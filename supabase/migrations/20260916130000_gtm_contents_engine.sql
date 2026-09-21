-- Contents Engine: 10 business tables, one scoped-access infrastructure table.
-- Existing product logs are read by a separate aggregate function, never copied.
create table public.gtm_creators (
 id uuid primary key default gen_random_uuid(), ref bigint generated always as identity unique,
 name text not null check (length(btrim(name)) > 0), description text,
 country text, languages text[] not null default '{}', contacts jsonb not null default '[]',
 owner_id text, notes text, do_not_contact boolean not null default false,
 contact_restriction_source text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by text, updated_by text, row_version bigint not null default 1, archived_at timestamptz,
 check(jsonb_typeof(contacts)='array')
);
create table public.gtm_campaigns (
 id uuid primary key default gen_random_uuid(), ref bigint generated always as identity unique,
 name text not null check(length(btrim(name))>0), description text, audience_brief text,
 value_proposition text, guide_ref text, guide_version text, owner_id text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by text, updated_by text, row_version bigint not null default 1, archived_at timestamptz
);
create table public.gtm_formats (
 id uuid primary key default gen_random_uuid(), ref bigint generated always as identity unique,
 name text not null check(length(btrim(name))>0), description text, guide_ref text,
 guide_version text, examples jsonb not null default '[]', owner_id text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by text, updated_by text, row_version bigint not null default 1, archived_at timestamptz
);
create table public.gtm_plans (
 id uuid primary key default gen_random_uuid(), ref bigint generated always as identity unique,
 name text not null check(length(btrim(name))>0), brief text, target_market text, target_audience text,
 goal_metric text default 'onboarding_completed_7d', metric_version text default 'gtm_observed_utm_v1', goal_value numeric,
 currency text not null default 'KRW' check(currency ~ '^[A-Z]{3}$'), cash_budget numeric,
 contingency numeric not null default 0, labor_budget_minutes numeric,
 start_at timestamptz, end_at timestamptz, timezone text not null default 'Asia/Seoul',
 owner_id text, status text not null default 'draft', plan_document_ref text, plan_version text,
 action_items jsonb not null default '[]',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by text, updated_by text, row_version bigint not null default 1, archived_at timestamptz,
 check(cash_budget >= 0), check(contingency >= 0), check(labor_budget_minutes >= 0),
 check(end_at is null or start_at is null or end_at > start_at)
);
create table public.gtm_accounts (
 id uuid primary key default gen_random_uuid(), ref bigint generated always as identity unique,
 creator_id uuid references public.gtm_creators(id), owner_kind text not null default 'creator',
 platform text not null, provider_scope text not null default 'public', external_id text,
 handle text, profile_url text, audience_summary text, audience_evidence jsonb not null default '{}',
 source_ref text, as_of timestamptz, collected_at timestamptz, valid_until timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by text, updated_by text, row_version bigint not null default 1, archived_at timestamptz,
 unique(platform,provider_scope,external_id)
);
create table public.gtm_collaborations (
 id uuid primary key default gen_random_uuid(), ref bigint generated always as identity unique,
 creator_id uuid not null references public.gtm_creators(id), plan_id uuid references public.gtm_plans(id),
 title text not null, status text not null default 'draft', owner_id text, contact_ref text,
 terms text, terms_version text, agreed_at timestamptz, due_at timestamptz,
 closed_at timestamptz, close_reason text, action_items jsonb not null default '[]',
 previous_collaboration_id uuid references public.gtm_collaborations(id), origin_activity_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by text, updated_by text, row_version bigint not null default 1, archived_at timestamptz,
 check(agreed_at is null or plan_id is not null)
);
create table public.gtm_contents (
 id uuid primary key default gen_random_uuid(), ref bigint generated always as identity unique,
 title text not null, creator_id uuid references public.gtm_creators(id),
 collaboration_id uuid references public.gtm_collaborations(id), plan_id uuid references public.gtm_plans(id),
 campaign_id uuid references public.gtm_campaigns(id), format_id uuid references public.gtm_formats(id),
 account_id uuid references public.gtm_accounts(id), placement text, distribution_type text not null default 'organic',
 content_group_id uuid not null default gen_random_uuid(), brief_ref text, brief_version text,
 asset_refs jsonb not null default '[]', rights_source text, target_market text, target_audience text,
 language text, cta text, destination_url text, execution_reason text,
 execution_snapshot jsonb not null default '{}', production_status text not null default 'draft',
 publish_status text not null default 'unpublished', due_at timestamptz, scheduled_at timestamptz,
 published_at timestamptz, post_url text, external_post_id text,
 tracking_links jsonb not null default '[]', action_items jsonb not null default '[]',
 previous_content_id uuid references public.gtm_contents(id), origin_activity_id uuid,
 reused_from_content_id uuid references public.gtm_contents(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by text, updated_by text, row_version bigint not null default 1, archived_at timestamptz,
 unique(account_id,external_post_id),
 check(published_at is null or (account_id is not null and campaign_id is not null and format_id is not null and plan_id is not null))
);
create table public.gtm_activities (
 id uuid primary key default gen_random_uuid(), ref bigint generated always as identity unique,
 entity text, entity_id uuid, kind text not null, body text, payload jsonb not null default '{}',
 occurred_at timestamptz not null default now(), source_ref text, provider text,
 connection_ref text, external_id text, thread_id text, correction_of_id uuid references public.gtm_activities(id),
 request_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by text, updated_by text, row_version bigint not null default 1, archived_at timestamptz,
 unique(provider,connection_ref,external_id), unique(request_id)
);
alter table public.gtm_collaborations add constraint gtm_collaborations_origin_fk foreign key(origin_activity_id) references public.gtm_activities(id);
alter table public.gtm_contents add constraint gtm_contents_origin_fk foreign key(origin_activity_id) references public.gtm_activities(id);
create table public.gtm_metric_snapshots (
 id uuid primary key default gen_random_uuid(), ref bigint generated always as identity unique,
 account_id uuid references public.gtm_accounts(id), content_id uuid references public.gtm_contents(id),
 metric text not null, value numeric, unit text not null, period_start timestamptz,
 period_end timestamptz, as_of timestamptz not null, collected_at timestamptz not null default now(),
 source_ref text not null, definition_version text not null, value_kind text not null default 'cumulative',
 missing_reason text, retention_until timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by text, updated_by text, row_version bigint not null default 1, archived_at timestamptz,
 check(num_nonnulls(account_id,content_id)=1), check(value is not null or missing_reason is not null),
 check(period_end is null or period_start is null or period_end>=period_start)
);
create unique index gtm_metric_observation_uidx on public.gtm_metric_snapshots
 (coalesce(account_id,content_id),metric,as_of,source_ref,definition_version);
create table public.gtm_costs (
 id uuid primary key default gen_random_uuid(), ref bigint generated always as identity unique,
 plan_id uuid references public.gtm_plans(id), collaboration_id uuid references public.gtm_collaborations(id),
 kind text not null, description text not null, currency text not null default 'KRW' check(currency ~ '^[A-Z]{3}$'),
 base_currency text not null default 'KRW' check(base_currency ~ '^[A-Z]{3}$'),
 fx_rate numeric not null default 1 check(fx_rate>0), fx_source text,
 expected_amount numeric, agreed_amount numeric, incurred_amount numeric,
 labor_minutes numeric, hourly_rate numeric, measurement_basis text,
 due_at timestamptz, incurred_at timestamptz, source_ref text,
 payments jsonb not null default '[]', allocations jsonb not null default '[]',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by text, updated_by text, row_version bigint not null default 1, archived_at timestamptz,
 check(expected_amount>=0), check(agreed_amount>=0), check(incurred_amount>=0),
 check(labor_minutes>=0), check(hourly_rate>=0),
 check(currency=base_currency or fx_source is not null)
);

-- This is infrastructure, not a new team-facing business ledger.
create table public.gtm_access_tokens (
 id uuid primary key default gen_random_uuid(), name text not null,
 token_hash text not null unique, can_write boolean not null default false,
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 revoked_at timestamptz, last_used_at timestamptz
);

create index gtm_collaborations_creator_idx on public.gtm_collaborations(creator_id,created_at desc);
create index gtm_collaborations_plan_idx on public.gtm_collaborations(plan_id);
create index gtm_contents_collaboration_idx on public.gtm_contents(collaboration_id);
create index gtm_contents_plan_idx on public.gtm_contents(plan_id);
create index gtm_activities_target_idx on public.gtm_activities(entity,entity_id,occurred_at desc);
create index gtm_costs_plan_idx on public.gtm_costs(plan_id);
create index gtm_accounts_creator_idx on public.gtm_accounts(creator_id);

create function public.gtm_stamp() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if TG_OP='UPDATE' then
  new.id:=old.id; new.ref:=old.ref; new.created_at:=old.created_at; new.created_by:=old.created_by;
  new.row_version:=old.row_version+1;
 else
  new.created_by:=nullif(current_setting('gtm.actor',true),'');
 end if;
 new.updated_at:=clock_timestamp();
 new.updated_by:=nullif(current_setting('gtm.actor',true),'');
 return new;
end $$;

do $$ declare t text; begin
 foreach t in array array['gtm_creators','gtm_accounts','gtm_campaigns','gtm_formats','gtm_plans',
 'gtm_collaborations','gtm_contents','gtm_activities','gtm_metric_snapshots','gtm_costs'] loop
  execute format('create trigger gtm_stamp_row before insert or update on public.%I for each row execute function public.gtm_stamp()',t);
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
 end loop;
 alter table public.gtm_access_tokens enable row level security;
 revoke all on public.gtm_access_tokens from anon,authenticated;
end $$;

create function public.gtm_net_paid(p_payments jsonb) returns numeric language sql immutable as $$
 select coalesce(sum((e->>'amount')::numeric * case when e->>'kind'='refund' then -1 else 1 end),0)
 from jsonb_array_elements(p_payments)e
$$;

create view public.gtm_cost_plan_amounts as
select c.id cost_id,c.plan_id,c.base_currency,
 coalesce(c.incurred_amount,case when c.kind='labor' then c.labor_minutes*c.hourly_rate/60 end)*c.fx_rate incurred,
 case when c.kind='labor' then 0 else greatest(coalesce(c.agreed_amount,0),coalesce(c.incurred_amount,0),public.gtm_net_paid(c.payments))*c.fx_rate end committed,
 public.gtm_net_paid(c.payments)*c.fx_rate paid,
 (c.incurred_amount is null and (c.kind<>'labor' or c.labor_minutes is null or c.hourly_rate is null)) incomplete
from public.gtm_costs c where c.plan_id is not null and c.archived_at is null
union all
select c.id,(a->>'plan_id')::uuid,c.base_currency,
 coalesce(c.incurred_amount,case when c.kind='labor' then c.labor_minutes*c.hourly_rate/60 end)*c.fx_rate*(a->>'share')::numeric,
 case when c.kind='labor' then 0 else greatest(coalesce(c.agreed_amount,0),coalesce(c.incurred_amount,0),public.gtm_net_paid(c.payments))*c.fx_rate*(a->>'share')::numeric end,
 public.gtm_net_paid(c.payments)*c.fx_rate*(a->>'share')::numeric,
 (c.incurred_amount is null and (c.kind<>'labor' or c.labor_minutes is null or c.hourly_rate is null))
from public.gtm_costs c cross join lateral jsonb_array_elements(c.allocations)a
where c.plan_id is null and c.archived_at is null and a ? 'plan_id';

create view public.gtm_plan_summary as
select p.*,coalesce(x.incurred,0) incurred_cost,coalesce(x.committed,0) committed_cash,
 coalesce(x.paid,0) net_paid,coalesce(x.incomplete,0) incomplete_cost_items,
 p.cash_budget-p.contingency-coalesce(x.committed,0) available_cash
from public.gtm_plans p left join lateral (
 select sum(c.incurred)incurred,sum(c.committed)committed,sum(c.paid)paid,
 count(*)filter(where c.incomplete)incomplete from public.gtm_cost_plan_amounts c where c.plan_id=p.id
)x on true;

create view public.gtm_today as
select e.entity,e.id entity_id,e.ref,e.title,a->>'id' action_id,a->>'text' action,
 a->>'owner_id' owner_id,nullif(a->>'due_at','')::timestamptz due_at,a->>'status' status,e.row_version
from (
 select 'gtm_collaborations'::text entity,id,ref,title,action_items,row_version from public.gtm_collaborations
 union all select 'gtm_contents',id,ref,title,action_items,row_version from public.gtm_contents
 union all select 'gtm_plans',id,ref,name,action_items,row_version from public.gtm_plans
)e cross join lateral jsonb_array_elements(e.action_items)a
where a->>'status'='open';

create function public.gtm_validate_record(p_entity text,p_record jsonb,p_before jsonb default null)
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
   if field='action_items' then
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

create function public.gtm_check_budgets(p_cost_id uuid) returns void language plpgsql set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.gtm_plan_summary p where committed_cash>0 and (cash_budget is null or available_cash<0)
  and exists(select 1 from public.gtm_cost_plan_amounts c where c.cost_id=p_cost_id and c.plan_id=p.id)) then
  raise exception 'Plan budget is missing or insufficient'; end if;
end $$;

-- A token permits only the listed GTM actions. It never permits SQL or raw product-user reads.
create function public.gtm_api(
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
  readtable:=case when p_entity='gtm_plans' then 'gtm_plan_summary' else p_entity end;
  if p_action='get' then
   execute format('select to_jsonb(t) from public.%I t where id=$1',readtable) into result using p_id;
   related:=jsonb_build_object('activities',coalesce((select jsonb_agg(to_jsonb(a))from
    (select id,ref,kind,body,source_ref,occurred_at,payload from public.gtm_activities
     where entity=p_entity and entity_id=p_id and kind not like 'system.%' order by occurred_at desc limit 20)a),'[]'),
    'open_actions',coalesce((select jsonb_agg(to_jsonb(t))from public.gtm_today t where entity=p_entity and entity_id=p_id),'[]'));
   if p_entity='gtm_creators' then
    related:=related||jsonb_build_object('accounts',coalesce((select jsonb_agg(to_jsonb(a))from public.gtm_accounts a where creator_id=p_id and archived_at is null),'[]'),
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

revoke all on public.gtm_cost_plan_amounts,public.gtm_plan_summary,public.gtm_today from anon,authenticated;
revoke all on function public.gtm_stamp(),public.gtm_net_paid(jsonb),public.gtm_validate_record(text,jsonb,jsonb),public.gtm_check_budgets(uuid) from public,anon,authenticated;
revoke all on function public.gtm_api(text,text,text,uuid,bigint,jsonb,uuid) from public;
grant execute on function public.gtm_api(text,text,text,uuid,bigint,jsonb,uuid) to anon,authenticated,service_role;
comment on function public.gtm_api(text,text,text,uuid,bigint,jsonb,uuid) is 'Scoped GTM read/write API. Token hash verification, row versions, idempotency, append-only audit, aggregate-only product analytics.';
notify pgrst,'reload schema';
