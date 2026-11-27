-- Roles prepared for a /jobs posting with no Harper Role behind it (Shaun 11/27). A person who signs up from such a
-- posting (a multi-company posting, or a single-company one whose role is not open in Harper) gets Harper's first
-- message from it: the Harper-connected roles close to that posting and open public postings like it, chosen once a
-- day for the posting (officialJobs/preparedRoles.server.ts, cron /api/internal/official-jobs/prepared-roles) so the
-- first message does not wait for a search. Harper still chooses from them what fits the person.
-- Additive only: the code before it never reads or writes this table.
create table if not exists public.official_job_prepared_roles (
  official_job_id uuid not null references public.official_jobs(id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  -- harper: a Harper-connected Role (Harper can recommend the person to that company). public: a public posting.
  kind text not null check (kind in ('harper', 'public')),
  rank integer not null check (rank >= 0),
  -- Why a Harper-connected Role is close to the posting, in a line (null for public postings).
  reason text check (reason is null or length(reason) <= 600),
  -- One build writes every row of a posting with the same time, then removes that posting's older rows.
  prepared_at timestamptz not null default now(),
  primary key (official_job_id, role_id)
);

alter table public.official_job_prepared_roles enable row level security;
revoke all on table public.official_job_prepared_roles from public, anon, authenticated;
grant select, insert, update, delete on table public.official_job_prepared_roles to service_role;
