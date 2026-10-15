-- company_db identifies public company facts. Organization access, private data
-- and billing belong to company_workspace and its explicit team memberships.
-- Independent Organizations may therefore reference the same public company.
drop index if exists public.company_workspace_company_db_id_uidx;
drop index if exists public.company_workspace_company_db_uidx;
create index if not exists company_workspace_company_db_id_idx
  on public.company_workspace(company_db_id) where company_db_id is not null;
