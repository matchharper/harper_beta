create or replace function public.get_ops_talent_metrics_v2(
  p_from date,
  p_to date,
  p_interval text default 'week',
  p_excluded_email_terms text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from date := least(p_from, p_to);
  v_to date := greatest(p_from, p_to);
  v_start timestamptz;
  v_requested_end timestamptz;
  v_effective_end timestamptz;
  v_duration interval;
  v_comparison_start timestamptz;
  v_generated_at timestamptz := clock_timestamp();
  v_effective_last_date date;
  v_base jsonb;
  v_summary_message_fields jsonb;
  v_comparison_message_fields jsonb;
  v_trend jsonb;
  v_weekly_retention_cohorts jsonb;
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
  v_effective_last_date := (
    (v_effective_end - interval '1 microsecond') at time zone 'Asia/Seoul'
  )::date;

  v_base := public.get_ops_talent_metrics_v1(
    v_from,
    v_to,
    p_interval,
    p_excluded_email_terms
  );

  with
  included_users as materialized (
    select
      users.user_id,
      users.created_at
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
      and message.created_at >= v_comparison_start
      and message.created_at < v_effective_end
  ),
  periods(period_key, start_at, end_at) as (
    values
      ('current'::text, v_start, v_effective_end),
      ('comparison'::text, v_comparison_start, v_start)
  ),
  period_messages as (
    select
      period.period_key,
      count(message.user_id)::bigint as message_count,
      coalesce(sum(message.character_count), 0)::bigint as character_count
    from periods period
    left join scoped_messages message
      on message.occurred_at >= period.start_at
      and message.occurred_at < period.end_at
    group by period.period_key
  ),
  message_buckets as (
    select
      date_trunc(p_interval, message.occurred_at at time zone 'Asia/Seoul')::date as bucket_start,
      count(*)::bigint as message_count,
      coalesce(sum(message.character_count), 0)::bigint as character_count
    from scoped_messages message
    where message.occurred_at >= v_start
      and message.occurred_at < v_effective_end
    group by 1
  ),
  latest_decisions as materialized (
    select distinct on (recommendation.talent_id, recommendation.role_id)
      recommendation.talent_id,
      recommendation.role_id,
      case
        when lower(btrim(recommendation.feedback)) in ('like', 'positive') then 'accepted'
        else 'rejected'
      end as decision,
      coalesce(recommendation.feedback_at, recommendation.updated_at) as decided_at
    from public.talent_opportunity_recommendation recommendation
    join included_users users on users.user_id = recommendation.talent_id
    where lower(btrim(coalesce(recommendation.feedback, ''))) in (
      'like', 'positive', 'dislike', 'negative'
    )
      and not exists (
        select 1
        from test_only_roles test_role
        where test_role.role_id = recommendation.role_id
      )
    order by
      recommendation.talent_id,
      recommendation.role_id,
      coalesce(recommendation.feedback_at, recommendation.updated_at) desc,
      recommendation.id desc
  ),
  decision_buckets as (
    select
      date_trunc(p_interval, decision.decided_at at time zone 'Asia/Seoul')::date as bucket_start,
      count(*) filter (where decision.decision = 'accepted')::bigint as accepted_count,
      count(*) filter (where decision.decision = 'rejected')::bigint as rejected_count
    from latest_decisions decision
    where decision.decided_at >= v_start
      and decision.decided_at < v_effective_end
    group by 1
  ),
  base_trend as (
    select point.value, point.ordinality
    from jsonb_array_elements(coalesce(v_base -> 'trend', '[]'::jsonb))
      with ordinality as point(value, ordinality)
  ),
  enriched_trend as (
    select coalesce(
      jsonb_agg(
        point.value || jsonb_build_object(
          'messageCharacterCount', coalesce(message.character_count, 0),
          'messageCount', coalesce(message.message_count, 0),
          'recommendationAcceptRejectRatio',
            decision.accepted_count::numeric / nullif(decision.rejected_count, 0),
          'recommendationAcceptedCount', coalesce(decision.accepted_count, 0),
          'recommendationRejectedCount', coalesce(decision.rejected_count, 0)
        )
        order by point.ordinality
      ),
      '[]'::jsonb
    ) as value
    from base_trend point
    left join message_buckets message
      on message.bucket_start = (point.value ->> 'bucketStart')::date
    left join decision_buckets decision
      on decision.bucket_start = (point.value ->> 'bucketStart')::date
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
  select
    jsonb_build_object(
      'messageCharacterCount', current_messages.character_count,
      'messageCount', current_messages.message_count
    ),
    jsonb_build_object(
      'messageCharacterCount', comparison_messages.character_count,
      'messageCount', comparison_messages.message_count
    ),
    (select value from enriched_trend),
    (select value from cohort_json)
  into
    v_summary_message_fields,
    v_comparison_message_fields,
    v_trend,
    v_weekly_retention_cohorts
  from period_messages current_messages
  join period_messages comparison_messages on true
  where current_messages.period_key = 'current'
    and comparison_messages.period_key = 'comparison';

  v_base := jsonb_set(
    v_base,
    '{summary}',
    (v_base -> 'summary') || v_summary_message_fields
  );
  v_base := jsonb_set(
    v_base,
    '{comparison}',
    (v_base -> 'comparison') || v_comparison_message_fields
  );
  v_base := jsonb_set(v_base, '{trend}', coalesce(v_trend, '[]'::jsonb));
  v_base := jsonb_set(
    v_base,
    '{weeklyRetentionCohorts}',
    coalesce(v_weekly_retention_cohorts, '[]'::jsonb)
  );

  return v_base;
end;
$$;

revoke all on function public.get_ops_talent_metrics_v2(date, date, text, text[])
  from public;
grant execute on function public.get_ops_talent_metrics_v2(date, date, text, text[])
  to service_role;
