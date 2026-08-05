-- Make company_internal_roles.request the canonical request for internal roles
-- while keeping company_roles.request current for legacy readers and rolling
-- deploys. The final direct-write guard is installed separately after old app
-- instances have drained.

begin;

alter table public.company_internal_roles
  add column if not exists request text;

lock table public.company_roles in share row exclusive mode;
lock table public.company_internal_roles in share row exclusive mode;

do $$
declare
  v_legacy_only_count bigint;
  v_legacy_only_ids text;
  v_internal_only_count bigint;
  v_internal_only_ids text;
  v_conflict_count bigint;
  v_conflict_ids text;
  v_external_count bigint;
  v_external_extension_count bigint;
  v_external_extension_ids text;
  v_oversized_count bigint;
  v_max_length bigint;
begin
  with candidates as (
    select role.role_id
    from public.company_roles role
    left join public.company_internal_roles internal_role
      on internal_role.role_id = role.role_id
    where (
        lower(btrim(coalesce(role.source_type, ''))) = 'internal'
        or internal_role.role_id is not null
      )
      and nullif(btrim(role.request), '') is not null
      and nullif(btrim(internal_role.request), '') is null
  )
  select
    count(*),
    (
      select string_agg(sample.role_id::text, ', ' order by sample.role_id)
      from (
        select role_id from candidates order by role_id limit 20
      ) sample
    )
  into v_legacy_only_count, v_legacy_only_ids
  from candidates;

  with candidates as (
    select role.role_id
    from public.company_roles role
    join public.company_internal_roles internal_role
      on internal_role.role_id = role.role_id
    where nullif(btrim(role.request), '') is null
      and nullif(btrim(internal_role.request), '') is not null
  )
  select
    count(*),
    (
      select string_agg(sample.role_id::text, ', ' order by sample.role_id)
      from (
        select role_id from candidates order by role_id limit 20
      ) sample
    )
  into v_internal_only_count, v_internal_only_ids
  from candidates;

  with candidates as (
    select role.role_id
    from public.company_roles role
    join public.company_internal_roles internal_role
      on internal_role.role_id = role.role_id
    where nullif(btrim(role.request), '') is not null
      and nullif(btrim(internal_role.request), '') is not null
      and role.request is distinct from internal_role.request
  )
  select
    count(*),
    (
      select string_agg(sample.role_id::text, ', ' order by sample.role_id)
      from (
        select role_id from candidates order by role_id limit 20
      ) sample
    )
  into v_conflict_count, v_conflict_ids
  from candidates;

  select count(*)
  into v_external_count
  from public.company_roles role
  left join public.company_internal_roles internal_role
    on internal_role.role_id = role.role_id
  where lower(btrim(coalesce(role.source_type, ''))) <> 'internal'
    and (
      nullif(btrim(role.request), '') is not null
      or nullif(btrim(internal_role.request), '') is not null
    );

  with candidates as (
    select role.role_id
    from public.company_roles role
    join public.company_internal_roles internal_role
      on internal_role.role_id = role.role_id
    where lower(btrim(coalesce(role.source_type, ''))) <> 'internal'
  )
  select
    count(*),
    (
      select string_agg(sample.role_id::text, ', ' order by sample.role_id)
      from (
        select role_id from candidates order by role_id limit 20
      ) sample
    )
  into v_external_extension_count, v_external_extension_ids
  from candidates;

  select
    count(*) filter (where candidate.request_length > 20000),
    coalesce(max(candidate.request_length), 0)
  into v_oversized_count, v_max_length
  from (
    select greatest(
      coalesce(char_length(role.request), 0),
      coalesce(char_length(internal_role.request), 0)
    )::bigint as request_length
    from public.company_roles role
    left join public.company_internal_roles internal_role
      on internal_role.role_id = role.role_id
    where
      lower(btrim(coalesce(role.source_type, ''))) = 'internal'
      or internal_role.role_id is not null
  ) candidate;

  raise notice
    'company role request preflight: legacy_only=% ids(first 20)=[%]; internal_only=% ids(first 20)=[%]; conflicts=% ids(first 20)=[%]',
    v_legacy_only_count,
    coalesce(v_legacy_only_ids, ''),
    v_internal_only_count,
    coalesce(v_internal_only_ids, ''),
    v_conflict_count,
    coalesce(v_conflict_ids, '');

  raise notice
    'company role request preflight: excluded_external_requests=%; external_extensions_to_remove=% ids(first 20)=[%]; target_over_20000=%; target_max_length=%',
    v_external_count,
    v_external_extension_count,
    coalesce(v_external_extension_ids, ''),
    v_oversized_count,
    v_max_length;

  if v_conflict_count > 0 then
    raise exception using
      errcode = '23514',
      message = 'company role request migration found conflicting legacy/internal values',
      detail = format(
        'conflict_count=%s; role_ids(first 20): %s',
        v_conflict_count,
        coalesce(v_conflict_ids, '')
      ),
      hint = 'Reconcile the listed rows explicitly, then re-run the migration.';
  end if;
end;
$$;

-- company_internal_roles only needs role_id; all other existing columns have
-- defaults or are nullable. Do not create extension rows for external roles.
insert into public.company_internal_roles (role_id, request)
select
  role.role_id,
  nullif(role.request, '')
from public.company_roles role
where lower(btrim(coalesce(role.source_type, ''))) = 'internal'
on conflict (role_id) do nothing;

-- Empty and whitespace-only values have one absent representation.
update public.company_internal_roles
set
  request = null,
  updated_at = transaction_timestamp()
where request is not null
  and nullif(btrim(request), '') is null;

update public.company_roles
set
  request = null,
  updated_at = transaction_timestamp()
where (
    lower(btrim(coalesce(source_type, ''))) = 'internal'
    or exists (
      select 1 from public.company_internal_roles internal_role
      where internal_role.role_id = company_roles.role_id
    )
  )
  and request is not null
  and nullif(btrim(request), '') is null;

-- Backfill in both directions without rewriting any present source text.
update public.company_internal_roles internal_role
set
  request = role.request,
  updated_at = transaction_timestamp()
from public.company_roles role
where role.role_id = internal_role.role_id
  and internal_role.request is null
  and role.request is not null;

update public.company_roles role
set
  request = internal_role.request,
  updated_at = transaction_timestamp()
from public.company_internal_roles internal_role
where internal_role.role_id = role.role_id
  and role.request is null
  and internal_role.request is not null;

-- A dirty pre-migration external extension can contain the only copy of the
-- request. The two-way backfill above first preserves that text on the parent;
-- only then remove the extension so source_type and extension scope converge.
delete from public.company_internal_roles internal_role
using public.company_roles role
where role.role_id = internal_role.role_id
  and lower(btrim(coalesce(role.source_type, ''))) <> 'internal';

do $$
begin
  if exists (
    select 1
    from public.company_roles role
    join public.company_internal_roles internal_role
      on internal_role.role_id = role.role_id
    where lower(btrim(coalesce(role.source_type, ''))) = 'internal'
      and role.request is distinct from internal_role.request
  ) then
    raise exception 'company role request backfill invariant failed';
  end if;


  if exists (
    select 1
    from public.company_roles role
    join public.company_internal_roles internal_role
      on internal_role.role_id = role.role_id
    where lower(btrim(coalesce(role.source_type, ''))) <> 'internal'
  ) then
    raise exception 'external company role extension cleanup invariant failed';
  end if;

  if exists (
    select 1
    from public.company_workspace workspace
    where workspace.company_db_id is not null
    group by workspace.company_db_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'company_db row is shared by multiple company workspaces',
      hint = 'Split or explicitly reconcile shared company_db references before applying this migration.';
  end if;
end;
$$;

create unique index if not exists company_workspace_company_db_id_uidx
  on public.company_workspace(company_db_id)
  where company_db_id is not null;

create or replace function public.sync_legacy_company_role_request_to_internal_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('harper.company_role_request_sync', true) = 'canonical' then
    return new;
  end if;

  if lower(btrim(coalesce(new.source_type, ''))) = 'internal'
     and (
       tg_op = 'INSERT'
       or new.request is distinct from old.request
       or new.source_type is distinct from old.source_type
     ) then
    insert into public.company_internal_roles (role_id, request, updated_at)
    values (
      new.role_id,
      case when nullif(btrim(new.request), '') is null then null else new.request end,
      transaction_timestamp()
    )
    on conflict (role_id) do update
      set request = excluded.request,
          updated_at = transaction_timestamp()
      where company_internal_roles.request is distinct from excluded.request;
  elsif lower(btrim(coalesce(new.source_type, ''))) <> 'internal' then
    -- The parent request is the durable legacy/external value. Removing the
    -- internal-only extension on source transition prevents stale canonical
    -- data from surviving an old writer's internal -> external update.
    delete from public.company_internal_roles
    where role_id = new.role_id;
  end if;

  return new;
end;
$$;

drop trigger if exists company_roles_legacy_request_to_internal
  on public.company_roles;
create trigger company_roles_legacy_request_to_internal
after insert or update of request, source_type
on public.company_roles
for each row
execute function public.sync_legacy_company_role_request_to_internal_v1();

create or replace function public.validate_company_internal_role_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_type text;
begin
  if tg_op = 'UPDATE' then
    if new.role_id is distinct from old.role_id then
      raise exception using
        errcode = '23514',
        message = 'company_internal_roles role_id cannot be reassigned';
    end if;
    return new;
  end if;

  select role.source_type
  into v_source_type
  from public.company_roles role
  where role.role_id = new.role_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'company internal role parent does not exist';
  end if;
  if lower(btrim(coalesce(v_source_type, ''))) <> 'internal' then
    raise exception using
      errcode = '23514',
      message = 'company_internal_roles is only available for internal roles';
  end if;
  return new;
end;
$$;

drop trigger if exists company_internal_roles_validate_scope
  on public.company_internal_roles;
create trigger company_internal_roles_validate_scope
before insert or update of role_id
on public.company_internal_roles
for each row
execute function public.validate_company_internal_role_scope_v1();

revoke all on function public.sync_legacy_company_role_request_to_internal_v1()
  from public, anon, authenticated;
revoke all on function public.validate_company_internal_role_scope_v1()
  from public, anon, authenticated;

comment on column public.company_internal_roles.request is
  'Canonical candidate-matching criteria for an internal company role. company_roles.request remains a compatibility mirror.';
comment on function public.sync_legacy_company_role_request_to_internal_v1() is
  'Rolling-deploy bridge for old writers that still update company_roles.request directly.';
comment on function public.validate_company_internal_role_scope_v1() is
  'Validates new extension scope against a locked parent and forbids role_id reassignment without locking ordinary child updates.';

commit;
