alter table public.opportunity_discovery_run
  drop constraint if exists opportunity_discovery_run_target_count_check;

alter table public.opportunity_discovery_run
  drop column if exists target_recommendation_count;
