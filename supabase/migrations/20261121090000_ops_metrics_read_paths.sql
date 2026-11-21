-- /ops/metrics·/ops/update-metrics 집계가 읽는 범위를 줄인다. 집계 결과는 바뀌지 않는다.
--
-- 2026-11-21 운영 측정(6일 범위): 지표 쿼리 6개가 테스트 Role 9개·내부 Role 115개를 찾으려고 company_roles
-- 29.6만 행(본문 약 530MB)을 각각 전부 읽었다. 메시지는 conversation_id로 시작하는 인덱스를 통째로 훑었고,
-- 리텐션은 코호트 활동을 하한 없이 찾느라 logs 인덱스 전체와 힙 36만 건을 읽어 78초가 걸렸다.
--
-- 운영 적용: 아래 인덱스 4개를 먼저 CREATE INDEX CONCURRENTLY로 만들고 pg_index.indisvalid를 확인한 뒤 이 migration을
-- 적용한다. 그러면 쓰기를 막지 않고, migration은 같은 정의를 기록만 한다. 제약이 아니라 읽기 경로다.
-- 운영은 2026-11-21에 이 순서로 적용했다(이력 version 20261121015515 ops_metrics_read_paths). 다시 적용하지 않는다.

-- test_only_roles·internal_roles CTE의 조건과 같은 식이라 planner가 이 인덱스만 읽는다.
CREATE INDEX IF NOT EXISTS company_roles_test_only_idx
  ON public.company_roles (role_id)
  WHERE lower(coalesce(information ->> 'testOnly', 'false')) = 'true';

CREATE INDEX IF NOT EXISTS company_roles_internal_idx
  ON public.company_roles (role_id)
  WHERE lower(coalesce(source_type, '')) = 'internal';

-- 기간 안의 사용자 메시지(활동·메시지 수 집계).
CREATE INDEX IF NOT EXISTS talent_messages_user_created_idx
  ON public.talent_messages (created_at, user_id)
  WHERE role = 'user';

-- 기간 안의 활동 로그(DAU·WAU·리텐션). 조건은 집계 쿼리의 활동 로그 조건과 같은 식이다.
-- 최근 로그 대부분은 career_tool_call이라, 이 인덱스가 없으면 그 행까지 힙에서 읽고 버린다.
CREATE INDEX IF NOT EXISTS logs_talent_activity_created_idx
  ON public.logs (created_at, user_id) INCLUDE (type)
  WHERE (type = 'login_completed' OR left(coalesce(type, ''), 7) = 'career_')
    AND left(coalesce(type, ''), 16) <> 'career_tool_call';

-- 리텐션: 나머지 정의는 20261113014810과 같다.
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
