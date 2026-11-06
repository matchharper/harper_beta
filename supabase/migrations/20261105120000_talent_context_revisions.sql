-- Kept versions of the Talent-side texts that evaluations read (D13, PR N).
--
-- Behavior Context (talent_behavior_contexts) and Career Brief / memory
-- (talent_contexts) are overwritten in place, so an evaluation could not be
-- replayed with the text it saw. Each change now leaves a copy in the same
-- transaction; the builders and readers are unchanged.
--
-- - talent_behavior_context_revisions: one row per Behavior version
--   (context_version goes up by one on every change).
-- - talent_context_revisions: one row per change of a Career memo (content,
--   label, key, collection, revision or deletion). Embedding refreshes are not
--   changes. A deleted memo's versions are kept (the deletion is one more row
--   with deleted_at); current reads already skip deleted memos. Only the
--   Talent account deletion removes them.
-- - company_role_candidate_evaluations.source_behavior_context_version: the
--   Behavior version the Talent had when the evaluation was saved, filled when
--   the writer leaves it empty. The Career memos of that moment are read from
--   talent_context_revisions by time (a list per evaluation would add about a
--   kilobyte to each of ~300k evaluations a week).
--
-- History starts now: earlier versions were overwritten and cannot be
-- recovered. Rows go with the Talent account.

create table public.talent_behavior_context_revisions (
  id bigint generated always as identity primary key,
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  context_version bigint not null,
  context_hash text not null,
  context_text text not null,
  builder_version text,
  created_at timestamptz not null default now(),
  constraint talent_behavior_context_revisions_version unique (talent_id, context_version)
);

create index talent_behavior_context_revisions_talent_created_idx
  on public.talent_behavior_context_revisions (talent_id, created_at desc);

create table public.talent_context_revisions (
  id bigint generated always as identity primary key,
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  context_id bigint not null,
  ref bigint,
  collection text,
  label text,
  key text,
  content text,
  revision bigint,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index talent_context_revisions_talent_created_idx
  on public.talent_context_revisions (talent_id, created_at desc);
create index talent_context_revisions_context_idx
  on public.talent_context_revisions (context_id, created_at desc);

alter table public.talent_behavior_context_revisions enable row level security;
alter table public.talent_context_revisions enable row level security;
revoke all on public.talent_behavior_context_revisions from public, anon, authenticated, service_role;
revoke all on public.talent_context_revisions from public, anon, authenticated, service_role;
grant select on public.talent_behavior_context_revisions to service_role;
grant select on public.talent_context_revisions to service_role;

create or replace function public.capture_talent_behavior_context_revision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.talent_behavior_context_revisions (
    talent_id, context_version, context_hash, context_text, builder_version
  ) values (
    new.talent_id, coalesce(new.context_version, 0), new.context_hash, new.context_text, new.builder_version
  )
  on conflict on constraint talent_behavior_context_revisions_version do nothing;
  return new;
end;
$$;

revoke all on function public.capture_talent_behavior_context_revision_v1()
  from public, anon, authenticated, service_role;

-- A blank text (no evidence yet, or marked for rebuild) is not a version.
create trigger talent_behavior_contexts_revision
  after insert on public.talent_behavior_contexts
  for each row
  when (coalesce(new.context_text, '') <> '' and coalesce(new.context_hash, '') <> '')
  execute function public.capture_talent_behavior_context_revision_v1();
create trigger talent_behavior_contexts_revision_update
  after update of context_text, context_hash, context_version on public.talent_behavior_contexts
  for each row
  when (coalesce(new.context_text, '') <> '' and coalesce(new.context_hash, '') <> ''
    and (old.context_hash, old.context_version) is distinct from (new.context_hash, new.context_version))
  execute function public.capture_talent_behavior_context_revision_v1();

create or replace function public.capture_talent_context_revision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.talent_context_revisions (
    talent_id, context_id, ref, collection, label, key, content, revision, deleted_at
  ) values (
    new.talent_id, new.id, new.ref, new.collection, new.label, new.key, new.content, new.revision, new.deleted_at
  );
  return new;
end;
$$;

revoke all on function public.capture_talent_context_revision_v1()
  from public, anon, authenticated, service_role;

create trigger talent_contexts_revision
  after insert on public.talent_contexts
  for each row
  execute function public.capture_talent_context_revision_v1();
create trigger talent_contexts_revision_update
  after update of content, label, key, collection, revision, deleted_at on public.talent_contexts
  for each row
  when ((old.content, old.label, old.key, old.collection, old.revision, old.deleted_at)
    is distinct from (new.content, new.label, new.key, new.collection, new.revision, new.deleted_at))
  execute function public.capture_talent_context_revision_v1();

-- The one read path for kept memos: the memos a Talent had at a moment, as
-- an evaluation then saw them (deleted ones only before their deletion).
-- Nothing else reads the history; the Career agent and the builders keep
-- reading talent_contexts, which skips deleted memos.
create or replace function public.talent_contexts_as_of_v1(p_talent_id uuid, p_at timestamptz)
returns table (
  context_id bigint, ref bigint, collection text, label text, key text, content text,
  revision bigint, changed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select latest.context_id, latest.ref, latest.collection, latest.label, latest.key,
    latest.content, latest.revision, latest.created_at
  from (
    select distinct on (history.context_id) history.*
    from public.talent_context_revisions history
    where history.talent_id = p_talent_id and history.created_at <= p_at
    order by history.context_id, history.created_at desc, history.id desc
  ) latest
  where latest.deleted_at is null or latest.deleted_at > p_at
  order by latest.ref;
$$;

revoke all on function public.talent_contexts_as_of_v1(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.talent_contexts_as_of_v1(uuid, timestamptz) to service_role;

-- The Behavior version an evaluation was made with.
alter table public.company_role_candidate_evaluations
  add column if not exists source_behavior_context_version bigint;

create or replace function public.set_evaluation_behavior_version_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_behavior_context_version is null then
    select behavior.context_version into new.source_behavior_context_version
    from public.talent_behavior_contexts behavior
    where behavior.talent_id = new.talent_id
      and coalesce(behavior.context_text, '') <> '';
  end if;
  return new;
end;
$$;

revoke all on function public.set_evaluation_behavior_version_v1()
  from public, anon, authenticated, service_role;

create trigger company_role_candidate_evaluations_behavior_version
  before insert on public.company_role_candidate_evaluations
  for each row
  execute function public.set_evaluation_behavior_version_v1();

-- First versions: what is saved now (live memos only).
insert into public.talent_behavior_context_revisions (
  talent_id, context_version, context_hash, context_text, builder_version, created_at
)
select behavior.talent_id, coalesce(behavior.context_version, 0), behavior.context_hash,
  behavior.context_text, behavior.builder_version,
  coalesce(behavior.last_changed_at, behavior.updated_at, now())
from public.talent_behavior_contexts behavior
join public.talent_users talent on talent.user_id = behavior.talent_id
where coalesce(behavior.context_text, '') <> '' and coalesce(behavior.context_hash, '') <> ''
on conflict on constraint talent_behavior_context_revisions_version do nothing;

insert into public.talent_context_revisions (
  talent_id, context_id, ref, collection, label, key, content, revision, deleted_at, created_at
)
select context.talent_id, context.id, context.ref, context.collection, context.label, context.key,
  context.content, context.revision, context.deleted_at, coalesce(context.updated_at, context.created_at, now())
from public.talent_contexts context
join public.talent_users talent on talent.user_id = context.talent_id
where context.deleted_at is null;
