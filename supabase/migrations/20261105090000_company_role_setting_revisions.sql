-- Role setting versions (D19, settings part).
--
-- A Harper-managed role's settings are the company_internal_roles columns that
-- are neither the Brief (request, criteria: company_role_brief_revisions) nor
-- the old Memory text, plus whether the role is on (company_roles.status) and
-- its priority. Examples: hide company name, promotion, pending-connection cap,
-- required documents, search schedule, team, email notifications. Every change
-- leaves an immutable version in the same transaction, with the same rules as
-- Brief versions: one version per transaction (its final state), none when the
-- settings end where they started. New company_internal_roles columns are
-- versioned as settings unless added to the excluded list below.
--
-- A setting change is not also written to company_decision_events: this table
-- is the original record of settings, and point-in-time reads take it from
-- here (D18, one original per kind of information).
--
-- Who and where come from harper.hiring_brief_change_context when the writer
-- set it; most settings writers do not yet, so those versions have no actor
-- until writers move to one write function.

create table public.company_role_setting_revisions (
  id bigint generated always as identity primary key,
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  revision integer not null check (revision > 0),
  snapshot jsonb not null,
  content_hash text not null,
  source text,
  actor_user_id uuid,
  actor_label text,
  transaction_id bigint not null default txid_current(),
  created_at timestamptz not null default now(),
  constraint company_role_setting_revisions_role_revision unique (role_id, revision),
  constraint company_role_setting_revisions_role_transaction unique (role_id, transaction_id)
);

create index company_role_setting_revisions_role_created_idx
  on public.company_role_setting_revisions (role_id, created_at desc, revision desc);
create index company_role_setting_revisions_workspace_idx
  on public.company_role_setting_revisions (company_workspace_id);

alter table public.company_role_setting_revisions enable row level security;
revoke all on public.company_role_setting_revisions from public, anon, authenticated, service_role;
grant select on public.company_role_setting_revisions to service_role;

create or replace function public.company_role_settings_snapshot_v1(p_role_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('status', role.status, 'priority', role.priority)
    || (to_jsonb(internal_role) - array[
      'role_id', 'request', 'criteria', 'memory',
      'created_at', 'updated_at', 'role_status_changed_at'
    ])
  from public.company_roles role
  join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
  where role.role_id = p_role_id;
$$;

-- Records the role's current settings as a version, once per transaction.
create or replace function public.capture_company_role_setting_revision_v1(p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context jsonb := coalesce(
    nullif(current_setting('harper.hiring_brief_change_context', true), ''), '{}'
  )::jsonb;
  v_workspace uuid;
  v_snapshot jsonb;
  v_hash text;
  v_previous_hash text;
  v_previous_revision integer;
  v_previous_created_at timestamptz;
begin
  select role.company_workspace_id into v_workspace
  from public.company_roles role
  join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
  where role.role_id = p_role_id;
  if v_workspace is null then
    return;
  end if;
  v_snapshot := public.company_role_settings_snapshot_v1(p_role_id);
  v_hash := md5(v_snapshot::text);

  perform pg_advisory_xact_lock(hashtextextended('company_role_setting_revision:' || p_role_id::text, 0));

  select revision.revision, revision.content_hash, revision.created_at
    into v_previous_revision, v_previous_hash, v_previous_created_at
  from public.company_role_setting_revisions revision
  where revision.role_id = p_role_id and revision.transaction_id <> txid_current()
  order by revision.revision desc
  limit 1;

  if v_hash is not distinct from v_previous_hash then
    delete from public.company_role_setting_revisions
    where role_id = p_role_id and transaction_id = txid_current();
    return;
  end if;

  -- Same time rule as Brief versions: a later number is never older.
  insert into public.company_role_setting_revisions (
    company_workspace_id, role_id, revision, snapshot, content_hash,
    source, actor_user_id, actor_label, created_at
  ) values (
    v_workspace, p_role_id, coalesce(v_previous_revision, 0) + 1, v_snapshot, v_hash,
    nullif(v_context->>'source', ''), nullif(v_context->>'actorUserId', '')::uuid,
    nullif(v_context->>'actorLabel', ''), greatest(now(), coalesce(v_previous_created_at, now()))
  )
  on conflict on constraint company_role_setting_revisions_role_transaction do update
    set snapshot = excluded.snapshot,
        content_hash = excluded.content_hash;
end;
$$;

revoke all on function public.capture_company_role_setting_revision_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.capture_company_role_setting_revision_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.capture_company_role_setting_revision_v1(new.role_id);
  return new;
end;
$$;

revoke all on function public.capture_company_role_setting_revision_trigger_v1()
  from public, anon, authenticated, service_role;

-- Every column, so a setting column added later is versioned too; a write that
-- touches only the Brief, Memory or timestamps leaves the hash unchanged, and a
-- write that changes nothing skips the function.
create trigger company_internal_roles_setting_revision
  after insert on public.company_internal_roles
  for each row execute function public.capture_company_role_setting_revision_trigger_v1();
create trigger company_internal_roles_setting_revision_update
  after update on public.company_internal_roles
  for each row
  when (old.* is distinct from new.*)
  execute function public.capture_company_role_setting_revision_trigger_v1();

create trigger company_roles_setting_revision
  after update of status, priority on public.company_roles
  for each row
  when (new.source_type = 'internal' and (old.status, old.priority) is distinct from (new.status, new.priority))
  execute function public.capture_company_role_setting_revision_trigger_v1();

-- Version 1 for every Harper-managed role, from what is saved now.
select set_config('harper.hiring_brief_change_context', '{"source":"migration"}', false);
select public.capture_company_role_setting_revision_v1(internal_role.role_id)
from public.company_internal_roles internal_role
order by internal_role.role_id;
select set_config('harper.hiring_brief_change_context', '', false);

-- Point-in-time reads now include the settings version.
create or replace function public.company_role_state_as_of_v1(p_role_id uuid, p_at timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'roleId', p_role_id,
    'at', p_at,
    'brief', (
      select jsonb_build_object(
        'revision', revision.revision,
        'createdAt', revision.created_at,
        'source', revision.source,
        'actorUserId', revision.actor_user_id,
        'legacyBriefVersion', revision.legacy_brief_version,
        'snapshot', revision.snapshot
      )
      from public.company_role_brief_revisions revision
      where revision.role_id = p_role_id and revision.created_at <= p_at
      order by revision.revision desc
      limit 1
    ),
    'settings', (
      select jsonb_build_object(
        'revision', revision.revision,
        'createdAt', revision.created_at,
        'source', revision.source,
        'actorUserId', revision.actor_user_id,
        'snapshot', revision.snapshot
      )
      from public.company_role_setting_revisions revision
      where revision.role_id = p_role_id and revision.created_at <= p_at
      order by revision.revision desc
      limit 1
    ),
    'decisions', coalesce((
      select jsonb_agg(to_jsonb(event) order by event.created_at, event.id)
      from public.company_decision_events event
      where event.role_id = p_role_id and event.created_at <= p_at
    ), '[]'::jsonb)
  );
$$;
