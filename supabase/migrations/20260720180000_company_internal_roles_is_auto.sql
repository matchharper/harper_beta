alter table public.company_internal_roles
  add column if not exists is_auto boolean not null default false;

comment on column public.company_internal_roles.is_auto is
  'Whether Harper should automatically recommend candidates for this internal role on the weekly schedule.';
