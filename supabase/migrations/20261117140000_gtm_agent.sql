-- 후보자 아웃리치 에이전트 (#5, /ops/gtm-plays tab 5): a background agent finds people who are looking for a job
-- (LinkedIn Recruiter applicants, #OpenToWork / Threads job-change posts), picks 2-3 fitting postings for each,
-- and mails them (or drafts a message a person sends by hand on LinkedIn / X / Threads). Every step of every person
-- is kept, so /ops #5 can show who was contacted, when, with what, through which channel, and what followed.
--
--   gtm_agent_settings  one row: on/off, sender, caps, hours, sources and channels (edited on /ops #5)
--   gtm_agent_runs      one row per run (a day's run, an import, a manual run), leased by the dispatcher
--   gtm_agent_people    one row per person per contact cycle: the person, the signal, the decisions, the message,
--                       the delivery and what came of it; events is the person's timeline
--   gtm_mails           #5 mails are campaign 'agent' (audience candidate, candidate_source null); postings holds
--                       the 2-3 postings of the mail, agent_person_id the person row
--
-- Test rows (is_test) never count in the numbers.

create table if not exists public.gtm_agent_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  sender_name text,
  sender_email text,
  daily_mail_cap integer not null default 30 check (daily_mail_cap between 0 and 500),
  daily_cost_usd numeric(10, 2) not null default 10 check (daily_cost_usd >= 0),
  send_start_hour integer not null default 8 check (send_start_hour between 0 and 23),
  send_end_hour integer not null default 21 check (send_end_hour between 1 and 24),
  approval_required boolean not null default false,
  followup_days integer not null default 7 check (followup_days between 1 and 60),
  quiet_days_after_end integer not null default 90 check (quiet_days_after_end between 0 and 365),
  own_domain_allowed boolean not null default true,
  sources jsonb not null default '{"recruiter": {"enabled": true, "daily": 30}, "opentowork": {"enabled": false, "daily": 30}, "threads": {"enabled": false, "daily": 30}}'::jsonb,
  channels jsonb not null default '{"linkedin": {"enabled": true, "account": null, "daily": 20}, "x": {"enabled": false, "account": null, "daily": 20}, "threads": {"enabled": false, "account": null, "daily": 20}}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.gtm_agent_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.gtm_agent_runs (
  id uuid primary key default gen_random_uuid(),
  -- The Korea-time day the run belongs to (caps and costs are per day).
  run_date date not null,
  kind text not null default 'daily' check (kind in ('daily', 'import', 'manual')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'stopped')),
  lease_token uuid,
  lease_expires_at timestamptz,
  counts jsonb not null default '{}'::jsonb,
  cost_usd numeric(10, 4) not null default 0,
  error text,
  is_test boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists gtm_agent_runs_status_idx on public.gtm_agent_runs (status, created_at);
create index if not exists gtm_agent_runs_date_idx on public.gtm_agent_runs (run_date desc);

create table if not exists public.gtm_agent_people (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.gtm_agent_runs(id) on delete set null,
  source text not null check (source in ('recruiter', 'opentowork', 'threads', 'manual')),
  -- One person across sources: lower-cased email, else the normalized profile URL (agent/people.ts personKey).
  person_key text not null,
  name text,
  headline text,
  location text,
  current_company text,
  profile_url text,
  profile_text text,
  -- What made the agent pick the person: the post or the application.
  signal_url text,
  signal_text text,
  signal_at timestamptz,
  status text not null default 'found' check (status in (
    'found', 'excluded', 'no_fit', 'matched', 'drafted', 'approved', 'sent', 'queued_human', 'skipped', 'replied',
    'ended', 'failed')),
  exclude_reason text,
  -- [{kind: 'external' | 'customer' | 'gtm', roleId, url, companyName, title, why}]
  postings jsonb not null default '[]'::jsonb,
  message_kind text check (message_kind in ('posting', 'posting_post')),
  reason text,
  channel text check (channel in ('email', 'linkedin', 'x', 'threads')),
  email text,
  email_source text check (email_source in ('import', 'post', 'lookup')),
  language text check (language in ('ko', 'en')),
  draft_subject text,
  draft_body text,
  mail_id uuid references public.gtm_mails(id) on delete set null,
  followup_mail_id uuid references public.gtm_mails(id) on delete set null,
  sent_by uuid,
  sent_account text,
  sent_at timestamptz,
  skip_reason text,
  reply_text text,
  replied_at timestamptz,
  followup_due_at timestamptz,
  ended_at timestamptz,
  cost_usd numeric(10, 4) not null default 0,
  is_test boolean not null default false,
  -- The person's timeline, oldest first: [{at, kind, by, note}] (agent/people.ts AgentEvent).
  events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gtm_agent_people_key_idx on public.gtm_agent_people (person_key, created_at desc);
create index if not exists gtm_agent_people_status_idx on public.gtm_agent_people (status, updated_at);
create index if not exists gtm_agent_people_followup_idx on public.gtm_agent_people (followup_due_at)
  where followup_due_at is not null;
create index if not exists gtm_agent_people_run_idx on public.gtm_agent_people (run_id);

alter table public.gtm_mails drop constraint if exists gtm_mails_campaign_check;
alter table public.gtm_mails add constraint gtm_mails_campaign_check
  check (campaign in ('pool', 'demand', 'outreach', 'agent'));
alter table public.gtm_mails add column if not exists postings jsonb;
alter table public.gtm_mails add column if not exists agent_person_id uuid
  references public.gtm_agent_people(id) on delete set null;
create index if not exists gtm_mails_agent_person_idx on public.gtm_mails (agent_person_id)
  where agent_person_id is not null;

alter table public.gtm_agent_settings enable row level security;
alter table public.gtm_agent_runs enable row level security;
alter table public.gtm_agent_people enable row level security;
revoke all on public.gtm_agent_settings, public.gtm_agent_runs, public.gtm_agent_people from public, anon, authenticated;
grant all on public.gtm_agent_settings, public.gtm_agent_runs, public.gtm_agent_people to service_role;
