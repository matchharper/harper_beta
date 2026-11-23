-- /ops/metrics DAU·WAU·리텐션에서 career_provider_usage 로그를 뺀다(Shaun 11/22: 하퍼가 남긴 비용 기록은 활동이 아님).
-- career_provider_usage는 Harper 서버가 talent 일을 하며 외부 서비스를 부를 때마다 남기는 비용 영수증이다
-- (src/lib/career/resources/providerUsage.ts). 이름이 career_로 시작해 11/20부터 활동으로 세어졌다.
-- 2026-11-22 운영 측정(KST 활동 인원): 11/20 642명 → 286명, 11/21 881명 → 209명.
-- 운영에 지금 있는 정의(20261116020000과 같음, 2026-11-22 prosrc md5로 확인)에 logs 조건 한 줄만 더했다. 그래서 인덱스
-- 준비 없이 따로 적용할 수 있다. 아직 운영에 안 들어간 20261121120000의 새 정의에도 같은 줄을 넣어 두었다(나중에 그
-- 정의를 적용해도 이 수정이 되돌아가지 않게).

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
      -- Harper가 외부 서비스를 부를 때 남긴 비용 기록(career_provider_usage)도 사람의 활동이 아니다(Shaun 11/22).
      and coalesce(log.type, '') <> 'career_provider_usage'
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
  -- 기간 앞 6일도 센다: 7일 평균이 기간 첫날부터 7일을 채운다.
  daily_activity_counts as materialized (
    select activity.activity_date, count(*)::bigint as talent_count
    from activity_days activity
    where activity.activity_date >= v_from - 6
      and activity.activity_date <= ((v_effective_end - interval '1 microsecond') at time zone 'Asia/Seoul')::date
    group by 1
  ),
  daily_activity_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'activeTalentCount', coalesce(activity.talent_count, 0),
          'activeTalentCount7dAvg', case
            when (day.activity_date + 1)::timestamp at time zone 'Asia/Seoul' > v_effective_end then null
            else (
              select round(coalesce(sum(previous.talent_count), 0)::numeric / 7, 1)
              from daily_activity_counts previous
              where previous.activity_date >= day.activity_date - 6
                and previous.activity_date <= day.activity_date
            )
          end,
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
      activity.user_id,
      min(activity.activity_date) as first_activity_date
    from activity_days activity
    group by 1, activity.user_id
  ),
  -- One first-active day per person per KST calendar week, irrespective of
  -- how many days or activity sources they used. These increments sum to WAU.
  weekly_first_activity_counts as materialized (
    select cohort_start, first_activity_date, count(*)::bigint as talent_count
    from weekly_activity
    group by cohort_start, first_activity_date
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
          'weekdayCumulativeActiveTalentCounts', (
            select jsonb_agg(case
              when week.cohort_start + weekday.day_index <= v_effective_last_date then (
                select coalesce(sum(first_day.talent_count), 0)::bigint
                from weekly_first_activity_counts first_day
                where first_day.cohort_start = week.cohort_start
                  and first_day.first_activity_date <= week.cohort_start + weekday.day_index
              ) else null end order by weekday.day_index)
            from generate_series(0, 6) weekday(day_index)
          ),
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


revoke all on function public.get_ops_talent_metrics_engagement_v1(date, date, text, text[]) from public, anon, authenticated;
grant execute on function public.get_ops_talent_metrics_engagement_v1(date, date, text, text[]) to service_role;
