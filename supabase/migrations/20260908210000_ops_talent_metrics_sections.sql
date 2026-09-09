-- Keep independently useful dashboard sections independently queryable. This
-- avoids making the first paint wait for the slowest source and removes the
-- v2 function's duplicated message/recommendation scans.

create or replace function public.get_ops_talent_metrics_conversion_v1(
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
  internal_roles as materialized (
    select role.role_id
    from public.company_roles role
    where lower(coalesce(role.source_type, '')) = 'internal'
      and lower(coalesce(role.information ->> 'testOnly', 'false')) <> 'true'
  ),
  test_only_roles as materialized (
    select role.role_id
    from public.company_roles role
    where lower(coalesce(role.information ->> 'testOnly', 'false')) = 'true'
  ),
  event_completion as materialized (
    select event.talent_id as user_id, min(event.created_at) as completed_at
    from public.talent_activity_events event
    join included_users users on users.user_id = event.talent_id
    where event.event_type = 'onboarding_completed'
    group by event.talent_id
  ),
  completion as materialized (
    select
      setting.user_id,
      coalesce(event.completed_at, setting.updated_at) as completed_at
    from public.talent_setting setting
    join included_users users on users.user_id = setting.user_id
    left join event_completion event on event.user_id = setting.user_id
    where setting.is_onboarding_done is true
  ),
  ready_talents as materialized (
    select completion.user_id, completion.completed_at
    from completion
    join public.talent_setting setting on setting.user_id = completion.user_id
    where setting.get_internal_recommendation is not false
      and lower(coalesce(setting.profile_visibility, '')) <> 'dont_share'
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
      and coalesce(recommendation.feedback_at, recommendation.updated_at) >= v_comparison_start
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
  internal_pairs as materialized (
    select
      recommendation.talent_id,
      recommendation.role_id,
      min(recommendation.recommended_at) as first_recommended_at
    from public.talent_opportunity_recommendation recommendation
    join included_users users on users.user_id = recommendation.talent_id
    join internal_roles role on role.role_id = recommendation.role_id
    where recommendation.recommended_at < v_effective_end
    group by recommendation.talent_id, recommendation.role_id
    having min(recommendation.recommended_at) >= v_comparison_start
  ),
  internal_outcomes as materialized (
    select
      pair.talent_id,
      pair.role_id,
      pair.first_recommended_at,
      decision.decision = 'accepted'
        and decision.decided_at >= pair.first_recommended_at
        and decision.decided_at <= pair.first_recommended_at + interval '14 days'
        as accepted_within_14_days
    from internal_pairs pair
    left join latest_decisions decision
      on decision.talent_id = pair.talent_id
      and decision.role_id = pair.role_id
  ),
  stage_events as materialized (
    select
      progress.talent_id,
      progress.role_id,
      case
        when lower(btrim(coalesce(progress.metadata ->> 'stage', ''))) like 'custom:%' then 'custom'
        else lower(btrim(coalesce(progress.metadata ->> 'stage', '')))
      end as stage,
      progress.created_at as occurred_at
    from public.talent_progress progress
    join included_users users on users.user_id = progress.talent_id
    join internal_roles role on role.role_id = progress.role_id
    where progress.kind = 'org_stage_change'
      and progress.created_at < v_effective_end

    union all

    select
      tag.talent_id,
      tag.opportunity_id,
      case
        when regexp_replace(tag.tag, '\s+', '', 'g') = '내부:연결대기' then 'pending_connection'
        when regexp_replace(tag.tag, '\s+', '', 'g') = '내부:연결됨' then 'connected'
        when regexp_replace(tag.tag, '\s+', '', 'g') = '내부:최종오퍼' then 'final_offer'
        when regexp_replace(tag.tag, '\s+', '', 'g') like '내부단계:%' then 'custom'
        else null
      end,
      tag.updated_at
    from public.talent_opportunity_tag tag
    join included_users users on users.user_id = tag.talent_id
    join internal_roles role on role.role_id = tag.opportunity_id
    where tag.updated_at < v_effective_end
  ),
  pair_stage_first as materialized (
    select
      stage.talent_id,
      stage.role_id,
      min(stage.occurred_at) filter (where stage.stage = 'pending_connection') as pending_at,
      min(stage.occurred_at) filter (
        where stage.stage in ('connected', 'final_offer', 'custom')
      ) as connected_at
    from stage_events stage
    where stage.stage is not null
    group by stage.talent_id, stage.role_id
  ),
  periods(period_key, start_at, end_at) as (
    values
      ('current'::text, v_start, v_effective_end),
      ('comparison'::text, v_comparison_start, v_start)
  ),
  period_metrics as (
    select
      period.period_key,
      (
        select count(*)::bigint
        from latest_decisions decision
        where decision.decision = 'accepted'
          and decision.decided_at >= period.start_at
          and decision.decided_at < period.end_at
      ) as recommendation_accepted_count,
      (
        select count(*)::bigint
        from latest_decisions decision
        where decision.decision = 'rejected'
          and decision.decided_at >= period.start_at
          and decision.decided_at < period.end_at
      ) as recommendation_rejected_count,
      (
        select count(*)::bigint
        from internal_outcomes outcome
        where outcome.first_recommended_at >= period.start_at
          and outcome.first_recommended_at < period.end_at
          and outcome.first_recommended_at <= v_generated_at - interval '14 days'
      ) as internal_matured_recommendation_count,
      (
        select count(*)::bigint
        from internal_outcomes outcome
        where outcome.first_recommended_at >= period.start_at
          and outcome.first_recommended_at < period.end_at
          and outcome.first_recommended_at <= v_generated_at - interval '14 days'
          and outcome.accepted_within_14_days
      ) as internal_accepted_count,
      (
        select count(*)::bigint
        from included_users users
        where users.created_at >= period.start_at
          and users.created_at < period.end_at
          and users.created_at <= v_generated_at - interval '14 days'
      ) as onboarding_matured_signup_count,
      (
        select count(*)::bigint
        from included_users users
        join completion on completion.user_id = users.user_id
        where users.created_at >= period.start_at
          and users.created_at < period.end_at
          and users.created_at <= v_generated_at - interval '14 days'
          and completion.completed_at >= users.created_at
          and completion.completed_at <= users.created_at + interval '14 days'
      ) as onboarding_completed_within_14_days_count,
      (
        select count(distinct stage.talent_id)::bigint
        from pair_stage_first stage
        where stage.pending_at >= period.start_at
          and stage.pending_at < period.end_at
      ) as pending_connection_talent_count,
      (
        select count(distinct stage.talent_id)::bigint
        from pair_stage_first stage
        where stage.connected_at >= period.start_at
          and stage.connected_at < period.end_at
      ) as connected_talent_count,
      (
        select count(*)::bigint
        from ready_talents talent
        where talent.completed_at < period.end_at
          and greatest(period.start_at, talent.completed_at) < period.end_at
      ) as service_ready_talent_count,
      (
        select coalesce(
          sum(
            extract(epoch from period.end_at - greatest(period.start_at, talent.completed_at))
          ) / 86400.0 / 90.0,
          0
        )::numeric
        from ready_talents talent
        where talent.completed_at < period.end_at
          and greatest(period.start_at, talent.completed_at) < period.end_at
      ) as service_ready_talent_quarter_equivalents
    from periods period
  ),
  period_json as (
    select
      metric.period_key,
      jsonb_build_object(
        'connectedTalentCount', metric.connected_talent_count,
        'internalAcceptedCount', metric.internal_accepted_count,
        'internalAcceptanceRate', metric.internal_accepted_count::numeric / nullif(metric.internal_matured_recommendation_count, 0),
        'internalMaturedRecommendationCount', metric.internal_matured_recommendation_count,
        'onboardingCompletedWithin14DaysCount', metric.onboarding_completed_within_14_days_count,
        'onboardingCompletionRate', metric.onboarding_completed_within_14_days_count::numeric / nullif(metric.onboarding_matured_signup_count, 0),
        'onboardingMaturedSignupCount', metric.onboarding_matured_signup_count,
        'pendingConnectionTalentCount', metric.pending_connection_talent_count,
        'recommendationAcceptRejectRatio', metric.recommendation_accepted_count::numeric / nullif(metric.recommendation_rejected_count, 0),
        'recommendationAcceptedCount', metric.recommendation_accepted_count,
        'recommendationDecisionAcceptanceRate', metric.recommendation_accepted_count::numeric / nullif(metric.recommendation_accepted_count + metric.recommendation_rejected_count, 0),
        'recommendationRejectedCount', metric.recommendation_rejected_count,
        'serviceReadyTalentCount', metric.service_ready_talent_count,
        'serviceReadyTalentQuarterEquivalents', metric.service_ready_talent_quarter_equivalents,
        'verifiedConnectionYieldPer100TalentQuarters', metric.connected_talent_count::numeric * 100 / nullif(metric.service_ready_talent_quarter_equivalents, 0)
      ) as value
    from period_metrics metric
  ),
  bucket_bounds as materialized (
    select
      series.local_start::date as bucket_start,
      greatest(v_start, series.local_start at time zone 'Asia/Seoul') as start_at,
      least(
        v_effective_end,
        (series.local_start + case p_interval
          when 'day' then interval '1 day'
          when 'week' then interval '7 days'
          else interval '1 month'
        end) at time zone 'Asia/Seoul'
      ) as end_at
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
  internal_buckets as (
    select
      date_trunc(p_interval, outcome.first_recommended_at at time zone 'Asia/Seoul')::date as bucket_start,
      count(*)::bigint as matured_count,
      count(*) filter (where outcome.accepted_within_14_days)::bigint as accepted_count
    from internal_outcomes outcome
    where outcome.first_recommended_at >= v_start
      and outcome.first_recommended_at < v_effective_end
      and outcome.first_recommended_at <= v_generated_at - interval '14 days'
    group by 1
  ),
  onboarding_buckets as (
    select
      date_trunc(p_interval, users.created_at at time zone 'Asia/Seoul')::date as bucket_start,
      count(*)::bigint as matured_count,
      count(*) filter (
        where completion.completed_at >= users.created_at
          and completion.completed_at <= users.created_at + interval '14 days'
      )::bigint as completed_count
    from included_users users
    left join completion on completion.user_id = users.user_id
    where users.created_at >= v_start
      and users.created_at < v_effective_end
      and users.created_at <= v_generated_at - interval '14 days'
    group by 1
  ),
  stage_buckets as (
    select
      bucket.bucket_start,
      count(distinct stage.talent_id) filter (
        where stage.pending_at >= bucket.start_at and stage.pending_at < bucket.end_at
      )::bigint as pending_count,
      count(distinct stage.talent_id) filter (
        where stage.connected_at >= bucket.start_at and stage.connected_at < bucket.end_at
      )::bigint as connected_count
    from bucket_bounds bucket
    left join pair_stage_first stage
      on (stage.pending_at >= bucket.start_at and stage.pending_at < bucket.end_at)
      or (stage.connected_at >= bucket.start_at and stage.connected_at < bucket.end_at)
    group by bucket.bucket_start
  ),
  exposure_buckets as (
    select
      bucket.bucket_start,
      coalesce(
        sum(
          extract(epoch from bucket.end_at - greatest(bucket.start_at, talent.completed_at))
        ) / 86400.0 / 90.0,
        0
      )::numeric as talent_quarter_equivalents
    from bucket_bounds bucket
    left join ready_talents talent
      on talent.completed_at < bucket.end_at
      and greatest(bucket.start_at, talent.completed_at) < bucket.end_at
    group by bucket.bucket_start
  ),
  trend_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'bucketStart', bucket.bucket_start::text,
          'connectedTalentCount', coalesce(stage.connected_count, 0),
          'fullLabel', case p_interval
            when 'day' then bucket.bucket_start::text
            when 'week' then to_char(bucket.bucket_start, 'MM.DD') || ' - ' || to_char(bucket.bucket_start + 6, 'MM.DD')
            else to_char(bucket.bucket_start, 'YYYY.MM')
          end,
          'internalAcceptanceRate', internal.accepted_count::numeric / nullif(internal.matured_count, 0),
          'label', case p_interval
            when 'month' then to_char(bucket.bucket_start, 'YYYY.MM')
            else to_char(bucket.bucket_start, 'MM.DD')
          end,
          'onboardingCompletionRate', onboarding.completed_count::numeric / nullif(onboarding.matured_count, 0),
          'pendingConnectionTalentCount', coalesce(stage.pending_count, 0),
          'recommendationAcceptRejectRatio', decision.accepted_count::numeric / nullif(decision.rejected_count, 0),
          'recommendationAcceptedCount', coalesce(decision.accepted_count, 0),
          'recommendationDecisionAcceptanceRate', decision.accepted_count::numeric / nullif(coalesce(decision.accepted_count, 0) + coalesce(decision.rejected_count, 0), 0),
          'recommendationRejectedCount', coalesce(decision.rejected_count, 0),
          'serviceReadyTalentQuarterEquivalents', exposure.talent_quarter_equivalents,
          'verifiedConnectionYieldPer100TalentQuarters', coalesce(stage.connected_count, 0)::numeric * 100 / nullif(exposure.talent_quarter_equivalents, 0)
        )
        order by bucket.bucket_start
      ),
      '[]'::jsonb
    ) as value
    from bucket_bounds bucket
    left join decision_buckets decision using (bucket_start)
    left join internal_buckets internal using (bucket_start)
    left join onboarding_buckets onboarding using (bucket_start)
    left join stage_buckets stage using (bucket_start)
    left join exposure_buckets exposure using (bucket_start)
  )
  select jsonb_build_object(
    'comparison', (select value from period_json where period_key = 'comparison'),
    'filters', jsonb_build_object(
      'from', v_from::text,
      'interval', p_interval,
      'to', v_to::text
    ),
    'generatedAt', to_char(v_generated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'sourceLimitReached', false,
    'summary', (select value from period_json where period_key = 'current'),
    'trend', (select value from trend_json)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_ops_talent_metrics_conversion_v1(date, date, text, text[])
  from public;
grant execute on function public.get_ops_talent_metrics_conversion_v1(date, date, text, text[])
  to service_role;

create or replace function public.get_ops_talent_metrics_engagement_v1(
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
  v_duration := v_requested_end - v_start;
  v_comparison_start := v_start - v_duration;
  v_activity_start := v_comparison_start - interval '14 days';

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
  periods(period_key, start_at, end_at, start_date, end_date) as (
    values
      (
        'current'::text,
        v_start,
        v_effective_end,
        (v_start at time zone 'Asia/Seoul')::date,
        ((v_effective_end - interval '1 microsecond') at time zone 'Asia/Seoul')::date
      ),
      (
        'comparison'::text,
        v_comparison_start,
        v_start,
        (v_comparison_start at time zone 'Asia/Seoul')::date,
        ((v_start - interval '1 microsecond') at time zone 'Asia/Seoul')::date
      )
  ),
  period_metrics as (
    select
      period.period_key,
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
        where activity.activity_date = period.end_date
          and activity.activity_date >= period.start_date
      ) as dau,
      (
        select count(distinct activity.user_id)::bigint
        from activity_days activity
        where activity.activity_date >= greatest(period.start_date, period.end_date - 6)
          and activity.activity_date <= period.end_date
      ) as wau,
      (
        select count(distinct activity.user_id)::bigint
        from activity_days activity
        where activity.activity_date >= period.end_date - 13
          and activity.activity_date <= period.end_date - 7
      ) as retention_base_talent_count,
      (
        select count(*)::bigint
        from (
          select distinct previous.user_id
          from activity_days previous
          where previous.activity_date >= period.end_date - 13
            and previous.activity_date <= period.end_date - 7
            and exists (
              select 1
              from activity_days current_activity
              where current_activity.user_id = previous.user_id
                and current_activity.activity_date >= greatest(
                  period.start_date,
                  period.end_date - 6
                )
                and current_activity.activity_date <= period.end_date
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
          'fullLabel', day.activity_date::text,
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
          'fullLabel', to_char(week.cohort_start, 'MM.DD') || ' - ' || to_char(week.cohort_start + 6, 'MM.DD'),
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
$$;

revoke all on function public.get_ops_talent_metrics_engagement_v1(date, date, text, text[])
  from public;
grant execute on function public.get_ops_talent_metrics_engagement_v1(date, date, text, text[])
  to service_role;

create or replace function public.get_ops_talent_metrics_retention_v1(
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
$$;

revoke all on function public.get_ops_talent_metrics_retention_v1(date, date, text, text[])
  from public;
grant execute on function public.get_ops_talent_metrics_retention_v1(date, date, text, text[])
  to service_role;
