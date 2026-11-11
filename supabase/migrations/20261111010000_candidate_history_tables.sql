-- Candidate versions: Brief/Memory, Behavior Context and settings (Q4).
--
-- talent_contexts, talent_behavior_contexts and talent_setting stay the
-- current copies their writers edit. Every meaningful change now also leaves
-- an immutable row in a history table, in the same transaction, written by a
-- trigger, so no writer changes and no write path can skip it. This mirrors
-- the company side: memory versions (20261105130100, with the 11/7 time-order
-- rule of 20261107060100) and role setting versions (20261105090100).
--
-- 1. talent_context_revisions: one row per change of a Brief or Memory row
--    (insert, a change of collection/key/label/content/importance/source_refs/
--    deleted_at, or a hard delete). Embedding-only or timestamp-only writes
--    leave none. The row id is the talent's context version: one writer per
--    talent at a time, so ids follow commit order within a talent. The whole
--    Brief and Memory at version v is, for each context row, its last history
--    row up to v, unless that row is a deletion (talent_contexts_for_version_v1).
-- 2. talent_behavior_context_revisions: one row per new Behavior Context
--    (context_version or context_hash changed). The Worker builder is unchanged.
-- 3. talent_setting_revisions: the settings that decide matching and
--    visibility, one version per transaction (its final state), none when they
--    end where they started.
-- 4. talent_versions_v1(talent, at) gives the four version numbers in force at
--    a moment (or now); talent_state_as_of_v1(talent, at) gives the whole state.
--
-- A later version is never older (created_at = greatest(now(), previous)), so
-- "as of T" reads see a prefix of each talent's versions.
--
-- Who made a change is not recorded: the writers set no change context a
-- trigger can read. source_refs (where the fact came from) is kept per row.
--
-- Rows saved before this migration start with their current state as their
-- first version: Brief/Memory at their last save time, Behavior at the time its
-- text last changed, settings at the migration time.
--
-- Account deletion removes talent_users, and these rows go with it (on delete
-- cascade). A withdrawal (talent_users.deleted_at) keeps them, like the rows
-- they copy.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- 1. Brief and Memory versions.
create table if not exists public.talent_context_revisions (
  id bigint generated always as identity primary key,
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  context_id bigint not null,
  ref bigint not null,
  collection text not null,
  key text,
  label text,
  content text not null,
  importance smallint,
  source_refs jsonb not null default '[]'::jsonb,
  context_revision bigint not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists talent_context_revisions_talent_idx
  on public.talent_context_revisions (talent_id, id desc);
create index if not exists talent_context_revisions_context_idx
  on public.talent_context_revisions (context_id, id desc);

alter table public.talent_context_revisions enable row level security;
revoke all on public.talent_context_revisions from public, anon, authenticated, service_role;
grant select on public.talent_context_revisions to service_role;

create or replace function public.capture_talent_context_revision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_talent_id uuid := case when tg_op = 'DELETE' then old.talent_id else new.talent_id end;
  v_previous_created_at timestamptz;
  v_at timestamptz;
begin
  -- The talent itself is being removed: its history goes with it.
  if tg_op = 'DELETE'
    and not exists (select 1 from public.talent_users talent where talent.user_id = v_talent_id) then
    return null;
  end if;
  -- One writer per talent at a time, so ids follow commit order within a talent.
  perform pg_advisory_xact_lock(hashtextextended('talent_context_revision:' || v_talent_id::text, 0));
  select revision.created_at into v_previous_created_at
  from public.talent_context_revisions revision
  where revision.talent_id = v_talent_id
  order by revision.id desc
  limit 1;
  -- A later id is never older, so "as of T" reads see a prefix of the ids.
  v_at := greatest(now(), coalesce(v_previous_created_at, now()));
  -- Fields are read one by one, never the whole row (its embedding is large).
  if tg_op = 'DELETE' then
    insert into public.talent_context_revisions (
      talent_id, context_id, ref, collection, key, label, content, importance,
      source_refs, context_revision, deleted_at, created_at
    ) values (
      old.talent_id, old.id, old.ref, old.collection, old.key, old.label, old.content,
      old.importance, old.source_refs, old.revision, v_at, v_at
    );
  else
    insert into public.talent_context_revisions (
      talent_id, context_id, ref, collection, key, label, content, importance,
      source_refs, context_revision, deleted_at, created_at
    ) values (
      new.talent_id, new.id, new.ref, new.collection, new.key, new.label, new.content,
      new.importance, new.source_refs, new.revision, new.deleted_at, v_at
    );
  end if;
  return null;
end;
$$;

revoke all on function public.capture_talent_context_revision_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists talent_contexts_revision on public.talent_contexts;
create trigger talent_contexts_revision
  after insert on public.talent_contexts
  for each row execute function public.capture_talent_context_revision_v1();
-- Embedding refreshes set only the embedding columns and skip this trigger.
drop trigger if exists talent_contexts_revision_update on public.talent_contexts;
create trigger talent_contexts_revision_update
  after update of collection, key, label, content, importance, source_refs, deleted_at
  on public.talent_contexts
  for each row
  when ((old.collection, old.key, old.label, old.content, old.importance, old.source_refs, old.deleted_at)
    is distinct from (new.collection, new.key, new.label, new.content, new.importance, new.source_refs, new.deleted_at))
  execute function public.capture_talent_context_revision_v1();
-- A row already soft-deleted has its deletion recorded.
drop trigger if exists talent_contexts_revision_delete on public.talent_contexts;
create trigger talent_contexts_revision_delete
  after delete on public.talent_contexts
  for each row
  when (old.deleted_at is null)
  execute function public.capture_talent_context_revision_v1();

-- Rows saved before this migration: their current state is their first
-- version, at their last save time, in time order.
insert into public.talent_context_revisions (
  talent_id, context_id, ref, collection, key, label, content, importance,
  source_refs, context_revision, deleted_at, created_at
)
select context.talent_id, context.id, context.ref, context.collection, context.key, context.label,
  context.content, context.importance, context.source_refs, context.revision, context.deleted_at,
  context.updated_at
from public.talent_contexts context
where not exists (
  select 1 from public.talent_context_revisions revision where revision.context_id = context.id
)
order by context.updated_at, context.id;

-- A talent's Brief and Memory now (null version) or at a version: each row's
-- last version up to it, unless deleted. changed_at is when that version was saved.
create or replace function public.talent_contexts_for_version_v1(p_talent_id uuid, p_version bigint default null)
returns table (
  context_id bigint, ref bigint, collection text, key text, label text, content text,
  importance smallint, source_refs jsonb, context_revision bigint, changed_at timestamptz,
  context_version bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select coalesce(p_version, (
      select coalesce(max(revision.id), 0)
      from public.talent_context_revisions revision
      where revision.talent_id = p_talent_id
    )) as version
  ), latest as (
    select distinct on (revision.context_id) revision.*
    from public.talent_context_revisions revision, target
    where revision.talent_id = p_talent_id and revision.id <= target.version
    order by revision.context_id, revision.id desc
  )
  select latest.context_id, latest.ref, latest.collection, latest.key, latest.label, latest.content,
    latest.importance, latest.source_refs, latest.context_revision, latest.created_at, target.version
  from latest, target
  where latest.deleted_at is null
  order by latest.collection, latest.ref;
$$;

-- 2. Behavior Context versions.
create table if not exists public.talent_behavior_context_revisions (
  id bigint generated always as identity primary key,
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  context_version bigint not null,
  context_text text not null,
  context_hash text not null,
  builder_version text not null,
  last_consumed_change_id bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists talent_behavior_context_revisions_talent_idx
  on public.talent_behavior_context_revisions (talent_id, id desc);

alter table public.talent_behavior_context_revisions enable row level security;
revoke all on public.talent_behavior_context_revisions from public, anon, authenticated, service_role;
grant select on public.talent_behavior_context_revisions to service_role;

create or replace function public.capture_talent_behavior_context_revision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_created_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('talent_behavior_context_revision:' || new.talent_id::text, 0));
  select revision.created_at into v_previous_created_at
  from public.talent_behavior_context_revisions revision
  where revision.talent_id = new.talent_id
  order by revision.id desc
  limit 1;
  insert into public.talent_behavior_context_revisions (
    talent_id, context_version, context_text, context_hash, builder_version,
    last_consumed_change_id, created_at
  ) values (
    new.talent_id, new.context_version, new.context_text, new.context_hash, new.builder_version,
    new.last_consumed_change_id, greatest(now(), coalesce(v_previous_created_at, now()))
  );
  return null;
end;
$$;

revoke all on function public.capture_talent_behavior_context_revision_v1()
  from public, anon, authenticated, service_role;

-- The builder rewrites the row on every run (cursor, evaluated time); only a
-- new version or text counts.
drop trigger if exists talent_behavior_contexts_revision on public.talent_behavior_contexts;
create trigger talent_behavior_contexts_revision
  after insert on public.talent_behavior_contexts
  for each row execute function public.capture_talent_behavior_context_revision_v1();
drop trigger if exists talent_behavior_contexts_revision_update on public.talent_behavior_contexts;
create trigger talent_behavior_contexts_revision_update
  after update of context_version, context_hash on public.talent_behavior_contexts
  for each row
  when ((old.context_version, old.context_hash) is distinct from (new.context_version, new.context_hash))
  execute function public.capture_talent_behavior_context_revision_v1();

-- Contexts saved before this migration: the current one, from when its text last changed.
insert into public.talent_behavior_context_revisions (
  talent_id, context_version, context_text, context_hash, builder_version,
  last_consumed_change_id, created_at
)
select behavior.talent_id, behavior.context_version, behavior.context_text, behavior.context_hash,
  behavior.builder_version, behavior.last_consumed_change_id,
  coalesce(behavior.last_changed_at, behavior.created_at)
from public.talent_behavior_contexts behavior
where not exists (
  select 1 from public.talent_behavior_context_revisions revision where revision.talent_id = behavior.talent_id
)
order by coalesce(behavior.last_changed_at, behavior.created_at), behavior.talent_id;

-- 3. Setting versions: the settings that decide what is matched and shown.
create table if not exists public.talent_setting_revisions (
  id bigint generated always as identity primary key,
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  revision integer not null check (revision > 0),
  snapshot jsonb not null,
  content_hash text not null,
  transaction_id bigint not null default txid_current(),
  created_at timestamptz not null default now(),
  constraint talent_setting_revisions_talent_revision unique (talent_id, revision),
  constraint talent_setting_revisions_talent_transaction unique (talent_id, transaction_id)
);

create index if not exists talent_setting_revisions_talent_created_idx
  on public.talent_setting_revisions (talent_id, created_at desc, revision desc);

alter table public.talent_setting_revisions enable row level security;
revoke all on public.talent_setting_revisions from public, anon, authenticated, service_role;
grant select on public.talent_setting_revisions to service_role;

-- A column added to talent_setting later is not versioned until it is added here.
create or replace function public.talent_setting_snapshot_v1(p_talent_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'profile_visibility', setting.profile_visibility,
    'blocked_companies', setting.blocked_companies,
    'engagement_types', setting.engagement_types,
    'get_internal_recommendation', setting.get_internal_recommendation,
    'get_external_recommendation', setting.get_external_recommendation,
    'is_onboarding_done', setting.is_onboarding_done,
    'external_search_default', setting.external_search_default,
    'periodic_interval_days', setting.periodic_interval_days,
    'recommendation_batch_size', setting.recommendation_batch_size,
    'preferred_locale', setting.preferred_locale,
    'status', setting.status
  )
  from public.talent_setting setting
  where setting.user_id = p_talent_id;
$$;

revoke all on function public.talent_setting_snapshot_v1(uuid) from public, anon, authenticated;
grant execute on function public.talent_setting_snapshot_v1(uuid) to service_role;

-- Records the talent's current settings as a version, once per transaction.
create or replace function public.capture_talent_setting_revision_v1(p_talent_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
  v_hash text;
  v_previous_hash text;
  v_previous_revision integer;
  v_previous_created_at timestamptz;
begin
  -- Taken before the snapshot so it includes a concurrent change to the same
  -- talent that committed while this one waited.
  perform pg_advisory_xact_lock(hashtextextended('talent_setting_revision:' || p_talent_id::text, 0));
  v_snapshot := public.talent_setting_snapshot_v1(p_talent_id);
  if v_snapshot is null then
    return;
  end if;
  v_hash := md5(v_snapshot::text);

  select revision.revision, revision.content_hash, revision.created_at
    into v_previous_revision, v_previous_hash, v_previous_created_at
  from public.talent_setting_revisions revision
  where revision.talent_id = p_talent_id and revision.transaction_id <> txid_current()
  order by revision.revision desc
  limit 1;

  if v_hash is not distinct from v_previous_hash then
    -- Back where the last committed version was: no version for this transaction.
    delete from public.talent_setting_revisions
    where talent_id = p_talent_id and transaction_id = txid_current();
    return;
  end if;

  -- Same time rule as the company versions: a later number is never older.
  insert into public.talent_setting_revisions (
    talent_id, revision, snapshot, content_hash, created_at
  ) values (
    p_talent_id, coalesce(v_previous_revision, 0) + 1, v_snapshot, v_hash,
    greatest(now(), coalesce(v_previous_created_at, now()))
  )
  on conflict on constraint talent_setting_revisions_talent_transaction do update
    set snapshot = excluded.snapshot,
        content_hash = excluded.content_hash;
end;
$$;

revoke all on function public.capture_talent_setting_revision_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.capture_talent_setting_revision_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.capture_talent_setting_revision_v1(new.user_id);
  return null;
end;
$$;

revoke all on function public.capture_talent_setting_revision_trigger_v1()
  from public, anon, authenticated, service_role;

-- After the existing talent_setting triggers (names sort after them); they are unchanged.
drop trigger if exists talent_setting_revision on public.talent_setting;
create trigger talent_setting_revision
  after insert on public.talent_setting
  for each row execute function public.capture_talent_setting_revision_trigger_v1();
drop trigger if exists talent_setting_revision_update on public.talent_setting;
create trigger talent_setting_revision_update
  after update of profile_visibility, blocked_companies, engagement_types, get_internal_recommendation,
    get_external_recommendation, is_onboarding_done, external_search_default, periodic_interval_days,
    recommendation_batch_size, preferred_locale, status
  on public.talent_setting
  for each row
  when ((old.profile_visibility, old.blocked_companies, old.engagement_types, old.get_internal_recommendation,
      old.get_external_recommendation, old.is_onboarding_done, old.external_search_default, old.periodic_interval_days,
      old.recommendation_batch_size, old.preferred_locale, old.status)
    is distinct from (new.profile_visibility, new.blocked_companies, new.engagement_types,
      new.get_internal_recommendation, new.get_external_recommendation, new.is_onboarding_done,
      new.external_search_default, new.periodic_interval_days, new.recommendation_batch_size,
      new.preferred_locale, new.status))
  execute function public.capture_talent_setting_revision_trigger_v1();

-- Version 1 for every talent with settings, from what is saved now. Set-based
-- rather than one capture call per talent: the triggers above already hold
-- the table, and ~9k advisory locks in one transaction would crowd the shared
-- lock table.
insert into public.talent_setting_revisions (talent_id, revision, snapshot, content_hash)
select setting.user_id, 1, snapshot.value, md5(snapshot.value::text)
from public.talent_setting setting
cross join lateral (select public.talent_setting_snapshot_v1(setting.user_id) as value) snapshot
where not exists (
  select 1 from public.talent_setting_revisions revision where revision.talent_id = setting.user_id
)
order by setting.user_id;

-- 4. Version numbers and the state of a moment.

-- The talent's version numbers in force at p_at (null: now). context is the
-- Brief/Memory version (0 before any), behavior the Behavior Context's own
-- context_version, setting the setting version, profile the default profile's
-- revision. PL/pgSQL so a session reuses its plans: the decision triggers
-- (20261111020000) call it on every candidate decision.
create or replace function public.talent_versions_v1(p_talent_id uuid, p_at timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'context', (
      select coalesce(max(revision.id), 0)
      from public.talent_context_revisions revision
      where revision.talent_id = p_talent_id
        and revision.created_at <= coalesce(p_at, 'infinity'::timestamptz)
    ),
    'behavior', (
      select revision.context_version
      from public.talent_behavior_context_revisions revision
      where revision.talent_id = p_talent_id
        and revision.created_at <= coalesce(p_at, 'infinity'::timestamptz)
      order by revision.id desc
      limit 1
    ),
    'setting', (
      select max(revision.revision)
      from public.talent_setting_revisions revision
      where revision.talent_id = p_talent_id
        and revision.created_at <= coalesce(p_at, 'infinity'::timestamptz)
    ),
    'profile', (
      -- Profile revisions keep their transaction start time; read each one
      -- from when it and every earlier one existed, the same order rule.
      select profile_revision.revision
      from (
        select revision.revision,
          max(revision.created_at) over (order by revision.revision) as in_order_at
        from public.talent_profiles profile
        join public.talent_profile_revisions revision on revision.profile_id = profile.id
        where profile.talent_id = p_talent_id and profile.is_default
      ) profile_revision
      where profile_revision.in_order_at <= coalesce(p_at, 'infinity'::timestamptz)
      order by profile_revision.revision desc
      limit 1
    )
  );
end;
$$;

-- What was in force for a talent at a moment: Brief and Memory rows, Behavior
-- Context, settings and the default profile's revision, with their numbers.
create or replace function public.talent_state_as_of_v1(p_talent_id uuid, p_at timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with versions as (
    select public.talent_versions_v1(p_talent_id, p_at) as value
  )
  select jsonb_build_object(
    'talentId', p_talent_id,
    'at', p_at,
    'versions', versions.value,
    'brief', coalesce((
      select jsonb_agg(to_jsonb(entry) - 'importance' order by entry.ref)
      from public.talent_contexts_for_version_v1(p_talent_id, (versions.value->>'context')::bigint) entry
      where entry.collection = 'brief'
    ), '[]'::jsonb),
    'memory', coalesce((
      select jsonb_agg(to_jsonb(entry) - 'label' order by entry.ref)
      from public.talent_contexts_for_version_v1(p_talent_id, (versions.value->>'context')::bigint) entry
      where entry.collection = 'memory'
    ), '[]'::jsonb),
    'behavior', (
      select jsonb_build_object(
        'version', revision.context_version,
        'hash', revision.context_hash,
        'text', revision.context_text,
        'builderVersion', revision.builder_version,
        'createdAt', revision.created_at
      )
      from public.talent_behavior_context_revisions revision
      where revision.talent_id = p_talent_id
        and revision.created_at <= coalesce(p_at, 'infinity'::timestamptz)
      order by revision.id desc
      limit 1
    ),
    'setting', (
      select jsonb_build_object(
        'revision', revision.revision,
        'createdAt', revision.created_at,
        'snapshot', revision.snapshot
      )
      from public.talent_setting_revisions revision
      where revision.talent_id = p_talent_id
        and revision.created_at <= coalesce(p_at, 'infinity'::timestamptz)
      order by revision.revision desc
      limit 1
    ),
    'profile', (
      select jsonb_build_object(
        'profileId', profile.id,
        'revision', (versions.value->>'profile')::bigint
      )
      from public.talent_profiles profile
      where profile.talent_id = p_talent_id and profile.is_default
        and versions.value->'profile' <> 'null'::jsonb
    )
  )
  from versions;
$$;

revoke all on function public.talent_contexts_for_version_v1(uuid, bigint) from public, anon, authenticated;
revoke all on function public.talent_versions_v1(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.talent_state_as_of_v1(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.talent_contexts_for_version_v1(uuid, bigint) to service_role;
grant execute on function public.talent_versions_v1(uuid, timestamptz) to service_role;
grant execute on function public.talent_state_as_of_v1(uuid, timestamptz) to service_role;

commit;
