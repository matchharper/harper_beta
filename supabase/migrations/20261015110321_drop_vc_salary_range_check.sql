-- Salary predictions have numeric endpoints without a source salary_range.
-- Do not restrict salary storage by ingestion provider; the salary RPC keeps
-- its existing endpoint validation and source/version guards.
set local lock_timeout = '5s';

alter table public.company_roles
  drop constraint if exists company_roles_vc_salary_range_check;
