alter table public.company_workspace
  add column if not exists pitch text null,
  add column if not exists request text null;

alter table public.company_roles
  add column if not exists request text null;
