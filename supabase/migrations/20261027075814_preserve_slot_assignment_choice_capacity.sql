-- Preserve pending role choices while assigning a purchase with several slots.
-- The capacity boundary is one Free Role plus available paid slots, as on activation.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

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
  -- A contract Role must not consume capacity needed by ordinary Roles, but
  -- unassigned purchased slots still provide room for the remaining choices.
  if exists(select 1 from public.company_workspace where company_workspace_id=p_workspace and billing_started_at is not null and billing_model='standard') and
    (select count(*) from public.company_roles r where r.company_workspace_id=p_workspace and r.source_type='internal'
      and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>clock_timestamp())
      and not exists(select 1 from public.company_internal_roles i where i.role_id=r.role_id and i.is_harper_tailored_role)
      and not exists(select 1 from public.company_workspace_slots a where a.assigned_role_id=r.role_id and public.workspace_billing_slot_active_v1(a,clock_timestamp())))>
      1+(select count(*) from public.company_workspace_slots a where a.company_workspace_id=p_workspace
        and a.assigned_role_id is null and public.workspace_billing_slot_active_v1(a,clock_timestamp())) then
    raise exception 'workspace_role_capacity_exceeded';
  end if;
end $$;

revoke all on function public.workspace_billing_assign_slot_v1(uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.workspace_billing_assign_slot_v1(uuid,uuid,uuid,bigint) to service_role;
commit;
