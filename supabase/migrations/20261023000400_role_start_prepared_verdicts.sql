-- Verdicts written ahead of confirmation while the team reviews the Brief.
-- entries: talentId → {briefHash, verdict, usd, at}; stats: used/discarded counts and cost.
alter table public.company_role_start_sessions
  add column if not exists prepared jsonb not null default '{"entries": {}, "stats": {}}'::jsonb;
