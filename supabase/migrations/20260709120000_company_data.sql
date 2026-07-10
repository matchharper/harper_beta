create table if not exists public.company_data (
  company_workspace_id uuid primary key references public.company_workspace(company_workspace_id) on delete cascade,
  total_funding_raised text null,
  main_investors text null,
  last_funding_stage text null,
  last_funding_round_description text null,
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 100)),
  search_query text null,
  source_payload jsonb null,
  searched_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.company_data
  add column if not exists confidence numeric null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.company_data'::regclass
      and conname = 'company_data_confidence_check'
  ) then
    alter table public.company_data
      add constraint company_data_confidence_check
      check (confidence is null or (confidence >= 0 and confidence <= 100));
  end if;
end $$;

comment on table public.company_data is
  'Cached public company funding data used by the Harper worker before external talent-opportunity fit evaluation.';

comment on column public.company_data.total_funding_raised is
  'Total funding raised, including currency when available.';

comment on column public.company_data.main_investors is
  'Primary investors or investor groups.';

comment on column public.company_data.last_funding_stage is
  'Current or latest disclosed funding/growth stage, such as Seed, Series A, IPO, or unknown.';

comment on column public.company_data.last_funding_round_description is
  'Most recent funding round summary, including size, stage, date, investors, and any useful caveats.';

comment on column public.company_data.confidence is
  '0-100 entity-match confidence that the cached funding data refers to the exact queried company.';

comment on column public.company_data.source_payload is
  'Compact Exa response payload used to ground the cached funding fields.';

create index if not exists company_data_searched_at_idx
  on public.company_data (searched_at);

create index if not exists company_data_updated_at_idx
  on public.company_data (updated_at);

alter table public.company_data enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    execute 'grant select, insert, update on public.company_data to harper_worker';

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'company_data'
        and policyname = 'harper_worker_company_data_all'
    ) then
      execute 'create policy harper_worker_company_data_all
        on public.company_data
        for all
        to harper_worker
        using (true)
        with check (true)';
    end if;
  end if;
end $$;
