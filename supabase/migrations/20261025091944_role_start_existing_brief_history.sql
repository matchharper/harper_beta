set local lock_timeout = '5s';
-- Role-start working state and reconstructible search caches.
-- Saved Brief history and versions reuse the existing ledger and search hash.
create extension if not exists vector with schema public;

-- One LLM pass normalizes free-form talent location text into SQL-filterable
-- fields. Unknown stays null: a filter treats null as "확인 안 됨", never as a miss.
create table if not exists public.talent_location_facets (
  talent_id uuid primary key references public.talent_users(user_id) on delete cascade,
  country_code text,
  city text,
  remote_ok boolean,
  hybrid_ok boolean,
  relocation_ok boolean,
  source_fingerprint text not null,
  model text not null,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists talent_location_facets_country_idx
  on public.talent_location_facets(country_code, city);
alter table public.talent_location_facets enable row level security;
revoke all on public.talent_location_facets from public, anon, authenticated;
grant all on public.talent_location_facets to service_role;

-- Section-level vectors (summary, each experience, education, extras). Criterion
-- similarity uses the best matching section instead of a diluted whole profile.
create table if not exists public.talent_profile_chunk_embeddings (
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  chunk_key text not null,
  chunk_text text not null,
  content_fingerprint text not null,
  embedding_model text not null,
  embedding public.vector(1536) not null,
  updated_at timestamptz not null default now(),
  primary key (talent_id, chunk_key)
);
create index if not exists talent_profile_chunk_embeddings_hnsw
  on public.talent_profile_chunk_embeddings using hnsw (embedding public.vector_cosine_ops);
alter table public.talent_profile_chunk_embeddings enable row level security;
revoke all on public.talent_profile_chunk_embeddings from public, anon, authenticated;
grant all on public.talent_profile_chunk_embeddings to service_role;

-- Role start state between first JD read and the first batch. The pool keeps
-- the first-three candidate set and per-criterion scores for the batch rerank.
create table if not exists public.company_role_start_sessions (
  role_id uuid primary key references public.company_roles(role_id) on delete cascade,
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  phase text not null default 'questions',
  brief jsonb not null default '{}'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  pending_question jsonb,
  pool jsonb,
  first_candidates jsonb not null default '[]'::jsonb,
  evaluations jsonb not null default '{}'::jsonb,
  batch jsonb,
  progress jsonb not null default '[]'::jsonb,
  timings jsonb not null default '{}'::jsonb,
  llm_usage jsonb not null default '[]'::jsonb,
  revision int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.company_role_start_sessions enable row level security;
revoke all on public.company_role_start_sessions from public, anon, authenticated;
grant all on public.company_role_start_sessions to service_role;

-- Verdicts written ahead of confirmation while the team reviews the Brief.
-- entries: talentId → {briefHash, verdict, usd, at}; stats: used/discarded counts and cost.
alter table public.company_role_start_sessions
  add column if not exists prepared jsonb not null default '{"entries": {}, "stats": {}}'::jsonb;

-- Latest role-start re-evaluations are a regenerable session cache, not the
-- durable company_role_candidate_evaluations search ledger. Keep that ledger
-- and its run/stage/version contract untouched.
alter table public.company_role_start_sessions
  add column if not exists criterion_evaluations jsonb not null default '{}'::jsonb;

set local lock_timeout = '5s';
-- One vector per distinct normalized job title (lowercase, single spaces), for
-- the role start job-match score. A reconstructible cache keyed by model, so
-- a different title model can be filled next to the current one.
create table if not exists public.job_title_embeddings (
  title text not null,
  model text not null,
  embedding public.vector(1024) not null,
  fingerprint text not null,
  updated_at timestamptz not null default now(),
  primary key (title, model)
);
alter table public.job_title_embeddings enable row level security;
revoke all on public.job_title_embeddings from public, anon, authenticated;
grant all on public.job_title_embeddings to service_role;

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

set local lock_timeout = '5s';
-- Background role start work is ordered and claimed in the database, not in
-- one server's memory: answers are refined in order (refined_answers counts
-- the answers already handled) and a running step holds a lease that expires.
alter table public.company_role_start_sessions
  add column if not exists refined_answers int not null default 0,
  add column if not exists leases jsonb not null default '{}'::jsonb;
update public.company_role_start_sessions
set refined_answers = coalesce(jsonb_array_length(questions->'history'), 0)
where refined_answers = 0;

-- Where a person says they can relocate to (ISO alpha-2), read only from what
-- they wrote. Empty means unknown. An on-site Role's location condition lets a
-- person living outside the Role's country through only when this lists it.
alter table public.talent_location_facets
  add column if not exists relocation_countries text[] not null default '{}';

-- Which writer owns the structured Brief cannot be inferred from its prose.
-- Imported legacy criteria leave this null; onboarding drafts set it explicitly.
alter table public.company_role_start_sessions add column if not exists brief_source text;
