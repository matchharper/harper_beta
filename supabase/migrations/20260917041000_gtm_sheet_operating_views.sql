-- Denormalized, read-only operating views for the three creator-facing Sheets.
-- No new business ledger is introduced: Supabase tables remain the source of truth.

create or replace view public.gtm_creator_directory_sheet_v1
with (security_invoker = true) as
select
  creator.*,
  primary_account.platform as sheet_primary_platform,
  primary_account.handle as sheet_primary_handle,
  primary_account.profile_url as sheet_primary_profile_url,
  primary_contact.email as sheet_primary_email,
  contact.first_outbound_at as sheet_first_outreach_at,
  contact.first_inbound_at as sheet_first_reply_at,
  active_plan.ref as sheet_current_plan_ref,
  active_plan.name as sheet_current_plan_name,
  (
    contact.first_outbound_at is not null
    or contact.first_inbound_at is not null
    or exists (
      select 1
      from public.gtm_collaborations collaboration
      where collaboration.creator_id = creator.id
        and collaboration.archived_at is null
        and (
          collaboration.agreed_at is not null
          or collaboration.closed_at is not null
          or collaboration.status <> 'draft'
        )
    )
    or exists (
      select 1
      from public.gtm_contents content
      where content.creator_id = creator.id
        and content.archived_at is null
        and content.published_at is not null
    )
  ) as sheet_has_relationship_history
from public.gtm_creator_overview creator
left join lateral (
  select account.platform, account.handle, account.profile_url
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
    min(activity.occurred_at) filter (
      where activity.kind = 'message_sent'
    ) as first_outbound_at,
    min(activity.occurred_at) filter (
      where activity.kind = 'message_received'
    ) as first_inbound_at
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
      or (
        activity.entity = 'gtm_contents'
        and exists (
          select 1
          from public.gtm_contents content
          where content.id = activity.entity_id
            and content.creator_id = creator.id
        )
      )
    )
) contact on true
left join public.gtm_collaborations active_collaboration
  on active_collaboration.id = creator.current_collaboration_id
left join public.gtm_plans active_plan
  on active_plan.id = active_collaboration.plan_id;

create or replace view public.gtm_connected_creator_sheet_v1
with (security_invoker = true) as
select
  creator.*,
  case
    when creator.do_not_contact then 'do_not_contact'
    when creator.current_collaboration_id is not null then 'active_collaboration'
    when creator.sheet_first_reply_at is not null then 'replied'
    when creator.sheet_first_outreach_at is not null then 'contacted'
    else 'past_collaboration'
  end as relationship_status,
  history.agreed_collaboration_count,
  history.closed_collaboration_count,
  history.collaboration_history_summary,
  history.content_history_summary,
  costs.lifetime_incurred_cost,
  costs.lifetime_committed_cash,
  costs.lifetime_net_paid,
  costs.relationship_cost_currency,
  costs.incomplete_cost_items
from public.gtm_creator_directory_sheet_v1 creator
left join lateral (
  select
    count(*) filter (
      where collaboration.agreed_at is not null
    )::integer as agreed_collaboration_count,
    count(*) filter (
      where collaboration.closed_at is not null
    )::integer as closed_collaboration_count,
    string_agg(
      '#' || collaboration.ref::text
        || ' · ' || collaboration.status
        || ' · ' || collaboration.title
        || case
          when plan.ref is not null
            then ' · plan #' || plan.ref::text || ' ' || plan.name
          else ''
        end
        || case
          when collaboration.agreed_at is not null
            then ' · agreed ' || collaboration.agreed_at::date::text
          else ''
        end
        || case
          when collaboration.closed_at is not null
            then ' · closed ' || collaboration.closed_at::date::text
          else ''
        end,
      E'\n' order by collaboration.created_at desc, collaboration.ref desc
    ) as collaboration_history_summary,
    (
      select string_agg(
        '#' || content.ref::text
          || ' · ' || content.publish_status
          || ' · ' || content.title
          || case
            when campaign.ref is not null
              then ' · campaign #' || campaign.ref::text || ' ' || campaign.name
            else ''
          end
          || case
            when format.ref is not null
              then ' · format #' || format.ref::text || ' ' || format.name
            else ''
          end
          || case
            when content.published_at is not null
              then ' · published ' || content.published_at::date::text
            else ''
          end,
        E'\n' order by content.created_at desc, content.ref desc
      )
      from public.gtm_contents content
      left join public.gtm_campaigns campaign on campaign.id = content.campaign_id
      left join public.gtm_formats format on format.id = content.format_id
      where content.creator_id = creator.id
        and content.archived_at is null
    ) as content_history_summary
  from public.gtm_collaborations collaboration
  left join public.gtm_plans plan on plan.id = collaboration.plan_id
  where collaboration.creator_id = creator.id
    and collaboration.archived_at is null
) history on true
left join lateral (
  with creator_costs as (
    select distinct cost.*
    from public.gtm_costs cost
    left join public.gtm_collaborations collaboration
      on collaboration.id = cost.collaboration_id
    where cost.archived_at is null
      and (
        collaboration.creator_id = creator.id
        or exists (
          select 1
          from jsonb_array_elements(cost.allocations) allocation
          join public.gtm_contents content
            on content.id = nullif(allocation ->> 'content_id', '')::uuid
          where content.creator_id = creator.id
            and content.archived_at is null
        )
      )
  )
  select
    case when count(distinct cost.base_currency) = 1 then sum(
      coalesce(
        cost.incurred_amount,
        case
          when cost.kind = 'labor'
            and cost.labor_minutes is not null
            and cost.hourly_rate is not null
            then cost.labor_minutes * cost.hourly_rate / 60
        end
      ) * cost.fx_rate
    ) end as lifetime_incurred_cost,
    case when count(distinct cost.base_currency) = 1 then sum(
      case
        when cost.kind = 'labor' then 0
        else greatest(
          coalesce(cost.agreed_amount, 0),
          coalesce(cost.incurred_amount, 0),
          public.gtm_net_paid(cost.payments)
        ) * cost.fx_rate
      end
    ) end as lifetime_committed_cash,
    case when count(distinct cost.base_currency) = 1
      then sum(public.gtm_net_paid(cost.payments) * cost.fx_rate)
    end as lifetime_net_paid,
    case
      when count(distinct cost.base_currency) = 1 then min(cost.base_currency)
      when count(distinct cost.base_currency) > 1 then 'MIXED'
    end as relationship_cost_currency,
    count(*) filter (
      where cost.incurred_amount is null
        and (
          cost.kind <> 'labor'
          or cost.labor_minutes is null
          or cost.hourly_rate is null
        )
    )::integer as incomplete_cost_items
  from creator_costs cost
) costs on true
where creator.sheet_has_relationship_history;

create or replace view public.gtm_outreach_sheet_v1
with (security_invoker = true) as
select
  activity.id,
  activity.ref,
  activity.kind,
  activity.body,
  activity.occurred_at,
  activity.source_ref,
  activity.provider,
  activity.connection_ref,
  activity.external_id,
  activity.thread_id,
  activity.created_by,
  activity.created_at,
  activity.updated_at,
  activity.row_version,
  activity.archived_at,
  case
    when activity.kind = 'message_draft' then 'draft'
    when activity.kind = 'message_received' then 'inbound'
    when activity.kind like 'message_%' then 'outbound'
    else 'event'
  end as direction,
  creator.id as creator_id,
  creator.ref as creator_ref,
  creator.name as creator_name,
  directory.sheet_primary_platform as primary_platform,
  directory.sheet_primary_handle as primary_handle,
  collaboration.id as collaboration_id,
  collaboration.ref as collaboration_ref,
  collaboration.title as collaboration_title,
  plan.ref as plan_ref,
  plan.name as plan_name,
  coalesce(
    activity.payload ->> 'channel',
    activity.provider
  ) as channel,
  coalesce(
    activity.payload ->> 'recipient',
    activity.payload ->> 'to',
    activity.payload ->> 'from',
    activity.payload ->> 'sender',
    activity.payload ->> 'address'
  ) as counterparty,
  activity.payload ->> 'subject' as subject,
  directory.outreach_status as creator_outreach_status,
  directory.next_action,
  directory.next_action_due_at
from public.gtm_activities activity
left join public.gtm_collaborations direct_collaboration
  on activity.entity = 'gtm_collaborations'
  and direct_collaboration.id = activity.entity_id
left join public.gtm_contents target_content
  on activity.entity = 'gtm_contents'
  and target_content.id = activity.entity_id
left join public.gtm_collaborations content_collaboration
  on content_collaboration.id = target_content.collaboration_id
left join public.gtm_collaborations collaboration
  on collaboration.id = coalesce(
    direct_collaboration.id,
    content_collaboration.id
  )
left join public.gtm_creators creator
  on creator.id = coalesce(
    case
      when activity.entity = 'gtm_creators' then activity.entity_id
    end,
    direct_collaboration.creator_id,
    target_content.creator_id,
    content_collaboration.creator_id
  )
left join public.gtm_creator_directory_sheet_v1 directory
  on directory.id = creator.id
left join public.gtm_plans plan
  on plan.id = coalesce(
    collaboration.plan_id,
    target_content.plan_id
  )
where activity.kind like 'message_%';

revoke all on
  public.gtm_creator_directory_sheet_v1,
  public.gtm_connected_creator_sheet_v1,
  public.gtm_outreach_sheet_v1
from public, anon, authenticated;

create or replace function public.gtm_sheet_view(
  p_token text,
  p_view text,
  p_id uuid default null,
  p_limit integer default 500,
  p_offset integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  credential public.gtm_access_tokens;
  read_table text;
  result jsonb;
  next_offset integer;
begin
  select * into credential
  from public.gtm_access_tokens
  where token_hash = encode(
      sha256(convert_to(coalesce(p_token, ''), 'UTF8')),
      'hex'
    )
    and revoked_at is null
    and expires_at > now();

  if not found then
    raise exception 'Invalid or expired GTM access token' using errcode = '28000';
  end if;

  read_table := case p_view
    when 'creator_directory' then 'gtm_creator_directory_sheet_v1'
    when 'connected_creators' then 'gtm_connected_creator_sheet_v1'
    when 'outreach_log' then 'gtm_outreach_sheet_v1'
    else null
  end;

  if read_table is null then
    raise exception 'Unknown GTM Sheet view';
  end if;
  if p_limit < 1 or p_limit > 500 then
    raise exception 'p_limit must be between 1 and 500';
  end if;
  if p_offset < 0 then
    raise exception 'p_offset cannot be negative';
  end if;

  update public.gtm_access_tokens
  set last_used_at = now()
  where id in (
    select id
    from public.gtm_access_tokens
    where id = credential.id
      and (
        last_used_at is null
        or last_used_at < now() - interval '5 minutes'
      )
    for update skip locked
  );

  if p_id is not null then
    execute format(
      'select to_jsonb(row) from public.%I row where id = $1',
      read_table
    ) into result using p_id;
    return jsonb_build_object('record', result, 'as_of', now());
  end if;

  if p_view = 'outreach_log' then
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(row)), ''[]''::jsonb)'
        || ' from (select * from public.%I'
        || ' where archived_at is null'
        || ' order by occurred_at desc, ref desc limit $1 offset $2) row',
      read_table
    ) into result using p_limit, p_offset;
  else
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(row)), ''[]''::jsonb)'
        || ' from (select * from public.%I'
        || ' where archived_at is null'
        || ' order by ref limit $1 offset $2) row',
      read_table
    ) into result using p_limit, p_offset;
  end if;

  next_offset := case
    when jsonb_array_length(result) = p_limit then p_offset + p_limit
  end;

  return jsonb_build_object(
    'rows', result,
    'offset', p_offset,
    'next_offset', next_offset,
    'as_of', now()
  );
end;
$$;

revoke all on function public.gtm_sheet_view(
  text,
  text,
  uuid,
  integer,
  integer
) from public;
grant execute on function public.gtm_sheet_view(
  text,
  text,
  uuid,
  integer,
  integer
) to anon, authenticated, service_role;

comment on view public.gtm_creator_directory_sheet_v1 is
  'Editable creator directory read model: research facts plus compact outreach and active-work state.';
comment on view public.gtm_connected_creator_sheet_v1 is
  'Read-only relationship rollup: connected creators, collaboration/content history, performance join keys, and exact recorded costs.';
comment on view public.gtm_outreach_sheet_v1 is
  'Read-only chronological outreach messages joined to creator, collaboration, and plan context.';
comment on function public.gtm_sheet_view(text, text, uuid, integer, integer) is
  'Scoped read API for denormalized Google Sheet views. Physical GTM tables remain canonical.';

notify pgrst, 'reload schema';
