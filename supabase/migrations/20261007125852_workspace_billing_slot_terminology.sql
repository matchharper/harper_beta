-- Canonical billing terminology is Slot. Rename in place: IDs, periods, and
-- existing Stripe subscriptions/amounts remain unchanged. Previous app readers
-- retain narrowly scoped compatibility while the application release is pending.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
alter table public.company_workspace_agents rename to company_workspace_slots;
alter table public.company_workspace_credit_periods rename column agent_id to slot_id;
-- Read-only derived alias for the previous app's usage-history join.
alter table public.company_workspace_credit_periods add column agent_id uuid generated always as (slot_id) stored;
comment on column public.company_workspace_credit_periods.agent_id is 'Deprecated read-only compatibility alias. New code uses slot_id.';
create view public.company_workspace_agents with (security_invoker=true) as select * from public.company_workspace_slots;
comment on view public.company_workspace_agents is 'Compatibility for the previous app only. Canonical table: company_workspace_slots.';
revoke all on public.company_workspace_agents from public,anon,authenticated;
grant select,insert,update on public.company_workspace_agents to service_role;

-- Keep schema object names consistent with their canonical table/column.
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.company_workspace_slots'::regclass and conname like '%agents%' loop
    execute format('alter table public.company_workspace_slots rename constraint %I to %I',c.conname,replace(c.conname,'agents','slots'));
  end loop;
  for c in select conname from pg_constraint where conrelid='public.company_workspace_credit_periods'::regclass and conname like '%agent_id%' loop
    execute format('alter table public.company_workspace_credit_periods rename constraint %I to %I',c.conname,replace(c.conname,'agent_id','slot_id'));
  end loop;
  for c in select indexname from pg_indexes where schemaname='public' and tablename='company_workspace_slots' and indexname like '%agents%' loop
    execute format('alter index public.%I rename to %I',c.indexname,replace(c.indexname,'agents','slots'));
  end loop;
end $$;

CREATE OR REPLACE FUNCTION public.workspace_billing_slot_active_v1(p_slot company_workspace_slots, p_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select (p_slot.ended_at is null or p_at < p_slot.ended_at)
    and (p_slot.cancel_at is null or p_at < p_slot.cancel_at)
    and exists(select 1 from public.company_workspace_credit_periods p
      where p.slot_id=p_slot.id and p.starts_at<=p_at and p.ends_at>p_at and p.confirmed_at<=p_at);
$function$;

CREATE OR REPLACE FUNCTION public.workspace_billing_reconcile_at_v1(p_workspace uuid, p_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_model text; v_count int; v_slot uuid; v_role record; v_kept boolean:=false;
begin
  select billing_model into v_model from public.company_workspace where company_workspace_id=p_workspace;
  -- Existing valid assignments survive. Released Roles retain all their data.
  update public.company_workspace_slots a set assigned_role_id=null,revision=revision+1
    where a.company_workspace_id=p_workspace and a.assigned_role_id is not null and
      (v_model='scale' or not public.workspace_billing_slot_active_v1(a,p_at) or not exists(
        select 1 from public.company_roles r where r.role_id=a.assigned_role_id
        and r.company_workspace_id=p_workspace and lower(r.status) in ('active','open','top_priority')
        and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>p_at)));
  if v_model='scale' then return; end if;
  select count(*) into v_count from public.company_workspace_slots a where a.company_workspace_id=p_workspace and public.workspace_billing_slot_active_v1(a,p_at);
  for v_role in select r.role_id from public.company_roles r
    left join public.company_workspace_slots a on a.assigned_role_id=r.role_id
    where r.company_workspace_id=p_workspace and r.source_type='internal'
      and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false)
      and (r.expires_at is null or r.expires_at>p_at)
    order by (a.id is not null) desc,r.created_at,r.role_id
  loop
    if v_count=0 then
      if not v_kept then v_kept:=true;
      else update public.company_roles set status='paused',updated_at=clock_timestamp() where role_id=v_role.role_id; end if;
    elsif not exists(select 1 from public.company_workspace_slots where assigned_role_id=v_role.role_id) then
      select a.id into v_slot from public.company_workspace_slots a where a.company_workspace_id=p_workspace
        and a.assigned_role_id is null and public.workspace_billing_slot_active_v1(a,p_at)
        order by (a.cancel_at is not null),a.cancel_at desc nulls first,a.started_at,a.id limit 1;
      if v_slot is not null then update public.company_workspace_slots set assigned_role_id=v_role.role_id,revision=revision+1 where id=v_slot;
      else update public.company_roles set status='paused',updated_at=clock_timestamp() where role_id=v_role.role_id; end if;
    end if;
  end loop;
end; $function$;

CREATE OR REPLACE FUNCTION public.workspace_billing_reconcile_v1(p_workspace uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_now timestamptz; v_checkpoint timestamptz; v_boundary record;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  v_now:=clock_timestamp();
  select coalesce(billing_reconciled_at,billing_started_at) into v_checkpoint from public.company_workspace where company_workspace_id=p_workspace;
  if v_checkpoint is null then return; end if;
  for v_boundary in select distinct boundary from (
    select p.ends_at boundary from public.company_workspace_credit_periods p where p.company_workspace_id=p_workspace and p.slot_id is not null
    union select a.cancel_at from public.company_workspace_slots a where a.company_workspace_id=p_workspace
    union select a.ended_at from public.company_workspace_slots a where a.company_workspace_id=p_workspace
  ) b where boundary>v_checkpoint and boundary<v_now order by boundary loop
    perform public.workspace_billing_reconcile_at_v1(p_workspace,v_boundary.boundary);
  end loop;
  perform public.workspace_billing_reconcile_at_v1(p_workspace,v_now);
  update public.company_workspace set billing_reconciled_at=v_now where company_workspace_id=p_workspace;
end; $function$;

CREATE OR REPLACE FUNCTION public.workspace_billing_sync_slot_v1(p_workspace uuid, p_subscription text, p_expected_revision bigint, p_snapshot jsonb, p_periods jsonb DEFAULT '[]'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_slot public.company_workspace_slots%rowtype; v_period jsonb; v_existing public.company_workspace_credit_periods%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  select * into v_slot from public.company_workspace_slots where stripe_subscription_id=p_subscription for update;
  if (v_slot.id is null and p_expected_revision<>0) or (v_slot.id is not null and v_slot.revision<>p_expected_revision) then return false; end if;
  if v_slot.id is not null and v_slot.company_workspace_id<>p_workspace then raise exception 'billing_workspace_mismatch'; end if;
  if not exists(select 1 from public.company_workspace where company_workspace_id=p_workspace and stripe_customer_id=p_snapshot->>'customer') then raise exception 'billing_customer_mismatch'; end if;
  if v_slot.id is null then
    insert into public.company_workspace_slots(company_workspace_id,stripe_subscription_id,stripe_price_id,billing_interval,status,started_at,current_period_end,cancel_at,ended_at)
      values(p_workspace,p_subscription,p_snapshot->>'price',coalesce(p_snapshot->>'billingInterval','month'),p_snapshot->>'status',(p_snapshot->>'startedAt')::timestamptz,(p_snapshot->>'periodEnd')::timestamptz,(p_snapshot->>'cancelAt')::timestamptz,(p_snapshot->>'endedAt')::timestamptz) returning * into v_slot;
  else
    update public.company_workspace_slots set billing_interval=coalesce(p_snapshot->>'billingInterval','month'),status=p_snapshot->>'status',current_period_end=(p_snapshot->>'periodEnd')::timestamptz,
      cancel_at=(p_snapshot->>'cancelAt')::timestamptz,ended_at=(p_snapshot->>'endedAt')::timestamptz,revision=revision+1,updated_at=clock_timestamp()
      where id=v_slot.id and row(billing_interval,status,current_period_end,cancel_at,ended_at) is distinct from
        row(coalesce(p_snapshot->>'billingInterval','month'),p_snapshot->>'status',(p_snapshot->>'periodEnd')::timestamptz,(p_snapshot->>'cancelAt')::timestamptz,(p_snapshot->>'endedAt')::timestamptz);
  end if;
  for v_period in select value from jsonb_array_elements(p_periods) loop
    select * into v_existing from public.company_workspace_credit_periods where slot_id=v_slot.id and starts_at=(v_period->>'startsAt')::timestamptz;
    if v_existing.id is not null then
      if v_existing.ends_at<>(v_period->>'endsAt')::timestamptz or v_existing.stripe_invoice_id is distinct from v_period->>'invoiceId' then raise exception 'billing_period_conflict'; end if;
    else
      insert into public.company_workspace_credit_periods(company_workspace_id,slot_id,stripe_invoice_id,starts_at,ends_at,confirmed_at,allowance,remaining)
        values(p_workspace,v_slot.id,v_period->>'invoiceId',(v_period->>'startsAt')::timestamptz,(v_period->>'endsAt')::timestamptz,coalesce((v_period->>'confirmedAt')::timestamptz,clock_timestamp()),50,50);
    end if;
  end loop;
  if jsonb_array_length(p_periods)>0 then
    update public.company_workspace set billing_started_at=coalesce(billing_started_at,clock_timestamp()),
      billing_free_anchor_at=coalesce(billing_free_anchor_at,clock_timestamp()) where company_workspace_id=p_workspace;
  end if;
  perform public.workspace_billing_reconcile_v1(p_workspace);
  return true;
end; $function$;

CREATE OR REPLACE FUNCTION public.workspace_billing_debit_v1(p_workspace uuid, p_action text, p_key text, p_role uuid, p_talent uuid, p_actor uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_complete boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_workspace public.company_workspace%rowtype; v_event public.company_workspace_credit_events%rowtype; v_now timestamptz; v_period uuid; v_count int; v_slot uuid; v_delta int:=0; v_id uuid;
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
    -- Role assignment and spending share the same workspace lock. Retries above
    -- retain their original event/period even after a Role moves or pauses.
    perform public.workspace_billing_reconcile_v1(p_workspace);
    v_now:=clock_timestamp();
    select count(*) into v_count from public.company_workspace_slots a where a.company_workspace_id=p_workspace and public.workspace_billing_slot_active_v1(a,v_now);
    if v_count=0 then
      if p_action='connect' then raise exception 'workspace_feature_unavailable'; end if;
      if not exists(select 1 from public.company_roles r where r.role_id=p_role
        and r.source_type='internal' and lower(r.status) in ('active','open','top_priority')
        and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>v_now)) then
        raise exception 'workspace_role_slot_required';
      end if;
      v_period:=public.workspace_billing_free_period_v1(p_workspace,v_now);
      if (select remaining from public.company_workspace_credit_periods where id=v_period)<1 then raise exception 'workspace_credits_exhausted'; end if;
    else
      select a.id into v_slot from public.company_workspace_slots a
        where a.company_workspace_id=p_workspace and a.assigned_role_id=p_role
          and public.workspace_billing_slot_active_v1(a,v_now) for update;
      if v_slot is null then raise exception 'workspace_role_slot_required'; end if;
      -- Never fall back to another Slot or the Free allowance.
      select p.id into v_period from public.company_workspace_credit_periods p
        where p.company_workspace_id=p_workspace and p.slot_id=v_slot
          and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now and p.remaining>=1
        order by p.ends_at,p.starts_at,p.id limit 1 for update;
      if v_period is null then raise exception 'workspace_credits_exhausted'; end if;
    end if;
    update public.company_workspace_credit_periods set remaining=remaining-1 where id=v_period;
    v_delta:=-1;
  end if;
  insert into public.company_workspace_credit_events(company_workspace_id,period_id,action_code,business_key,role_id,talent_id,actor_id,delta,action_payload,completed_at)
    values(p_workspace,v_period,p_action,p_key,p_role,p_talent,p_actor,v_delta,p_payload,case when p_complete then v_now end) returning id into v_id;
  return v_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.workspace_billing_role_guard_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_workspace public.company_workspace%rowtype; v_count int; v_used int;
begin
  if new.source_type<>'internal' or lower(new.status) not in ('active','open','top_priority') or coalesce(new.is_expired,false) or (new.expires_at is not null and new.expires_at<=clock_timestamp()) then return new; end if;
  select * into v_workspace from public.company_workspace where company_workspace_id=new.company_workspace_id;
  if v_workspace.billing_started_at is null or v_workspace.billing_model='scale' then return new; end if;
  perform public.workspace_billing_reconcile_v1(new.company_workspace_id);
  select greatest(1,count(*)) into v_count from public.company_workspace_slots a where a.company_workspace_id=new.company_workspace_id and public.workspace_billing_slot_active_v1(a,clock_timestamp());
  select count(*) into v_used from public.company_roles r where r.company_workspace_id=new.company_workspace_id and r.role_id<>new.role_id
    and r.source_type='internal' and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>clock_timestamp());
  if v_used>=v_count then raise exception 'workspace_role_capacity_exceeded'; end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.workspace_billing_role_assignment_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_slot uuid;
begin
  if new.source_type<>'internal' then return new; end if;
  if not exists(select 1 from public.company_workspace where company_workspace_id=new.company_workspace_id and billing_started_at is not null) then return new; end if;
  if lower(new.status) not in ('active','open','top_priority') or coalesce(new.is_expired,false) or (new.expires_at is not null and new.expires_at<=clock_timestamp()) then
    update public.company_workspace_slots set assigned_role_id=null,revision=revision+1 where assigned_role_id=new.role_id;
  elsif not exists(select 1 from public.company_workspace_slots where assigned_role_id=new.role_id)
    and exists(select 1 from public.company_workspace where company_workspace_id=new.company_workspace_id and billing_started_at is not null and billing_model='standard') then
    select id into v_slot from public.company_workspace_slots a where a.company_workspace_id=new.company_workspace_id and a.assigned_role_id is null
      and public.workspace_billing_slot_active_v1(a,clock_timestamp()) order by (a.cancel_at is not null),a.cancel_at desc nulls first,a.started_at,a.id limit 1;
    if v_slot is not null then update public.company_workspace_slots set assigned_role_id=new.role_id,revision=revision+1 where id=v_slot; end if;
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.workspace_billing_assign_slot_v1(p_workspace uuid, p_slot uuid, p_role uuid, p_revision bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_slot public.company_workspace_slots%rowtype; v_other uuid; v_previous uuid;
begin
  perform public.workspace_billing_reconcile_v1(p_workspace);
  select * into strict v_slot from public.company_workspace_slots where id=p_slot and company_workspace_id=p_workspace;
  if v_slot.revision<>p_revision or not public.workspace_billing_slot_active_v1(v_slot,clock_timestamp()) then raise exception 'billing_assignment_conflict'; end if;
  if p_role is not null and not exists(select 1 from public.company_roles where role_id=p_role and company_workspace_id=p_workspace and source_type='internal' and lower(status) in ('active','open','top_priority') and not coalesce(is_expired,false)) then raise exception 'billing_role_conflict'; end if;
  if p_role is null and v_slot.assigned_role_id is not null then raise exception 'billing_assignment_conflict'; end if;
  select id into v_other from public.company_workspace_slots where assigned_role_id=p_role and company_workspace_id=p_workspace;
  v_previous:=v_slot.assigned_role_id;
  update public.company_workspace_slots set assigned_role_id=null,revision=revision+1 where id in (p_slot,v_other);
  update public.company_workspace_slots set assigned_role_id=p_role where id=p_slot;
  if v_other is not null and v_other<>p_slot then update public.company_workspace_slots set assigned_role_id=v_previous where id=v_other; end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.workspace_billing_expire_due_v1(p_limit integer DEFAULT 200)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row record; v_n integer:=0;
begin
  for v_row in select w.company_workspace_id from public.company_workspace w
    where w.billing_started_at is not null and w.billing_model='standard' and exists(
      select 1 from public.company_workspace_slots a where a.company_workspace_id=w.company_workspace_id
      and a.assigned_role_id is not null and not public.workspace_billing_slot_active_v1(a,clock_timestamp()))
    order by w.billing_reconciled_at nulls first limit least(greatest(p_limit,1),500)
  loop
    perform public.workspace_billing_reconcile_v1(v_row.company_workspace_id); v_n:=v_n+1;
  end loop;
  return v_n;
end; $function$;

CREATE OR REPLACE FUNCTION public.workspace_billing_enroll_v1(p_workspace uuid, p_model text, p_keep_role uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  if p_model not in ('standard','scale') then raise exception 'billing_model_invalid'; end if;
  if not exists(select 1 from public.company_workspace where company_workspace_id=p_workspace) then raise exception 'billing_workspace_not_found'; end if;
  if exists(select 1 from public.company_workspace_slots a where a.company_workspace_id=p_workspace and
      (public.workspace_billing_slot_active_v1(a,clock_timestamp()) or a.status not in ('canceled','incomplete_expired'))) then
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
end; $function$;

CREATE OR REPLACE FUNCTION public.workspace_signup_update_v1(p_user uuid, p_workspace uuid, p_action text, p_values jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare w public.company_workspace%rowtype; s jsonb; r jsonb; v_db bigint; v_token text; v_url text;
begin
  -- Accept an in-flight request from the previous app, store only the new term.
  if p_action='plan' and p_values->>'plan'='agent' then
    p_values:=jsonb_set(p_values,'{plan}','"slot"'::jsonb);
  end if;
  select * into strict w from public.company_workspace where company_workspace_id=p_workspace for update;
  if w.signup_state->>'createdBy' is distinct from p_user::text or not exists(
    select 1 from public.company_user_workspace where company_workspace_id=p_workspace and company_user_id=p_user and authority='owner') then
    raise exception 'signup_forbidden';
  end if;
  s:=w.signup_state;
  if p_action='research_start' then
    if s->>'companyConfirmedAt' is not null or s->>'researchStatus'='ready' or
      (s->>'researchStatus'='pending' and (s->>'researchStartedAt')::timestamptz>clock_timestamp()-interval '2 minutes') then
      return jsonb_build_object('claimed',false);
    end if;
    -- Failed provider calls may be retried, but cannot become an unbounded paid-search endpoint.
    if coalesce((s->>'researchAttempts')::int,0)>=3 then return jsonb_build_object('claimed',false); end if;
    v_token:=gen_random_uuid()::text;
    s:=s||jsonb_build_object('researchStatus','pending','researchToken',v_token,'researchStartedAt',clock_timestamp(),'researchAttempts',coalesce((s->>'researchAttempts')::int,0)+1);
    update public.company_workspace set signup_state=s where company_workspace_id=p_workspace;
    return jsonb_build_object('claimed',true,'token',v_token,'domain',w.signup_domain);
  elsif p_action='research_finish' then
    if s->>'companyConfirmedAt' is not null or s->>'researchToken' is distinct from p_values->>'token' then return jsonb_build_object('applied',false); end if;
    s:=s||jsonb_build_object('researchStatus',case when p_values->'company' is null then 'failed' else 'ready' end);
    update public.company_data set source_payload=coalesce(source_payload,'{}')||jsonb_build_object('signupResearch',p_values->'company'),
      searched_at=case when p_values->'company' is not null then clock_timestamp() else searched_at end
      where company_workspace_id=p_workspace;
  elsif p_action='company' then
    if length(trim(coalesce(p_values->>'name','')))=0 or length(p_values->>'name')>160
      or length(trim(coalesce(p_values->>'description','')))=0 or length(p_values->>'description')>8000 then raise exception 'signup_invalid_company'; end if;
    v_url:=nullif(p_values->>'linkedinUrl','');
    if v_url is not null then
      perform pg_advisory_xact_lock(hashtextextended('signup-company-linkedin:'||rtrim(lower(v_url),'/'),0));
    end if;
    if v_url is not null and exists(select 1 from public.company_workspace other
      where other.company_workspace_id<>p_workspace and rtrim(lower(other.linkedin_url),'/')=rtrim(lower(v_url),'/')
      and exists(select 1 from public.company_user_workspace m where m.company_workspace_id=other.company_workspace_id)) then
      raise exception 'signup_company_exists';
    end if;
    select source_payload->'signupResearch' into r from public.company_data where company_workspace_id=p_workspace;
    update public.company_data set
      total_funding_raised=coalesce(total_funding_raised,nullif(r->>'totalFundingRaised','')),
      main_investors=coalesce(main_investors,nullif(r->>'mainInvestors','')),
      last_funding_stage=coalesce(last_funding_stage,nullif(r->>'lastFundingStage','')),
      last_funding_round_description=coalesce(last_funding_round_description,nullif(r->>'lastFundingRoundDescription','')),
      updated_at=clock_timestamp()
      where company_workspace_id=p_workspace;
    v_db:=w.company_db_id;
    if v_db is null and v_url is not null then
      select id into v_db from public.company_db where rtrim(lower(linkedin_url),'/')=rtrim(lower(v_url),'/') order by id limit 1;
    end if;
    if v_db is null then
      select id into v_db from public.company_db
        where lower(split_part(regexp_replace(coalesce(website_url,''),'^https?://(www\.)?','','i'),'/',1))=w.signup_domain
        order by id limit 1;
    end if;
    if v_db is null then
      insert into public.company_db(name,description,short_description,website_url,linkedin_url,location)
        values(p_values->>'name',p_values->>'description',p_values->>'description','https://'||w.signup_domain,v_url,r->>'location') returning id into v_db;
    end if;
    -- Never overwrite a shared company_db record from a new signup's edits.
    update public.company_workspace set company_name=p_values->>'name',company_description=p_values->>'description',
      linkedin_url=v_url,company_db_id=v_db,updated_at=clock_timestamp() where company_workspace_id=p_workspace;
    s:=s||jsonb_build_object('companyConfirmedAt',clock_timestamp());
  elsif p_action='plan' then
    if s->>'companyConfirmedAt' is null then raise exception 'signup_company_required'; end if;
    if p_values->>'plan' not in ('free','slot') or p_values->>'plan' is null then raise exception 'signup_invalid_plan'; end if;
    if p_values->>'plan'='slot' and not exists(select 1 from public.company_workspace_slots a
      where a.company_workspace_id=p_workspace and public.workspace_billing_slot_active_v1(a,clock_timestamp())) then
      raise exception 'signup_payment_pending';
    end if;
    if p_values->>'plan'='free' and exists(select 1 from public.company_workspace_slots a
      where a.company_workspace_id=p_workspace and public.workspace_billing_slot_active_v1(a,clock_timestamp())) then
      raise exception 'signup_paid_plan_active';
    end if;
    s:=s||jsonb_build_object('plan',p_values->>'plan','planSelectedAt',clock_timestamp());
  else raise exception 'signup_invalid_action'; end if;
  update public.company_workspace set signup_state=s where company_workspace_id=p_workspace;
  return jsonb_build_object('ok',true);
end; $function$;

CREATE OR REPLACE FUNCTION public.workspace_billing_summary_v2(p_workspace uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_workspace public.company_workspace%rowtype; v_now timestamptz; v_count int; v_roles int; v_balance int; v_free uuid; v_free_end timestamptz; v_slots jsonb; v_credit_slots jsonb:='[]'::jsonb; v_role uuid; v_role_name text;
begin
  perform public.workspace_billing_reconcile_v1(p_workspace);
  v_now:=clock_timestamp();
  select * into strict v_workspace from public.company_workspace where company_workspace_id=p_workspace;
  select count(*) into v_count from public.company_workspace_slots a where a.company_workspace_id=p_workspace and public.workspace_billing_slot_active_v1(a,v_now);
  select count(*) into v_roles from public.company_roles r where r.company_workspace_id=p_workspace and r.source_type='internal'
    and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>v_now);
  if v_workspace.billing_started_at is not null and v_workspace.billing_model='standard' then
    if v_count=0 then
      v_free:=public.workspace_billing_free_period_v1(p_workspace,v_now);
      select remaining,ends_at into v_balance,v_free_end from public.company_workspace_credit_periods where id=v_free;
    else
      select coalesce(sum(p.remaining),0) into v_balance from public.company_workspace_credit_periods p
        join public.company_workspace_slots a on a.id=p.slot_id where p.company_workspace_id=p_workspace
        and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now and public.workspace_billing_slot_active_v1(a,v_now);
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'label','Slot '||a.ordinal,'roleId',a.assigned_role_id,'roleName',r.name,
    'status',a.status,'startedAt',a.started_at,'periodEnd',a.current_period_end,'billingInterval',a.billing_interval,'creditsRenewAt',(select min(p.ends_at) from public.company_workspace_credit_periods p where p.slot_id=a.id and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now),'cancelAt',a.cancel_at,'endedAt',a.ended_at,
    'active',public.workspace_billing_slot_active_v1(a.base,v_now),'revision',a.revision,
    'remaining',coalesce((select sum(p.remaining) from public.company_workspace_credit_periods p where p.slot_id=a.id and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now),0)
  ) order by a.started_at,a.id),'[]'::jsonb) into v_slots from (
    select a.*,a as base,row_number() over(order by a.started_at,a.id) ordinal from public.company_workspace_slots a where a.company_workspace_id=p_workspace
  ) a left join public.company_roles r on r.role_id=a.assigned_role_id;
  if v_workspace.billing_started_at is not null and v_workspace.billing_model='standard' then
    if v_count=0 then
      select r.role_id,r.name into v_role,v_role_name from public.company_roles r
        where r.company_workspace_id=p_workspace and r.source_type='internal'
          and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false)
          and (r.expires_at is null or r.expires_at>v_now) order by r.created_at,r.role_id limit 1;
      v_credit_slots:=jsonb_build_array(jsonb_build_object('id','free','slotId',null,'label','Free',
        'roleId',v_role,'roleName',v_role_name,'remaining',v_balance,'allowance',5,'renewsAt',v_free_end,'cancelAt',null));
    else
      select coalesce(jsonb_agg(jsonb_build_object('id',a->'id','slotId',a->'id','label',a->'label',
        'roleId',a->'roleId','roleName',a->'roleName','remaining',a->'remaining','allowance',50,
        'renewsAt',a->'creditsRenewAt','cancelAt',a->'cancelAt') order by ordinal),'[]'::jsonb)
        into v_credit_slots from jsonb_array_elements(v_slots) with ordinality as slots(a,ordinal)
        where (a->>'active')::boolean;
    end if;
  end if;
  -- balance is retained for compatibility with older diagnostic clients only.
  -- No debit or product surface may use it as a spendable workspace balance.
  return jsonb_build_object('workspaceId',p_workspace,'model',case when v_workspace.billing_started_at is null then 'legacy' when v_workspace.billing_model='scale' then 'scale' when v_count=0 then 'free' else 'slot' end,
    'activeRoles',v_roles,'capacity',case when v_workspace.billing_started_at is null or v_workspace.billing_model='scale' then null else greatest(1,v_count) end,
    'creditSlots',v_credit_slots,'balance',v_balance,'freeRenewsAt',v_free_end,'slots',v_slots,'hasCustomer',v_workspace.stripe_customer_id is not null);
end; $function$;

-- Previous app compatibility; all mutations delegate to the Slot implementation.
create or replace function public.workspace_billing_sync_agent_v1(p_workspace uuid,p_subscription text,p_expected_revision bigint,p_snapshot jsonb,p_periods jsonb default '[]')
returns boolean language sql security definer set search_path='' as $$
 select public.workspace_billing_sync_slot_v1(p_workspace,p_subscription,p_expected_revision,p_snapshot,p_periods);
$$;
create or replace function public.workspace_billing_assign_v1(p_workspace uuid,p_agent uuid,p_role uuid,p_revision bigint)
returns void language sql security definer set search_path='' as $$
 select public.workspace_billing_assign_slot_v1(p_workspace,p_agent,p_role,p_revision);
$$;
create or replace function public.workspace_billing_agent_active_v1(p_agent public.company_workspace_slots,p_at timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
 select public.workspace_billing_slot_active_v1(p_agent,p_at);
$$;
create function public.workspace_billing_agent_active_v1(p_agent public.company_workspace_agents,p_at timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select public.workspace_billing_slot_active_v1(s,p_at) from public.company_workspace_slots s where s.id=p_agent.id),false);
$$;
create or replace function public.workspace_billing_summary_v1(p_workspace uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; credits jsonb;
begin
 s:=public.workspace_billing_summary_v2(p_workspace);
 select coalesce(jsonb_agg((c-'slotId')||jsonb_build_object('agentId',c->'slotId') order by n),'[]'::jsonb)
 into credits from jsonb_array_elements(s->'creditSlots') with ordinality as rows(c,n);
 return (s-'slots')||jsonb_build_object('model',case when s->>'model'='slot' then 'agent' else s->>'model' end,
   'agents',s->'slots','creditSlots',credits);
end $$;

revoke all on function public.workspace_billing_slot_active_v1(public.company_workspace_slots,timestamptz),
 public.workspace_billing_sync_slot_v1(uuid,text,bigint,jsonb,jsonb),
 public.workspace_billing_assign_slot_v1(uuid,uuid,uuid,bigint),
 public.workspace_billing_summary_v2(uuid),
 public.workspace_billing_agent_active_v1(public.company_workspace_agents,timestamptz)
from public,anon,authenticated;
grant execute on function public.workspace_billing_slot_active_v1(public.company_workspace_slots,timestamptz),
 public.workspace_billing_sync_slot_v1(uuid,text,bigint,jsonb,jsonb),
 public.workspace_billing_assign_slot_v1(uuid,uuid,uuid,bigint),
 public.workspace_billing_summary_v2(uuid),
 public.workspace_billing_agent_active_v1(public.company_workspace_agents,timestamptz)
to service_role;

update public.company_workspace set signup_state=jsonb_set(signup_state,'{plan}','"slot"'::jsonb)
 where signup_state->>'plan'='agent';
notify pgrst,'reload schema';
commit;
