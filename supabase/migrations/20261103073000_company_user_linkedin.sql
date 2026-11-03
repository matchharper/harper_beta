set local lock_timeout = '5s';
-- A company member's own LinkedIn profile, entered in personal settings (optional). Used only where
-- that member is introduced by email to an external person who confirmed a connection.
alter table public.company_users add column if not exists linkedin_url text;
