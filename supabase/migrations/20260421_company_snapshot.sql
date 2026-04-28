create extension if not exists pgcrypto;

create table if not exists public.company_snapshot (
  id uuid primary key default gen_random_uuid(),
  company_db_id integer null references public.company_db(id) on delete set null,
  company_name text not null,
  normalized_company_name text not null,
  content jsonb not null default '{}'::jsonb,
  source_urls jsonb not null default '[]'::jsonb,
  status text not null default 'completed',
  error_message text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  alter table public.company_snapshot
    add constraint company_snapshot_status_check
    check (status in ('pending', 'completed', 'failed'));
exception
  when duplicate_object then null;
end
$$;

create index if not exists company_snapshot_normalized_recent_idx
  on public.company_snapshot (normalized_company_name, created_at desc);

create index if not exists company_snapshot_company_db_recent_idx
  on public.company_snapshot (company_db_id, created_at desc)
  where company_db_id is not null;

create or replace function public.set_company_snapshot_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists company_snapshot_set_updated_at
  on public.company_snapshot;

create trigger company_snapshot_set_updated_at
before update on public.company_snapshot
for each row execute function public.set_company_snapshot_updated_at();

alter table public.company_snapshot enable row level security;
