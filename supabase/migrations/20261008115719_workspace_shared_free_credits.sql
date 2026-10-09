-- Unlimited Roles and an independent monthly workspace allowance.
-- Preserve existing period IDs, consumed credits, subscription terms and events.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

alter table public.company_workspace_credit_periods
  drop constraint workspace_credit_period_kind_check,
  drop constraint company_workspace_credit_periods_allowance_check;
alter table public.company_workspace_credit_periods
  add constraint company_workspace_credit_periods_allowance_check check (allowance in (5,10,50));
-- Historical five-credit periods remain valid. Existing monthly usage is retained
-- when the current period is first read after this migration (one-time +5).
alter table public.company_workspace_credit_periods add constraint workspace_credit_period_kind_check check (
  (slot_id is null and allowance in (5,10) and stripe_invoice_id is null)
  or (slot_id is not null and allowance=50)
);


CREATE OR REPLACE FUNCTION public.workspace_billing_free_period_v1(p_workspace uuid, p_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_anchor timestamp; v_local timestamp:=p_at at time zone 'Asia/Seoul'; v_n int; v_start timestamptz; v_end timestamptz; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  select coalesce(billing_free_anchor_at,billing_started_at,created_at) at time zone 'Asia/Seoul' into v_anchor
    from public.company_workspace where company_workspace_id=p_workspace;
  v_n:=(extract(year from v_local)::int-extract(year from v_anchor)::int)*12+extract(month from v_local)::int-extract(month from v_anchor)::int;
  if v_anchor+make_interval(months=>v_n)>v_local then v_n:=v_n-1; end if;
  v_start:=(v_anchor+make_interval(months=>v_n)) at time zone 'Asia/Seoul';
  v_end:=(v_anchor+make_interval(months=>v_n+1)) at time zone 'Asia/Seoul';
  insert into public.company_workspace_credit_periods(company_workspace_id,starts_at,ends_at,allowance,remaining)
    values(p_workspace,v_start,v_end,10,10) on conflict do nothing;
  select id into v_id from public.company_workspace_credit_periods where company_workspace_id=p_workspace and slot_id is null and starts_at=v_start;
  update public.company_workspace_credit_periods
    set remaining=remaining+(10-allowance),allowance=10
    where id=v_id and allowance<10;
  return v_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.workspace_billing_reconcile_at_v1(p_workspace uuid, p_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_model text; v_slot uuid; v_role record;
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
  for v_role in select r.role_id from public.company_roles r
    left join public.company_workspace_slots a on a.assigned_role_id=r.role_id
    where r.company_workspace_id=p_workspace and r.source_type='internal'
      and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false)
      and (r.expires_at is null or r.expires_at>p_at)
    order by (a.id is not null) desc,r.created_at,r.role_id
  loop
    if not exists(select 1 from public.company_workspace_slots where assigned_role_id=v_role.role_id) then
      select a.id into v_slot from public.company_workspace_slots a where a.company_workspace_id=p_workspace
        and a.assigned_role_id is null and public.workspace_billing_slot_active_v1(a,p_at)
        order by (a.cancel_at is not null),a.cancel_at desc nulls first,a.started_at,a.id limit 1;
      if v_slot is not null then update public.company_workspace_slots set assigned_role_id=v_role.role_id,revision=revision+1 where id=v_slot;
      end if;
    end if;
  end loop;
end; $function$;

CREATE OR REPLACE FUNCTION public.workspace_billing_role_guard_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_workspace public.company_workspace%rowtype;
begin
  if new.source_type<>'internal' or lower(new.status) not in ('active','open','top_priority') or coalesce(new.is_expired,false) or (new.expires_at is not null and new.expires_at<=clock_timestamp()) then return new; end if;
  select * into v_workspace from public.company_workspace where company_workspace_id=new.company_workspace_id;
  if v_workspace.billing_started_at is null or v_workspace.billing_model='scale' then return new; end if;
  perform public.workspace_billing_reconcile_v1(new.company_workspace_id);
  return new;
end; $function$;

create or replace function public.workspace_billing_enroll_v1(p_workspace uuid,p_model text,p_keep_role uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  if p_model not in ('standard','scale') then raise exception 'billing_model_invalid'; end if;
  if not exists(select 1 from public.company_workspace where company_workspace_id=p_workspace) then raise exception 'billing_workspace_not_found'; end if;
  if exists(select 1 from public.company_workspace_slots a where a.company_workspace_id=p_workspace and
      (public.workspace_billing_slot_active_v1(a,clock_timestamp()) or
        (a.source='stripe' and a.status not in ('canceled','incomplete_expired')))) then
    raise exception 'billing_active_subscription_conflict';
  end if;
  update public.company_workspace set billing_model=p_model,billing_started_at=coalesce(billing_started_at,clock_timestamp()),
    billing_free_anchor_at=coalesce(billing_free_anchor_at,clock_timestamp()) where company_workspace_id=p_workspace;
  perform public.workspace_billing_reconcile_v1(p_workspace);
end $$;

CREATE OR REPLACE FUNCTION public.workspace_billing_debit_v1(p_workspace uuid, p_action text, p_key text, p_role uuid, p_talent uuid, p_actor uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_complete boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_workspace public.company_workspace%rowtype; v_event public.company_workspace_credit_events%rowtype; v_now timestamptz; v_period uuid; v_slot uuid; v_delta int:=0; v_id uuid;
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
    select a.id into v_slot from public.company_workspace_slots a
      where a.company_workspace_id=p_workspace and a.assigned_role_id=p_role
        and public.workspace_billing_slot_active_v1(a,v_now) for update;
    -- A shared allowance never grants paid-only connection access.
    if p_action='connect' and v_slot is null then raise exception 'workspace_feature_unavailable'; end if;
    if not exists(select 1 from public.company_roles r where r.role_id=p_role
      and r.source_type='internal' and lower(r.status) in ('active','open','top_priority')
      and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>v_now)) then
      raise exception 'workspace_role_slot_required';
    end if;
    -- Prefer this Role's paid credits. Other paid slots are never spendable.
    select p.id into v_period from public.company_workspace_credit_periods p
      where p.company_workspace_id=p_workspace and p.slot_id=v_slot
        and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now and p.remaining>=1
      order by p.ends_at,p.starts_at,p.id limit 1 for update;
    if v_period is null then
      v_period:=public.workspace_billing_free_period_v1(p_workspace,v_now);
      if (select remaining from public.company_workspace_credit_periods where id=v_period)<1 then
        raise exception 'workspace_credits_exhausted';
      end if;
    end if;
    update public.company_workspace_credit_periods set remaining=remaining-1 where id=v_period;
    v_delta:=-1;
  end if;
  insert into public.company_workspace_credit_events(company_workspace_id,period_id,action_code,business_key,role_id,talent_id,actor_id,delta,action_payload,completed_at)
    values(p_workspace,v_period,p_action,p_key,p_role,p_talent,p_actor,v_delta,p_payload,case when p_complete then v_now end) returning id into v_id;
  return v_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.workspace_billing_summary_v2(p_workspace uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_workspace public.company_workspace%rowtype; v_now timestamptz; v_count int; v_roles int; v_balance int; v_free uuid; v_free_end timestamptz; v_slots jsonb; v_credit_slots jsonb:='[]'::jsonb;
begin
  perform public.workspace_billing_reconcile_v1(p_workspace);
  v_now:=clock_timestamp();
  select * into strict v_workspace from public.company_workspace where company_workspace_id=p_workspace;
  select count(*) into v_count from public.company_workspace_slots a where a.company_workspace_id=p_workspace and public.workspace_billing_slot_active_v1(a,v_now);
  select count(*) into v_roles from public.company_roles r where r.company_workspace_id=p_workspace and r.source_type='internal'
    and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>v_now);
  if v_workspace.billing_started_at is not null and v_workspace.billing_model='standard' then
    v_free:=public.workspace_billing_free_period_v1(p_workspace,v_now);
    select remaining,ends_at into v_balance,v_free_end from public.company_workspace_credit_periods where id=v_free;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'label','Slot '||a.ordinal,'roleId',a.assigned_role_id,'roleName',r.name,
    'source',a.source,'status',a.status,'startedAt',a.started_at,'periodEnd',a.current_period_end,'billingInterval',a.billing_interval,'creditsRenewAt',(select min(p.ends_at) from public.company_workspace_credit_periods p where p.slot_id=a.id and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now),'cancelAt',a.cancel_at,'endedAt',a.ended_at,
    'active',public.workspace_billing_slot_active_v1(a.base,v_now),'revision',a.revision,
    'remaining',coalesce((select sum(p.remaining) from public.company_workspace_credit_periods p where p.slot_id=a.id and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now),0)
  ) order by a.started_at,a.id),'[]'::jsonb) into v_slots from (
    select a.*,a as base,row_number() over(order by a.started_at,a.id) ordinal from public.company_workspace_slots a where a.company_workspace_id=p_workspace
  ) a left join public.company_roles r on r.role_id=a.assigned_role_id;
  if v_workspace.billing_started_at is not null and v_workspace.billing_model='standard' then
    select coalesce(jsonb_agg(jsonb_build_object('id',a->'id','slotId',a->'id','label',a->'label',
      'roleId',a->'roleId','roleName',a->'roleName','remaining',a->'remaining','allowance',50,
      'renewsAt',a->'creditsRenewAt','cancelAt',a->'cancelAt') order by ordinal),'[]'::jsonb)
      into v_credit_slots from jsonb_array_elements(v_slots) with ordinality as slots(a,ordinal)
      where (a->>'active')::boolean;
    v_credit_slots:=jsonb_build_array(jsonb_build_object('id','free','slotId',null,'label','Shared credits',
      'roleId',null,'roleName',null,'remaining',v_balance,'allowance',10,'renewsAt',v_free_end,'cancelAt',null))||v_credit_slots;
    select sum((s->>'remaining')::int) into v_balance from jsonb_array_elements(v_credit_slots) s;
  end if;
  -- balance is retained for compatibility with older diagnostic clients only.
  -- No debit or product surface may use it as a spendable workspace balance.
  return jsonb_build_object('workspaceId',p_workspace,'model',case when v_workspace.billing_started_at is null then 'legacy' when v_workspace.billing_model='scale' then 'scale' when v_count=0 then 'free' else 'slot' end,
    'activeRoles',v_roles,'capacity',null,
    'creditSlots',v_credit_slots,'balance',v_balance,'freeRenewsAt',v_free_end,'slots',v_slots,'hasCustomer',v_workspace.stripe_customer_id is not null);
end; $function$;

create or replace function public.role_matching_slot_type_v1(p_role_id uuid, p_at timestamptz default now())
returns text language sql stable security invoker set search_path = '' as $$
  select coalesce((
    select case
      when internal_role.is_harper_tailored_role or workspace.billing_started_at is null
        or workspace.billing_model = 'scale' then 'paid'
      when exists (select 1 from public.company_workspace_slots slot
        where slot.company_workspace_id = role.company_workspace_id
          and slot.assigned_role_id = role.role_id
          and public.workspace_billing_slot_active_v1(slot,p_at)) then 'paid'
      else 'free'
    end
    from public.company_roles role
    join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
    join public.company_workspace workspace on workspace.company_workspace_id = role.company_workspace_id
    where role.role_id = p_role_id
  ),'unavailable');
$$;
revoke all on function public.role_matching_slot_type_v1(uuid,timestamptz) from public,anon;
grant execute on function public.role_matching_slot_type_v1(uuid,timestamptz) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
