create table if not exists public.jobs_companies_sources (
  id bigserial primary key,
  company_workspace_id uuid null references public.company_workspace(company_workspace_id) on delete set null,
  linkedin_name text null,
  linkedin_url text null,
  wanted_company_name text null,
  wanted_company_url text null,
  jobkorea_company_name text null,
  jobkorea_company_url text null,
  zighang_company_name text null,
  zighang_company_url text null,
  groupby_company_name text null,
  groupby_company_url text null,
  source_metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists jobs_companies_sources_linkedin_url_uidx
  on public.jobs_companies_sources (linkedin_url)
  where linkedin_url is not null;

create unique index if not exists jobs_companies_sources_wanted_url_uidx
  on public.jobs_companies_sources (wanted_company_url)
  where wanted_company_url is not null;

create unique index if not exists jobs_companies_sources_jobkorea_url_uidx
  on public.jobs_companies_sources (jobkorea_company_url)
  where jobkorea_company_url is not null;

create unique index if not exists jobs_companies_sources_zighang_url_uidx
  on public.jobs_companies_sources (zighang_company_url)
  where zighang_company_url is not null;

create unique index if not exists jobs_companies_sources_groupby_url_uidx
  on public.jobs_companies_sources (groupby_company_url)
  where groupby_company_url is not null;

create index if not exists jobs_companies_sources_workspace_idx
  on public.jobs_companies_sources (company_workspace_id)
  where company_workspace_id is not null;

create index if not exists jobs_companies_sources_updated_idx
  on public.jobs_companies_sources (updated_at desc);

create or replace function public.set_jobs_companies_sources_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobs_companies_sources_set_updated_at
  on public.jobs_companies_sources;

create trigger jobs_companies_sources_set_updated_at
before update on public.jobs_companies_sources
for each row execute function public.set_jobs_companies_sources_updated_at();

alter table public.jobs_companies_sources enable row level security;
