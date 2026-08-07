create table if not exists public.company_role_assignees (
  role_id uuid not null
    references public.company_roles(role_id) on delete cascade,
  company_user_id uuid not null
    references public.company_users(user_id) on delete cascade,
  primary key (role_id, company_user_id)
);

alter table public.company_role_assignees enable row level security;

revoke all on public.company_role_assignees from anon, authenticated;
grant all on public.company_role_assignees to service_role;

comment on table public.company_role_assignees is
  'Workspace members automatically CCed on introduction emails for a role.';
