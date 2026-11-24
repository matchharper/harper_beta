-- /ops/metrics 주간 리텐션에서도 career_provider_usage 로그를 활동으로 세지 않는다.
-- career_provider_usage는 Harper 서버가 talent 일을 하며 외부 서비스(Exa, 공고 페이지, Gmail)를 부를 때마다 남기는
-- 비용 기록이다(src/lib/career/resources/providerUsage.ts). 이름이 career_로 시작해 2026-11-17부터 활동으로 세어졌다.
-- 20261122080000은 DAU·WAU(engagement)에서만 이 로그를 뺐고 리텐션 함수는 바꾸지 않았다.
-- 운영에 지금 있는 정의(20261121090000과 같음, 2026-11-23 prosrc md5로 확인)에 logs 조건 한 줄만 더했다.
-- 추가된 조건은 logs_talent_activity_created_idx의 조건을 좁히기만 하므로 그 인덱스를 그대로 읽는다.

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
  v_activity_start timestamptz;
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
  -- 모든 코호트는 기간 첫날이 속한 주 이후에 시작한다. 활동을 이 시각부터만 읽어도 결과는 같고,
  -- 메시지·로그를 처음부터 훑지 않고 그 범위만 읽는다.
  v_activity_start := date_trunc('week', v_start at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';

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
      and message.created_at >= v_activity_start
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
      -- Harper가 외부 서비스를 부를 때 남긴 비용 기록(career_provider_usage)도 사람의 활동이 아니다.
      and coalesce(log.type, '') <> 'career_provider_usage'
      and log.created_at >= (
        cohort.cohort_start::timestamp at time zone 'Asia/Seoul'
      )
      and log.created_at >= v_activity_start
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

revoke all on function public.get_ops_talent_metrics_retention_v1(date, date, text, text[]) from public, anon, authenticated;
grant execute on function public.get_ops_talent_metrics_retention_v1(date, date, text, text[]) to service_role;
