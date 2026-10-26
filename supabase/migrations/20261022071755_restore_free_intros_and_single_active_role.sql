-- Restore profile visibility and ten shared monthly Intros; allow one active Free Role.
-- Restore the database policy independently of the pending web/Worker changes.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

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


-- Slot assignments and Free activation use the same existing workspace lock.
-- Drafts do not consume capacity. Legacy, Enterprise and tailored contracts keep
-- their existing entitlements. No new table or scenario/status CHECK is needed.
create or replace function public.workspace_billing_role_guard_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_workspace public.company_workspace%rowtype; v_free int; v_unused int; v_now timestamptz;
begin
  if new.source_type<>'internal' or lower(new.status) not in ('active','open','top_priority') or coalesce(new.is_expired,false) or (new.expires_at is not null and new.expires_at<=clock_timestamp()) then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||new.company_workspace_id::text,0));
  v_now:=clock_timestamp();
  select * into v_workspace from public.company_workspace where company_workspace_id=new.company_workspace_id;
  if v_workspace.billing_started_at is null or v_workspace.billing_model='scale' then return new; end if;
  if exists(select 1 from public.company_internal_roles where role_id=new.role_id and is_harper_tailored_role)
    or exists(select 1 from public.company_workspace_slots a where a.company_workspace_id=new.company_workspace_id and a.assigned_role_id=new.role_id and public.workspace_billing_slot_active_v1(a,v_now)) then return new; end if;
  select count(*) into v_free from public.company_roles r
    where r.company_workspace_id=new.company_workspace_id and r.role_id<>new.role_id and r.source_type='internal'
      and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>v_now)
      and not exists(select 1 from public.company_internal_roles i where i.role_id=r.role_id and i.is_harper_tailored_role)
      and not exists(select 1 from public.company_workspace_slots a where a.assigned_role_id=r.role_id and public.workspace_billing_slot_active_v1(a,v_now));
  select count(*) into v_unused from public.company_workspace_slots a
    where a.company_workspace_id=new.company_workspace_id and a.assigned_role_id is null and public.workspace_billing_slot_active_v1(a,v_now);
  if v_free>=1+v_unused then raise exception 'workspace_role_capacity_exceeded'; end if;
  return new;
end $$;

create or replace function public.workspace_billing_reconcile_at_v1(p_workspace uuid,p_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare v_workspace public.company_workspace%rowtype; v_slot uuid; v_role record; v_kept_free boolean:=false;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  select * into v_workspace from public.company_workspace where company_workspace_id=p_workspace;
  if v_workspace.billing_started_at is null then return; end if;
  update public.company_workspace_slots a set assigned_role_id=null,revision=revision+1
    where a.company_workspace_id=p_workspace and a.assigned_role_id is not null and
      (v_workspace.billing_model='scale' or not public.workspace_billing_slot_active_v1(a,p_at) or not exists(
        select 1 from public.company_roles r where r.role_id=a.assigned_role_id and r.company_workspace_id=p_workspace
          and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>p_at)));
  if v_workspace.billing_model='scale' then return; end if;
  for v_role in select r.role_id from public.company_roles r
    where r.company_workspace_id=p_workspace and r.source_type='internal'
      and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>p_at)
      and not exists(select 1 from public.company_internal_roles i where i.role_id=r.role_id and i.is_harper_tailored_role)
    order by r.created_at,r.role_id
  loop
    if exists(select 1 from public.company_workspace_slots a where a.assigned_role_id=v_role.role_id) then continue; end if;
    select a.id into v_slot from public.company_workspace_slots a
      where a.company_workspace_id=p_workspace and a.assigned_role_id is null and public.workspace_billing_slot_active_v1(a,p_at)
      order by (a.cancel_at is not null),a.cancel_at desc nulls first,a.started_at,a.id limit 1;
    if v_slot is not null then
      update public.company_workspace_slots set assigned_role_id=v_role.role_id,revision=revision+1 where id=v_slot;
    elsif not v_kept_free then
      v_kept_free:=true;
    else
      -- Keep the oldest eligible Free Role; pause surplus Roles without deleting
      -- recommendations, candidates, Intro commitments or progress history.
      update public.company_roles set status='paused',updated_at=clock_timestamp() where role_id=v_role.role_id;
    end if;
  end loop;
end $$;


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
  -- Moving a slot to a contract Role must not leave two ordinary Free Roles.
  if exists(select 1 from public.company_workspace where company_workspace_id=p_workspace and billing_started_at is not null and billing_model='standard') and
    (select count(*) from public.company_roles r where r.company_workspace_id=p_workspace and r.source_type='internal'
      and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>clock_timestamp())
      and not exists(select 1 from public.company_internal_roles i where i.role_id=r.role_id and i.is_harper_tailored_role)
      and not exists(select 1 from public.company_workspace_slots a where a.assigned_role_id=r.role_id and public.workspace_billing_slot_active_v1(a,clock_timestamp())))>1 then
    raise exception 'workspace_role_capacity_exceeded';
  end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.workspace_billing_debit_v1(p_workspace uuid, p_action text, p_key text, p_role uuid, p_talent uuid, p_actor uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_complete boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_workspace public.company_workspace%rowtype; v_event public.company_workspace_credit_events%rowtype; v_now timestamptz; v_period uuid; v_slot uuid; v_paid_access boolean; v_delta int:=0; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  if p_action not in ('intro_request','connect') or p_action is null then raise exception 'billing_action_invalid'; end if;
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
    v_paid_access:=public.role_matching_slot_type_v1(p_role,v_now)='paid';
    -- A shared allowance never grants paid-only connection access.
    if p_action='connect' and not v_paid_access then raise exception 'workspace_feature_unavailable'; end if;
    if not exists(select 1 from public.company_roles r where r.role_id=p_role
      and r.source_type='internal' and lower(r.status) in ('active','open','top_priority')
      and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>v_now)) then
      raise exception 'workspace_role_slot_required';
    end if;
    -- Preserve existing no-slot contract access. Ordinary Free Roles use the
    -- shared allowance; assigned Roles prefer their own paid credits first.
    if v_slot is not null or not v_paid_access then
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
    'activeRoles',v_roles,'capacity',case when v_workspace.billing_started_at is not null and v_workspace.billing_model='standard' then v_count+1+(select count(*) from public.company_roles r join public.company_internal_roles i using(role_id) where r.company_workspace_id=p_workspace and i.is_harper_tailored_role and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>v_now) and not exists(select 1 from public.company_workspace_slots a where a.assigned_role_id=r.role_id and public.workspace_billing_slot_active_v1(a,v_now))) else null end,
    'creditSlots',v_credit_slots,'balance',v_balance,'freeRenewsAt',v_free_end,'slots',v_slots,'hasCustomer',v_workspace.stripe_customer_id is not null);
end; $function$;


-- Historical opening receipts remain audit facts only. They no longer grant or
-- restrict profile reads, and opening a profile never spends an Intro.
drop function if exists public.workspace_open_candidate_v1(uuid,uuid,uuid,uuid);
drop function if exists public.workspace_candidate_access_v1(uuid);
alter table if exists public.company_first_slack_outbox drop column if exists profile_access;

-- Restore current shared balances from actual Intro/connection debits. Do not
-- retroactively bill zero-cost actions from the retired views policy. Paid pools
-- and historical event receipts are unchanged.
do $$ declare w record; v_now timestamptz; begin
  -- Only enrolled standard workspaces use the Free allowance/capacity contract.
  -- Do not lock every imported workspace or modify separate contract balances.
  for w in select company_workspace_id from public.company_workspace
    where billing_started_at is not null and billing_model='standard'
    order by company_workspace_id loop
    perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||w.company_workspace_id::text,0));
    v_now:=clock_timestamp();
    update public.company_workspace_credit_periods p
      set allowance=10,remaining=greatest(0,10+coalesce((select sum(e.delta) from public.company_workspace_credit_events e
        where e.period_id=p.id and e.action_code in ('intro_request','connect')),0))
      where p.company_workspace_id=w.company_workspace_id and p.slot_id is null and p.starts_at<=v_now and p.ends_at>v_now;
    -- Enforce this policy now; do not replay it at old subscription boundaries.
    perform public.workspace_billing_reconcile_at_v1(w.company_workspace_id,v_now);
    update public.company_workspace set billing_reconciled_at=v_now where company_workspace_id=w.company_workspace_id;
  end loop;
end $$;

revoke all on function public.workspace_billing_free_period_v1(uuid,timestamptz),public.workspace_billing_debit_v1(uuid,text,text,uuid,uuid,uuid,jsonb,boolean),public.workspace_billing_summary_v2(uuid),public.workspace_billing_reconcile_at_v1(uuid,timestamptz),public.workspace_billing_assign_slot_v1(uuid,uuid,uuid,bigint),public.workspace_billing_role_guard_v1() from public,anon,authenticated;
grant execute on function public.workspace_billing_free_period_v1(uuid,timestamptz),public.workspace_billing_debit_v1(uuid,text,text,uuid,uuid,uuid,jsonb,boolean),public.workspace_billing_summary_v2(uuid),public.workspace_billing_reconcile_at_v1(uuid,timestamptz),public.workspace_billing_assign_slot_v1(uuid,uuid,uuid,bigint) to service_role;
notify pgrst,'reload schema';
commit;
