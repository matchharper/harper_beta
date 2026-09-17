-- Complete the live creator operating view used by the Sheet bridge.
-- The Sheet-specific views already expose these values; this keeps the
-- canonical creator read API consistent with the deployed operating model.

create or replace view public.gtm_creator_overview
with (security_invoker = true) as
select
  creator.*,
  coalesce((
    select string_agg(
      (contact ->> 'channel') || ': ' || (contact ->> 'address')
        || case
          when nullif(contact ->> 'status', '') is not null
            then ' [' || (contact ->> 'status') || ']'
          else ''
        end,
      E'\n' order by contact ->> 'channel', contact ->> 'address'
    )
    from jsonb_array_elements(creator.contacts) contact
  ), '') as contact_summary,
  jsonb_array_length(creator.contacts) > 0 as has_contact_method,
  coalesce(account_rollup.account_count, 0) as account_count,
  coalesce(account_rollup.platforms, '{}'::text[]) as platforms,
  coalesce(account_rollup.account_summary, '') as account_summary,
  coalesce(account_rollup.audience_summary, '') as audience_summary,
  account_rollup.total_followers,
  account_rollup.content_count_365d,
  account_rollup.latest_post_at,
  account_rollup.profile_metrics_as_of,
  creator_refresh.fields as refresh_fields,
  array_to_string(creator_refresh.fields, ', ') as refresh_fields_text,
  case
    when coalesce(account_rollup.account_count, 0) = 0 then 'missing_accounts'
    when cardinality(creator.activity_regions) = 0
      or cardinality(creator.content_topics) = 0
      or jsonb_array_length(creator.contacts) = 0
      or account_rollup.incomplete_accounts > 0
      then 'incomplete'
    when account_rollup.stale_accounts > 0 then 'stale'
    else 'current'
  end as data_status,
  case
    when creator.do_not_contact then 'do_not_contact'
    when contact.last_inbound_at is not null
      and contact.last_inbound_at >= coalesce(contact.last_outbound_at, '-infinity'::timestamptz)
      then 'replied'
    when contact.last_outbound_at is not null then 'awaiting_reply'
    when contact.last_draft_at is not null then 'draft_ready'
    when current_collaboration.id is not null then 'preparing'
    else 'not_contacted'
  end as outreach_status,
  greatest(contact.last_outbound_at, contact.last_inbound_at) as last_contact_at,
  contact.last_outbound_at,
  contact.last_inbound_at,
  current_collaboration.id as current_collaboration_id,
  current_collaboration.ref as current_collaboration_ref,
  current_collaboration.title as current_collaboration_title,
  current_collaboration.status as current_collaboration_status,
  current_collaboration.due_at as current_collaboration_due_at,
  next_action.action as next_action,
  next_action.due_at as next_action_due_at,
  coalesce(history.collaboration_count, 0) as collaboration_count,
  coalesce(history.published_content_count, 0) as published_content_count,
  history.last_published_at,
  decision.direction as latest_direction,
  decision.body as latest_direction_reason,
  decision.occurred_at as latest_direction_at,
  primary_account.platform as primary_platform,
  primary_account.handle as primary_handle,
  primary_account.profile_url as primary_profile_url,
  primary_contact.email as primary_email,
  contact.first_outbound_at as first_outreach_at,
  contact.first_inbound_at as first_reply_at,
  current_collaboration.plan_ref as current_plan_ref,
  current_collaboration.plan_name as current_plan_name
from public.gtm_creators creator
left join lateral (
  select
    account.platform,
    account.handle,
    account.profile_url
  from public.gtm_account_overview account
  where account.creator_id = creator.id
    and account.archived_at is null
  order by account.follower_count desc nulls last,
    account.platform,
    account.handle nulls last,
    account.ref
  limit 1
) primary_account on true
left join lateral (
  select contact ->> 'address' as email
  from jsonb_array_elements(creator.contacts) contact
  where lower(coalesce(contact ->> 'channel', '')) = 'email'
    and lower(coalesce(contact ->> 'status', '')) not in (
      'invalid',
      'bounced',
      'revoked'
    )
  order by
    (lower(coalesce(contact ->> 'party', '')) = 'creator') desc,
    (lower(coalesce(contact ->> 'status', '')) in ('active', 'verified')) desc,
    contact ->> 'as_of' desc nulls last,
    contact ->> 'address'
  limit 1
) primary_contact on true
left join lateral (
  select
    count(*)::integer as account_count,
    array_agg(distinct account.platform order by account.platform) as platforms,
    string_agg(
      account.platform || ' ' || coalesce(nullif('@' || account.handle, '@'), account.profile_url, '(handle missing)')
        || ' · followers ' || coalesce(account.follower_count::text, '?')
        || ' · posts/365d ' || coalesce(account.content_count_365d::text, '?'),
      E'\n' order by account.platform, account.handle
    ) as account_summary,
    string_agg(
      account.platform || ': ' || account.audience_summary,
      E'\n' order by account.platform
    ) filter (where nullif(account.audience_summary, '') is not null) as audience_summary,
    sum(account.follower_count) as total_followers,
    sum(account.content_count_365d) as content_count_365d,
    max(account.last_post_at) as latest_post_at,
    min(account.profile_metrics_as_of) as profile_metrics_as_of,
    array(
      select distinct field
      from public.gtm_account_overview nested_account
      cross join lateral unnest(nested_account.refresh_fields) field
      where nested_account.creator_id = creator.id
        and nested_account.archived_at is null
      order by field
    ) as refresh_fields,
    count(*) filter (where account.data_status = 'incomplete')::integer as incomplete_accounts,
    count(*) filter (where account.data_status = 'stale')::integer as stale_accounts
  from public.gtm_account_overview account
  where account.creator_id = creator.id
    and account.archived_at is null
) account_rollup on true
left join lateral (
  select array(
    select distinct field
    from unnest(
      coalesce(account_rollup.refresh_fields, '{}'::text[])
      || array_remove(array[
        case when cardinality(creator.activity_regions) = 0 then 'activity_regions' end,
        case when cardinality(creator.content_topics) = 0 then 'content_topics' end,
        case when jsonb_array_length(creator.contacts) = 0 then 'contact_method' end
      ], null)::text[]
    ) field
    order by field
  ) as fields
) creator_refresh on true
left join lateral (
  select
    min(activity.occurred_at) filter (where activity.kind = 'message_sent') as first_outbound_at,
    min(activity.occurred_at) filter (where activity.kind = 'message_received') as first_inbound_at,
    max(activity.occurred_at) filter (where activity.kind = 'message_draft') as last_draft_at,
    max(activity.occurred_at) filter (where activity.kind = 'message_sent') as last_outbound_at,
    max(activity.occurred_at) filter (where activity.kind = 'message_received') as last_inbound_at
  from public.gtm_activities activity
  where activity.archived_at is null
    and (
      (activity.entity = 'gtm_creators' and activity.entity_id = creator.id)
      or (
        activity.entity = 'gtm_collaborations'
        and exists (
          select 1
          from public.gtm_collaborations collaboration
          where collaboration.id = activity.entity_id
            and collaboration.creator_id = creator.id
        )
      )
    )
) contact on true
left join lateral (
  select collaboration.id, collaboration.ref, collaboration.title, collaboration.status,
    collaboration.due_at, plan.ref as plan_ref, plan.name as plan_name
  from public.gtm_collaborations collaboration
  left join public.gtm_plans plan on plan.id = collaboration.plan_id
  where collaboration.creator_id = creator.id
    and collaboration.archived_at is null
    and collaboration.closed_at is null
  order by collaboration.created_at desc
  limit 1
) current_collaboration on true
left join lateral (
  select task.action, task.due_at
  from public.gtm_today task
  join public.gtm_collaborations collaboration
    on task.entity = 'gtm_collaborations'
    and task.entity_id = collaboration.id
  where collaboration.creator_id = creator.id
  order by task.due_at nulls last, task.ref
  limit 1
) next_action on true
left join lateral (
  select
    count(distinct collaboration.id)::integer as collaboration_count,
    count(content.id) filter (where content.published_at is not null)::integer as published_content_count,
    max(content.published_at) as last_published_at
  from public.gtm_collaborations collaboration
  left join public.gtm_contents content
    on content.collaboration_id = collaboration.id
    and content.archived_at is null
  where collaboration.creator_id = creator.id
    and collaboration.archived_at is null
) history on true
left join lateral (
  select activity.payload ->> 'direction' as direction, activity.body, activity.occurred_at
  from public.gtm_activities activity
  where activity.kind = 'review_adopted'
    and activity.archived_at is null
    and (
      (activity.entity = 'gtm_creators' and activity.entity_id = creator.id)
      or (
        activity.entity = 'gtm_collaborations'
        and exists (
          select 1 from public.gtm_collaborations collaboration
          where collaboration.id = activity.entity_id and collaboration.creator_id = creator.id
        )
      )
      or (
        activity.entity = 'gtm_contents'
        and exists (
          select 1 from public.gtm_contents content
          where content.id = activity.entity_id and content.creator_id = creator.id
        )
      )
    )
  order by activity.occurred_at desc, activity.created_at desc
  limit 1
) decision on true;

revoke all on public.gtm_creator_overview
  from public, anon, authenticated;

comment on view public.gtm_creator_overview is
  'Default creator operating read: normalized account metrics, outreach state, freshness, current work, and adopted direction.';

notify pgrst, 'reload schema';
