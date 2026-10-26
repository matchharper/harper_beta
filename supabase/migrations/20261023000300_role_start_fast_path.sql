set local lock_timeout = '5s';
-- Role start redesign: per-Role working state and two
-- reconstructible talent caches used by the synchronous first-candidates path.
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

-- The whole-profile cache is stored as real[]; index its vector projection so
-- unfiltered nearest-profile lookups do not cast every row.
create index if not exists talent_profile_search_embeddings_vector_hnsw
  on public.talent_profile_search_embeddings
  using hnsw ((embedding::public.vector(1536)) public.vector_cosine_ops)
  where embedding_model = 'text-embedding-3-small';

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
