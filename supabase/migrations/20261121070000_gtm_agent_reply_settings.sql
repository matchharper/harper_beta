-- #5 reply agent settings on /ops (agent/settingsFields.ts). Ashley's replies start switched off: they go on from /ops
-- after the real-reply test. The Slack user hand-offs @mention is set on /ops; empty means no @mention.
alter table public.gtm_agent_settings add column if not exists reply_agent_enabled boolean not null default false;
alter table public.gtm_agent_settings add column if not exists handoff_slack_user_id text;
alter table public.gtm_agent_settings add column if not exists company_mail_min_candidates integer not null default 2
  check (company_mail_min_candidates between 1 and 10);
