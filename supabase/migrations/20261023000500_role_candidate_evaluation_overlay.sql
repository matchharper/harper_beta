-- Per-criterion grades written after a rubric change. The board reads these
-- first, so a changed or added criterion shows "다시 보는 중" until re-judged
-- and unchanged criteria keep their earlier grades.
create table if not exists public.company_role_candidate_evaluations (
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  evaluations jsonb not null default '[]'::jsonb,
  reason_chips jsonb not null default '[]'::jsonb,
  brief_version int,
  updated_at timestamptz not null default now(),
  primary key (role_id, talent_id)
);
alter table public.company_role_candidate_evaluations enable row level security;
revoke all on public.company_role_candidate_evaluations from public, anon, authenticated;
grant all on public.company_role_candidate_evaluations to service_role;
