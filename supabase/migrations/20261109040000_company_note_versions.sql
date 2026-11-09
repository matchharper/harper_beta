set local lock_timeout = '5s';

-- A company's note is a judgment too. It is about one candidate, so it does not belong in the Role's
-- state of a moment; instead each version of a note records the same three version numbers a decision
-- does: the Brief, the company memory and the company information in force when it was written.
alter table public.company_candidate_note_revisions
  add column if not exists brief_revision integer,
  add column if not exists memory_version bigint,
  add column if not exists company_info_revision integer;

create or replace function public.set_company_note_versions_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select max(revision.revision) into new.brief_revision
  from public.company_role_brief_revisions revision
  where revision.role_id = new.role_id and revision.created_at <= new.created_at;

  select coalesce(max(revision.id), 0) into new.memory_version
  from public.company_memory_revisions revision
  where revision.company_workspace_id = new.company_workspace_id and revision.created_at <= new.created_at;

  select max(revision.revision) into new.company_info_revision
  from public.company_info_revisions revision
  where revision.company_workspace_id = new.company_workspace_id and revision.created_at <= new.created_at;
  return new;
end;
$$;

revoke all on function public.set_company_note_versions_v1() from public, anon, authenticated, service_role;

drop trigger if exists company_candidate_note_revisions_versions on public.company_candidate_note_revisions;
create trigger company_candidate_note_revisions_versions
  before insert on public.company_candidate_note_revisions
  for each row execute function public.set_company_note_versions_v1();
