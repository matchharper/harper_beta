alter table public.talent_opportunity_recommendation
  add column if not exists preference_fit jsonb not null default '{}'::jsonb;
