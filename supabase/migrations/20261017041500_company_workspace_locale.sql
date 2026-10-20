alter table public.company_workspace
  add column locale text;

alter table public.company_workspace
  add constraint company_workspace_locale_check
  check (locale is null or locale in ('ko', 'en'));

comment on column public.company_workspace.locale is
  'Language for workspace-wide company messages; null follows the Headquarters rule (company_db.location).';
