begin;

create index if not exists talent_recommendation_action_received_idx
  on public.talent_opportunity_recommendation (
    talent_id,
    opportunity_type,
    recommended_at
  );

create index if not exists talent_recommendation_action_viewed_idx
  on public.talent_opportunity_recommendation (talent_id, viewed_at)
  where viewed_at is not null;

create index if not exists talent_recommendation_action_feedback_idx
  on public.talent_opportunity_recommendation (talent_id, feedback_at)
  where feedback_at is not null or feedback is not null;

create index if not exists talent_contexts_action_change_idx
  on public.talent_contexts (talent_id, created_at, updated_at);

create index if not exists talent_messages_call_action_idx
  on public.talent_messages (
    conversation_id,
    message_type,
    role,
    created_at
  );

create index if not exists career_email_messages_action_inbound_idx
  on public.career_email_messages (talent_id, occurred_at)
  where direction = 'inbound';

create index if not exists talent_integrations_action_gmail_idx
  on public.talent_integrations (talent_id, created_at)
  where provider = 'gmail';

create or replace function public.get_ops_talent_action_logs_v1(
  p_group text default 'product',
  p_view text default 'summary',
  p_days integer default 30,
  p_weeks integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_summary_start timestamptz;
  v_current_week date;
  v_week_start date;
  v_week_end date;
  v_result jsonb;
begin
  if p_group not in ('product', 'recommendations', 'communication') then
    raise exception 'Unsupported action source group: %', p_group;
  end if;
  if p_view not in ('summary', 'weekly') then
    raise exception 'Unsupported action log view: %', p_view;
  end if;
  if p_days < 1 or p_days > 365 then
    raise exception 'p_days must be between 1 and 365';
  end if;
  if p_weeks < 2 or p_weeks > 26 then
    raise exception 'p_weeks must be between 2 and 26';
  end if;

  v_summary_start := (
    (
      timezone('Asia/Seoul', v_now)::date - (p_days - 1)
    )::timestamp at time zone 'Asia/Seoul'
  );
  v_current_week := date_trunc(
    'week',
    timezone('Asia/Seoul', v_now)
  )::date;
  -- Only closed signup weeks are compared. Each user then gets the same
  -- seven-day post-onboarding observation window.
  v_week_end := v_current_week - 7;
  v_week_start := v_week_end - (p_weeks * 7);

  with
  action_catalog(group_name, action_id, sort_order) as (
    values
      ('product', 'brief_viewed', 10),
      ('product', 'profile_context_changed', 20),
      ('product', 'recommendation_advanced', 30),
      ('product', 'job_posting_opened', 40),
      ('product', 'recommend_job_postings_called', 50),
      ('product', 'priority_review_called', 60),
      ('product', 'history_pipeline_viewed', 70),
      ('product', 'history_position_detail_viewed', 80),
      ('product', 'history_company_modal_opened', 90),
      ('product', 'composer_add_clicked', 100),
      ('product', 'settings_opened', 110),
      ('product', 'referral_viewed', 120),
      ('product', 'gmail_connect_clicked', 130),
      ('product', 'gmail_connect_succeeded', 140),
      ('product', 'gmail_connect_failed', 150),
      ('product', 'update_notes_viewed', 160),
      ('product', 'about_viewed', 170),
      ('recommendations', 'external_recommendation_received', 10),
      ('recommendations', 'external_recommendation_viewed', 20),
      ('recommendations', 'recommendation_feedback_any', 30),
      ('recommendations', 'internal_recommendation_received', 40),
      ('recommendations', 'internal_recommendation_feedback', 50),
      ('communication', 'two_way_call', 10),
      ('communication', 'email_replied', 20)
  ),
  selected_actions as materialized (
    select catalog.action_id, catalog.sort_order
    from action_catalog catalog
    where catalog.group_name = p_group
  ),
  included_users as materialized (
    select users.user_id, users.created_at as signup_at
    from public.talent_users users
    where users.deleted_at is null
      and split_part(lower(coalesce(users.email, '')), '@', 2)
        <> 'matchharper.com'
      and not exists (
        select 1
        from public.logs marker
        where marker.type = 'analytics_excluded_test_fixture_talent'
          and marker.user_id = users.user_id
      )
  ),
  event_completion as materialized (
    select
      event.talent_id as user_id,
      min(event.created_at) as completed_at
    from public.talent_activity_events event
    join included_users users on users.user_id = event.talent_id
    where event.event_type = 'onboarding_completed'
    group by event.talent_id
  ),
  completed_users as materialized (
    select
      users.user_id,
      users.signup_at,
      coalesce(completion.completed_at, setting.updated_at) as completed_at
    from included_users users
    join public.talent_setting setting on setting.user_id = users.user_id
    left join event_completion completion on completion.user_id = users.user_id
    where setting.is_onboarding_done is true
  ),
  scoped_users as materialized (
    select
      users.user_id,
      users.signup_at,
      users.completed_at,
      date_trunc(
        'week',
        timezone('Asia/Seoul', users.signup_at)
      )::date as signup_week
    from completed_users users
    where (
        p_view = 'summary'
        and users.signup_at >= v_summary_start
        and users.signup_at <= v_now
      )
      or (
        p_view = 'weekly'
        and users.signup_at >= (
          v_week_start::timestamp at time zone 'Asia/Seoul'
        )
        and users.signup_at < (
          v_week_end::timestamp at time zone 'Asia/Seoul'
        )
        and users.completed_at + interval '7 days' <= v_now
      )
  ),
  test_only_roles as materialized (
    select role.role_id
    from public.company_roles role
    where lower(coalesce(role.information ->> 'testOnly', 'false')) = 'true'
  ),
  log_actions as materialized (
    select
      case log.type
        when 'career_click_chat_composer_add'
          then 'composer_add_clicked'
        when 'career_click_history_open_company'
          then 'history_company_modal_opened'
        when 'career_click_mobile_history_open_company'
          then 'history_company_modal_opened'
        when 'career_referral_viewed'
          then 'referral_viewed'
        when 'career_view_update_notes'
          then 'update_notes_viewed'
        when 'career_view_about'
          then 'about_viewed'
        when 'career_click_open_settings'
          then 'settings_opened'
        when 'career_view_settings'
          then 'settings_opened'
        when 'career_view_history_saved_pipeline'
          then 'history_pipeline_viewed'
        when 'career_view_history_saved_detail'
          then 'history_position_detail_viewed'
        when 'career_view_profile_brief'
          then 'brief_viewed'
        when 'career_click_profile_section_brief'
          then 'brief_viewed'
        when 'career_click_history_next'
          then 'recommendation_advanced'
        when 'career_click_mobile_history_next'
          then 'recommendation_advanced'
        when 'career_click_history_open_jd'
          then 'job_posting_opened'
        when 'career_click_mobile_history_open_jd'
          then 'job_posting_opened'
        when 'career_tool_call:recommend_job_postings'
          then 'recommend_job_postings_called'
        when 'career_tool_call:internal_role_priority_review'
          then 'priority_review_called'
        when 'career_click_resume_links_connect_gmail'
          then 'gmail_connect_clicked'
        when 'career_gmail_connect_succeeded'
          then 'gmail_connect_succeeded'
        when 'career_gmail_connect_failed'
          then 'gmail_connect_failed'
        else null
      end as action_id,
      log.user_id,
      log.created_at as occurred_at
    from public.logs log
    join scoped_users users on users.user_id = log.user_id
    where p_group = 'product'
      and log.type in (
        'career_click_chat_composer_add',
        'career_click_history_open_company',
        'career_click_mobile_history_open_company',
        'career_referral_viewed',
        'career_view_update_notes',
        'career_view_about',
        'career_click_open_settings',
        'career_view_settings',
        'career_view_history_saved_pipeline',
        'career_view_history_saved_detail',
        'career_view_profile_brief',
        'career_click_profile_section_brief',
        'career_click_history_next',
        'career_click_mobile_history_next',
        'career_click_history_open_jd',
        'career_click_mobile_history_open_jd',
        'career_tool_call:recommend_job_postings',
        'career_tool_call:internal_role_priority_review',
        'career_click_resume_links_connect_gmail',
        'career_gmail_connect_succeeded',
        'career_gmail_connect_failed'
      )
      and (
        log.type not in (
          'career_click_history_open_company',
          'career_click_mobile_history_open_company'
        )
        or nullif(log.meta_data ->> 'companyId', '') is not null
      )
  ),
  context_actions as materialized (
    select
      'profile_context_changed'::text as action_id,
      context.talent_id as user_id,
      event.occurred_at
    from public.talent_contexts context
    join scoped_users users on users.user_id = context.talent_id
    cross join lateral (
      values
        (context.created_at),
        (case
          when context.updated_at > context.created_at then context.updated_at
          else null
        end),
        (context.deleted_at)
    ) as event(occurred_at)
    where p_group = 'product'
      and event.occurred_at is not null
      and event.occurred_at >= users.completed_at
  ),
  gmail_success_actions as materialized (
    select
      'gmail_connect_succeeded'::text as action_id,
      integration.talent_id as user_id,
      integration.created_at as occurred_at
    from public.talent_integrations integration
    join scoped_users users on users.user_id = integration.talent_id
    where p_group = 'product'
      and integration.provider = 'gmail'
  ),
  recommendation_actions as materialized (
    select
      action.action_id,
      recommendation.talent_id as user_id,
      action.occurred_at
    from public.talent_opportunity_recommendation recommendation
    join scoped_users users on users.user_id = recommendation.talent_id
    cross join lateral (
      values
        (
          case
            when recommendation.opportunity_type = 'external_jd'
              then 'external_recommendation_received'
            else null
          end,
          recommendation.recommended_at
        ),
        (
          case
            when recommendation.opportunity_type = 'external_jd'
              and recommendation.viewed_at is not null
              then 'external_recommendation_viewed'
            else null
          end,
          recommendation.viewed_at
        ),
        (
          case
            when recommendation.feedback_at is not null
              or nullif(btrim(coalesce(recommendation.feedback, '')), '')
                is not null
              then 'recommendation_feedback_any'
            else null
          end,
          case
            when recommendation.feedback_at is not null
              or nullif(btrim(coalesce(recommendation.feedback, '')), '')
                is not null
              then coalesce(
                recommendation.feedback_at,
                recommendation.updated_at,
                recommendation.recommended_at
              )
            else null
          end
        ),
        (
          case
            when recommendation.opportunity_type = 'internal_recommendation'
              then 'internal_recommendation_received'
            else null
          end,
          recommendation.recommended_at
        ),
        (
          case
            when recommendation.opportunity_type = 'internal_recommendation'
              and (
                recommendation.feedback_at is not null
                or nullif(btrim(coalesce(recommendation.feedback, '')), '')
                  is not null
              )
              then 'internal_recommendation_feedback'
            else null
          end,
          case
            when recommendation.opportunity_type = 'internal_recommendation'
              and (
                recommendation.feedback_at is not null
                or nullif(btrim(coalesce(recommendation.feedback, '')), '')
                  is not null
              )
              then coalesce(
                recommendation.feedback_at,
                recommendation.updated_at,
                recommendation.recommended_at
              )
            else null
          end
        )
    ) as action(action_id, occurred_at)
    where p_group = 'recommendations'
      and action.action_id is not null
      and action.occurred_at is not null
      and not exists (
        select 1
        from test_only_roles role
        where role.role_id = recommendation.role_id
      )
  ),
  call_actions as materialized (
    select
      'two_way_call'::text as action_id,
      call.user_id,
      max(message.created_at) as occurred_at
    from public.talent_calls call
    join scoped_users users on users.user_id = call.user_id
    join public.talent_messages message
      on message.conversation_id = call.conversation_id
      and message.user_id = call.user_id
      and message.message_type = 'call_transcript'
    where p_group = 'communication'
      and call.conversation_id is not null
    group by call.id, call.user_id
    having bool_or(message.role = 'user')
      and bool_or(message.role = 'assistant')
  ),
  email_actions as materialized (
    select
      'email_replied'::text as action_id,
      email.talent_id as user_id,
      email.occurred_at
    from public.career_email_messages email
    join scoped_users users on users.user_id = email.talent_id
    where p_group = 'communication'
      and email.direction = 'inbound'
  ),
  raw_actions as materialized (
    select * from log_actions where action_id is not null
    union all
    select * from context_actions
    union all
    select * from gmail_success_actions
    union all
    select * from recommendation_actions
    union all
    select * from call_actions
    union all
    select * from email_actions
  ),
  qualified_users as materialized (
    select distinct action.action_id, action.user_id
    from raw_actions action
    join scoped_users users on users.user_id = action.user_id
    join selected_actions selected on selected.action_id = action.action_id
    where action.occurred_at >= case
        when p_view = 'weekly' then users.completed_at
        else users.signup_at
      end
      and (
        p_view = 'summary'
        or action.occurred_at < users.completed_at + interval '7 days'
      )
  ),
  summary_cohort as (
    select count(*)::integer as cohort_total
    from scoped_users
  ),
  summary_counts as (
    select
      selected.action_id,
      selected.sort_order,
      count(qualified.user_id)::integer as user_count
    from selected_actions selected
    left join qualified_users qualified
      on qualified.action_id = selected.action_id
    group by selected.action_id, selected.sort_order
  ),
  summary_items as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'actionId', counts.action_id,
          'userCount', counts.user_count,
          'percentage', case
            when cohort.cohort_total = 0 then 0
            else round(
              100 * counts.user_count::numeric / cohort.cohort_total,
              1
            )
          end
        )
        order by counts.sort_order
      ),
      '[]'::jsonb
    ) as items
    from summary_counts counts
    cross join summary_cohort cohort
  ),
  weeks as materialized (
    select week_start::date
    from generate_series(
      v_week_start::timestamp,
      (v_week_end - 7)::timestamp,
      interval '7 days'
    ) as series(week_start)
  ),
  weekly_cohorts as (
    select
      week.week_start,
      count(users.user_id)::integer as cohort_total
    from weeks week
    left join scoped_users users on users.signup_week = week.week_start
    group by week.week_start
  ),
  weekly_counts as (
    select
      users.signup_week as week_start,
      qualified.action_id,
      count(qualified.user_id)::integer as user_count
    from qualified_users qualified
    join scoped_users users on users.user_id = qualified.user_id
    group by users.signup_week, qualified.action_id
  ),
  weekly_items as (
    select
      cohort.week_start,
      cohort.cohort_total,
      jsonb_agg(
        jsonb_build_object(
          'actionId', selected.action_id,
          'userCount', coalesce(counts.user_count, 0),
          'percentage', case
            when cohort.cohort_total = 0 then 0
            else round(
              100 * coalesce(counts.user_count, 0)::numeric
                / cohort.cohort_total,
              1
            )
          end
        )
        order by selected.sort_order
      ) as items
    from weekly_cohorts cohort
    cross join selected_actions selected
    left join weekly_counts counts
      on counts.week_start = cohort.week_start
      and counts.action_id = selected.action_id
    group by cohort.week_start, cohort.cohort_total
  ),
  weekly_payload as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'weekStart', weekly.week_start,
          'cohortTotal', weekly.cohort_total,
          'items', weekly.items
        )
        order by weekly.week_start
      ),
      '[]'::jsonb
    ) as weeks
    from weekly_items weekly
  )
  select jsonb_build_object(
    'generatedAt', v_now,
    'filters', jsonb_build_object(
      'group', p_group,
      'view', p_view,
      'days', p_days,
      'weeks', p_weeks
    ),
    'cohortTotal', case
      when p_view = 'summary' then cohort.cohort_total
      else 0
    end,
    'items', case
      when p_view = 'summary' then summary.items
      else '[]'::jsonb
    end,
    'weeks', case
      when p_view = 'weekly' then weekly.weeks
      else '[]'::jsonb
    end
  )
  into v_result
  from summary_cohort cohort
  cross join summary_items summary
  cross join weekly_payload weekly;

  return v_result;
end;
$$;

revoke all on function public.get_ops_talent_action_logs_v1(
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function public.get_ops_talent_action_logs_v1(
  text,
  text,
  integer,
  integer
) to service_role;

commit;
