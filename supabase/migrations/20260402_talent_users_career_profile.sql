alter table public.talent_users
  add column if not exists career_profile jsonb not null default '{}'::jsonb,
  add column if not exists career_profile_initialized_at timestamptz null,
  add column if not exists network_claimed_at timestamptz null;
