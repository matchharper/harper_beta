set local lock_timeout = '5s';
-- Email lookup for one external person a company was shown (external_candidates).
-- The Worker finds an address from public sources (Exa Agent) and records where it
-- came from and how it was checked. The address itself never goes to the
-- company-side LLM or the company; they see the status only.
-- Service-only: Worker and server tool executors read and write; no client access.
create table if not exists public.external_candidate_contacts (
  id uuid primary key default gen_random_uuid(),
  external_candidate_id uuid not null references public.external_candidates(id) on delete cascade,
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  requested_by uuid,
  status text not null default 'queued',
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0,
  email text,
  email_kind text,
  source_kind text,
  source_url text,
  same_person_basis text,
  checks jsonb not null default '{}'::jsonb,
  cost jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
-- One lookup record per person shown; a retry reuses it (each lookup costs money).
create unique index if not exists external_candidate_contacts_candidate_key
  on public.external_candidate_contacts(external_candidate_id);
create index if not exists external_candidate_contacts_claim_idx
  on public.external_candidate_contacts(status, available_at);
create index if not exists external_candidate_contacts_workspace_idx
  on public.external_candidate_contacts(company_workspace_id, created_at desc);
alter table public.external_candidate_contacts enable row level security;
revoke all on public.external_candidate_contacts from public, anon, authenticated;
grant all on public.external_candidate_contacts to service_role;
