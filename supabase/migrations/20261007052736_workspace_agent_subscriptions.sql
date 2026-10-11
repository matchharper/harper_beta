-- Workspace subscriptions. Matching/recommendation Workers are deliberately
-- unchanged. Existing workspaces must be explicitly enrolled (standard/scale).
-- Stripe owns money/receipts; these three tables own access and credits.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

alter table public.company_workspace
  add column billing_model text not null default 'standard' check (billing_model in ('standard','scale')),
  add column billing_started_at timestamptz,
  add column billing_free_anchor_at timestamptz,
  add column billing_reconciled_at timestamptz,
  add column stripe_customer_id text unique,
  add column billing_checkout jsonb;
-- Stage the schema before the application release. Both existing workspaces
-- and workspaces created by the old application stay unenrolled. Enable the
-- creation defaults only together with the billing-capable application rollout.

create table public.company_workspace_agents (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id),
  stripe_subscription_id text not null unique,
  stripe_price_id text not null,
  status text not null,
  started_at timestamptz not null,
  current_period_end timestamptz,
  cancel_at timestamptz,
  ended_at timestamptz,
  assigned_role_id uuid unique references public.company_roles(role_id),
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, company_workspace_id)
);
create index company_workspace_agents_workspace_idx on public.company_workspace_agents(company_workspace_id);

create table public.company_workspace_credit_periods (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id),
  agent_id uuid,
  stripe_invoice_id text unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  confirmed_at timestamptz not null default clock_timestamp(),
  allowance integer not null check (allowance in (5,50)),
  remaining integer not null check (remaining >= 0 and remaining <= allowance),
  foreign key(agent_id, company_workspace_id) references public.company_workspace_agents(id, company_workspace_id),
  check (ends_at > starts_at),
  check ((agent_id is null and allowance = 5 and stripe_invoice_id is null) or (agent_id is not null and allowance = 50 and stripe_invoice_id is not null)),
  unique(id,company_workspace_id)
);
create unique index company_workspace_paid_period_key on public.company_workspace_credit_periods(agent_id,starts_at) where agent_id is not null;
create unique index company_workspace_free_period_key on public.company_workspace_credit_periods(company_workspace_id,starts_at) where agent_id is null;
create index company_workspace_period_expiry_idx on public.company_workspace_credit_periods(company_workspace_id,ends_at,starts_at);

create table public.company_workspace_credit_events (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id),
  period_id uuid,
  action_code text not null check (action_code in ('intro_request','connect')),
  business_key text not null,
  role_id uuid not null references public.company_roles(role_id),
  talent_id uuid not null,
  actor_id uuid not null,
  delta integer not null check (delta in (-1,0)),
  -- For Connect this is the durable, immutable approval needed to resume the
  -- same side effect. It contains machine inputs, never LLM reasoning.
  action_payload jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  execution_token uuid,
  execution_until timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(period_id,company_workspace_id) references public.company_workspace_credit_periods(id,company_workspace_id),
  unique(company_workspace_id,action_code,business_key),
  check ((delta = -1 and period_id is not null) or delta = 0)
);
create index company_workspace_credit_events_period_idx on public.company_workspace_credit_events(period_id);
create index company_workspace_credit_events_role_idx on public.company_workspace_credit_events(role_id);
create index company_workspace_credit_events_history_idx on public.company_workspace_credit_events(company_workspace_id,created_at desc,id desc);
create index company_workspace_credit_events_pending_idx on public.company_workspace_credit_events(created_at) where action_code='connect' and completed_at is null;

alter table public.company_workspace_agents enable row level security;
alter table public.company_workspace_credit_periods enable row level security;
alter table public.company_workspace_credit_events enable row level security;
revoke all on public.company_workspace_agents,public.company_workspace_credit_periods,public.company_workspace_credit_events from public,anon,authenticated;
grant select,insert,update on public.company_workspace_agents,public.company_workspace_credit_periods,public.company_workspace_credit_events to service_role;

create function public.workspace_billing_agent_active_v1(p_agent public.company_workspace_agents,p_at timestamptz)
returns boolean language sql stable set search_path='' as $$
  select (p_agent.ended_at is null or p_at < p_agent.ended_at)
    and (p_agent.cancel_at is null or p_at < p_agent.cancel_at)
    and exists(select 1 from public.company_workspace_credit_periods p
      where p.agent_id=p_agent.id and p.starts_at<=p_at and p.ends_at>p_at and p.confirmed_at<=p_at);
$$;

create function public.workspace_billing_free_period_v1(p_workspace uuid,p_at timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_anchor timestamp; v_local timestamp:=p_at at time zone 'Asia/Seoul'; v_n int; v_start timestamptz; v_end timestamptz; v_id uuid;
begin
  select coalesce(billing_free_anchor_at,billing_started_at,created_at) at time zone 'Asia/Seoul' into v_anchor
    from public.company_workspace where company_workspace_id=p_workspace;
  v_n:=(extract(year from v_local)::int-extract(year from v_anchor)::int)*12+extract(month from v_local)::int-extract(month from v_anchor)::int;
  if v_anchor+make_interval(months=>v_n)>v_local then v_n:=v_n-1; end if;
  v_start:=(v_anchor+make_interval(months=>v_n)) at time zone 'Asia/Seoul';
  v_end:=(v_anchor+make_interval(months=>v_n+1)) at time zone 'Asia/Seoul';
  insert into public.company_workspace_credit_periods(company_workspace_id,starts_at,ends_at,allowance,remaining)
    values(p_workspace,v_start,v_end,5,5) on conflict do nothing;
  select id into v_id from public.company_workspace_credit_periods where company_workspace_id=p_workspace and agent_id is null and starts_at=v_start;
  return v_id;
end; $$;

create function public.workspace_billing_reconcile_at_v1(p_workspace uuid,p_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare v_model text; v_count int; v_agent uuid; v_role record; v_kept boolean:=false;
begin
  select billing_model into v_model from public.company_workspace where company_workspace_id=p_workspace;
  -- Existing valid assignments survive. Released Roles retain all their data.
  update public.company_workspace_agents a set assigned_role_id=null,revision=revision+1
    where a.company_workspace_id=p_workspace and a.assigned_role_id is not null and
      (v_model='scale' or not public.workspace_billing_agent_active_v1(a,p_at) or not exists(
        select 1 from public.company_roles r where r.role_id=a.assigned_role_id
        and r.company_workspace_id=p_workspace and lower(r.status) in ('active','open','top_priority')
        and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>p_at)));
  if v_model='scale' then return; end if;
  select count(*) into v_count from public.company_workspace_agents a where a.company_workspace_id=p_workspace and public.workspace_billing_agent_active_v1(a,p_at);
  for v_role in select r.role_id from public.company_roles r
    left join public.company_workspace_agents a on a.assigned_role_id=r.role_id
    where r.company_workspace_id=p_workspace and r.source_type='internal'
      and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false)
      and (r.expires_at is null or r.expires_at>p_at)
    order by (a.id is not null) desc,r.created_at,r.role_id
  loop
    if v_count=0 then
      if not v_kept then v_kept:=true;
      else update public.company_roles set status='paused',updated_at=clock_timestamp() where role_id=v_role.role_id; end if;
    elsif not exists(select 1 from public.company_workspace_agents where assigned_role_id=v_role.role_id) then
      select a.id into v_agent from public.company_workspace_agents a where a.company_workspace_id=p_workspace
        and a.assigned_role_id is null and public.workspace_billing_agent_active_v1(a,p_at)
        order by (a.cancel_at is not null),a.cancel_at desc nulls first,a.started_at,a.id limit 1;
      if v_agent is not null then update public.company_workspace_agents set assigned_role_id=v_role.role_id,revision=revision+1 where id=v_agent;
      else update public.company_roles set status='paused',updated_at=clock_timestamp() where role_id=v_role.role_id; end if;
    end if;
  end loop;
end; $$;

create function public.workspace_billing_reconcile_v1(p_workspace uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_now timestamptz; v_checkpoint timestamptz; v_boundary record;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  v_now:=clock_timestamp();
  select coalesce(billing_reconciled_at,billing_started_at) into v_checkpoint from public.company_workspace where company_workspace_id=p_workspace;
  if v_checkpoint is null then return; end if;
  for v_boundary in select distinct boundary from (
    select p.ends_at boundary from public.company_workspace_credit_periods p where p.company_workspace_id=p_workspace and p.agent_id is not null
    union select a.cancel_at from public.company_workspace_agents a where a.company_workspace_id=p_workspace
    union select a.ended_at from public.company_workspace_agents a where a.company_workspace_id=p_workspace
  ) b where boundary>v_checkpoint and boundary<v_now order by boundary loop
    perform public.workspace_billing_reconcile_at_v1(p_workspace,v_boundary.boundary);
  end loop;
  perform public.workspace_billing_reconcile_at_v1(p_workspace,v_now);
  update public.company_workspace set billing_reconciled_at=v_now where company_workspace_id=p_workspace;
end; $$;

create function public.workspace_billing_summary_v1(p_workspace uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_workspace public.company_workspace%rowtype; v_now timestamptz; v_count int; v_roles int; v_balance int; v_free uuid; v_free_end timestamptz; v_agents jsonb;
begin
  perform public.workspace_billing_reconcile_v1(p_workspace);
  v_now:=clock_timestamp();
  select * into strict v_workspace from public.company_workspace where company_workspace_id=p_workspace;
  select count(*) into v_count from public.company_workspace_agents a where a.company_workspace_id=p_workspace and public.workspace_billing_agent_active_v1(a,v_now);
  select count(*) into v_roles from public.company_roles r where r.company_workspace_id=p_workspace and r.source_type='internal'
    and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>v_now);
  if v_workspace.billing_started_at is not null and v_workspace.billing_model='standard' then
    if v_count=0 then
      v_free:=public.workspace_billing_free_period_v1(p_workspace,v_now);
      select remaining,ends_at into v_balance,v_free_end from public.company_workspace_credit_periods where id=v_free;
    else
      select coalesce(sum(p.remaining),0) into v_balance from public.company_workspace_credit_periods p
        join public.company_workspace_agents a on a.id=p.agent_id where p.company_workspace_id=p_workspace
        and p.starts_at<=v_now and p.ends_at>v_now and public.workspace_billing_agent_active_v1(a,v_now);
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'label','Agent '||a.ordinal,'roleId',a.assigned_role_id,'roleName',r.name,
    'status',a.status,'startedAt',a.started_at,'periodEnd',a.current_period_end,'cancelAt',a.cancel_at,'endedAt',a.ended_at,
    'active',public.workspace_billing_agent_active_v1(a.base,v_now),'revision',a.revision,
    'remaining',coalesce((select sum(p.remaining) from public.company_workspace_credit_periods p where p.agent_id=a.id and p.starts_at<=v_now and p.ends_at>v_now),0)
  ) order by a.started_at,a.id),'[]'::jsonb) into v_agents from (
    select a.*,a as base,row_number() over(order by a.started_at,a.id) ordinal from public.company_workspace_agents a where a.company_workspace_id=p_workspace
  ) a left join public.company_roles r on r.role_id=a.assigned_role_id;
  return jsonb_build_object('workspaceId',p_workspace,'model',case when v_workspace.billing_started_at is null then 'legacy' when v_workspace.billing_model='scale' then 'scale' when v_count=0 then 'free' else 'agent' end,
    'activeRoles',v_roles,'capacity',case when v_workspace.billing_started_at is null or v_workspace.billing_model='scale' then null else greatest(1,v_count) end,
    'balance',v_balance,'freeRenewsAt',v_free_end,'agents',v_agents,'hasCustomer',v_workspace.stripe_customer_id is not null);
end; $$;

create function public.workspace_billing_sync_agent_v1(p_workspace uuid,p_subscription text,p_expected_revision bigint,p_snapshot jsonb,p_periods jsonb default '[]')
returns boolean language plpgsql security definer set search_path='' as $$
declare v_agent public.company_workspace_agents%rowtype; v_period jsonb; v_existing public.company_workspace_credit_periods%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  select * into v_agent from public.company_workspace_agents where stripe_subscription_id=p_subscription for update;
  if (v_agent.id is null and p_expected_revision<>0) or (v_agent.id is not null and v_agent.revision<>p_expected_revision) then return false; end if;
  if v_agent.id is not null and v_agent.company_workspace_id<>p_workspace then raise exception 'billing_workspace_mismatch'; end if;
  if not exists(select 1 from public.company_workspace where company_workspace_id=p_workspace and stripe_customer_id=p_snapshot->>'customer') then raise exception 'billing_customer_mismatch'; end if;
  if v_agent.id is null then
    insert into public.company_workspace_agents(company_workspace_id,stripe_subscription_id,stripe_price_id,status,started_at,current_period_end,cancel_at,ended_at)
      values(p_workspace,p_subscription,p_snapshot->>'price',p_snapshot->>'status',(p_snapshot->>'startedAt')::timestamptz,(p_snapshot->>'periodEnd')::timestamptz,(p_snapshot->>'cancelAt')::timestamptz,(p_snapshot->>'endedAt')::timestamptz) returning * into v_agent;
  else
    update public.company_workspace_agents set status=p_snapshot->>'status',current_period_end=(p_snapshot->>'periodEnd')::timestamptz,
      cancel_at=(p_snapshot->>'cancelAt')::timestamptz,ended_at=(p_snapshot->>'endedAt')::timestamptz,revision=revision+1,updated_at=clock_timestamp()
      where id=v_agent.id and row(status,current_period_end,cancel_at,ended_at) is distinct from
        row(p_snapshot->>'status',(p_snapshot->>'periodEnd')::timestamptz,(p_snapshot->>'cancelAt')::timestamptz,(p_snapshot->>'endedAt')::timestamptz);
  end if;
  for v_period in select value from jsonb_array_elements(p_periods) loop
    select * into v_existing from public.company_workspace_credit_periods where agent_id=v_agent.id and starts_at=(v_period->>'startsAt')::timestamptz;
    if v_existing.id is not null then
      if v_existing.ends_at<>(v_period->>'endsAt')::timestamptz then raise exception 'billing_period_conflict'; end if;
    else
      insert into public.company_workspace_credit_periods(company_workspace_id,agent_id,stripe_invoice_id,starts_at,ends_at,confirmed_at,allowance,remaining)
        values(p_workspace,v_agent.id,v_period->>'invoiceId',(v_period->>'startsAt')::timestamptz,(v_period->>'endsAt')::timestamptz,coalesce((v_period->>'confirmedAt')::timestamptz,clock_timestamp()),50,50);
    end if;
  end loop;
  if jsonb_array_length(p_periods)>0 then
    update public.company_workspace set billing_started_at=coalesce(billing_started_at,clock_timestamp()),
      billing_free_anchor_at=coalesce(billing_free_anchor_at,clock_timestamp()) where company_workspace_id=p_workspace;
  end if;
  perform public.workspace_billing_reconcile_v1(p_workspace);
  return true;
end; $$;

create function public.workspace_billing_debit_v1(p_workspace uuid,p_action text,p_key text,p_role uuid,p_talent uuid,p_actor uuid,p_payload jsonb default '{}',p_complete boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_workspace public.company_workspace%rowtype; v_event public.company_workspace_credit_events%rowtype; v_now timestamptz; v_period uuid; v_count int; v_delta int:=0; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  v_now:=clock_timestamp();
  select * into v_workspace from public.company_workspace where company_workspace_id=p_workspace;
  if v_workspace.company_workspace_id is null then raise exception 'billing_workspace_not_found'; end if;
  if not exists(select 1 from public.company_roles where role_id=p_role and company_workspace_id=p_workspace) then raise exception 'billing_role_mismatch'; end if;
  select * into v_event from public.company_workspace_credit_events where company_workspace_id=p_workspace and action_code=p_action and business_key=p_key;
  if v_event.id is not null then
    if v_event.role_id<>p_role or v_event.talent_id<>p_talent or v_event.action_payload<>p_payload then raise exception 'billing_action_conflict'; end if;
    return v_event.id;
  end if;
  -- Legacy contracts are deliberately opt-in. No retroactive debits.
  if v_workspace.billing_started_at is null then return null; end if;
  if v_workspace.billing_model='standard' then
    select count(*) into v_count from public.company_workspace_agents a where a.company_workspace_id=p_workspace and public.workspace_billing_agent_active_v1(a,v_now);
    if v_count=0 then
      if p_action='connect' then raise exception 'workspace_feature_unavailable'; end if;
      v_period:=public.workspace_billing_free_period_v1(p_workspace,v_now);
      if (select remaining from public.company_workspace_credit_periods where id=v_period)<1 then raise exception 'workspace_credits_exhausted'; end if;
    else
      select p.id into v_period from public.company_workspace_credit_periods p join public.company_workspace_agents a on a.id=p.agent_id
        where p.company_workspace_id=p_workspace and p.starts_at<=v_now and p.ends_at>v_now and p.remaining>=1 and public.workspace_billing_agent_active_v1(a,v_now)
        order by p.ends_at,p.starts_at,p.id limit 1 for update of p;
      if v_period is null then raise exception 'workspace_credits_exhausted'; end if;
    end if;
    update public.company_workspace_credit_periods set remaining=remaining-1 where id=v_period;
    v_delta:=-1;
  end if;
  insert into public.company_workspace_credit_events(company_workspace_id,period_id,action_code,business_key,role_id,talent_id,actor_id,delta,action_payload,completed_at)
    values(p_workspace,v_period,p_action,p_key,p_role,p_talent,p_actor,v_delta,p_payload,case when p_complete then v_now end) returning id into v_id;
  return v_id;
end; $$;

-- Preserve the existing Intro transaction verbatim, including its route/privacy
-- locks. A failed debit rolls the original request and delivery enqueue back.
alter function public.request_company_intro_v1(uuid,uuid,uuid,uuid,text[],text) rename to request_company_intro_without_billing_v1;
revoke all on function public.request_company_intro_without_billing_v1(uuid,uuid,uuid,uuid,text[],text) from public,anon,authenticated,service_role;
create function public.request_company_intro_v1(p_intro_candidate_id uuid,p_company_workspace_id uuid,p_company_user_id uuid,p_next_stage_id uuid,p_intro_recipient_emails text[],p_company_appeal text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_intro record;
begin
  if not exists(select 1 from public.company_workspace where company_workspace_id=p_company_workspace_id and billing_started_at is not null) then
    return public.request_company_intro_without_billing_v1(p_intro_candidate_id,p_company_workspace_id,p_company_user_id,p_next_stage_id,p_intro_recipient_emails,p_company_appeal);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_company_workspace_id::text,0));
  v_result:=public.request_company_intro_without_billing_v1(p_intro_candidate_id,p_company_workspace_id,p_company_user_id,p_next_stage_id,p_intro_recipient_emails,p_company_appeal);
  if v_result->>'status'='requested' then
    select role_id,talent_id into strict v_intro from public.company_intro_candidates where id=p_intro_candidate_id;
    perform public.workspace_billing_debit_v1(p_company_workspace_id,'intro_request',p_intro_candidate_id::text,v_intro.role_id,v_intro.talent_id,p_company_user_id,'{}',true);
  end if;
  return v_result;
end; $$;

create function public.workspace_billing_claim_action_v1(p_event uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.company_workspace_credit_events set execution_token=p_token,execution_until=clock_timestamp()+interval '5 minutes',attempts=attempts+1
    where id=p_event and action_code='connect' and completed_at is null and (execution_until is null or execution_until<clock_timestamp());
  return found;
end; $$;

create function public.workspace_billing_release_action_v1(p_event uuid,p_token uuid)
returns void language sql security definer set search_path='' as $$
  update public.company_workspace_credit_events set execution_until=null,execution_token=null
    where id=p_event and execution_token=p_token and completed_at is null;
$$;

create function public.workspace_billing_complete_action_v1(p_event uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.company_workspace_credit_events set completed_at=clock_timestamp(),execution_until=null,execution_token=null
    where id=p_event and execution_token=p_token and completed_at is null;
  return found;
end; $$;

create function public.workspace_billing_checkout_v1(p_workspace uuid,p_customer text default null,p_key uuid default null,p_session text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_workspace public.company_workspace%rowtype; v_checkout jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  select * into strict v_workspace from public.company_workspace where company_workspace_id=p_workspace for update;
  if p_customer is not null then
    if v_workspace.stripe_customer_id is not null and v_workspace.stripe_customer_id<>p_customer then raise exception 'billing_customer_conflict'; end if;
    update public.company_workspace set stripe_customer_id=p_customer where company_workspace_id=p_workspace;
  end if;
  if v_workspace.billing_model='scale' then raise exception 'billing_scale_checkout_forbidden'; end if;
  v_checkout:=v_workspace.billing_checkout;
  if p_key is not null then
    if v_checkout->>'key' is distinct from p_key::text then raise exception 'billing_checkout_conflict'; end if;
    if p_session is null then v_checkout:=null;
    else v_checkout:=v_checkout||jsonb_build_object('sessionId',p_session); end if;
  elsif v_checkout is null or (v_checkout->>'expiresAt')::timestamptz<clock_timestamp() then
    v_checkout:=jsonb_build_object('key',gen_random_uuid(),'expiresAt',clock_timestamp()+interval '35 minutes');
  end if;
  update public.company_workspace set billing_checkout=v_checkout where company_workspace_id=p_workspace;
  return v_checkout;
end; $$;

create function public.workspace_billing_role_guard_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_workspace public.company_workspace%rowtype; v_count int; v_used int;
begin
  if new.source_type<>'internal' or lower(new.status) not in ('active','open','top_priority') or coalesce(new.is_expired,false) or (new.expires_at is not null and new.expires_at<=clock_timestamp()) then return new; end if;
  select * into v_workspace from public.company_workspace where company_workspace_id=new.company_workspace_id;
  if v_workspace.billing_started_at is null or v_workspace.billing_model='scale' then return new; end if;
  perform public.workspace_billing_reconcile_v1(new.company_workspace_id);
  select greatest(1,count(*)) into v_count from public.company_workspace_agents a where a.company_workspace_id=new.company_workspace_id and public.workspace_billing_agent_active_v1(a,clock_timestamp());
  select count(*) into v_used from public.company_roles r where r.company_workspace_id=new.company_workspace_id and r.role_id<>new.role_id
    and r.source_type='internal' and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>clock_timestamp());
  if v_used>=v_count then raise exception 'workspace_role_capacity_exceeded'; end if;
  return new;
end; $$;

create function public.workspace_billing_role_assignment_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_agent uuid;
begin
  if new.source_type<>'internal' then return new; end if;
  if not exists(select 1 from public.company_workspace where company_workspace_id=new.company_workspace_id and billing_started_at is not null) then return new; end if;
  if lower(new.status) not in ('active','open','top_priority') or coalesce(new.is_expired,false) or (new.expires_at is not null and new.expires_at<=clock_timestamp()) then
    update public.company_workspace_agents set assigned_role_id=null,revision=revision+1 where assigned_role_id=new.role_id;
  elsif not exists(select 1 from public.company_workspace_agents where assigned_role_id=new.role_id)
    and exists(select 1 from public.company_workspace where company_workspace_id=new.company_workspace_id and billing_started_at is not null and billing_model='standard') then
    select id into v_agent from public.company_workspace_agents a where a.company_workspace_id=new.company_workspace_id and a.assigned_role_id is null
      and public.workspace_billing_agent_active_v1(a,clock_timestamp()) order by (a.cancel_at is not null),a.cancel_at desc nulls first,a.started_at,a.id limit 1;
    if v_agent is not null then update public.company_workspace_agents set assigned_role_id=new.role_id,revision=revision+1 where id=v_agent; end if;
  end if;
  return new;
end; $$;
create trigger workspace_billing_role_guard before insert or update of status,is_expired,expires_at on public.company_roles for each row execute function public.workspace_billing_role_guard_v1();
create trigger workspace_billing_role_assignment after insert or update of status,is_expired,expires_at on public.company_roles for each row execute function public.workspace_billing_role_assignment_v1();

-- Commit the connection state together. Email delivery reuses the existing
-- deterministic message identity before this step; retries use this event ID.
create function public.workspace_billing_commit_connection_v1(p_event uuid,p_token uuid,p_tags text[],p_next_tag text,p_stage text,p_progress jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_event public.company_workspace_credit_events%rowtype; v_rec uuid;
begin
  select * into strict v_event from public.company_workspace_credit_events where id=p_event for update;
  if v_event.action_code<>'connect' or v_event.execution_token is distinct from p_token or v_event.completed_at is not null then raise exception 'billing_action_conflict'; end if;
  v_rec:=v_event.business_key::uuid;
  if v_event.action_payload->'input'->>'stage' is distinct from p_stage then raise exception 'billing_action_conflict'; end if;
  perform 1 from public.talent_opportunity_recommendation where id=v_rec and role_id=v_event.role_id and talent_id=v_event.talent_id for update;
  if not found then raise exception 'billing_recommendation_conflict'; end if;
  delete from public.talent_opportunity_tag where talent_id=v_event.talent_id and opportunity_id=v_event.role_id and tag=any(p_tags);
  insert into public.talent_opportunity_tag(opportunity_id,tag,talent_id) values(v_event.role_id,p_next_tag,v_event.talent_id);
  update public.talent_opportunity_recommendation set processed_stage=p_stage,updated_at=clock_timestamp() where id=v_rec;
  insert into public.talent_progress(id,company_user_id,kind,metadata,recommendation_id,role_id,talent_id,text,user_id)
    values(v_event.id,v_event.actor_id,'org_stage_change',p_progress->'metadata',v_rec,v_event.role_id,v_event.talent_id,p_progress->>'text',p_progress->>'user_id')
    on conflict(id) do nothing;
end; $$;

-- Optional reassignment swaps two occupied Agents without touching Role content.
create function public.workspace_billing_assign_v1(p_workspace uuid,p_agent uuid,p_role uuid,p_revision bigint)
returns void language plpgsql security definer set search_path='' as $$
declare v_agent public.company_workspace_agents%rowtype; v_other uuid; v_previous uuid;
begin
  perform public.workspace_billing_reconcile_v1(p_workspace);
  select * into strict v_agent from public.company_workspace_agents where id=p_agent and company_workspace_id=p_workspace;
  if v_agent.revision<>p_revision or not public.workspace_billing_agent_active_v1(v_agent,clock_timestamp()) then raise exception 'billing_assignment_conflict'; end if;
  if p_role is not null and not exists(select 1 from public.company_roles where role_id=p_role and company_workspace_id=p_workspace and source_type='internal' and lower(status) in ('active','open','top_priority') and not coalesce(is_expired,false)) then raise exception 'billing_role_conflict'; end if;
  if p_role is null and v_agent.assigned_role_id is not null then raise exception 'billing_assignment_conflict'; end if;
  select id into v_other from public.company_workspace_agents where assigned_role_id=p_role and company_workspace_id=p_workspace;
  v_previous:=v_agent.assigned_role_id;
  update public.company_workspace_agents set assigned_role_id=null,revision=revision+1 where id in (p_agent,v_other);
  update public.company_workspace_agents set assigned_role_id=p_role where id=p_agent;
  if v_other is not null and v_other<>p_agent then update public.company_workspace_agents set assigned_role_id=v_previous where id=v_other; end if;
end; $$;

-- Existing client workspace editing must never acquire access to billing fields.
create function public.workspace_billing_workspace_guard_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
  if tg_op='INSERT' then
    if new.billing_model<>'standard' or new.stripe_customer_id is not null or new.billing_checkout is not null then raise exception 'billing_write_forbidden'; end if;
    -- Before rollout the defaults are NULL; preserve that opt-out for old clients.
    -- After rollout a Free insert is normalized to the actual insertion time.
    if new.billing_started_at is not null then new.billing_started_at:=clock_timestamp(); end if;
    new.billing_free_anchor_at:=new.billing_started_at; new.billing_reconciled_at:=null;
  elsif row(new.billing_model,new.billing_started_at,new.billing_free_anchor_at,new.billing_reconciled_at,new.stripe_customer_id,new.billing_checkout)
    is distinct from row(old.billing_model,old.billing_started_at,old.billing_free_anchor_at,old.billing_reconciled_at,old.stripe_customer_id,old.billing_checkout) then
    raise exception 'billing_write_forbidden';
  end if;
  return new;
end; $$;
create trigger workspace_billing_workspace_guard before insert or update on public.company_workspace for each row execute function public.workspace_billing_workspace_guard_v1();

-- Fast local expiry sweep is independent of Stripe's API or the number of
-- Free workspaces. Reads/mutations also reconcile the selected workspace.
create function public.workspace_billing_expire_due_v1(p_limit integer default 200)
returns integer language plpgsql security definer set search_path='' as $$
declare v_row record; v_n integer:=0;
begin
  for v_row in select w.company_workspace_id from public.company_workspace w
    where w.billing_started_at is not null and w.billing_model='standard' and exists(
      select 1 from public.company_workspace_agents a where a.company_workspace_id=w.company_workspace_id
      and a.assigned_role_id is not null and not public.workspace_billing_agent_active_v1(a,clock_timestamp()))
    order by w.billing_reconciled_at nulls first limit least(greatest(p_limit,1),500)
  loop
    perform public.workspace_billing_reconcile_v1(v_row.company_workspace_id); v_n:=v_n+1;
  end loop;
  return v_n;
end; $$;

-- Explicit administrative enrollment. Existing contracts are never migrated
-- by guessing from old payment records or by silently pausing arbitrary Roles.
create function public.workspace_billing_enroll_v1(p_workspace uuid,p_model text,p_keep_role uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  if p_model not in ('standard','scale') then raise exception 'billing_model_invalid'; end if;
  if not exists(select 1 from public.company_workspace where company_workspace_id=p_workspace) then raise exception 'billing_workspace_not_found'; end if;
  if exists(select 1 from public.company_workspace_agents a where a.company_workspace_id=p_workspace and
      (public.workspace_billing_agent_active_v1(a,clock_timestamp()) or a.status not in ('canceled','incomplete_expired'))) then
    raise exception 'billing_active_subscription_conflict';
  end if;
  if p_model='standard' then
    select count(*) into v_count from public.company_roles where company_workspace_id=p_workspace and source_type='internal'
      and lower(status) in ('active','open','top_priority') and not coalesce(is_expired,false) and (expires_at is null or expires_at>clock_timestamp());
    if v_count>1 then
      if p_keep_role is null or not exists(select 1 from public.company_roles where role_id=p_keep_role and company_workspace_id=p_workspace and source_type='internal' and lower(status) in ('active','open','top_priority') and not coalesce(is_expired,false) and (expires_at is null or expires_at>clock_timestamp())) then raise exception 'billing_retained_role_required'; end if;
      update public.company_roles set status='paused',updated_at=clock_timestamp() where company_workspace_id=p_workspace and role_id<>p_keep_role and source_type='internal' and lower(status) in ('active','open','top_priority');
    end if;
  end if;
  update public.company_workspace set billing_model=p_model,billing_started_at=coalesce(billing_started_at,clock_timestamp()),
    billing_free_anchor_at=coalesce(billing_free_anchor_at,clock_timestamp()) where company_workspace_id=p_workspace;
  perform public.workspace_billing_reconcile_v1(p_workspace);
end; $$;

-- Only the service boundary can call billing routines. Grants and RLS are
-- deliberately explicit; default Data API exposure is not an authorization.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'workspace_billing_%' or p.proname='request_company_intro_v1') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
