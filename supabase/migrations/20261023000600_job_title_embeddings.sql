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
