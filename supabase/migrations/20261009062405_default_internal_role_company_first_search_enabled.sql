-- Enable periodic company-first search by default for newly created internal roles.
-- Preserve every existing role's explicit search setting.
alter table public.company_internal_roles
  alter column is_company_first_search set default true;
