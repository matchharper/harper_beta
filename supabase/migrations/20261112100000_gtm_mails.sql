-- GTM plays (Ops /ops/gtm-plays): one row per mail sent from the screen.
--   audience company:   #2 (공고 → 내부 후보 카드, campaign pool) and #3 (관심 쌓인 고객사, campaign demand)
--   audience candidate: #4 (Role 아웃리치, campaign outreach) to a Harper member, an external candidate or a
--                       person from the scraped profile DB (candidate_source member / external / scraped)
-- The log is what the 30-day repeat check and the "보낸 기록" lists read. A candidate mail's id is also the
-- token in its Harper link: when the person opens Harper from it and signs in, the posting is put in their
-- inbox and claimed_* is filled.
-- Opt-outs, bounces and complaints are not stored here: the sender checks the shared
-- external_contact_suppressions list (20261102130000_external_intro_invites.sql) before sending.
create table if not exists public.gtm_mails (
  id uuid primary key default gen_random_uuid(),
  campaign text not null check (campaign in ('pool', 'demand', 'outreach')),
  audience text not null check (audience in ('company', 'candidate')),
  from_name text,
  from_email text not null,
  cc_emails text[] not null default '{}',
  to_email text not null,
  company_name text,
  company_workspace_id uuid references public.company_workspace(company_workspace_id) on delete set null,
  role_id uuid references public.company_roles(role_id) on delete set null,
  posting_url text,
  candidate_source text check (candidate_source in ('member', 'external', 'scraped')),
  candidate_ref text,
  talent_ids uuid[] not null default '{}',
  language text,
  subject text not null,
  html text not null,
  text_body text not null,
  sent_by uuid not null,
  -- sending: written before the provider call, so a second click finds it; then sent or failed.
  -- blocked: refused before sending (opted out / bounced / sent to this address within 30 days).
  status text not null check (status in ('sending', 'sent', 'failed', 'blocked')),
  provider_message_id text,
  error text,
  claimed_talent_id uuid,
  claimed_recommendation_id uuid,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  check (audience = 'candidate' or candidate_source is null)
);

-- to_email is stored lower-cased; the repeat check filters on it as is.
create index if not exists gtm_mails_to_email_created_idx
  on public.gtm_mails (to_email, created_at desc);
create index if not exists gtm_mails_workspace_created_idx
  on public.gtm_mails (company_workspace_id, created_at desc)
  where company_workspace_id is not null;
create index if not exists gtm_mails_role_created_idx
  on public.gtm_mails (role_id, created_at desc)
  where role_id is not null;

alter table public.gtm_mails enable row level security;
revoke all on public.gtm_mails from public, anon, authenticated;
grant all on public.gtm_mails to service_role;
