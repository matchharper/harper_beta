-- Version numbers that point at what was in force (#255, #258, worker #61).
--
-- Memory versions in time order. company_memory_revisions.id follows commit
-- order per company (the capture takes a company lock), but created_at was the
-- transaction's start time. Two overlapping memory writes in one company could
-- leave a later id with an earlier time, so every "as of T" read
-- (max(id) where created_at <= T: decisions, company_role_state_as_of_v1, the
-- worker's company-first and shadow reads) could include a change committed
-- after T. Brief and settings versions already avoid this with greatest():
-- a version's time is never earlier than the one before it. Memory versions
-- now do the same, and rows already saved are put back in that order once.
-- The readers stay as they are.
--
-- Brief version of a search Brief hash. Member-search evaluations and runs
-- keep the search Brief hash (brief_version), and several Brief versions can
-- share one hash (A -> B -> A edits, role start-only changes). The version is
-- the latest one with that hash at or before the moment; an evaluation older
-- than the role's first version takes the first version with that hash.
-- New evaluations record it in brief_revision, like decisions do; older rows
-- are read through the function.

create or replace function public.capture_company_memory_revision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_created_at timestamptz;
begin
  -- One writer per company at a time, so ids follow commit order within a company.
  perform pg_advisory_xact_lock(hashtextextended('company_memory_revision:' || new.company_workspace_id::text, 0));
  select revision.created_at into v_previous_created_at
  from public.company_memory_revisions revision
  where revision.company_workspace_id = new.company_workspace_id
  order by revision.id desc
  limit 1;
  -- A later id is never older, so "as of T" reads see a prefix of the ids.
  insert into public.company_memory_revisions (
    company_workspace_id, entry_id, scope, team_id, role_id, kind, label, content,
    entry_revision, source, source_message_id, evidence, deleted_at, created_at
  ) values (
    new.company_workspace_id, new.id, new.scope, new.team_id, new.role_id, new.kind, new.label,
    new.content, new.revision, new.source, new.source_message_id, new.evidence, new.deleted_at,
    greatest(now(), coalesce(v_previous_created_at, now()))
  );
  return new;
end;
$$;

revoke all on function public.capture_company_memory_revision_v1()
  from public, anon, authenticated, service_role;

-- Rows saved before this: each time at least the one before it in its company.
update public.company_memory_revisions revision
set created_at = ordered.in_order
from (
  select id, max(created_at) over (
    partition by company_workspace_id order by id rows between unbounded preceding and current row
  ) as in_order
  from public.company_memory_revisions
) ordered
where ordered.id = revision.id and ordered.in_order > revision.created_at;

create or replace function public.company_role_brief_revision_for_version_v1(
  p_role_id uuid, p_brief_version text, p_at timestamptz
) returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select max(revision.revision) from public.company_role_brief_revisions revision
     where revision.role_id = p_role_id and revision.legacy_brief_version = p_brief_version
       and revision.created_at <= p_at),
    (select min(revision.revision) from public.company_role_brief_revisions revision
     where revision.role_id = p_role_id and revision.legacy_brief_version = p_brief_version
       and not exists (
         select 1 from public.company_role_brief_revisions earlier
         where earlier.role_id = p_role_id and earlier.created_at <= p_at)));
$$;

revoke all on function public.company_role_brief_revision_for_version_v1(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.company_role_brief_revision_for_version_v1(uuid, text, timestamptz)
  to service_role;

alter table public.company_role_candidate_evaluations add column if not exists brief_revision integer;

create or replace function public.set_company_evaluation_brief_revision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.brief_revision is null and new.brief_version is not null then
    new.brief_revision := public.company_role_brief_revision_for_version_v1(
      new.role_id, new.brief_version, coalesce(new.evaluated_at, now()));
  end if;
  return new;
end;
$$;

revoke all on function public.set_company_evaluation_brief_revision_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists company_role_candidate_evaluations_brief_revision on public.company_role_candidate_evaluations;
create trigger company_role_candidate_evaluations_brief_revision
  before insert on public.company_role_candidate_evaluations
  for each row execute function public.set_company_evaluation_brief_revision_v1();
