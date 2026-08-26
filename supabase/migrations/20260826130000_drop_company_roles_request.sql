-- Remove the retired parent request store after preserving every canonical
-- internal-role request. This migration intentionally fails instead of
-- discarding ambiguous or out-of-scope legacy data.

begin;

set local lock_timeout = '5s';

-- Lock the parent first, matching the normal parent-child write order, and
-- prevent a legacy writer from racing the final reconciliation.
lock table public.company_roles in access exclusive mode;
lock table public.company_internal_roles in share row exclusive mode;

do $$
declare
  v_conflict_count integer;
  v_conflict_ids text;
  v_external_count integer;
  v_external_ids text;
begin
  select count(*), string_agg(role.role_id::text, ', ' order by role.role_id)
  into v_conflict_count, v_conflict_ids
  from public.company_roles role
  join public.company_internal_roles internal_role
    on internal_role.role_id = role.role_id
  where lower(btrim(coalesce(role.source_type, ''))) = 'internal'
    and nullif(btrim(role.request), '') is not null
    and nullif(btrim(internal_role.request), '') is not null
    and role.request is distinct from internal_role.request;

  if v_conflict_count > 0 then
    raise exception using
      errcode = '23514',
      message = format(
        'cannot drop company_roles.request: %s internal role request value(s) conflict with company_internal_roles.request (%s)',
        v_conflict_count,
        v_conflict_ids
      );
  end if;

  select count(*), string_agg(role.role_id::text, ', ' order by role.role_id)
  into v_external_count, v_external_ids
  from public.company_roles role
  where lower(btrim(coalesce(role.source_type, ''))) <> 'internal'
    and nullif(btrim(role.request), '') is not null;

  if v_external_count > 0 then
    raise exception using
      errcode = '23514',
      message = format(
        'cannot drop company_roles.request: %s non-internal role request value(s) have no canonical destination (%s)',
        v_external_count,
        v_external_ids
      );
  end if;
end;
$$;

-- Create any missing internal extension row, then copy only parent-only values.
-- A populated child value is never overwritten.
insert into public.company_internal_roles(role_id, request)
select role.role_id, role.request
from public.company_roles role
where lower(btrim(coalesce(role.source_type, ''))) = 'internal'
  and not exists (
    select 1
    from public.company_internal_roles internal_role
    where internal_role.role_id = role.role_id
  );

update public.company_internal_roles internal_role
set
  request = role.request,
  updated_at = transaction_timestamp()
from public.company_roles role
where role.role_id = internal_role.role_id
  and lower(btrim(coalesce(role.source_type, ''))) = 'internal'
  and nullif(btrim(role.request), '') is not null
  and nullif(btrim(internal_role.request), '') is null;

do $$
declare
  v_unmigrated_count integer;
begin
  select count(*)
  into v_unmigrated_count
  from public.company_roles role
  left join public.company_internal_roles internal_role
    on internal_role.role_id = role.role_id
  where lower(btrim(coalesce(role.source_type, ''))) = 'internal'
    and nullif(btrim(role.request), '') is not null
    and (
      internal_role.role_id is null
      or internal_role.request is distinct from role.request
    );

  if v_unmigrated_count > 0 then
    raise exception using
      errcode = '23514',
      message = format(
        'cannot drop company_roles.request: %s internal request value(s) were not preserved',
        v_unmigrated_count
      );
  end if;

  if to_regprocedure(
       'public.build_company_role_search_tsv_v1(text,text,text,text,text,text[])'
     ) is null
     or to_regprocedure(
       'public.refresh_company_role_search_from_internal_request_v1()'
     ) is null
     or not exists (
       select 1
       from pg_trigger trigger_row
       where trigger_row.tgrelid = 'public.company_internal_roles'::regclass
         and trigger_row.tgname = 'company_internal_roles_refresh_role_search'
         and not trigger_row.tgisinternal
     )
     or not exists (
       select 1
       from pg_trigger trigger_row
       where trigger_row.tgrelid = 'public.company_internal_roles'::regclass
         and trigger_row.tgname = 'company_internal_roles_refresh_role_search_delete'
         and not trigger_row.tgisinternal
     )
     or not exists (
       select 1
       from pg_trigger trigger_row
       where trigger_row.tgrelid = 'public.company_roles'::regclass
         and trigger_row.tgname = 'company_roles_set_opportunity_search_tsv'
         and not trigger_row.tgisinternal
     ) then
    raise exception using
      errcode = '55000',
      message = 'cannot drop company_roles.request: canonical internal-request search refresh is not installed';
  end if;
end;
$$;

drop trigger if exists company_roles_legacy_request_to_internal
  on public.company_roles;
drop trigger if exists company_roles_guard_internal_legacy_request
  on public.company_roles;
drop function if exists public.sync_legacy_company_role_request_to_internal_v1();
drop function if exists public.guard_internal_company_role_legacy_request_v1();

-- Do not use CASCADE: an undiscovered reader must block the migration rather
-- than be silently removed with the column.
alter table public.company_roles drop column request;

commit;
