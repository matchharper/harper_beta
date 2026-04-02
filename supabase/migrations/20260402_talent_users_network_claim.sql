alter table public.talent_users
  add column if not exists network_waitlist_id bigint null,
  add column if not exists network_source_talent_id uuid null,
  add column if not exists network_application jsonb not null default '{}'::jsonb;

create unique index if not exists talent_users_network_waitlist_uidx
  on public.talent_users (network_waitlist_id)
  where network_waitlist_id is not null;

create index if not exists talent_users_network_source_talent_idx
  on public.talent_users (network_source_talent_id)
  where network_source_talent_id is not null;
