set local lock_timeout = '5s';
-- The broad candidate pool (members and per-criterion scores, often several MB)
-- moves out of the role start session row, so the screen's frequent session
-- reads no longer carry it. One row per Role, rebuilt freely.
create table if not exists public.company_role_start_pools (
  role_id uuid primary key references public.company_roles(role_id) on delete cascade,
  pool jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.company_role_start_pools enable row level security;
revoke all on public.company_role_start_pools from public, anon, authenticated;
grant all on public.company_role_start_pools to service_role;

insert into public.company_role_start_pools (role_id, pool)
select role_id, pool from public.company_role_start_sessions where pool is not null
on conflict (role_id) do nothing;
update public.company_role_start_sessions set pool = null where pool is not null;
