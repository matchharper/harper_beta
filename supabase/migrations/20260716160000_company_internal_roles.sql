create table if not exists public.company_internal_roles (
  role_id uuid primary key references public.company_roles(role_id) on delete cascade,
  request text null,
  considerations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.company_internal_roles is
  'Internal-only role metadata keyed one-to-one by company_roles.role_id.';

comment on column public.company_internal_roles.considerations is
  'Structured internal considerations for the role.';

insert into public.company_internal_roles (role_id)
select role.role_id
from public.company_roles role
where lower(coalesce(role.source_type, '')) = 'internal'
on conflict (role_id) do nothing;

alter table public.company_internal_roles enable row level security;
