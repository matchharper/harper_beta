-- Expand the reusable content and outreach libraries shown in Google Sheets.
-- Existing formats stay canonical; outreach templates are a new durable asset
-- used by message drafts and results, not a transient activity payload.

alter table public.gtm_formats
  add column if not exists status text not null default 'draft',
  add column if not exists default_campaign_id uuid references public.gtm_campaigns(id),
  add column if not exists hook text,
  add column if not exists shot_sequence text,
  add column if not exists required_moment text,
  add column if not exists caption_template text,
  add column if not exists example_links text[] not null default '{}',
  add column if not exists replicate_rule text,
  add column if not exists kill_rule text,
  add column if not exists target_creator_profile text,
  add column if not exists cold_outreach_angle text;

create table if not exists public.gtm_outreach_templates (
  id uuid primary key default gen_random_uuid(),
  ref bigint generated always as identity unique,
  name text not null check (length(btrim(name)) > 0),
  status text not null default 'draft',
  campaign_id uuid references public.gtm_campaigns(id),
  channel text not null default 'email' check (length(btrim(channel)) > 0),
  language text,
  target_creator_profile text,
  subject_template text,
  opening_template text not null check (length(btrim(opening_template)) > 0),
  value_proposition text,
  ask text,
  offer_structure text,
  follow_up_template text,
  link_refs text[] not null default '{}',
  usage_notes text,
  template_version text,
  owner_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  row_version bigint not null default 1,
  archived_at timestamptz
);

alter table public.gtm_formats
  add column if not exists default_outreach_template_id uuid
    references public.gtm_outreach_templates(id);

alter table public.gtm_activities
  add column if not exists outreach_template_id uuid
    references public.gtm_outreach_templates(id);

create index if not exists gtm_formats_default_campaign_idx
  on public.gtm_formats(default_campaign_id)
  where archived_at is null;
create index if not exists gtm_formats_default_outreach_template_idx
  on public.gtm_formats(default_outreach_template_id)
  where archived_at is null;
create index if not exists gtm_outreach_templates_campaign_status_idx
  on public.gtm_outreach_templates(campaign_id, status, ref)
  where archived_at is null;
create index if not exists gtm_activities_outreach_template_idx
  on public.gtm_activities(outreach_template_id, occurred_at desc)
  where outreach_template_id is not null and archived_at is null;
create index if not exists gtm_activities_outreach_thread_idx
  on public.gtm_activities(provider, connection_ref, thread_id, occurred_at)
  where thread_id is not null and archived_at is null
    and kind in ('message_sent', 'message_received');

alter table public.gtm_outreach_templates enable row level security;
revoke all on public.gtm_outreach_templates from public, anon, authenticated;

drop trigger if exists gtm_stamp_row on public.gtm_outreach_templates;
create trigger gtm_stamp_row
before insert or update on public.gtm_outreach_templates
for each row execute function public.gtm_stamp();

create or replace view public.gtm_format_overview
with (security_invoker = true) as
select
  format.*,
  campaign.ref as default_campaign_ref,
  campaign.name as default_campaign_name,
  template.ref as default_outreach_template_ref,
  template.name as default_outreach_template_name,
  coalesce(usage.content_use_count, 0) as content_use_count,
  coalesce(usage.published_content_count, 0) as published_content_count,
  usage.last_published_at
from public.gtm_formats format
left join public.gtm_campaigns campaign on campaign.id = format.default_campaign_id
left join public.gtm_outreach_templates template
  on template.id = format.default_outreach_template_id
left join lateral (
  select
    count(*)::integer as content_use_count,
    count(*) filter (where content.published_at is not null)::integer
      as published_content_count,
    max(content.published_at) as last_published_at
  from public.gtm_contents content
  where content.format_id = format.id
    and content.archived_at is null
) usage on true;

create or replace view public.gtm_outreach_template_overview
with (security_invoker = true) as
select
  template.*,
  campaign.ref as campaign_ref,
  campaign.name as campaign_name,
  coalesce(format_usage.default_format_count, 0) as default_format_count,
  coalesce(format_usage.default_format_summary, '') as default_format_summary,
  coalesce(activity_usage.draft_count, 0) as draft_count,
  coalesce(activity_usage.sent_count, 0) as sent_count,
  coalesce(thread_usage.sent_thread_count, 0) as sent_thread_count,
  coalesce(thread_usage.replied_thread_count, 0) as replied_thread_count,
  case
    when coalesce(thread_usage.sent_thread_count, 0) = 0 then null
    else round(
      100 * thread_usage.replied_thread_count::numeric
        / thread_usage.sent_thread_count,
      1
    )
  end as response_rate,
  activity_usage.last_sent_at,
  thread_usage.last_reply_at
from public.gtm_outreach_templates template
left join public.gtm_campaigns campaign on campaign.id = template.campaign_id
left join lateral (
  select
    count(*)::integer as default_format_count,
    string_agg(
      '#' || format.ref::text || ' · ' || format.name,
      E'\n' order by format.ref
    ) as default_format_summary
  from public.gtm_formats format
  where format.default_outreach_template_id = template.id
    and format.archived_at is null
) format_usage on true
left join lateral (
  select
    count(*) filter (where activity.kind = 'message_draft')::integer
      as draft_count,
    count(*) filter (where activity.kind = 'message_sent')::integer
      as sent_count,
    max(activity.occurred_at) filter (where activity.kind = 'message_sent')
      as last_sent_at
  from public.gtm_activities activity
  where activity.outreach_template_id = template.id
    and activity.archived_at is null
) activity_usage on true
left join lateral (
  with outbound_threads as (
    select
      sent.provider,
      sent.connection_ref,
      sent.thread_id,
      min(sent.occurred_at) as first_sent_at
    from public.gtm_activities sent
    where sent.outreach_template_id = template.id
      and sent.kind = 'message_sent'
      and sent.archived_at is null
      and sent.thread_id is not null
    group by sent.provider, sent.connection_ref, sent.thread_id
  ), replied_threads as (
    select
      outbound.provider,
      outbound.connection_ref,
      outbound.thread_id,
      min(received.occurred_at) as first_reply_at
    from outbound_threads outbound
    join public.gtm_activities received
      on received.kind = 'message_received'
      and received.archived_at is null
      and received.provider is not distinct from outbound.provider
      and received.connection_ref is not distinct from outbound.connection_ref
      and received.thread_id = outbound.thread_id
      and received.occurred_at >= outbound.first_sent_at
    group by outbound.provider, outbound.connection_ref, outbound.thread_id
  )
  select
    (select count(*)::integer from outbound_threads) as sent_thread_count,
    count(*)::integer as replied_thread_count,
    max(replied.first_reply_at) as last_reply_at
  from replied_threads replied
) thread_usage on true;

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
  directory.next_action_due_at,
  outreach_template.ref as outreach_template_ref,
  outreach_template.name as outreach_template_name
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
left join public.gtm_outreach_templates outreach_template
  on outreach_template.id = activity.outreach_template_id
left join public.gtm_creator_directory_sheet_v1 directory
  on directory.id = creator.id
left join public.gtm_plans plan
  on plan.id = coalesce(
    collaboration.plan_id,
    target_content.plan_id
  )
where activity.kind like 'message_%';

revoke all on public.gtm_format_overview,
  public.gtm_outreach_template_overview,
  public.gtm_outreach_sheet_v1
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
 if p_entity='gtm_formats' and nullif(p_record->>'default_outreach_template_id','') is not null then
  select campaign_id into wanted
  from public.gtm_outreach_templates
  where id=(p_record->>'default_outreach_template_id')::uuid;
  if nullif(p_record->>'default_campaign_id','') is not null
     and wanted is not null
     and wanted is distinct from (p_record->>'default_campaign_id')::uuid then
   raise exception 'Format default campaign and outreach template campaign differ';
  end if;
 end if;
 if p_entity='gtm_activities'
    and nullif(p_record->>'outreach_template_id','') is not null
    and p_record->>'kind' not like 'message_%' then
  raise exception 'Outreach templates can only be linked to message activities';
 end if;
 if p_entity='gtm_activities' then
  if p_record->>'kind' like 'system.%' then raise exception 'Reserved activity kind'; end if;
  if nullif(p_record->>'request_id','') is not null then raise exception 'Activity request_id is reserved'; end if;
  if nullif(p_record->>'external_id','') is not null and (nullif(p_record->>'provider','') is null or nullif(p_record->>'connection_ref','') is null) then
   raise exception 'External activity needs provider and connection scope'; end if;
  if num_nonnulls(p_record->>'entity',p_record->>'entity_id')=1 then raise exception 'Activity target needs both entity and ID'; end if;
  if p_record->>'entity' is not null then
   if not(p_record->>'entity'=any(array['gtm_creators','gtm_accounts','gtm_campaigns','gtm_formats','gtm_outreach_templates','gtm_plans','gtm_collaborations','gtm_contents','gtm_activities','gtm_metric_snapshots','gtm_costs'])) then raise exception 'Invalid activity target'; end if;
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
 'gtm_outreach_templates','gtm_plans','gtm_collaborations','gtm_contents','gtm_activities','gtm_metric_snapshots','gtm_costs'];
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
  readtable:=case
   when p_entity='gtm_plans' then 'gtm_plan_summary'
   when p_entity='gtm_creators' then 'gtm_creator_overview'
   when p_entity='gtm_formats' then 'gtm_format_overview'
   when p_entity='gtm_outreach_templates' then 'gtm_outreach_template_overview'
   else p_entity
  end;
  if p_action='get' then
   execute format('select to_jsonb(t) from public.%I t where id=$1',readtable) into result using p_id;
   related:=jsonb_build_object('activities',coalesce((select jsonb_agg(to_jsonb(a))from
    (select id,ref,kind,body,source_ref,occurred_at,payload,outreach_template_id from public.gtm_activities
     where entity=p_entity and entity_id=p_id and kind not like 'system.%' order by occurred_at desc limit 20)a),'[]'),
    'open_actions',coalesce((select jsonb_agg(to_jsonb(t))from public.gtm_today t where entity=p_entity and entity_id=p_id),'[]'));
   if p_entity='gtm_creators' then
    related:=related||jsonb_build_object('accounts',coalesce((select jsonb_agg(to_jsonb(a) order by a.platform,a.handle)from public.gtm_account_overview a where creator_id=p_id and archived_at is null),'[]'),
     'collaborations',coalesce((select jsonb_agg(to_jsonb(c))from(select id,ref,title,status,plan_id,owner_id,due_at from public.gtm_collaborations where creator_id=p_id order by created_at desc limit 20)c),'[]'));
   elsif p_entity='gtm_formats' then
    related:=related||jsonb_build_object('contents',coalesce((select jsonb_agg(to_jsonb(c))from
     (select id,ref,title,creator_id,campaign_id,production_status,publish_status,published_at,post_url
      from public.gtm_contents where format_id=p_id order by created_at desc limit 30)c),'[]'));
   elsif p_entity='gtm_outreach_templates' then
    related:=related||jsonb_build_object('messages',coalesce((select jsonb_agg(to_jsonb(a))from
     (select id,ref,kind,body,entity,entity_id,provider,connection_ref,thread_id,occurred_at,source_ref
      from public.gtm_activities where outreach_template_id=p_id
      order by occurred_at desc limit 50)a),'[]'));
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

comment on table public.gtm_outreach_templates is
  'Reusable outreach copy and offer contract. Actual drafts, sends, and replies remain in gtm_activities.';
comment on column public.gtm_formats.shot_sequence is
  'Human-readable ordered production flow; keep creator-specific execution in gtm_contents.';
comment on column public.gtm_activities.outreach_template_id is
  'Template version used as the starting point for a message; the exact delivered copy remains in body.';
comment on view public.gtm_format_overview is
  'Editable Format Bank with campaign/template defaults and observed content usage.';
comment on view public.gtm_outreach_template_overview is
  'Editable outreach template library with campaign/format context and recorded draft/send/reply usage.';
comment on view public.gtm_outreach_sheet_v1 is
  'Read-only chronological outreach messages joined to creator, collaboration, plan, and reusable template context.';

notify pgrst, 'reload schema';
