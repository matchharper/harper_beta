-- gtm agent job-page requests (decided 11/24): "비슷한 공고 추천받기" on Harper's job page. A visitor leaves an email and
-- a LinkedIn URL or a CV, and the agent mails them similar postings through its own steps (agent/request.ts). One
-- gtm_agent_people row per request: method 'request', email_source 'self' (the address they typed), the request's
-- facts in `request`. Additive only: the code before it never writes these values or reads the column.

-- Which ways the agent finds people is the code's to say (agent/types.ts AGENT_METHODS), as is where an address came
-- from (AgentEmailSource): no list in the database to keep in step.
alter table public.gtm_agent_people drop constraint if exists gtm_agent_people_method_check;
alter table public.gtm_agent_people drop constraint if exists gtm_agent_people_email_source_check;

-- The request: the posting they asked from (as the server loaded it), what they gave, the consent's version and time,
-- the hashed IP for the rate limit, and the agent's checks while it waits for postings to mail.
alter table public.gtm_agent_people add column if not exists request jsonb;

-- Today's requests (the job page's gate, the rate limits) and the requests the tick takes up.
create index if not exists gtm_agent_people_request_idx
  on public.gtm_agent_people (created_at) where method = 'request';
