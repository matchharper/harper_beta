begin;

alter table public.opportunity_discovery_run
  drop constraint if exists opportunity_discovery_run_trigger_check;

alter table public.opportunity_discovery_run
  add constraint opportunity_discovery_run_trigger_check
  check (
    trigger = any (
      array[
        'conversation_completed'::text,
        'immediate_opportunity_requested'::text,
        'all_batch_feedback_submitted'::text,
        'preference_became_more_active'::text,
        'periodic_refresh_due'::text,
        'company_request_followup_due'::text
      ]
    )
  ) not valid;

alter table public.opportunity_discovery_run
  validate constraint opportunity_discovery_run_trigger_check;

commit;
