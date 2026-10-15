-- The derived-data function reads only these three source columns.
-- Country/work-mode metadata must not force large description TOAST reads.
set lock_timeout = '5s';
drop trigger invalidate_external_role_derived_data on public.company_roles;
create trigger invalidate_external_role_derived_data
before update of name, description, company_workspace_id on public.company_roles
for each row execute function public.invalidate_external_role_derived_data();
