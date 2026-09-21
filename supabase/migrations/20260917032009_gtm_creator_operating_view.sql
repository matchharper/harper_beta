-- Keep multi-account facts normalized while making the default creator read
-- useful for research, outreach, and daily operations.
alter table public.gtm_creators
  add column if not exists activity_regions text[] not null default '{}',
  add column if not exists content_topics text[] not null default '{}';

update public.gtm_creators
set activity_regions = array[country]
where cardinality(activity_regions) = 0
  and nullif(btrim(country), '') is not null;

alter table public.gtm_accounts
  add column if not exists last_post_at timestamptz;

create index if not exists gtm_metric_account_latest_idx
  on public.gtm_metric_snapshots (account_id, metric, as_of desc)
  where account_id is not null and archived_at is null;

create index if not exists gtm_contents_creator_published_idx
  on public.gtm_contents (creator_id, published_at desc)
  where creator_id is not null and archived_at is null;

create or replace view public.gtm_account_overview
with (security_invoker = true) as
select
  account.*,
  followers.value as follower_count,
  followers.as_of as followers_as_of,
  followers.source_ref as followers_source_ref,
  posts.value as content_count_365d,
  posts.as_of as content_count_as_of,
  posts.source_ref as content_count_source_ref,
  case
    when followers.as_of is not null and posts.as_of is not null
      then least(followers.as_of, posts.as_of)
    else null
  end as profile_metrics_as_of,
  array_remove(array[
    case when followers.as_of is null then 'followers' end,
    case when posts.as_of is null then 'content_count_365d' end,
    case when account.last_post_at is null then 'last_post_at' end,
    case when nullif(account.audience_summary, '') is null then 'audience' end,
    case when followers.as_of < now() - interval '30 days' then 'followers' end,
    case when posts.as_of < now() - interval '30 days' then 'content_count_365d' end,
    case
      when nullif(account.audience_summary, '') is not null
        and (account.as_of is null or account.as_of < now() - interval '90 days')
        then 'audience'
    end,
    case when account.valid_until is not null and account.valid_until < now() then 'account_evidence' end
  ], null)::text[] as refresh_fields,
  case
    when followers.as_of is null or posts.as_of is null
      or account.last_post_at is null
      or nullif(account.audience_summary, '') is null
      then 'incomplete'
    when followers.as_of < now() - interval '30 days'
      or posts.as_of < now() - interval '30 days'
      or (
        nullif(account.audience_summary, '') is not null
        and (account.as_of is null or account.as_of < now() - interval '90 days')
      )
      or (account.valid_until is not null and account.valid_until < now())
      then 'stale'
    else 'current'
  end as data_status
from public.gtm_accounts account
left join lateral (
  select metric.value, metric.as_of, metric.source_ref
  from public.gtm_metric_snapshots metric
  where metric.account_id = account.id
    and metric.metric = 'followers'
    and metric.archived_at is null
  order by metric.as_of desc, metric.created_at desc
  limit 1
) followers on true
left join lateral (
  select metric.value, metric.as_of, metric.source_ref
  from public.gtm_metric_snapshots metric
  where metric.account_id = account.id
    and metric.metric = 'published_content_count'
    and metric.period_start is not null
    and metric.period_end is not null
    and metric.period_end - metric.period_start between interval '364 days' and interval '366 days'
    and metric.archived_at is null
  order by metric.as_of desc, metric.created_at desc
  limit 1
) posts on true;

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

revoke all on public.gtm_account_overview, public.gtm_creator_overview
  from public, anon, authenticated;
create or replace function public.gtm_validate_record(p_entity text,p_record jsonb,p_before jsonb default null)
returns void language plpgsql set search_path=public,pg_temp as $$
declare field text; item jsonb; olditem jsonb; total numeric; n integer; wanted uuid; actual uuid; planrow record;
begin
 foreach field in array array['contacts','action_items','payments','allocations','tracking_links'] loop
  if not(p_record ? field) then continue; end if;
  if jsonb_typeof(p_record->field)<>'array' or jsonb_array_length(p_record->field)>100 then
   raise exception '% must be an array of at most 100 items',field;
  end if;
  if exists(select 1 from jsonb_array_elements(p_record->field)a where nullif(a->>'id','') is null)
   or (select count(*)<>count(distinct a->>'id') from jsonb_array_elements(p_record->field)a) then
   raise exception '% needs unique immutable item IDs',field;
  end if;
  for item in select value from jsonb_array_elements(p_record->field) loop
   if field='contacts' then
    if nullif(item->>'channel','') is null or nullif(item->>'address','') is null
      or nullif(item->>'source_ref','') is null or nullif(item->>'as_of','') is null then
     raise exception 'Contact needs channel, address, source_ref, and as_of'; end if;
    perform (item->>'as_of')::timestamptz;
   elsif field='action_items' then
    if nullif(item->>'text','') is null or item->>'status' not in ('open','done','cancelled') or not(item?'status') then
     raise exception 'Action needs text and open/done/cancelled status'; end if;
    perform nullif(item->>'due_at','')::timestamptz;
   elsif field='payments' then
    if (item->>'amount')::numeric<0 or not(item?'amount') or item->>'kind' not in ('payment','refund') or not(item?'kind') then
     raise exception 'Payment needs nonnegative amount and payment/refund kind'; end if;
    if nullif(item->>'occurred_at','') is null or nullif(item->>'source_ref','') is null then
     raise exception 'Payment needs actual time and evidence'; end if;
    perform (item->>'occurred_at')::timestamptz;
    if item?'external_id' and (nullif(item->>'provider','') is null or nullif(item->>'connection_ref','') is null) then
     raise exception 'External payment needs provider and connection scope'; end if;
    if item?'external_id' and exists(select 1 from public.gtm_costs c cross join lateral jsonb_array_elements(c.payments)a
      where c.id<>(p_record->>'id')::uuid and a->>'external_id'=item->>'external_id'
      and a->>'provider'=item->>'provider' and a->>'connection_ref'=item->>'connection_ref') then
     raise exception 'External payment already recorded'; end if;
   elsif field='allocations' then
    if not(item?'share') or (item->>'share')::numeric<=0 or (item->>'share')::numeric>1
      or num_nonnulls(item->>'content_id',item->>'plan_id')<>1 then
     raise exception 'Allocation needs one target and share between 0 and 1'; end if;
    if item?'content_id' then
     select plan_id into actual from public.gtm_contents where id=(item->>'content_id')::uuid;
     if not found then raise exception 'Allocation content not found'; end if;
     if nullif(p_record->>'plan_id','') is null or actual is distinct from (p_record->>'plan_id')::uuid then
      raise exception 'Content allocations must belong to the cost plan'; end if;
    else
     perform 1 from public.gtm_plans where id=(item->>'plan_id')::uuid;
     if not found or nullif(p_record->>'plan_id','') is not null then
      raise exception 'Plan allocations require an existing plan and no direct cost plan'; end if;
    end if;
   end if;
  end loop;
  if field='allocations' and jsonb_array_length(p_record->field)>0 then
   select sum((a->>'share')::numeric) into total from jsonb_array_elements(p_record->field)a;
   if abs(total-1)>0.00000001 then raise exception 'Allocation shares must sum to 1'; end if;
   if exists(select 1 from jsonb_array_elements(p_record->field)a group by coalesce(a->>'content_id',a->>'plan_id') having count(*)>1) then
    raise exception 'Allocation targets must be unique'; end if;
  elsif field='payments' then
   if exists(select 1 from jsonb_array_elements(p_record->field)a where a?'external_id'
    group by a->>'provider',a->>'connection_ref',a->>'external_id' having count(*)>1) then
    raise exception 'External payment already recorded in this cost'; end if;
  end if;
 end loop;
 if p_entity='gtm_activities' then
  if p_record->>'kind' like 'system.%' then raise exception 'Reserved activity kind'; end if;
  if nullif(p_record->>'request_id','') is not null then raise exception 'Activity request_id is reserved'; end if;
  if nullif(p_record->>'external_id','') is not null and (nullif(p_record->>'provider','') is null or nullif(p_record->>'connection_ref','') is null) then
   raise exception 'External activity needs provider and connection scope'; end if;
  if num_nonnulls(p_record->>'entity',p_record->>'entity_id')=1 then raise exception 'Activity target needs both entity and ID'; end if;
  if p_record->>'entity' is not null then
   if not(p_record->>'entity'=any(array['gtm_creators','gtm_accounts','gtm_campaigns','gtm_formats','gtm_plans','gtm_collaborations','gtm_contents','gtm_activities','gtm_metric_snapshots','gtm_costs'])) then raise exception 'Invalid activity target'; end if;
   execute format('select count(*) from public.%I where id=$1',p_record->>'entity') into n using (p_record->>'entity_id')::uuid;
   if n<>1 then raise exception 'Activity target not found'; end if;
  end if;
  if p_record->>'kind' in ('message_sent','payment_confirmed','published') and nullif(p_record->>'source_ref','') is null then
   raise exception 'Actual execution needs a source reference'; end if;
 end if;
 if p_entity='gtm_contents' and nullif(p_record->>'collaboration_id','') is not null then
  select plan_id,creator_id into planrow from public.gtm_collaborations where id=(p_record->>'collaboration_id')::uuid;
  if planrow.plan_id is distinct from nullif(p_record->>'plan_id','')::uuid or planrow.creator_id is distinct from nullif(p_record->>'creator_id','')::uuid then
   raise exception 'Content must match its collaboration creator and plan'; end if;
 end if;
 if p_entity='gtm_costs' then
  if nullif(p_record->>'collaboration_id','') is not null then
   select plan_id into wanted from public.gtm_collaborations where id=(p_record->>'collaboration_id')::uuid;
   if wanted is distinct from nullif(p_record->>'plan_id','')::uuid then raise exception 'Cost and collaboration plan differ'; end if;
  end if;
  if p_record->>'kind'<>'labor' and greatest(coalesce((p_record->>'agreed_amount')::numeric,0),coalesce((p_record->>'incurred_amount')::numeric,0),public.gtm_net_paid(p_record->'payments'))>0
     and nullif(p_record->>'plan_id','') is null and jsonb_array_length(p_record->'allocations')=0 then
   raise exception 'Cash obligations require a plan or plan allocations'; end if;
  if nullif(p_record->>'archived_at','') is not null and (coalesce((p_record->>'agreed_amount')::numeric,0)>0
    or coalesce((p_record->>'incurred_amount')::numeric,0)>0 or jsonb_array_length(p_record->'payments')>0) then
   raise exception 'Recorded obligations/payments cannot be hidden by archive'; end if;
  if exists(select 1 from public.gtm_cost_plan_amounts c join public.gtm_plans p on p.id=c.plan_id
   where c.cost_id=(p_record->>'id')::uuid and c.base_currency<>p.currency) then
   raise exception 'Cost base currency must match its plan'; end if;
 end if;
end $$;

create or replace function public.gtm_api(
 p_token text,p_action text,p_entity text default null,p_id uuid default null,
 p_expected_version bigint default null,p_data jsonb default '{}',p_request_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare credential public.gtm_access_tokens; allowed text[]:=array['gtm_creators','gtm_accounts','gtm_campaigns','gtm_formats',
 'gtm_plans','gtm_collaborations','gtm_contents','gtm_activities','gtm_metric_snapshots','gtm_costs'];
before_row jsonb; after_row jsonb; result jsonb; related jsonb; key text; columns_sql text; values_sql text; update_sql text;
item jsonb; items jsonb; operation jsonb; arr jsonb; field text; link jsonb; target_id uuid; request_hash text; previous_request jsonb;
 limit_rows integer; offset_rows integer; readtable text;
begin
 select * into credential from public.gtm_access_tokens where token_hash=encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex')
  and revoked_at is null and expires_at>now();
 if not found then raise exception 'Invalid or expired GTM access token' using errcode='28000'; end if;
 if octet_length(coalesce(p_data,'{}')::text)>262144 then raise exception 'Request too large'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'p_data must be an object'; end if;
 if p_action is null then raise exception 'p_action is required'; end if;
 perform set_config('gtm.actor',credential.name,true);
 update public.gtm_access_tokens set last_used_at=now() where id in (
  select id from public.gtm_access_tokens where id=credential.id and (last_used_at is null or last_used_at<now()-interval '5 minutes')
  for update skip locked);
 if p_action='batch' then
  if jsonb_typeof(p_data->'operations') is distinct from 'array' or jsonb_array_length(p_data->'operations') not between 1 and 50 then raise exception 'Batch needs 1 to 50 operations'; end if;
  result:='[]';
  for operation in select value from jsonb_array_elements(p_data->'operations') loop
   if operation->>'action'='batch' then raise exception 'Nested batches are not supported'; end if;
   result:=result||jsonb_build_array(public.gtm_api(p_token,operation->>'action',operation->>'entity',
    (operation->>'id')::uuid,(operation->>'expected_version')::bigint,coalesce(operation->'data','{}'),(operation->>'request_id')::uuid));
  end loop;
  return jsonb_build_object('results',result);
 end if;
 if p_action='today' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select * from public.gtm_today order by due_at nulls last limit 500)t;
  return jsonb_build_object('rows',result,'as_of',now());
 end if;
 if p_action in ('performance','overview') then
  return public.gtm_performance(p_data);
 end if;
 if p_entity is null or not(p_entity=any(allowed)) then raise exception 'Unknown GTM entity'; end if;
 if p_action in ('list','get') then
  readtable:=case when p_entity='gtm_plans' then 'gtm_plan_summary' when p_entity='gtm_creators' then 'gtm_creator_overview' else p_entity end;
  if p_action='get' then
   execute format('select to_jsonb(t) from public.%I t where id=$1',readtable) into result using p_id;
   related:=jsonb_build_object('activities',coalesce((select jsonb_agg(to_jsonb(a))from
    (select id,ref,kind,body,source_ref,occurred_at,payload from public.gtm_activities
     where entity=p_entity and entity_id=p_id and kind not like 'system.%' order by occurred_at desc limit 20)a),'[]'),
    'open_actions',coalesce((select jsonb_agg(to_jsonb(t))from public.gtm_today t where entity=p_entity and entity_id=p_id),'[]'));
   if p_entity='gtm_creators' then
    related:=related||jsonb_build_object('accounts',coalesce((select jsonb_agg(to_jsonb(a) order by a.platform,a.handle)from public.gtm_account_overview a where creator_id=p_id and archived_at is null),'[]'),
     'collaborations',coalesce((select jsonb_agg(to_jsonb(c))from(select id,ref,title,status,plan_id,owner_id,due_at from public.gtm_collaborations where creator_id=p_id order by created_at desc limit 20)c),'[]'));
   elsif p_entity='gtm_collaborations' then
    related:=related||jsonb_build_object('contents',coalesce((select jsonb_agg(to_jsonb(c))from(select id,ref,title,publish_status,production_status,post_url,due_at,action_items from public.gtm_contents where collaboration_id=p_id)c),'[]'),
     'costs',coalesce((select jsonb_agg(to_jsonb(c))from public.gtm_costs c where collaboration_id=p_id),'[]'));
   elsif p_entity='gtm_contents' then
    related:=related||jsonb_build_object('metrics',coalesce((select jsonb_agg(to_jsonb(m))from(select * from public.gtm_metric_snapshots where content_id=p_id order by as_of desc limit 30)m),'[]'),
     'platform_versions',coalesce((select jsonb_agg(to_jsonb(c))from(select id,ref,title,account_id,brief_ref,brief_version,post_url from public.gtm_contents where content_group_id=(result->>'content_group_id')::uuid)c),'[]'));
   end if;
   return jsonb_build_object('record',result,'related',related,'as_of',now());
  end if;
  limit_rows:=least(greatest(coalesce((p_data->>'limit')::integer,50),1),500);
  offset_rows:=greatest(coalesce((p_data->>'offset')::integer,0),0);
  execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]'') from (select * from public.%I t where
   ($1 or archived_at is null) and to_jsonb(t) @> $2 and ($3='''' or to_jsonb(t)::text ilike ''%%''||$3||''%%'')
   order by ref limit $4 offset $5)r',readtable)
  into result using coalesce((p_data->>'include_archived')::boolean,false),coalesce(p_data->'filters','{}'),coalesce(p_data->>'search',''),limit_rows,offset_rows;
  return jsonb_build_object('rows',result,'offset',offset_rows,'next_offset',case when jsonb_array_length(result)=limit_rows then offset_rows+limit_rows end,'as_of',now());
 end if;
 if not credential.can_write then raise exception 'GTM token is read only' using errcode='42501'; end if;
 if p_action not in ('save','archive','patch_item','issue_link') then raise exception 'Unknown GTM action'; end if;
 if p_request_id is null then raise exception 'Mutation request_id is required'; end if;
 -- One short transaction serializes cross-row budget/payment/link checks. LLM work stays outside this lock.
 perform pg_advisory_xact_lock(hashtextextended('gtm_mutation_v1',0));
 request_hash:=encode(sha256(convert_to(jsonb_build_object('action',p_action,'entity',p_entity,'id',p_id,'version',p_expected_version,'data',p_data)::text,'UTF8')),'hex');
 select payload into previous_request from public.gtm_activities where request_id=p_request_id;
 if found then
  if previous_request->>'input_hash'<>request_hash or previous_request->>'credential_id'<>credential.id::text then raise exception 'Idempotency key reused with different input'; end if;
  return previous_request->'result';
 end if;
 if p_id is not null then
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',p_entity) into before_row using p_id;
  if before_row is null then raise exception 'Record not found'; end if;
  if p_expected_version is null or (before_row->>'row_version')::bigint<>p_expected_version then
   raise exception 'Row version conflict. Reload before applying your change.' using errcode='40001'; end if;
 end if;
 if p_action<>'save' and before_row is null then raise exception 'This action requires an existing record'; end if;
 if p_action='archive' then
  p_data:=jsonb_build_object('archived_at',now());
 elsif p_action='patch_item' then
  field:=p_data->>'field';
  if not(field=any(array['contacts','action_items','payments','allocations','asset_refs'])) or not(before_row?field) then raise exception 'Unknown item field'; end if;
  items:=case when p_data?'items' then p_data->'items' else jsonb_build_array(p_data->'item') end;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 100 then raise exception 'Supply 1 to 100 child items'; end if;
  arr:=before_row->field;
  for item in select value from jsonb_array_elements(items) loop
   if jsonb_typeof(item) is distinct from 'object' or nullif(item->>'id','') is null then raise exception 'Item object with immutable ID is required'; end if;
   if field='payments' and exists(select 1 from jsonb_array_elements(arr)a where a->>'id'=item->>'id' and a<>a||item) then
    raise exception 'Payments are immutable; record a refund or separate correction evidence'; end if;
   select coalesce(jsonb_agg(case when a->>'id'=item->>'id' then a||item else a end),'[]') into arr from jsonb_array_elements(arr)a;
   if not exists(select 1 from jsonb_array_elements(arr)a where a->>'id'=item->>'id') then arr:=arr||jsonb_build_array(item); end if;
  end loop;
  p_data:=jsonb_build_object(field,arr);
 elsif p_action='issue_link' then
  if p_entity<>'gtm_contents' or nullif(before_row->>'campaign_id','') is null or nullif(before_row->>'plan_id','') is null then raise exception 'A content plan and campaign are required'; end if;
  if coalesce(p_data->>'source','') !~ '^[a-z0-9][a-z0-9_-]{0,79}$' or coalesce(p_data->>'medium','') !~ '^[a-z0-9][a-z0-9_-]{0,59}$' then raise exception 'Use valid source and medium identifiers'; end if;
  if coalesce(p_data->>'destination_url','') !~ '^https://[^[:space:]]+$' or p_data->>'destination_url' like '%#%' or p_data->>'destination_url' like '%utm_%' or p_data->>'destination_url' ~ '[?&](source|tm_source)=' then
   raise exception 'Use an HTTPS destination without existing attribution parameters or fragment'; end if;
  field:=coalesce(p_data->>'scope','content');
  target_id:=case field when 'content' then p_id when 'account' then nullif(before_row->>'account_id','')::uuid when 'plan' then (before_row->>'plan_id')::uuid end;
  if target_id is null then raise exception 'Invalid attribution scope/target'; end if;
  link:=jsonb_build_object('id','gtm_'||replace(gen_random_uuid()::text,'-',''),'destination_url',p_data->>'destination_url',
   'utm_source',p_data->>'source','utm_medium',p_data->>'medium','utm_campaign',replace(before_row->>'campaign_id','-',''),
   'scope',field,'target_id',target_id,'plan_id',before_row->>'plan_id','campaign_id',before_row->>'campaign_id',
   'format_id',before_row->>'format_id','placement',p_data->>'placement','created_at',now());
  link:=link||jsonb_build_object('url',(p_data->>'destination_url')||case when position('?' in p_data->>'destination_url')>0 then '&' else '?' end||
   'utm_source='||(link->>'utm_source')||'&utm_medium='||(link->>'utm_medium')||'&utm_campaign='||(link->>'utm_campaign')||'&utm_content='||(link->>'id'));
  p_data:=jsonb_build_object('tracking_links',(before_row->'tracking_links')||jsonb_build_array(link));
 else
  if p_data ?| array['tracking_links','contacts','action_items','payments','allocations','asset_refs'] then
   raise exception 'Use patch_item for child items and issue_link for immutable links'; end if;
 end if;
 if p_entity='gtm_activities' and before_row is not null then raise exception 'Activities are append only; add a correction referencing the prior record'; end if;
 for key in select jsonb_object_keys(p_data) loop
  if key=any(array['id','ref','created_at','updated_at','created_by','updated_by','row_version']) or not exists(
   select 1 from information_schema.columns where table_schema='public' and table_name=p_entity and column_name=key) then
   raise exception 'Unknown or read-only field: %',key; end if;
 end loop;
 if p_data='{}'::jsonb then raise exception 'A change is required'; end if;
 select string_agg(format('%I',k),','),string_agg(format('x.%I',k),','),string_agg(format('%I=x.%I',k,k),',')
 into columns_sql,values_sql,update_sql from jsonb_object_keys(p_data)k;
 if before_row is null then
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1)x returning to_jsonb(%I.*)',p_entity,columns_sql,values_sql,p_entity,p_entity)
  into after_row using p_data;
 else
  execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1)x where t.id=$2 returning to_jsonb(t)',p_entity,update_sql,p_entity)
  into after_row using p_data,p_id;
 end if;
 perform public.gtm_validate_record(p_entity,after_row,before_row);
 -- New promises consume available budget. Actual incurred costs/payments must remain recordable
 -- after a budget reduction, so the ledger never hides an already-existing expense.
 if p_entity='gtm_costs' and (coalesce((after_row->>'agreed_amount')::numeric,0)>coalesce((before_row->>'agreed_amount')::numeric,0)
  or (coalesce((after_row->>'agreed_amount')::numeric,0)>0 and
   (after_row->>'plan_id' is distinct from before_row->>'plan_id' or after_row->'allocations' is distinct from before_row->'allocations'))) then
  perform public.gtm_check_budgets((after_row->>'id')::uuid);
 end if;
 result:=jsonb_build_object('record',after_row,'link',link,'request_id',p_request_id);
 insert into public.gtm_activities(entity,entity_id,kind,body,payload,request_id)
 values(p_entity,(after_row->>'id')::uuid,'system.mutation','Recorded change',
 jsonb_build_object('input_hash',request_hash,'credential_id',credential.id,'before',before_row,'result',result),p_request_id);
 return result;
end $$;

comment on view public.gtm_creator_overview is 'Default creator operating read: normalized account metrics, outreach state, freshness, current work, and adopted direction.';
comment on column public.gtm_creators.activity_regions is 'Countries, cities, or markets where the creator actively produces or operates; use verified labels.';
comment on column public.gtm_creators.content_topics is 'Stable, observed content topics; request-specific fit remains in research_result activities.';
