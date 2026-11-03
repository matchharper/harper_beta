set local lock_timeout = '5s';
-- The invited person's own "connect" from the link in Harper's invitation. On confirmation Harper
-- emails the person and the company recipients together (To the person, CC the company), the same
-- result as a member accepting a company Intro. Statuses stay free text: accepted -> connecting ->
-- connected. The link token is stored only as a keyed hash, like the reply and opt-out tokens.
alter table public.external_intro_requests
  add column if not exists accept_token_hash text,
  add column if not exists accepted_at timestamptz,
  add column if not exists connect_email_id text,
  add column if not exists connected_at timestamptz;

create unique index if not exists external_intro_requests_accept_token_key
  on public.external_intro_requests(accept_token_hash) where accept_token_hash is not null;
