set local lock_timeout = '5s';
-- A company's request to be connected with one external person it was shown
-- (external_candidates). Same inputs as a company-first Intro request: the
-- company's reason for interest and the company recipients to CC once the
-- person accepts. Recording a request contacts nobody; inviting the person and
-- handing a signed-up person to the ordinary Intro flow are later steps.
-- Service-only: server tool executors read and write; no client access.
create table if not exists public.external_intro_requests (
  id uuid primary key default gen_random_uuid(),
  external_candidate_id uuid not null references public.external_candidates(id) on delete cascade,
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  requested_by uuid not null,
  company_appeal text not null,
  intro_recipient_emails text[] not null default '{}'::text[],
  status text not null default 'requested',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One request per person shown, also for concurrent confirmations.
create unique index if not exists external_intro_requests_candidate_key
  on public.external_intro_requests(external_candidate_id);
create index if not exists external_intro_requests_workspace_idx
  on public.external_intro_requests(company_workspace_id, created_at desc);
alter table public.external_intro_requests enable row level security;
revoke all on public.external_intro_requests from public, anon, authenticated;
grant all on public.external_intro_requests to service_role;
