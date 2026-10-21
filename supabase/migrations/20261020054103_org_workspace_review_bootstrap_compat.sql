-- Production bootstrap compatibility only; the review workflow is applied separately.
alter table public.company_workspace
  add column if not exists is_reviewing boolean not null default false;
