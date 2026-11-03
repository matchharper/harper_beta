set local lock_timeout = '5s';
-- External candidate sourcing: people outside Harper found from public profiles
-- for one Role. They are not talent_* members and never enter member tables or
-- the member evaluation ledger until they reply and sign up.
-- Service-only: Worker and server tool executors read and write; no client access.

-- One sourcing attempt for one Role. Same queue and lease shape as
-- company_first_search_runs (queued -> running -> succeeded / skipped / failed).
-- trigger, status and the jsonb shapes stay free text (no value-list CHECKs).
create table if not exists public.external_sourcing_runs (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  trigger text not null,
  requested_by uuid,
  status text not null default 'queued',
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  attempt_count integer not null default 0,
  input jsonb not null default '{}'::jsonb,
  budget jsonb not null default '{}'::jsonb,
  cost jsonb not null default '{}'::jsonb,
  counts jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists external_sourcing_runs_claim_idx
  on public.external_sourcing_runs(status, available_at);
create index if not exists external_sourcing_runs_role_idx
  on public.external_sourcing_runs(role_id, created_at desc);
-- Each run costs money: at most one queued or running run per Role, even for
-- concurrent requests. A second request reads the existing run instead.
create unique index if not exists external_sourcing_runs_one_active_per_role
  on public.external_sourcing_runs(role_id) where status in ('queued', 'running');
alter table public.external_sourcing_runs enable row level security;
revoke all on public.external_sourcing_runs from public, anon, authenticated;
grant all on public.external_sourcing_runs to service_role;

-- One person on one run's shortlist (at most ten), with the final judgement.
-- delivered marks the people passed to the company (at most three).
-- profile_text and evidence quotes of people the company never acted on are
-- removed after 30 days (raw_purged_at); judgement, links and summary remain.
create table if not exists public.external_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.external_sourcing_runs(id) on delete cascade,
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  person_key text not null,
  linkedin_url text,
  name text,
  headline text,
  current_company text,
  location text,
  career_lines jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  screen jsonb not null default '{}'::jsonb,
  verdict jsonb not null default '{}'::jsonb,
  rank integer,
  delivered boolean not null default false,
  excluded_reason text,
  profile_text text,
  raw_purged_at timestamptz,
  company_decision text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists external_candidates_run_idx
  on public.external_candidates(run_id);
create index if not exists external_candidates_role_idx
  on public.external_candidates(role_id, created_at desc);
alter table public.external_candidates enable row level security;
revoke all on public.external_candidates from public, anon, authenticated;
grant all on public.external_candidates to service_role;
