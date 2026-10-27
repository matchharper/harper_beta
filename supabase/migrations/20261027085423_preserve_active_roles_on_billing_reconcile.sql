-- Preserve existing active Roles; enforce capacity only on activation/reactivation.
-- No Role backfill, entitlement snapshot, or change to Intro balances.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create or replace function public.workspace_billing_role_guard_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_workspace public.company_workspace%rowtype; v_free int; v_unused int; v_now timestamptz;
begin
  if new.source_type<>'internal' or lower(new.status) not in ('active','open','top_priority') or coalesce(new.is_expired,false) or (new.expires_at is not null and new.expires_at<=clock_timestamp()) then return new; end if;
  -- Capacity applies only when entering the active set. Existing active Roles
  -- may be saved or change active status without losing their existing access.
  if TG_OP='UPDATE' and old.company_workspace_id=new.company_workspace_id
    and old.source_type='internal' and lower(old.status) in ('active','open','top_priority')
    and not coalesce(old.is_expired,false) and (old.expires_at is null or old.expires_at>clock_timestamp()) then
    return new;
  end if;
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
declare v_workspace public.company_workspace%rowtype; v_slot uuid; v_role record; v_recover_expired boolean; v_unassigned int;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  select * into v_workspace from public.company_workspace where company_workspace_id=p_workspace;
  if v_workspace.billing_started_at is null then return; end if;
  -- Slot expiry can release or recover an assignment, but never pauses an
  -- already-active Role. Multiple unassigned Roles retain the purchase choice.
  select exists(select 1 from public.company_workspace_slots a
    where a.company_workspace_id=p_workspace and a.assigned_role_id is not null
      and not public.workspace_billing_slot_active_v1(a,p_at)) into v_recover_expired;
  update public.company_workspace_slots a set assigned_role_id=null,revision=revision+1
    where a.company_workspace_id=p_workspace and a.assigned_role_id is not null and
      (v_workspace.billing_model='scale' or not public.workspace_billing_slot_active_v1(a,p_at) or not exists(
        select 1 from public.company_roles r where r.role_id=a.assigned_role_id and r.company_workspace_id=p_workspace
          and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>p_at)));
  if v_workspace.billing_model='scale' then return; end if;
  select count(*) into v_unassigned from public.company_roles r
    where r.company_workspace_id=p_workspace and r.source_type='internal'
      and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>p_at)
      and not exists(select 1 from public.company_internal_roles i where i.role_id=r.role_id and i.is_harper_tailored_role)
      and not exists(select 1 from public.company_workspace_slots a where a.assigned_role_id=r.role_id);
  for v_role in select r.role_id from public.company_roles r
    where r.company_workspace_id=p_workspace and r.source_type='internal'
      and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>p_at)
      and not exists(select 1 from public.company_internal_roles i where i.role_id=r.role_id and i.is_harper_tailored_role)
    order by r.created_at,r.role_id
  loop
    if exists(select 1 from public.company_workspace_slots a where a.assigned_role_id=v_role.role_id) then continue; end if;
    if not v_recover_expired and v_unassigned>1 then
      continue;
    end if;
    select a.id into v_slot from public.company_workspace_slots a
      where a.company_workspace_id=p_workspace and a.assigned_role_id is null and public.workspace_billing_slot_active_v1(a,p_at)
      order by (a.cancel_at is not null),a.cancel_at desc nulls first,a.started_at,a.id limit 1;
    if v_slot is not null then
      update public.company_workspace_slots set assigned_role_id=v_role.role_id,revision=revision+1 where id=v_slot;
    end if;
  end loop;
end $$;

create or replace function public.workspace_billing_assign_slot_v1(p_workspace uuid,p_slot uuid,p_role uuid,p_revision bigint)
returns void language plpgsql security definer set search_path='' as $$
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
  -- Reassigning a slot does not activate a Role. Preserve existing active Roles.

end $$;

revoke all on function public.workspace_billing_role_guard_v1(),public.workspace_billing_reconcile_at_v1(uuid,timestamptz),public.workspace_billing_assign_slot_v1(uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.workspace_billing_reconcile_at_v1(uuid,timestamptz),public.workspace_billing_assign_slot_v1(uuid,uuid,uuid,bigint) to service_role;
commit;
