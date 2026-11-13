-- /ops/metrics(Talent 지표)의 활동 집계와 실행 권한을 바로잡는다.
-- 1) Harper가 talent 대신 도구를 실행할 때 남는 career_tool_call:* / career_tool_call_failed:* 로그를 활동에서 뺀다.
--    2026-11-04부터 백그라운드 Career 실행이 많은 talent에 대해 이 로그를 남기면서 DAU·WAU·상호작용 talent·주간 리텐션이 부풀었다.
-- 2) 요약 DAU·WAU·리텐션은 기간 안에서 마지막으로 끝난 KST 날짜(summaryDate)를 기준으로 하고, 비교 기간도 같은 길이만큼 앞선 날짜를 본다.
--    진행 중인 오늘의 일부를 비교 기간의 하루 전체와 비교하지 않는다. 끝나지 않은 날·주의 툴팁 이름에는 진행 중 표시를 붙인다.
-- 3) engagement·retention과 이전 v1·v2 함수의 anon·authenticated 실행 권한을 회수한다.
-- 본문의 나머지는 2026-11-13 운영 정의와 같다.

CREATE OR REPLACE FUNCTION public.get_ops_talent_metrics_engagement_v1(p_from date, p_to date, p_interval text DEFAULT 'week'::text, p_excluded_email_terms text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_from date := least(p_from, p_to);
  v_to date := greatest(p_from, p_to);
  v_start timestamptz;
  v_requested_end timestamptz;
  v_effective_end timestamptz;
  v_duration interval;
  v_comparison_start timestamptz;
  v_activity_start timestamptz;
  v_effective_last_date date;
  v_summary_date date;
  v_comparison_summary_date date;
  v_generated_at timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if p_from is null or p_to is null then
    raise exception 'from and to are required';
  end if;
  if v_to - v_from + 1 > 366 then
    raise exception 'date range cannot exceed 366 days';
  end if;
  if p_interval not in ('day', 'week', 'month') then
    raise exception 'interval must be day, week, or month';
  end if;

  v_start := v_from::timestamp at time zone 'Asia/Seoul';
  v_requested_end := (v_to + 1)::timestamp at time zone 'Asia/Seoul';
  v_effective_end := greatest(v_start, least(v_requested_end, v_generated_at));
  v_duration := v_requested_end - v_start;
  v_comparison_start := v_start - v_duration;
  v_activity_start := v_comparison_start - interval '14 days';
  v_effective_last_date := (
    (v_effective_end - interval '1 microsecond') at time zone 'Asia/Seoul'
  )::date;
  -- 요약 DAU·WAU·리텐션은 진행 중인 오늘이 아니라 기간 안에서 마지막으로 끝난 KST 날짜를 본다.
  -- 기간 안에 끝난 날이 없으면(오늘 하루만 고른 경우) 오늘을 본다. 비교 기간은 같은 길이만큼 앞선 날짜를 본다.
  v_summary_date := (v_effective_end at time zone 'Asia/Seoul')::date - 1;
  if v_summary_date < v_from then
    v_summary_date := v_effective_last_date;
  end if;
  v_comparison_summary_date := v_summary_date - (v_to - v_from + 1);

  with
  included_users as materialized (
    select users.user_id
    from public.talent_users users
    where users.deleted_at is null
      and split_part(lower(coalesce(users.email, '')), '@', 2) <> 'matchharper.com'
      and not exists (
        select 1
        from unnest(coalesce(p_excluded_email_terms, '{}'::text[])) term(value)
        where nullif(btrim(term.value), '') is not null
          and position(lower(btrim(term.value)) in lower(coalesce(users.email, ''))) > 0
      )
  ),
  test_only_roles as materialized (
    select role.role_id
    from public.company_roles role
    where lower(coalesce(role.information ->> 'testOnly', 'false')) = 'true'
  ),
  scoped_messages as materialized (
    select
      message.user_id,
      message.created_at as occurred_at,
      char_length(message.content) as character_count
    from public.talent_messages message
    join included_users users on users.user_id = message.user_id
    where message.role = 'user'
      and message.created_at >= v_activity_start
      and message.created_at < v_effective_end
  ),
  activity_day_sources as materialized (
    select
      message.user_id,
      (message.occurred_at at time zone 'Asia/Seoul')::date as activity_date,
      true as is_interaction
    from scoped_messages message
    group by message.user_id, (message.occurred_at at time zone 'Asia/Seoul')::date

    union all

    select
      log.user_id,
      (log.created_at at time zone 'Asia/Seoul')::date,
      bool_or(left(coalesce(log.type, ''), 7) = 'career_')
    from public.logs log
    join included_users users on users.user_id = log.user_id
    where (log.type = 'login_completed' or left(coalesce(log.type, ''), 7) = 'career_')
      -- Harper가 talent 대신 도구를 실행한 기록(career_tool_call:*, career_tool_call_failed:*)은 사람의 활동이 아니다.
      and left(coalesce(log.type, ''), 16) <> 'career_tool_call'
      and log.created_at >= v_activity_start
      and log.created_at < v_effective_end
    group by log.user_id, (log.created_at at time zone 'Asia/Seoul')::date

    union all

    select
      recommendation.talent_id,
      (event.occurred_at at time zone 'Asia/Seoul')::date,
      true
    from public.talent_opportunity_recommendation recommendation
    join included_users users on users.user_id = recommendation.talent_id
    cross join lateral (
      values
        (recommendation.viewed_at),
        (recommendation.clicked_at),
        (recommendation.feedback_at)
    ) event(occurred_at)
    where event.occurred_at >= v_activity_start
      and event.occurred_at < v_effective_end
      and not exists (
        select 1
        from test_only_roles test_role
        where test_role.role_id = recommendation.role_id
      )
    group by
      recommendation.talent_id,
      (event.occurred_at at time zone 'Asia/Seoul')::date
  ),
  activity_days as materialized (
    select
      source.user_id,
      source.activity_date,
      bool_or(source.is_interaction) as is_interaction
    from activity_day_sources source
    group by source.user_id, source.activity_date
  ),
  periods(period_key, start_at, end_at, start_date, end_date, summary_date) as (
    values
      (
        'current'::text,
        v_start,
        v_effective_end,
        (v_start at time zone 'Asia/Seoul')::date,
        v_effective_last_date,
        v_summary_date
      ),
      (
        'comparison'::text,
        v_comparison_start,
        v_start,
        (v_comparison_start at time zone 'Asia/Seoul')::date,
        ((v_start - interval '1 microsecond') at time zone 'Asia/Seoul')::date,
        v_comparison_summary_date
      )
  ),
  period_metrics as (
    select
      period.period_key,
      period.summary_date,
      (
        select count(*)::bigint
        from scoped_messages message
        where message.occurred_at >= period.start_at
          and message.occurred_at < period.end_at
      ) as message_count,
      (
        select count(distinct message.user_id)::bigint
        from scoped_messages message
        where message.occurred_at >= period.start_at
          and message.occurred_at < period.end_at
      ) as message_sender_count,
      (
        select coalesce(sum(message.character_count), 0)::numeric
        from scoped_messages message
        where message.occurred_at >= period.start_at
          and message.occurred_at < period.end_at
      ) as message_character_count,
      (
        select count(distinct activity.user_id)::bigint
        from activity_days activity
        where activity.is_interaction
          and activity.activity_date >= period.start_date
          and activity.activity_date <= period.end_date
      ) as interaction_talent_count,
      (
        select count(distinct activity.user_id)::bigint
        from activity_days activity
        where activity.activity_date = period.summary_date
          and activity.activity_date >= period.start_date
      ) as dau,
      (
        select count(distinct activity.user_id)::bigint
        from activity_days activity
        where activity.activity_date >= greatest(period.start_date, period.summary_date - 6)
          and activity.activity_date <= period.summary_date
      ) as wau,
      (
        select count(distinct activity.user_id)::bigint
        from activity_days activity
        where activity.activity_date >= period.summary_date - 13
          and activity.activity_date <= period.summary_date - 7
      ) as retention_base_talent_count,
      (
        select count(*)::bigint
        from (
          select distinct previous.user_id
          from activity_days previous
          where previous.activity_date >= period.summary_date - 13
            and previous.activity_date <= period.summary_date - 7
            and exists (
              select 1
              from activity_days current_activity
              where current_activity.user_id = previous.user_id
                and current_activity.activity_date >= greatest(
                  period.start_date,
                  period.summary_date - 6
                )
                and current_activity.activity_date <= period.summary_date
            )
        ) retained
      ) as retained_talent_count
    from periods period
  ),
  period_json as (
    select
      metric.period_key,
      jsonb_build_object(
        'dau', metric.dau,
        'interactionTalentCount', metric.interaction_talent_count,
        'messageCharacterCount', metric.message_character_count,
        'messageCount', metric.message_count,
        'messageSenderCount', metric.message_sender_count,
        'retainedTalentCount', metric.retained_talent_count,
        'retentionBaseTalentCount', metric.retention_base_talent_count,
        'retentionRate', metric.retained_talent_count::numeric / nullif(metric.retention_base_talent_count, 0),
        'summaryDate', metric.summary_date::text,
        'wau', metric.wau
      ) as value
    from period_metrics metric
  ),
  bucket_bounds as materialized (
    select series.local_start::date as bucket_start
    from generate_series(
      date_trunc(p_interval, v_start at time zone 'Asia/Seoul'),
      date_trunc(p_interval, (v_effective_end - interval '1 microsecond') at time zone 'Asia/Seoul'),
      case p_interval
        when 'day' then interval '1 day'
        when 'week' then interval '7 days'
        else interval '1 month'
      end
    ) series(local_start)
    where v_effective_end > v_start
  ),
  message_buckets as (
    select
      date_trunc(p_interval, message.occurred_at at time zone 'Asia/Seoul')::date as bucket_start,
      count(*)::bigint as message_count,
      coalesce(sum(message.character_count), 0)::numeric as character_count
    from scoped_messages message
    where message.occurred_at >= v_start
      and message.occurred_at < v_effective_end
    group by 1
  ),
  interaction_buckets as (
    select
      date_trunc(p_interval, activity.activity_date::timestamp)::date as bucket_start,
      count(distinct activity.user_id)::bigint as talent_count
    from activity_days activity
    where activity.is_interaction
      and activity.activity_date >= v_from
      and activity.activity_date <= ((v_effective_end - interval '1 microsecond') at time zone 'Asia/Seoul')::date
    group by 1
  ),
  trend_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'bucketStart', bucket.bucket_start::text,
          'fullLabel', case p_interval
            when 'day' then bucket.bucket_start::text
            when 'week' then to_char(bucket.bucket_start, 'MM.DD') || ' - ' || to_char(bucket.bucket_start + 6, 'MM.DD')
            else to_char(bucket.bucket_start, 'YYYY.MM')
          end,
          'interactionTalentCount', coalesce(interaction.talent_count, 0),
          'label', case p_interval
            when 'month' then to_char(bucket.bucket_start, 'YYYY.MM')
            else to_char(bucket.bucket_start, 'MM.DD')
          end,
          'messageCharacterCount', coalesce(message.character_count, 0),
          'messageCount', coalesce(message.message_count, 0)
        )
        order by bucket.bucket_start
      ),
      '[]'::jsonb
    ) as value
    from bucket_bounds bucket
    left join message_buckets message using (bucket_start)
    left join interaction_buckets interaction using (bucket_start)
  ),
  selected_days as materialized (
    select series.local_start::date as activity_date
    from generate_series(
      date_trunc('day', v_start at time zone 'Asia/Seoul'),
      date_trunc('day', (v_effective_end - interval '1 microsecond') at time zone 'Asia/Seoul'),
      interval '1 day'
    ) series(local_start)
    where v_effective_end > v_start
  ),
  daily_activity_counts as (
    select activity.activity_date, count(*)::bigint as talent_count
    from activity_days activity
    where activity.activity_date >= v_from
      and activity.activity_date <= ((v_effective_end - interval '1 microsecond') at time zone 'Asia/Seoul')::date
    group by 1
  ),
  daily_activity_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'activeTalentCount', coalesce(activity.talent_count, 0),
          'date', day.activity_date::text,
          'fullLabel', day.activity_date::text || case
            when (day.activity_date + 1)::timestamp at time zone 'Asia/Seoul' > v_effective_end then ' (진행 중)'
            else ''
          end,
          'label', to_char(day.activity_date, 'MM.DD')
        )
        order by day.activity_date
      ),
      '[]'::jsonb
    ) as value
    from selected_days day
    left join daily_activity_counts activity using (activity_date)
  ),
  selected_weeks as materialized (
    select series.local_start::date as cohort_start
    from generate_series(
      date_trunc('week', v_start at time zone 'Asia/Seoul'),
      date_trunc('week', (v_effective_end - interval '1 microsecond') at time zone 'Asia/Seoul'),
      interval '7 days'
    ) series(local_start)
    where v_effective_end > v_start
  ),
  weekly_activity as materialized (
    select
      date_trunc('week', activity.activity_date::timestamp)::date as cohort_start,
      activity.user_id
    from activity_days activity
    group by 1, activity.user_id
  ),
  weekly_counts as (
    select activity.cohort_start, count(*)::bigint as talent_count
    from weekly_activity activity
    group by activity.cohort_start
  ),
  weekly_retained as (
    select current_activity.cohort_start, count(*)::bigint as talent_count
    from weekly_activity current_activity
    join weekly_activity previous_activity
      on previous_activity.user_id = current_activity.user_id
      and previous_activity.cohort_start = current_activity.cohort_start - 7
    group by current_activity.cohort_start
  ),
  retention_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'activeTalentCount', coalesce(current_count.talent_count, 0),
          'cohortStart', week.cohort_start::text,
          'fullLabel', to_char(week.cohort_start, 'MM.DD') || ' - ' || to_char(week.cohort_start + 6, 'MM.DD') || case
            when (week.cohort_start + 7)::timestamp at time zone 'Asia/Seoul' > v_effective_end then ' (진행 중)'
            else ''
          end,
          'label', to_char(week.cohort_start, 'MM.DD'),
          'retentionBaseTalentCount', coalesce(previous_count.talent_count, 0),
          'retentionRate', case
            when (week.cohort_start + 7)::timestamp at time zone 'Asia/Seoul' > v_effective_end then null
            else retained.talent_count::numeric / nullif(previous_count.talent_count, 0)
          end,
          'retainedTalentCount', coalesce(retained.talent_count, 0)
        )
        order by week.cohort_start
      ),
      '[]'::jsonb
    ) as value
    from selected_weeks week
    left join weekly_counts current_count on current_count.cohort_start = week.cohort_start
    left join weekly_counts previous_count on previous_count.cohort_start = week.cohort_start - 7
    left join weekly_retained retained on retained.cohort_start = week.cohort_start
  )
  select jsonb_build_object(
    'comparison', (select value from period_json where period_key = 'comparison'),
    'dailyActivity', (select value from daily_activity_json),
    'filters', jsonb_build_object(
      'from', v_from::text,
      'interval', p_interval,
      'to', v_to::text
    ),
    'generatedAt', to_char(v_generated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'retention', (select value from retention_json),
    'sourceLimitReached', false,
    'summary', (select value from period_json where period_key = 'current'),
    'trend', (select value from trend_json)
  ) into v_result;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_ops_talent_metrics_retention_v1(p_from date, p_to date, p_interval text DEFAULT 'week'::text, p_excluded_email_terms text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_from date := least(p_from, p_to);
  v_to date := greatest(p_from, p_to);
  v_start timestamptz;
  v_requested_end timestamptz;
  v_effective_end timestamptz;
  v_effective_last_date date;
  v_generated_at timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if p_from is null or p_to is null then
    raise exception 'from and to are required';
  end if;
  if v_to - v_from + 1 > 366 then
    raise exception 'date range cannot exceed 366 days';
  end if;
  if p_interval not in ('day', 'week', 'month') then
    raise exception 'interval must be day, week, or month';
  end if;

  v_start := v_from::timestamp at time zone 'Asia/Seoul';
  v_requested_end := (v_to + 1)::timestamp at time zone 'Asia/Seoul';
  v_effective_end := greatest(v_start, least(v_requested_end, v_generated_at));
  v_effective_last_date := (
    (v_effective_end - interval '1 microsecond') at time zone 'Asia/Seoul'
  )::date;

  with
  included_users as materialized (
    select users.user_id, users.created_at
    from public.talent_users users
    where users.deleted_at is null
      and split_part(lower(coalesce(users.email, '')), '@', 2) <> 'matchharper.com'
      and not exists (
        select 1
        from unnest(coalesce(p_excluded_email_terms, '{}'::text[])) term(value)
        where nullif(btrim(term.value), '') is not null
          and position(lower(btrim(term.value)) in lower(coalesce(users.email, ''))) > 0
      )
  ),
  test_only_roles as materialized (
    select role.role_id
    from public.company_roles role
    where lower(coalesce(role.information ->> 'testOnly', 'false')) = 'true'
  ),
  cohort_members as materialized (
    select
      users.user_id,
      date_trunc('week', users.created_at at time zone 'Asia/Seoul')::date as cohort_start
    from included_users users
    where users.created_at >= v_start
      and users.created_at < v_effective_end
  ),
  cohort_counts as materialized (
    select cohort.cohort_start, count(*)::bigint as signup_count
    from cohort_members cohort
    group by cohort.cohort_start
  ),
  cohort_activity_day_sources as materialized (
    select
      cohort.user_id,
      (message.created_at at time zone 'Asia/Seoul')::date as activity_date
    from cohort_members cohort
    join public.talent_messages message on message.user_id = cohort.user_id
    where message.role = 'user'
      and message.created_at >= (
        cohort.cohort_start::timestamp at time zone 'Asia/Seoul'
      )
      and message.created_at < v_effective_end
    group by cohort.user_id, (message.created_at at time zone 'Asia/Seoul')::date

    union

    select
      cohort.user_id,
      (log.created_at at time zone 'Asia/Seoul')::date
    from cohort_members cohort
    join public.logs log on log.user_id = cohort.user_id
    where (log.type = 'login_completed' or left(coalesce(log.type, ''), 7) = 'career_')
      -- Harper가 talent 대신 도구를 실행한 기록(career_tool_call:*, career_tool_call_failed:*)은 사람의 활동이 아니다.
      and left(coalesce(log.type, ''), 16) <> 'career_tool_call'
      and log.created_at >= (
        cohort.cohort_start::timestamp at time zone 'Asia/Seoul'
      )
      and log.created_at < v_effective_end
    group by cohort.user_id, (log.created_at at time zone 'Asia/Seoul')::date

    union

    select
      cohort.user_id,
      (event.occurred_at at time zone 'Asia/Seoul')::date
    from cohort_members cohort
    join public.talent_opportunity_recommendation recommendation
      on recommendation.talent_id = cohort.user_id
    cross join lateral (
      values
        (recommendation.viewed_at),
        (recommendation.clicked_at),
        (recommendation.feedback_at)
    ) event(occurred_at)
    where event.occurred_at >= (
        cohort.cohort_start::timestamp at time zone 'Asia/Seoul'
      )
      and event.occurred_at < v_effective_end
      and not exists (
        select 1
        from test_only_roles test_role
        where test_role.role_id = recommendation.role_id
      )
    group by cohort.user_id, (event.occurred_at at time zone 'Asia/Seoul')::date
  ),
  cohort_activity_days as materialized (
    select distinct source.user_id, source.activity_date
    from cohort_activity_day_sources source
  ),
  cohort_week_activity as materialized (
    select
      member.cohort_start,
      ((activity.activity_date - member.cohort_start) / 7)::integer as week_index,
      count(distinct activity.user_id)::bigint as active_talent_count
    from cohort_activity_days activity
    join cohort_members member on member.user_id = activity.user_id
    where activity.activity_date >= member.cohort_start
    group by
      member.cohort_start,
      ((activity.activity_date - member.cohort_start) / 7)::integer
  ),
  cohort_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cohortStart', cohort.cohort_start::text,
          'fullLabel', to_char(cohort.cohort_start, 'YYYY-MM-DD') || ' - ' ||
            to_char(cohort.cohort_start + 6, 'YYYY-MM-DD'),
          'label', to_char(cohort.cohort_start, 'MM/DD'),
          'signupCount', cohort.signup_count,
          'weeks', (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'activeTalentCount', coalesce(activity.active_talent_count, 0),
                  'isComplete', (
                    (
                      cohort.cohort_start + ((week_index.value + 1) * 7)
                    )::timestamp at time zone 'Asia/Seoul'
                  ) <= v_effective_end,
                  'retentionRate',
                    coalesce(activity.active_talent_count, 0)::numeric /
                      nullif(cohort.signup_count, 0),
                  'weekIndex', week_index.value
                )
                order by week_index.value
              ),
              '[]'::jsonb
            )
            from generate_series(
              0,
              greatest(0, ((v_effective_last_date - cohort.cohort_start) / 7)::integer)
            ) week_index(value)
            left join cohort_week_activity activity
              on activity.cohort_start = cohort.cohort_start
              and activity.week_index = week_index.value
          )
        )
        order by cohort.cohort_start
      ),
      '[]'::jsonb
    ) as value
    from cohort_counts cohort
  )
  select jsonb_build_object(
    'filters', jsonb_build_object(
      'from', v_from::text,
      'interval', p_interval,
      'to', v_to::text
    ),
    'generatedAt', to_char(v_generated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'sourceLimitReached', false,
    'weeklyRetentionCohorts', (select value from cohort_json)
  ) into v_result;

  return v_result;
end;
$function$;

-- 지표 함수는 서버의 service_role 호출만 허용한다. 제외 이메일 인자로 가입 여부를 알아낼 수 있으므로 공개 키로 부를 수 없어야 한다.
revoke all on function public.get_ops_talent_metrics_engagement_v1(date, date, text, text[]) from public, anon, authenticated;
grant execute on function public.get_ops_talent_metrics_engagement_v1(date, date, text, text[]) to service_role;

revoke all on function public.get_ops_talent_metrics_retention_v1(date, date, text, text[]) from public, anon, authenticated;
grant execute on function public.get_ops_talent_metrics_retention_v1(date, date, text, text[]) to service_role;

-- 화면에서 더 이상 쓰지 않는 이전 지표 함수도 같은 권한으로 맞춘다.
revoke all on function public.get_ops_talent_metrics_v1(date, date, text, text[]) from public, anon, authenticated;
grant execute on function public.get_ops_talent_metrics_v1(date, date, text, text[]) to service_role;

revoke all on function public.get_ops_talent_metrics_v2(date, date, text, text[]) from public, anon, authenticated;
grant execute on function public.get_ops_talent_metrics_v2(date, date, text, text[]) to service_role;
