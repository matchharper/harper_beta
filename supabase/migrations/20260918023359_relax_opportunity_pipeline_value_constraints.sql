-- Product vocabulary and scoring ranges evolve in application code. Keep hard
-- relational/nullability/JSON-shape integrity in Postgres, but do not require a
-- schema migration whenever a worker adds a run state, trigger, channel,
-- recommendation kind/type, rank convention, or score scale.
begin;

alter table public.opportunity_discovery_run
  drop constraint if exists opportunity_discovery_run_mode_check,
  drop constraint if exists opportunity_discovery_run_status_check,
  drop constraint if exists opportunity_discovery_run_target_count_check,
  drop constraint if exists opportunity_discovery_run_trigger_check;

alter table public.talent_opportunity_recommendation
  drop constraint if exists talent_opportunity_recommendation_feedback_check,
  drop constraint if exists talent_opportunity_recommendation_kind_check,
  drop constraint if exists talent_opportunity_recommendation_opportunity_type_check,
  drop constraint if exists talent_opportunity_recommendation_rank_check,
  drop constraint if exists talent_opportunity_recommendation_score_check;

alter table public.talent_opportunity_delivery
  drop constraint if exists talent_opportunity_delivery_channel_check,
  drop constraint if exists talent_opportunity_delivery_status_check;

alter table public.career_email_messages
  drop constraint if exists career_email_messages_direction_check,
  drop constraint if exists career_email_messages_status_check;

commit;
