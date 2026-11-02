set local lock_timeout = '5s';
-- Invitation email for a recorded external connection request, and the person's reply.
-- The web dispatcher (cron) sends one invitation per request from Harper's address once
-- an email is found; replies come back through Resend inbound on a per-request address
-- (candidate+<token>@reply domain). Sending is off unless ORG_EXTERNAL_INVITE_SENDING=on.
-- opened_at is the first Resend open event for the invitation (approximate: image
-- blocking hides opens, mail privacy proxies can open on delivery).
-- Status stays free text: requested -> sending -> invited -> replied | declined |
-- unsubscribed | bounced; not_sendable / failed when no invitation can go out; cancelled
-- when the company passed before it went out.
alter table public.external_intro_requests
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists lease_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists recipient_email text,
  add column if not exists reply_token_hash text,
  add column if not exists unsubscribe_token_hash text,
  add column if not exists invite_email_id text,
  add column if not exists invited_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists last_reply_at timestamptz,
  add column if not exists reply_type text,
  add column if not exists error_code text;
create unique index if not exists external_intro_requests_reply_token_key
  on public.external_intro_requests(reply_token_hash) where reply_token_hash is not null;
create unique index if not exists external_intro_requests_unsubscribe_token_key
  on public.external_intro_requests(unsubscribe_token_hash) where unsubscribe_token_hash is not null;
create index if not exists external_intro_requests_invite_email_idx
  on public.external_intro_requests(invite_email_id) where invite_email_id is not null;
create index if not exists external_intro_requests_due_idx
  on public.external_intro_requests(status, available_at);

-- The company's own decision on a shown person from the Role Inbox (Pass), with its reason.
-- company_decision stays free text: intro_requested | passed (Pass also works after a request).
alter table public.external_candidates
  add column if not exists company_decision_reason text,
  add column if not exists company_decided_at timestamptz,
  add column if not exists company_decided_by uuid;

-- Addresses that must never get another external invitation (opt-out, decline,
-- permanent bounce, spam complaint). Only a keyed hash of the address is kept.
create table if not exists public.external_contact_suppressions (
  email_hash text primary key,
  reason text not null,
  external_intro_request_id uuid references public.external_intro_requests(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.external_contact_suppressions enable row level security;
revoke all on public.external_contact_suppressions from public, anon, authenticated;
grant all on public.external_contact_suppressions to service_role;

-- One row per inbound reply job (retries reuse it). The body is the person's newest
-- text only; the company sees the classification and a short summary, not the body.
create table if not exists public.external_candidate_replies (
  id uuid primary key default gen_random_uuid(),
  external_intro_request_id uuid not null references public.external_intro_requests(id) on delete cascade,
  email_reply_job_id uuid not null unique,
  from_email text,
  from_invited_address boolean not null default false,
  subject text,
  body_text text,
  reply_type text,
  summary text,
  classified_at timestamptz,
  company_notice jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists external_candidate_replies_request_idx
  on public.external_candidate_replies(external_intro_request_id, created_at desc);
alter table public.external_candidate_replies enable row level security;
revoke all on public.external_candidate_replies from public, anon, authenticated;
grant all on public.external_candidate_replies to service_role;

-- Replies to an external invitation are handled only by the web runtime: route them
-- away from the legacy talent poller at insert, like company email replies.
create or replace function public.route_company_email_job_v1() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.metadata->>'companyEmail' = 'true' or new.metadata->>'externalCandidateEmail' = 'true' then
    new.worker_target := 'vercel_queue';
  end if;
  return new;
end $$;
