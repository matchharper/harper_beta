-- Latest role-start re-evaluations are a regenerable session cache, not the
-- durable company_role_candidate_evaluations search ledger. Keep that ledger
-- and its run/stage/version contract untouched.
alter table public.company_role_start_sessions
  add column if not exists criterion_evaluations jsonb not null default '{}'::jsonb;
