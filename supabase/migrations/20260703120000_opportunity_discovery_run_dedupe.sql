alter table public.opportunity_discovery_run
  add column if not exists dedupe_key text;

comment on column public.opportunity_discovery_run.dedupe_key is
  'Optional idempotency key for enqueue paths that must create at most one logical discovery run.';

create unique index if not exists opportunity_discovery_run_dedupe_key_uidx
  on public.opportunity_discovery_run (dedupe_key)
  where dedupe_key is not null;

drop index if exists public.opportunity_discovery_run_active_talent_uidx;

create unique index if not exists opportunity_discovery_run_active_periodic_talent_uidx
  on public.opportunity_discovery_run (talent_id)
  where talent_id is not null
    and trigger = 'periodic_refresh_due'
    and status in ('queued', 'running');
