alter table public.opportunity_discovery_run
  add column if not exists started_at timestamptz null,
  add column if not exists completed_at timestamptz null;

alter table public.opportunity_ingestion_run
  add column if not exists started_at timestamptz null,
  add column if not exists completed_at timestamptz null;
