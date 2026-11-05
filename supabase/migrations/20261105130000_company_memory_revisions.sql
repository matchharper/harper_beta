-- Company memory versions and one read function (D19 memory part, F1a).
--
-- company_memory_entries stays the current copy that the memory tools edit.
-- Every change leaves a row in company_memory_revisions in the same
-- transaction, numbered in commit order per company. That number is the
-- company's memory version: the memory a role had at version v is, for each
-- entry, its last row up to v, unless that row is a deletion.
--
-- - Decisions and evaluations record the memory version they were made with
--   (filled when the writer leaves it empty), next to the existing
--   fingerprint, so the memory of that moment can be read back.
-- - company_memory_for_role_v1(role, version) is the one read path: company,
--   team and role entries that apply to the role, now or at a version.
-- - Entries gain kind, source, source_message_id and evidence so a memory can
--   say where it came from. Existing writers leave them empty; the kinds are
--   set when writers move (F1b/G).
-- - The old single-text memories (company_memories, company_internal_roles.memory)
--   are not copied here: their readers still read them, and a copy would show
--   the same text twice. They move together with the readers (F1b).
--
-- Production had no entries when this was written, so history starts complete.

alter table public.company_memory_entries
  add column if not exists kind text,
  add column if not exists source text,
  add column if not exists source_message_id bigint
    references public.company_messages(id) on delete set null,
  add column if not exists evidence jsonb not null default '[]'::jsonb;

create table public.company_memory_revisions (
  id bigint generated always as identity primary key,
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  entry_id bigint not null,
  scope text not null,
  team_id uuid,
  role_id uuid,
  kind text,
  label text not null default '',
  content text not null,
  entry_revision bigint not null,
  source text,
  source_message_id bigint,
  evidence jsonb not null default '[]'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index company_memory_revisions_workspace_idx
  on public.company_memory_revisions (company_workspace_id, id desc);
create index company_memory_revisions_entry_idx
  on public.company_memory_revisions (entry_id, id desc);

alter table public.company_memory_revisions enable row level security;
revoke all on public.company_memory_revisions from public, anon, authenticated, service_role;
grant select on public.company_memory_revisions to service_role;

-- One writer per company at a time, so ids follow commit order within a company.
create or replace function public.capture_company_memory_revision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('company_memory_revision:' || new.company_workspace_id::text, 0));
  insert into public.company_memory_revisions (
    company_workspace_id, entry_id, scope, team_id, role_id, kind, label, content,
    entry_revision, source, source_message_id, evidence, deleted_at
  ) values (
    new.company_workspace_id, new.id, new.scope, new.team_id, new.role_id, new.kind, new.label,
    new.content, new.revision, new.source, new.source_message_id, new.evidence, new.deleted_at
  );
  return new;
end;
$$;

revoke all on function public.capture_company_memory_revision_v1()
  from public, anon, authenticated, service_role;

create trigger company_memory_entries_revision
  after insert on public.company_memory_entries
  for each row execute function public.capture_company_memory_revision_v1();
create trigger company_memory_entries_revision_update
  after update on public.company_memory_entries
  for each row
  when ((old.scope, old.team_id, old.role_id, old.kind, old.label, old.content, old.revision, old.deleted_at)
    is distinct from (new.scope, new.team_id, new.role_id, new.kind, new.label, new.content, new.revision, new.deleted_at))
  execute function public.capture_company_memory_revision_v1();

-- The company's current memory version (0 before any memory).
create or replace function public.company_memory_version_v1(p_company_workspace_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(revision.id), 0)
  from public.company_memory_revisions revision
  where revision.company_workspace_id = p_company_workspace_id;
$$;

-- The memory that applies to a role: company entries, its team's and its
-- own, now (null version) or at a version.
create or replace function public.company_memory_for_role_v1(p_role_id uuid, p_version bigint default null)
returns table (
  entry_id bigint, scope text, team_id uuid, role_id uuid, kind text, label text, content text,
  entry_revision bigint, source text, source_message_id bigint, evidence jsonb, memory_version bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select role.role_id, role.company_workspace_id, internal_role.team_id,
      coalesce(p_version, public.company_memory_version_v1(role.company_workspace_id)) as version
    from public.company_roles role
    left join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
    where role.role_id = p_role_id
  ), latest as (
    select distinct on (revision.entry_id) revision.*
    from public.company_memory_revisions revision, target
    where revision.company_workspace_id = target.company_workspace_id and revision.id <= target.version
    order by revision.entry_id, revision.id desc
  )
  select latest.entry_id, latest.scope, latest.team_id, latest.role_id, latest.kind, latest.label,
    latest.content, latest.entry_revision, latest.source, latest.source_message_id, latest.evidence,
    target.version
  from latest, target
  where latest.deleted_at is null
    and (latest.scope = 'company'
      or (latest.scope = 'team' and latest.team_id is not distinct from target.team_id and target.team_id is not null)
      or (latest.scope = 'role' and latest.role_id = target.role_id))
  order by latest.entry_id;
$$;

revoke all on function public.company_memory_version_v1(uuid) from public, anon, authenticated;
revoke all on function public.company_memory_for_role_v1(uuid, bigint) from public, anon, authenticated;
grant execute on function public.company_memory_version_v1(uuid) to service_role;
grant execute on function public.company_memory_for_role_v1(uuid, bigint) to service_role;

-- Decisions and evaluations record the memory version they were made with.
alter table public.company_decision_events add column if not exists memory_version bigint;
alter table public.company_role_candidate_evaluations add column if not exists source_company_memory_version bigint;

create or replace function public.set_company_memory_version_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- As of the row's own time, so a decision copied in later with its original
  -- time does not get a memory version from after it.
  if tg_table_name = 'company_decision_events' then
    if new.memory_version is null then
      select coalesce(max(revision.id), 0) into new.memory_version
      from public.company_memory_revisions revision
      where revision.company_workspace_id = new.company_workspace_id
        and revision.created_at <= coalesce(new.created_at, now());
    end if;
  elsif new.source_company_memory_version is null and new.company_workspace_id is not null then
    new.source_company_memory_version := public.company_memory_version_v1(new.company_workspace_id);
  end if;
  return new;
end;
$$;

revoke all on function public.set_company_memory_version_v1() from public, anon, authenticated, service_role;

create trigger company_decision_events_memory_version
  before insert on public.company_decision_events
  for each row execute function public.set_company_memory_version_v1();
create trigger company_role_candidate_evaluations_memory_version
  before insert on public.company_role_candidate_evaluations
  for each row execute function public.set_company_memory_version_v1();

-- Point-in-time reads include the memory version in force.
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
    'memory', (
      with version as (
        select coalesce(max(revision.id), 0) as id
        from public.company_memory_revisions revision
        join public.company_roles role on role.company_workspace_id = revision.company_workspace_id
        where role.role_id = p_role_id and revision.created_at <= p_at
      )
      select jsonb_build_object(
        'version', version.id,
        'entries', coalesce((
          select jsonb_agg(to_jsonb(entry) order by entry.entry_id)
          from public.company_memory_for_role_v1(p_role_id, version.id) entry
        ), '[]'::jsonb)
      )
      from version
    ),
    'decisions', coalesce((
      select jsonb_agg(to_jsonb(event) order by event.created_at, event.id)
      from public.company_decision_events event
      where event.role_id = p_role_id and event.created_at <= p_at
    ), '[]'::jsonb)
  );
$$;
