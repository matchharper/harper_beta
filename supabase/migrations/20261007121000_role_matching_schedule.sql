begin;
alter table public.company_first_search_runs add column if not exists role_id uuid
  references public.company_roles(role_id) on delete cascade;
drop index if exists public.company_first_search_runs_slot_unique_idx;
create unique index company_first_search_runs_legacy_slot_unique_idx
  on public.company_first_search_runs(company_workspace_id, scheduled_slot, contract_version)
  where role_id is null;
create unique index company_first_search_runs_role_slot_unique_idx
  on public.company_first_search_runs(role_id, scheduled_slot, contract_version, trigger_reason)
  where role_id is not null;
create unique index company_first_search_runs_role_activation_unique_idx
  on public.company_first_search_runs(role_id, contract_version)
  where trigger_reason = 'role_activated';

create or replace function public.enqueue_activated_role_matching_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role public.company_roles; v_internal public.company_internal_roles;
begin
  select * into v_role from public.company_roles where role_id = new.role_id;
  select * into v_internal from public.company_internal_roles where role_id = new.role_id;
  if v_internal.role_id is null or v_internal.is_harper_tailored_role
     or lower(coalesce(v_role.source_type,'')) <> 'internal'
     or lower(coalesce(v_role.status,'')) <> 'active'
     or coalesce(v_role.is_expired,false)
     or (v_role.expires_at is not null and v_role.expires_at <= now())
     or coalesce(lower(btrim(v_role.information->>'testOnly')),'') in ('true','1','yes','on') then
    return new;
  end if;
  insert into public.company_first_search_runs (
    company_workspace_id, role_id, scheduled_slot, trigger_reason, contract_version,
    status, available_at, scheduled_role_ids
  ) values (v_role.company_workspace_id,v_role.role_id,now(),'role_activated',
            'unified_role_matching_v4','queued',now(),array[v_role.role_id])
  on conflict do nothing;
  return new;
end $$;
revoke all on function public.enqueue_activated_role_matching_v1() from public,anon,authenticated;
create trigger enqueue_activated_role_matching
  after insert or update of status on public.company_roles
  for each row execute function public.enqueue_activated_role_matching_v1();
create trigger enqueue_internal_role_matching
  after insert on public.company_internal_roles
  for each row execute function public.enqueue_activated_role_matching_v1();
comment on column public.company_first_search_runs.role_id is
  'One role per unified scheduled/activation run. Legacy company-scoped rows retain null.';
commit;
