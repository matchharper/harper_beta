alter table public.opportunity_discovery_run
  drop constraint if exists opportunity_discovery_run_target_count_check;

do $$
begin
  alter table public.opportunity_discovery_run
    add constraint opportunity_discovery_run_target_count_check
    check (target_recommendation_count between 1 and 200);
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.talent_opportunity_profile_snapshot (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  source_conversation_id uuid null references public.talent_conversations(id) on delete set null,
  snapshot_hash text not null,
  raw_signals_json jsonb not null default '{}'::jsonb,
  preference_profile_json jsonb not null default '{}'::jsonb,
  snapshot_text text not null default '',
  retrieval_query_text text not null default '',
  snapshot_embedding jsonb null,
  embedding_model text null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.talent_opportunity_profile_snapshot
  add column if not exists retrieval_query_text text not null default '';

update public.talent_opportunity_profile_snapshot
set retrieval_query_text = coalesce(
  nullif(trim(retrieval_query_text), ''),
  nullif(trim(preference_profile_json ->> 'retrievalQueryText'), ''),
  nullif(trim(snapshot_text), ''),
  ''
)
where coalesce(trim(retrieval_query_text), '') = '';

create index if not exists talent_opportunity_profile_snapshot_talent_recent_idx
  on public.talent_opportunity_profile_snapshot (talent_id, created_at desc);

create index if not exists talent_opportunity_profile_snapshot_hash_idx
  on public.talent_opportunity_profile_snapshot (talent_id, snapshot_hash);

create table if not exists public.opportunity_role_match_index (
  role_id uuid primary key references public.company_roles(role_id) on delete cascade,
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  source_type text not null,
  match_text text not null default '',
  embedding jsonb null,
  embedding_model text null,
  embedding_dim integer null,
  quality_score numeric(6,5) not null default 0,
  freshness_score numeric(6,5) not null default 0,
  role_updated_at timestamptz null,
  workspace_updated_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint opportunity_role_match_index_source_type_check
    check (source_type in ('internal', 'external'))
);

create index if not exists opportunity_role_match_index_source_recent_idx
  on public.opportunity_role_match_index (source_type, updated_at desc);

create table if not exists public.talent_opportunity_delivery (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  discovery_run_id uuid not null references public.opportunity_discovery_run(id) on delete cascade,
  channel text not null,
  status text not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz null,
  error_message text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint talent_opportunity_delivery_channel_check
    check (channel in ('chat', 'email', 'no_result')),
  constraint talent_opportunity_delivery_status_check
    check (status in ('queued', 'sent', 'failed', 'skipped'))
);

create index if not exists talent_opportunity_delivery_run_channel_idx
  on public.talent_opportunity_delivery (discovery_run_id, channel, created_at desc);

alter table public.talent_opportunity_profile_snapshot enable row level security;
alter table public.opportunity_role_match_index enable row level security;
alter table public.talent_opportunity_delivery enable row level security;
