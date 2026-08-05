-- Install the final legacy-write guard in rollout-safe mode. The rolling
-- legacy -> internal bridge remains active until operators enable the custom
-- database setting after every old application instance has drained:
--
--   alter database <database_name>
--     set harper.company_role_request_guard_enabled = 'on';
--
-- Keeping activation operational (rather than unconditional at migration
-- apply time) prevents a migration-first rolling deploy from breaking the old
-- writer before the new RPC-based application is live.

begin;

create or replace function public.guard_internal_company_role_legacy_request_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.request is not distinct from old.request then
    return new;
  end if;

  if lower(btrim(coalesce(new.source_type, ''))) <> 'internal'
     and lower(btrim(coalesce(old.source_type, ''))) <> 'internal'
     and not exists (
       select 1 from public.company_internal_roles internal_role
       where internal_role.role_id = new.role_id
     ) then
    return new;
  end if;

  if current_setting('harper.company_role_request_sync', true) = 'canonical' then
    return new;
  end if;

  if lower(coalesce(
       current_setting('harper.company_role_request_guard_enabled', true),
       'off'
     )) in ('on', 'true', '1') then
    raise exception using
      errcode = '55000',
      message = 'direct writes to company_roles.request are disabled for internal roles',
      hint = 'Write company_internal_roles.request through apply_company_data_changes_v1; the legacy value is mirrored in the same transaction.';
  end if;

  return new;
end;
$$;

drop trigger if exists company_roles_guard_internal_legacy_request
  on public.company_roles;
create trigger company_roles_guard_internal_legacy_request
before update of request
on public.company_roles
for each row
execute function public.guard_internal_company_role_legacy_request_v1();

revoke all on function public.guard_internal_company_role_legacy_request_v1()
  from public, anon, authenticated;

comment on function public.guard_internal_company_role_legacy_request_v1() is
  'Rejects internal company_roles.request direct writes after the rollout guard setting is enabled; canonical RPC mirror writes are always allowed.';

commit;
