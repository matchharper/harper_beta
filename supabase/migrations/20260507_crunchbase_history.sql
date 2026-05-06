create extension if not exists pgcrypto;

create table if not exists public.crunchbase_history (
  id uuid primary key default gen_random_uuid(),
  company_db_id integer null references public.company_db(id) on delete set null,
  organization_url text not null,
  organization_permalink text null,
  content jsonb not null default '{}'::jsonb,
  source_actor text null,
  fetched_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists crunchbase_history_company_recent_idx
  on public.crunchbase_history (company_db_id, fetched_at desc)
  where company_db_id is not null;

create index if not exists crunchbase_history_permalink_recent_idx
  on public.crunchbase_history (organization_permalink, fetched_at desc)
  where organization_permalink is not null;

create index if not exists crunchbase_history_url_recent_idx
  on public.crunchbase_history (organization_url, fetched_at desc);

alter table public.crunchbase_history enable row level security;
