begin;

alter table public.opportunity_ingestion_run
  add column if not exists workflow_name text,
  add column if not exists workflow_run_id text,
  add column if not exists workflow_run_attempt integer,
  add column if not exists workflow_run_url text;

create unique index if not exists opportunity_ingestion_run_workflow_execution_uidx
  on public.opportunity_ingestion_run (
    source_provider,
    workflow_run_id,
    workflow_run_attempt
  )
  where workflow_run_id is not null
    and workflow_run_attempt is not null;

create index if not exists opportunity_ingestion_run_provider_created_idx
  on public.opportunity_ingestion_run (source_provider, created_at desc);

alter table public.jobposting_crawl_log
  add column if not exists ingestion_run_id uuid null
    references public.opportunity_ingestion_run(id) on delete set null;

create index if not exists jobposting_crawl_log_ingestion_run_idx
  on public.jobposting_crawl_log (ingestion_run_id, fetched_at desc);

comment on table public.opportunity_ingestion_run is
  'One row per top-level opportunity scraping or ingestion execution.';

comment on column public.jobposting_crawl_log.ingestion_run_id is
  'Top-level execution that produced this per-company or per-source detail log.';

commit;
