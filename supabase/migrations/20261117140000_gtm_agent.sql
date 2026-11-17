-- 후보자 소싱 에이전트 (#5, /ops/gtm-plays tab 5): a background agent finds people who are looking for a job
-- (LinkedIn Recruiter "Apply starters" uploaded by Ops, job-seeking posts and profiles on LinkedIn / X / Threads /
-- developer communities / blogs and the open web), picks 2-3 fitting postings for each and emails them.
-- Email is the only contact (Shaun 11/17). Every step of every person is kept, so /ops #5 can show who was
-- contacted, when, with what, why, and what followed.
--
--   gtm_agent_settings  one row: on/off, sender, caps, hours, send mode, per-source settings (edited on /ops #5);
--                       version goes up on every save and each person keeps the version that found them
--   gtm_agent_runs      one row per run (a day's run, an applicant file import, a manual run), leased by the dispatcher
--   gtm_agent_people    one row per person per contact cycle: the person, the signal, the decisions, the message,
--                       the delivery and what came of it; events is the person's timeline
--   gtm_mails           #5 mails are campaign 'agent' (audience candidate, candidate_source null); postings holds
--                       the 2-3 postings of the mail, agent_person_id the person row, rfc_message_id the mail's
--                       RFC Message-ID (what a reply's In-Reply-To names)
--   gtm_agent_mailboxes one row per team mailbox read for replies (agent/replies.server.ts): Gmail's history cursor
--   gtm_agent_spend     one row per paid step (search, email lookup, posting pick, writing), keyed by the Korea-time
--                       day the money was spent: the daily cost cap and /ops #5 "오늘 비용" read it (agent/spend.ts)
--
-- Test rows (is_test) never count in the numbers.

create table if not exists public.gtm_agent_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  -- As #1 and #4 by default (Shaun 11/17); a separate first-contact domain can be set on /ops #5.
  sender_name text default 'Chris Heo',
  sender_email text default 'chris@matchharper.com',
  daily_mail_cap integer not null default 30 check (daily_mail_cap between 0 and 500),
  daily_cost_usd numeric(10, 2) not null default 100 check (daily_cost_usd >= 0),
  -- Mails go out only from send_start_hour to send_end_hour (Korea time) on send_weekdays (0 = Sunday … 6 = Saturday),
  -- spread over the open time of the day (agent/sendTiming.ts): 평일 9~21시 by default. Never outside 8~21시: an ad
  -- mailed from 21:00 to 08:00 needs separate prior consent (agent/people.ts SEND_HOURS_LIMIT).
  send_start_hour integer not null default 9 check (send_start_hour between 8 and 20),
  send_end_hour integer not null default 21 check (send_end_hour between 9 and 21),
  send_weekdays integer[] not null default '{1,2,3,4,5}'
    check (cardinality(send_weekdays) between 1 and 7 and send_weekdays <@ '{0,1,2,3,4,5,6}'::integer[]),
  followup_days integer not null default 7 check (followup_days between 1 and 60),
  quiet_days_after_end integer not null default 90 check (quiet_days_after_end between 0 and 365),
  -- A person without an address the agent may mail gets one paid email lookup (agent/emailLookup.ts, about $0.12)
  -- before being excluded as no_email.
  -- 사람 찾기 settings (agent/tuning.ts SignalSettings): {sources: {<source id>: {enabled, daily, lookFor, keepRule,
  -- minScore, maxAgeDays, budgetUsd, maxRounds, resultsPerSearch, layoffSearch}}, exploreShare, explore, blockedDomains}.
  -- Read through normalizeSignalSettings (missing = defaults, a source not listed is off).
  signals jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.gtm_agent_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.gtm_agent_runs (
  id uuid primary key default gen_random_uuid(),
  -- The Korea-time day the run belongs to (caps and costs are per day).
  run_date date not null,
  -- import: an uploaded applicant file; manual: "지금 실행".
  kind text not null default 'daily' check (kind in ('daily', 'import', 'manual')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'stopped')),
  lease_token uuid,
  lease_expires_at timestamptz,
  -- When a tick last took this run: ticks take the least recently taken run, so an upload waiting on email lookups
  -- never holds back the day's search (and the other way round).
  last_leased_at timestamptz,
  counts jsonb not null default '{}'::jsonb,
  -- 사람 찾기 log per source id (agent/signals.ts SignalLogEntry): {<source>: {tuningVersion, plans [{plan, reason,
  -- stage}], yields [{stage, window, group, query, results, kept, withContact}], keptSamples (headline · signal, no
  -- names), at}}. Later runs' first plans read the last few for their source.
  signal_log jsonb not null default '{}'::jsonb,
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
-- One day's run per Korea-time day (two dispatchers around midnight both try to make it; the second does nothing).
create unique index if not exists gtm_agent_runs_daily_day_key on public.gtm_agent_runs (run_date)
  where kind = 'daily' and not is_test;

create table if not exists public.gtm_agent_people (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.gtm_agent_runs(id) on delete set null,
  -- Where the person was found: a default-list source id (agent/signals.ts: linkedin, threads, okky, velog, ...), or
  -- the registrable domain of the page when it is on no listed platform.
  source text not null check (source ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  -- How: applicant (uploaded LinkedIn "Apply starters" file), open_to_work_profile, signal_post (a post saying they
  -- look), layoff_company (from a company with recent layoff news).
  method text not null check (method in ('applicant', 'open_to_work_profile', 'signal_post', 'layoff_company')),
  -- The settings version (gtm_agent_settings.version) and the source's search tuning version that found the person.
  settings_version integer,
  tuning_version text,
  -- A link the person wrote on their own page (site, GitHub, portfolio): where an email may be looked up.
  contact_url text,
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
    'found', 'excluded', 'no_fit', 'matched', 'drafted', 'approved', 'sent', 'skipped', 'replied', 'ended', 'failed')),
  exclude_reason text,
  -- [{kind: 'external' | 'customer' | 'gtm', roleId, url, companyName, title, why}]
  postings jsonb not null default '[]'::jsonb,
  message_kind text check (message_kind in ('posting', 'posting_post')),
  reason text,
  channel text check (channel in ('email')),
  email text,
  email_source text check (email_source in ('import', 'post', 'lookup')),
  -- The email lookup, when one was started (agent/types.ts AgentEmailLookup): {runId, startedAt, state: running | done,
  -- finishedAt, costUsd, verified, used, emailKind, sourceUrl, reason}. It runs across dispatcher ticks; the address
  -- itself is kept only in email (email_source 'lookup') when it is used.
  email_lookup jsonb,
  language text check (language in ('ko', 'en')),
  draft_subject text,
  draft_body text,
  mail_id uuid references public.gtm_mails(id) on delete set null,
  followup_mail_id uuid references public.gtm_mails(id) on delete set null,
  sent_by uuid,
  sent_at timestamptz,
  skip_reason text,
  reply_text text,
  replied_at timestamptz,
  followup_due_at timestamptz,
  ended_at timestamptz,
  cost_usd numeric(10, 4) not null default 0,
  -- A step that failed for a passing reason (an email lookup that did not start, a model error): how many tries so
  -- far and when the next one may run (agent/tickRules.ts retryDelayMs); the person is given up after 3.
  attempts integer not null default 0,
  retry_at timestamptz,
  is_test boolean not null default false,
  -- The person's timeline, oldest first: [{at, kind, by, note}] (agent/people.ts AgentEvent).
  events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gtm_agent_people_key_idx on public.gtm_agent_people (person_key, created_at desc);
create index if not exists gtm_agent_people_source_idx on public.gtm_agent_people (source, created_at desc);
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
-- The RFC Message-ID Resend gave an agent mail, without <> and lower-cased ('' when Resend had none an hour after
-- sending): a reply whose In-Reply-To / References names it is that mail's reply (agent/replies.ts).
alter table public.gtm_mails add column if not exists rfc_message_id text;
create index if not exists gtm_mails_rfc_message_id_idx on public.gtm_mails (rfc_message_id)
  where rfc_message_id is not null and rfc_message_id <> '';

-- Candidates answer agent mails into the team's Google Workspace mailboxes (Reply-To = the sender). Each dispatcher
-- tick reads the mailboxes in GTM_AGENT_REPLY_MAILBOXES plus the sender (agent/replies.server.ts) from Gmail's
-- history cursor kept here; last_error is the last failed read (e.g. delegation not granted), null after a good one.
create table if not exists public.gtm_agent_mailboxes (
  email text primary key check (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  history_id text,
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

-- What the agent spent, one row per paid step as it happens (agent/spend.server.ts): spent_day is the Korea-time day
-- of the spend (not the run's day), so an upload's lookups a day later count on that later day's cap. An email lookup
-- logs its estimate when it starts and the rest (maybe negative) when it ends. is_test: a test run's (the money is
-- real; /ops shows it apart).
create table if not exists public.gtm_agent_spend (
  id bigint generated always as identity primary key,
  spent_day date not null default ((now() at time zone 'Asia/Seoul')::date),
  spent_at timestamptz not null default now(),
  step text not null check (step in ('search', 'lookup', 'match', 'compose', 'followup')),
  usd numeric(12, 6) not null,
  run_id uuid references public.gtm_agent_runs(id) on delete set null,
  person_id uuid references public.gtm_agent_people(id) on delete set null,
  source text,
  is_test boolean not null default false
);
create index if not exists gtm_agent_spend_day_idx on public.gtm_agent_spend (spent_day);

alter table public.gtm_agent_settings enable row level security;
alter table public.gtm_agent_runs enable row level security;
alter table public.gtm_agent_people enable row level security;
alter table public.gtm_agent_mailboxes enable row level security;
alter table public.gtm_agent_spend enable row level security;
revoke all on public.gtm_agent_settings, public.gtm_agent_runs, public.gtm_agent_people, public.gtm_agent_mailboxes,
  public.gtm_agent_spend from public, anon, authenticated;
grant all on public.gtm_agent_settings, public.gtm_agent_runs, public.gtm_agent_people, public.gtm_agent_mailboxes,
  public.gtm_agent_spend to service_role;

-- One of a #5 mail's Harper Roles (customer or GTM) into the person's inbox, as ensure_gtm_mail_opportunity_v1 does
-- for a #4 mail's one Role: v1's body, for a Role the mail proposed (gtm_mails.postings) instead of only role_id.
create or replace function public.ensure_gtm_mail_opportunity_v2(p_talent uuid, p_mail uuid, p_role uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mail record;
  v_role public.company_roles%rowtype;
  v_workspace public.company_workspace%rowtype;
  v_is_gtm boolean;
  v_allowed jsonb;
  v_rec public.talent_opportunity_recommendation;
  v_created boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:' || p_talent, 0));
  if not exists (select 1 from public.talent_users where user_id = p_talent and deleted_at is null) then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select mail.id, mail.audience, mail.status, mail.provider_message_id, mail.role_id, mail.postings into v_mail
  from public.gtm_mails mail where mail.id = p_mail;
  -- The mail went out (sent, or still 'sending' while the provider already accepted it: its id is known), and the
  -- Role is the mail's own or one of the postings the mail proposed (#5 agent mails carry 2-3). coalesce: a mail
  -- without a main Role (role_id null) must still name the Role in its postings.
  if v_mail.id is null or v_mail.audience <> 'candidate' or p_role is null
    or not (v_mail.status = 'sent' or (v_mail.status = 'sending' and v_mail.provider_message_id is not null))
    or not (coalesce(v_mail.role_id = p_role, false)
      or coalesce(v_mail.postings, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('roleId', p_role::text)))
  then
    return jsonb_build_object('status', 'no_role');
  end if;

  select * into v_role from public.company_roles where role_id = p_role for update;
  if v_role.role_id is null
    or lower(btrim(coalesce(v_role.source_type, ''))) <> 'internal'
    or lower(btrim(coalesce(v_role.status, ''))) not in ('active', 'paused', 'top_priority')
    or coalesce(v_role.is_expired, false)
    or (v_role.expires_at is not null and v_role.expires_at <= now())
    or not exists (select 1 from public.company_internal_roles internal_role where internal_role.role_id = v_role.role_id)
  then
    return jsonb_build_object('status', 'unavailable');
  end if;

  v_is_gtm := v_role.company_workspace_id = '93ecd68d-1cf4-4af8-a5c1-b7cb7e4cb848'::uuid
    and coalesce(v_role.information ->> 'purpose', '') = 'gtm_outreach';
  if lower(coalesce(v_role.information ->> 'testOnly', 'false')) in ('true', '1', 'yes', 'on') and not v_is_gtm then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select * into v_workspace from public.company_workspace where company_workspace_id = v_role.company_workspace_id;
  if exists (
    select 1
    from public.talent_setting setting, unnest(coalesce(setting.blocked_companies, '{}'::text[])) blocked(name)
    where setting.user_id = p_talent
      and (blocked.name = v_workspace.company_workspace_id::text
        or lower(btrim(blocked.name)) in (
          lower(btrim(coalesce(v_workspace.company_name, ''))),
          lower(btrim(coalesce(v_workspace.published_name, ''))),
          lower(btrim(coalesce(v_role.information #>> '{gtm,companyName}', '')))))
      and nullif(btrim(blocked.name), '') is not null
  ) then
    return jsonb_build_object('status', 'blocked');
  end if;

  if v_is_gtm then
    v_allowed := coalesce(v_role.information -> 'testTalentIds', '[]'::jsonb);
    if jsonb_typeof(v_allowed) <> 'array' then v_allowed := '[]'::jsonb; end if;
    if not (v_allowed ? p_talent::text) or nullif(v_role.information ->> 'testFixture', '') is null then
      update public.company_roles
      set information = information || jsonb_build_object(
        'testFixture', coalesce(nullif(information ->> 'testFixture', ''), 'gtm_outreach'),
        'testTalentIds', case when v_allowed ? p_talent::text then v_allowed else v_allowed || to_jsonb(p_talent::text) end)
      where role_id = v_role.role_id;
    end if;
  end if;

  select * into v_rec from public.talent_opportunity_recommendation
  where talent_id = p_talent and role_id = v_role.role_id
  order by created_at desc, id desc limit 1 for update;
  if not found then
    insert into public.talent_opportunity_recommendation(talent_id, role_id, opportunity_type, kind, evidence,
      fit_reasons, preference_fit, tradeoffs)
    values (p_talent, v_role.role_id, 'internal_recommendation', 'match',
      jsonb_build_array(jsonb_build_object('source', 'gtm_mail', 'mailId', p_mail)), '[]', '{}', '[]')
    returning * into v_rec;
    v_created := true;
    insert into public.talent_opportunity_tag(talent_id, opportunity_id, tag)
    values (p_talent, v_role.role_id, '내부:추천') on conflict do nothing;
  end if;
  -- Older writers have a membership trigger; ON CONFLICT also handles those.
  insert into public.talent_opportunity_memberships(talent_id, recommendation_id, role_id, explanation, rank, archived_at)
  values (p_talent, v_rec.id, v_role.role_id, '', coalesce(v_rec.rank, 0),
    case when v_rec.feedback = 'dislike' or v_rec.saved_stage = 'hidden' then now() else null end)
  on conflict do nothing;

  return jsonb_build_object('status', 'added', 'recommendationId', v_rec.id, 'roleId', v_role.role_id,
    'created', v_created);
end;
$$;
revoke all on function public.ensure_gtm_mail_opportunity_v2(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.ensure_gtm_mail_opportunity_v2(uuid, uuid, uuid) to service_role;
