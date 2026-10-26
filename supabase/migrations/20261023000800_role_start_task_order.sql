set local lock_timeout = '5s';
-- Background role start work is ordered and claimed in the database, not in
-- one server's memory: answers are refined in order (refined_answers counts
-- the answers already handled) and a running step holds a lease that expires.
alter table public.company_role_start_sessions
  add column if not exists refined_answers int not null default 0,
  add column if not exists leases jsonb not null default '{}'::jsonb;
update public.company_role_start_sessions
set refined_answers = coalesce(jsonb_array_length(questions->'history'), 0)
where refined_answers = 0;
