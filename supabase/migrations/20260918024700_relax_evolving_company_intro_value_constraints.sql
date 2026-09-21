-- These values are application vocabulary or operating knobs that are expected
-- to evolve. Keep relational, nullability, uniqueness, non-empty text, date
-- ordering, and consent/privacy constraints in Postgres; avoid requiring a DDL
-- migration for each new lifecycle value or tuning range.
begin;

alter table public.company_roles
  drop constraint if exists company_roles_source_type_check,
  drop constraint if exists company_roles_status_check,
  drop constraint if exists company_roles_work_mode_check;

alter table public.email_reply_jobs
  drop constraint if exists email_reply_jobs_status_check;

alter table public.ops_matching_role_stages
  drop constraint if exists ops_matching_role_stages_meeting_candidate_message_length_check,
  drop constraint if exists ops_matching_role_stages_meeting_duration_check,
  drop constraint if exists ops_matching_role_stages_meeting_purpose_length_check;

alter table public.talent_setting
  drop constraint if exists talent_setting_periodic_interval_check,
  drop constraint if exists talent_setting_recommendation_batch_size_check;

commit;
