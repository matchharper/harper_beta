-- 후보자 소싱 에이전트 (#5) Ashley's reply agent (agent/ashleyAgent.ts, ashleyReply.server.ts). Idempotent.

-- The Slack thread a person's reply alert went in (the daily numbers post it is a comment under, or the alert itself
-- before the first daily post): Ashley's hand-offs and sent replies go in the same thread (agent/replies.server.ts
-- alertReply sets it; null before the first alert).
alter table public.gtm_agent_people add column if not exists reply_slack_ts text;

-- Spend steps: Ashley's model calls are logged as 'reply'. The fixed list of steps is dropped instead of extended, so a
-- new step never fails a spend write again (the code's AgentSpendStep is the list; AGENTS.md: no constraints the
-- service does not need).
alter table public.gtm_agent_spend drop constraint if exists gtm_agent_spend_step_check;

-- A company's words reach a candidate once per company address and candidate (design 5장 "메일 중계는 한 쌍에 한 번",
-- Shaun 11/20 21:43): the row is claimed before the relay mail is queued, so a second company mail, a second worker
-- or a retry finds it taken. After it, each side gets one fixed answer (candidate_noted_at, company_noted_at). When the
-- company wants to talk, the candidate's notice is the reply to the company's mail and the company's link mail is
-- recorded here (company_link_*).
create table if not exists public.gtm_agent_relays (
  company_email text not null,
  person_id uuid not null references public.gtm_agent_people(id) on delete cascade,
  kind text not null,
  company_mail_id uuid references public.gtm_mails(id) on delete set null,
  inbound_message_id uuid references public.gtm_agent_messages(id) on delete set null,
  candidate_noted_at timestamptz,
  company_noted_at timestamptz,
  company_link_sent_at timestamptz,
  company_link_provider_id text,
  created_at timestamptz not null default now(),
  primary key (company_email, person_id)
);
create index if not exists gtm_agent_relays_person_idx on public.gtm_agent_relays (person_id);

alter table public.gtm_agent_relays enable row level security;
revoke all on public.gtm_agent_relays from public, anon, authenticated;
grant all on public.gtm_agent_relays to service_role;
