-- Automatically assign a lone Free Role; ask when multiple Roles can use a slot.
-- No backfill: existing paid assignments and credits stay intact.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create or replace function public.workspace_billing_reconcile_at_v1(p_workspace uuid,p_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare v_workspace public.company_workspace%rowtype; v_slot uuid; v_role record; v_kept_free boolean:=false; v_recover_expired boolean; v_unassigned int; v_unused int; v_pending int:=0;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  select * into v_workspace from public.company_workspace where company_workspace_id=p_workspace;
  if v_workspace.billing_started_at is null then return; end if;
  -- Expiry still recovers active Roles onto spare slots before applying the
  -- one-Free-Role limit. With multiple eligible Roles, ordinary reads leave
  -- the choice open within the existing capacity (one Free + available slots).
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
  select count(*) into v_unused from public.company_workspace_slots a
    where a.company_workspace_id=p_workspace and a.assigned_role_id is null and public.workspace_billing_slot_active_v1(a,p_at);
  for v_role in select r.role_id from public.company_roles r
    where r.company_workspace_id=p_workspace and r.source_type='internal'
      and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>p_at)
      and not exists(select 1 from public.company_internal_roles i where i.role_id=r.role_id and i.is_harper_tailored_role)
    order by r.created_at,r.role_id
  loop
    if exists(select 1 from public.company_workspace_slots a where a.assigned_role_id=v_role.role_id) then continue; end if;
    if not v_recover_expired and v_unassigned>1 then
      v_pending:=v_pending+1;
      if v_pending>1+v_unused then
        update public.company_roles set status='paused',updated_at=clock_timestamp() where role_id=v_role.role_id;
      end if;
      continue;
    end if;
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

-- A normal save of an already-active Free Role must not bypass the chooser.
-- Only a real activation (or reactivation) consumes a vacant slot automatically.
create or replace function public.workspace_billing_role_assignment_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_slot uuid;
begin
  if new.source_type<>'internal' then return new; end if;
  if not exists(select 1 from public.company_workspace where company_workspace_id=new.company_workspace_id and billing_started_at is not null) then return new; end if;
  if lower(new.status) not in ('active','open','top_priority') or coalesce(new.is_expired,false) or (new.expires_at is not null and new.expires_at<=clock_timestamp()) then
    update public.company_workspace_slots set assigned_role_id=null,revision=revision+1 where assigned_role_id=new.role_id;
  elsif TG_OP='UPDATE' and lower(old.status) in ('active','open','top_priority') and not coalesce(old.is_expired,false)
    and (old.expires_at is null or old.expires_at>clock_timestamp()) then
    return new;
  elsif not exists(select 1 from public.company_workspace_slots where assigned_role_id=new.role_id)
    and exists(select 1 from public.company_workspace where company_workspace_id=new.company_workspace_id and billing_started_at is not null and billing_model='standard') then
    select id into v_slot from public.company_workspace_slots a where a.company_workspace_id=new.company_workspace_id and a.assigned_role_id is null
      and public.workspace_billing_slot_active_v1(a,clock_timestamp()) order by (a.cancel_at is not null),a.cancel_at desc nulls first,a.started_at,a.id limit 1;
    if v_slot is not null then update public.company_workspace_slots set assigned_role_id=new.role_id,revision=revision+1 where id=v_slot; end if;
  end if;
  return new;
end $$;

revoke all on function public.workspace_billing_reconcile_at_v1(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.workspace_billing_reconcile_at_v1(uuid,timestamptz) to service_role;
revoke all on function public.workspace_billing_role_assignment_v1() from public,anon,authenticated;
grant execute on function public.workspace_billing_role_assignment_v1() to service_role;
commit;
