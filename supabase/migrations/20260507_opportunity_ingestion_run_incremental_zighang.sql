alter table public.opportunity_ingestion_run
  add column if not exists from_date timestamptz null,
  add column if not exists to_date timestamptz null,
  add column if not exists source_provider text null,
  add column if not exists numbers jsonb null;

create index if not exists opportunity_ingestion_run_provider_to_date_idx
  on public.opportunity_ingestion_run (source_provider, to_date desc, created_at desc)
  where source_provider is not null;

insert into public.opportunity_ingestion_run
  (status, source_provider, from_date, to_date, numbers)
select
  'completed',
  'zighang',
  null,
  timestamptz '2026-04-28 00:00:00+00',
  jsonb_build_object(
    'bootstrap', true,
    'found_count', 0,
    'inserted_count', 0,
    'updated_count', 0,
    'source_url', 'https://zighang.com/recruitment',
    'affiliates', jsonb_build_array('원티드', '직행 수집', '그룹바이')
  )
where not exists (
  select 1
  from public.opportunity_ingestion_run
  where source_provider = 'zighang'
    and to_date is not null
);
