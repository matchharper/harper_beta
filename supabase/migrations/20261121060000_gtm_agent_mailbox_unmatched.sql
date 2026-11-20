-- #5 reply reading (agent/replies.server.ts) opens only mails threaded to an agent mail; the rest of a team mailbox
-- (LinkedIn notices, sales) is never opened or stored. How many it left unopened, per Korea-time day
-- ({"YYYY-MM-DD": n}), so /ops #5 로그 · 메일 can show the count (agent/conversationViews.server.ts).
alter table public.gtm_agent_mailboxes add column if not exists unmatched_by_day jsonb not null default '{}'::jsonb;
