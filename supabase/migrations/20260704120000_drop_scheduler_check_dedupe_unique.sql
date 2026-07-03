drop index if exists public.opportunity_scheduler_checks_dedupe_key_uidx;

comment on column public.opportunity_scheduler_checks.dedupe_key is
  'Legacy diagnostic key. Scheduler checks are audit rows and are intentionally not deduplicated.';
