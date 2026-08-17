alter table public.company_internal_roles
  add column if not exists is_auto boolean not null default true;

alter table public.company_internal_roles
  alter column is_auto set default true;

update public.company_internal_roles
set is_auto = true
where is_auto is null;

alter table public.company_internal_roles
  alter column is_auto set not null;

comment on column public.company_internal_roles.is_auto is
  'Whether recurring company-side behavior context and talent fit refresh runs for this internal role. New roles default to enabled.';
