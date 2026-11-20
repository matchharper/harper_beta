-- #5 non-customer company mail (agent/companyMail.ts, design 5장 "회사 쪽 흐름"): when candidates show interest in an
-- outside posting, Ashley writes once to that company's hiring address. The mail is a gtm_mails row like the
-- candidate mails (campaign 'agent', audience 'company', so it shares the one daily cap), with agent_person_id the
-- interested candidate it is for and talent_ids the Harper members it counted. The minimum number of candidates is
-- gtm_agent_settings.company_mail_min_candidates (20261121070000_gtm_agent_reply_settings.sql).

-- What one company mail showed and counted (agent/companyMail.ts CompanyMailFacts): S1/S2/S3, N, the interested
-- candidates so far in the thread, the nameless lines and the landing's "직접 관심" cards, the thread headers.
alter table public.gtm_mails add column if not exists company_mail jsonb;
create index if not exists gtm_mails_agent_company_posting_idx
  on public.gtm_mails (posting_url, created_at)
  where campaign = 'agent' and audience = 'company';

-- One row per outside posting a company mail was considered for (posting_url = agent/companyMail.ts postingKey):
-- the strong Harper members last counted for it (recounted after a day or a newer interest), and its hiring
-- address: the posting's own, or the paid lookup's (contact_lookup: the Exa run, as gtm_agent_people.email_lookup).
create table if not exists public.gtm_agent_company_postings (
  posting_url text primary key,
  company_name text,
  members_counted_at timestamptz,
  member_ids uuid[] not null default '{}',
  contact_email text,
  contact_source text,
  contact_lookup jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gtm_agent_company_postings enable row level security;
revoke all on public.gtm_agent_company_postings from public, anon, authenticated;
grant all on public.gtm_agent_company_postings to service_role;
