create extension if not exists pgcrypto;

create table if not exists public.talent_network_referral_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  token text not null,
  source text not null,
  sharer_email text not null,
  sharer_name text null,
  sharer_local_id text null,
  created_from_path text null,
  visit_count integer not null default 0,
  first_visited_at timestamptz null,
  last_visited_at timestamptz null,
  first_visitor_local_id text null,
  last_visitor_local_id text null,
  last_visited_path text null,
  conversion_count integer not null default 0,
  first_converted_at timestamptz null,
  last_converted_at timestamptz null,
  last_converted_email text null,
  last_converted_name text null,
  last_converted_local_id text null,
  last_converted_role text null,
  constraint talent_network_referral_links_token_key unique (token),
  constraint talent_network_referral_links_source_check check (
    source in ('onboarding_step6', 'landing_footer')
  )
);

create index if not exists talent_network_referral_links_sharer_email_idx
  on public.talent_network_referral_links (sharer_email);

create index if not exists talent_network_referral_links_source_idx
  on public.talent_network_referral_links (source);

create index if not exists talent_network_referral_links_last_converted_local_id_idx
  on public.talent_network_referral_links (last_converted_local_id)
  where last_converted_local_id is not null;

alter table public.talent_network_referral_links enable row level security;
