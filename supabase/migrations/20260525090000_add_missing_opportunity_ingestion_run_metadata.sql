alter table public.opportunity_ingestion_run
  add column if not exists coverage jsonb not null default '{}'::jsonb,
  add column if not exists source_scope jsonb not null default '{}'::jsonb,
  add column if not exists trigger text not null default 'scheduled_refresh';

