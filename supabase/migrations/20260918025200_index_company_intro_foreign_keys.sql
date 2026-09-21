-- Cover the foreign-key columns used by Company-first cleanup, stage handoff,
-- account deletion, and Slack delivery. These tables are new and small enough
-- for ordinary index creation during this migration.
create index if not exists company_intro_candidates_selection_run_idx
  on public.company_intro_candidates (selection_run_id);

create index if not exists company_intro_candidates_talent_idx
  on public.company_intro_candidates (talent_id);

create index if not exists company_intro_candidates_next_stage_idx
  on public.company_intro_candidates (next_stage_id);

create index if not exists company_intro_candidates_requested_by_idx
  on public.company_intro_candidates (requested_by_company_user_id);

create index if not exists company_first_slack_outbox_workspace_idx
  on public.company_first_slack_outbox (company_workspace_id);

create index if not exists company_first_slack_outbox_channel_idx
  on public.company_first_slack_outbox (channel_id);
