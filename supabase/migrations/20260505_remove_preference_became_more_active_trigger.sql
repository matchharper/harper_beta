alter table public.opportunity_discovery_run
  drop constraint if exists opportunity_discovery_run_trigger_check;

alter table public.opportunity_discovery_run
  add constraint opportunity_discovery_run_trigger_check
  check (
    trigger in (
      'conversation_completed',
      'immediate_opportunity_requested',
      'all_batch_feedback_submitted',
      'periodic_refresh_due'
    )
  );
