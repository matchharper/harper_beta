-- Brief versions and point-in-time reads (D19, first part).
--
-- Every change to a Harper-managed role's Brief now leaves an immutable version:
-- the Brief text and criteria (company_internal_roles.request, criteria), the
-- role facts that the search Brief includes (company_roles), and the structured
-- Brief of new roles (company_role_start_sessions.brief). Triggers record the
-- version in the same transaction as the change, so no write path can skip it
-- and the version always matches what was saved. One transaction gives at most
-- one version (its final state); a transaction that ends where it started, or a
-- write that changes nothing, gives none.
--
-- Who and where come from the existing harper.hiring_brief_change_context
-- setting (role start, chat, Slack and the web screen already set it). Moving
-- every writer to one write function and refusing other direct writes is E3.
--
-- company_role_state_as_of_v1(role, at) returns the Brief version that was in
-- force at that moment and the company decisions up to it. Memory, settings,
-- posting text and company profile are added to it by their own PRs.
--
-- Searches keep reading request/criteria; nothing they read changes here.

create table public.company_role_brief_revisions (
  id bigint generated always as identity primary key,
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  revision integer not null check (revision > 0),
  -- search: company_role_search_brief_snapshot_v1 (role facts + request + criteria)
  -- sessionBrief: the structured Brief of roles created through role start
  snapshot jsonb not null,
  legacy_brief_version text,
  content_hash text not null,
  source text,
  actor_user_id uuid,
  actor_label text,
  transaction_id bigint not null default txid_current(),
  created_at timestamptz not null default now(),
  constraint company_role_brief_revisions_role_revision unique (role_id, revision),
  constraint company_role_brief_revisions_role_transaction unique (role_id, transaction_id)
);

create index company_role_brief_revisions_role_created_idx
  on public.company_role_brief_revisions (role_id, created_at desc, revision desc);
create index company_role_brief_revisions_workspace_idx
  on public.company_role_brief_revisions (company_workspace_id);

alter table public.company_role_brief_revisions enable row level security;
revoke all on public.company_role_brief_revisions from public, anon, authenticated, service_role;
grant select on public.company_role_brief_revisions to service_role;

create or replace function public.company_role_brief_snapshot_v1(p_role_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'search', public.company_role_search_brief_snapshot_v1(p_role_id),
    'sessionBrief', (
      select session.brief from public.company_role_start_sessions session
      where session.role_id = p_role_id
    )
  );
$$;

-- Records the role's current Brief as a version, once per transaction.
create or replace function public.capture_company_role_brief_revision_v1(p_role_id uuid)
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
  v_snapshot := public.company_role_brief_snapshot_v1(p_role_id);
  v_hash := md5(v_snapshot::text);

  -- Serialise version numbering per role. Waits only for another transaction
  -- that is changing the same role's Brief.
  perform pg_advisory_xact_lock(hashtextextended('company_role_brief_revision:' || p_role_id::text, 0));

  select revision.revision, revision.content_hash, revision.created_at
    into v_previous_revision, v_previous_hash, v_previous_created_at
  from public.company_role_brief_revisions revision
  where revision.role_id = p_role_id and revision.transaction_id <> txid_current()
  order by revision.revision desc
  limit 1;

  if v_hash is not distinct from v_previous_hash then
    -- Back where the last committed version was: no version for this transaction.
    delete from public.company_role_brief_revisions
    where role_id = p_role_id and transaction_id = txid_current();
    return;
  end if;

  -- created_at is the transaction time, like the decisions written with it. Two
  -- overlapping transactions on one role can commit out of start order, so it
  -- never goes below the previous version's: a later number is never older.
  insert into public.company_role_brief_revisions (
    company_workspace_id, role_id, revision, snapshot, legacy_brief_version,
    content_hash, source, actor_user_id, actor_label, created_at
  ) values (
    v_workspace, p_role_id, coalesce(v_previous_revision, 0) + 1, v_snapshot,
    public.company_role_search_brief_version_v1(p_role_id), v_hash,
    nullif(v_context->>'source', ''), nullif(v_context->>'actorUserId', '')::uuid,
    nullif(v_context->>'actorLabel', ''), greatest(now(), coalesce(v_previous_created_at, now()))
  )
  on conflict on constraint company_role_brief_revisions_role_transaction do update
    set snapshot = excluded.snapshot,
        legacy_brief_version = excluded.legacy_brief_version,
        content_hash = excluded.content_hash;
end;
$$;

revoke all on function public.capture_company_role_brief_revision_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.capture_company_role_brief_revision_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.capture_company_role_brief_revision_v1(new.role_id);
  return new;
end;
$$;

revoke all on function public.capture_company_role_brief_revision_trigger_v1()
  from public, anon, authenticated, service_role;

create trigger company_internal_roles_brief_revision
  after insert or update of request, criteria on public.company_internal_roles
  for each row execute function public.capture_company_role_brief_revision_trigger_v1();

-- Same columns as company_role_search_brief_snapshot_v1 reads. External roles
-- (about 270k rows) are skipped before the function runs.
create trigger company_roles_brief_revision
  after update of name, description, location_text, country_code, work_mode, type,
    seniority_level, salary_range, salary_min, salary_max, salary_currency, salary_period
  on public.company_roles
  for each row
  when (new.source_type = 'internal')
  execute function public.capture_company_role_brief_revision_trigger_v1();

create trigger company_role_start_sessions_brief_revision
  after insert or update of brief on public.company_role_start_sessions
  for each row execute function public.capture_company_role_brief_revision_trigger_v1();

-- Version 1 for every Harper-managed role, from what is saved now. Earlier
-- history (company_role_hiring_brief_history) has no role facts, so it is kept
-- read-only and not turned into versions; point-in-time reads start here.
-- Session-level (not transaction-local) so it holds whether or not the runner
-- wraps the file in one transaction; cleared right after.
select set_config('harper.hiring_brief_change_context', '{"source":"migration"}', false);
select public.capture_company_role_brief_revision_v1(internal_role.role_id)
from public.company_internal_roles internal_role
order by internal_role.role_id;
select set_config('harper.hiring_brief_change_context', '', false);

-- Decisions keep the Brief version number of their moment, beside brief_version.
alter table public.company_decision_events add column brief_revision integer;

create or replace function public.set_company_decision_brief_revision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.brief_revision is null then
    select max(revision.revision) into new.brief_revision
    from public.company_role_brief_revisions revision
    where revision.role_id = new.role_id;
  end if;
  return new;
end;
$$;

revoke all on function public.set_company_decision_brief_revision_v1()
  from public, anon, authenticated, service_role;

create trigger company_decision_events_brief_revision
  before insert on public.company_decision_events
  for each row execute function public.set_company_decision_brief_revision_v1();

-- What was in force for a role at a moment: the Brief version and the
-- decisions up to then. Later PRs add memory, settings, posting text and
-- company profile with the same shape.
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
    'decisions', coalesce((
      select jsonb_agg(to_jsonb(event) order by event.created_at, event.id)
      from public.company_decision_events event
      where event.role_id = p_role_id and event.created_at <= p_at
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.company_role_state_as_of_v1(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.company_role_state_as_of_v1(uuid, timestamptz) to service_role;
