-- External searches record the Brief and memory versions they ran with (E2).
--
-- Member searches already keep the Brief they used (the run snapshot and each
-- evaluation's brief_version, which maps to company_role_brief_revisions by
-- legacy_brief_version). External searches kept only the request reason, so
-- a later look could not tell which Brief or memory they searched with.
--
-- When an external run starts (status becomes running, also on a retry), it
-- takes the role's current Brief version and the company's memory version.
-- The Worker is not changed. Reading structured Brief values in searches
-- waits for the Brief writer (E3), when every role has them.

alter table public.external_sourcing_runs
  add column if not exists brief_revision integer,
  add column if not exists memory_version bigint;

create or replace function public.set_external_sourcing_run_versions_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select max(revision.revision) into new.brief_revision
  from public.company_role_brief_revisions revision
  where revision.role_id = new.role_id;
  new.memory_version := public.company_memory_version_v1(new.company_workspace_id);
  return new;
end;
$$;

revoke all on function public.set_external_sourcing_run_versions_v1()
  from public, anon, authenticated, service_role;

create trigger external_sourcing_runs_versions
  before update of status on public.external_sourcing_runs
  for each row
  when (new.status = 'running' and old.status is distinct from 'running')
  execute function public.set_external_sourcing_run_versions_v1();
