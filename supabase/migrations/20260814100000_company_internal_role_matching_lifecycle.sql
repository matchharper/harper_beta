begin;

alter table public.company_internal_roles
  add column if not exists role_status_changed_at timestamptz
    default timezone('utc', now()),
  add column if not exists last_long_inactive_reactivated_at timestamptz,
  add column if not exists last_auto_enabled_at timestamptz;

comment on column public.company_internal_roles.role_status_changed_at is
  'When the current company_roles.status value began. Stored on the internal-role extension so this workflow adds no company_roles column.';
comment on column public.company_internal_roles.last_long_inactive_reactivated_at is
  'Latest transition from paused or ended to active or top_priority after at least 72 continuous hours inactive.';
comment on column public.company_internal_roles.last_auto_enabled_at is
  'Latest explicit company_internal_roles.is_auto false-to-true transition. Initial default true is not treated as this event.';

create or replace function public.sync_company_internal_role_matching_status_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := timezone('utc', now());
begin
  update public.company_internal_roles internal_role
  set
    last_long_inactive_reactivated_at = case
      when lower(btrim(coalesce(old.status, ''))) in ('paused', 'ended')
       and lower(btrim(coalesce(new.status, ''))) in ('active', 'top_priority')
       and internal_role.role_status_changed_at is not null
       and internal_role.role_status_changed_at <= v_now - interval '72 hours'
        then v_now
      else internal_role.last_long_inactive_reactivated_at
    end,
    role_status_changed_at = v_now
  where internal_role.role_id = new.role_id;
  return new;
end;
$$;

drop trigger if exists company_roles_sync_internal_matching_status_v1
  on public.company_roles;
create trigger company_roles_sync_internal_matching_status_v1
after update of status on public.company_roles
for each row
when (old.status is distinct from new.status)
execute function public.sync_company_internal_role_matching_status_v1();

create or replace function public.touch_company_internal_role_auto_enabled_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.is_auto is distinct from new.is_auto and new.is_auto = true then
    new.last_auto_enabled_at := timezone('utc', now());
  end if;
  return new;
end;
$$;

drop trigger if exists company_internal_roles_touch_auto_enabled_v1
  on public.company_internal_roles;
create trigger company_internal_roles_touch_auto_enabled_v1
before update of is_auto on public.company_internal_roles
for each row
when (old.is_auto is distinct from new.is_auto)
execute function public.touch_company_internal_role_auto_enabled_v1();

commit;
