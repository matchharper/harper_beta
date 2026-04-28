create extension if not exists pgcrypto;

alter table public.talent_opportunity_recommendation
  add column if not exists discovery_run_id uuid null,
  add column if not exists fit_summary text null,
  add column if not exists fit_reasons jsonb not null default '[]'::jsonb,
  add column if not exists tradeoffs jsonb not null default '[]'::jsonb,
  add column if not exists evidence jsonb not null default '[]'::jsonb,
  add column if not exists confidence numeric(6,5) null,
  add column if not exists ranking_notes text null,
  add column if not exists recommendation_status text not null default 'ready';

do $$
begin
  alter table public.talent_opportunity_recommendation
    add constraint talent_opportunity_recommendation_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1));
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.talent_opportunity_recommendation
    add constraint talent_opportunity_recommendation_status_check
    check (recommendation_status in ('ready', 'needs_review', 'stale', 'hidden'));
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.opportunity_discovery_run (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid null references public.talent_users(user_id) on delete cascade,
  conversation_id uuid null references public.talent_conversations(id) on delete set null,
  status text not null default 'queued',
  trigger text not null,
  run_mode text not null default 'initial',
  target_recommendation_count integer not null default 10,
  chat_preview_count integer not null default 3,
  settings_snapshot jsonb not null default '{}'::jsonb,
  trigger_payload jsonb not null default '{}'::jsonb,
  user_brief jsonb not null default '{}'::jsonb,
  query_plan jsonb not null default '{}'::jsonb,
  coverage jsonb not null default '{}'::jsonb,
  error_message text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint opportunity_discovery_run_status_check
    check (status in ('queued', 'running', 'completed', 'failed', 'partial')),
  constraint opportunity_discovery_run_trigger_check
    check (
      trigger in (
        'conversation_completed',
        'immediate_opportunity_requested',
        'all_batch_feedback_submitted',
        'preference_became_more_active',
        'periodic_refresh_due'
      )
    ),
  constraint opportunity_discovery_run_mode_check
    check (run_mode in ('initial', 'immediate', 'refine', 'refresh')),
  constraint opportunity_discovery_run_target_count_check
    check (target_recommendation_count between 1 and 20),
  constraint opportunity_discovery_run_preview_count_check
    check (chat_preview_count between 0 and 10)
);

alter table public.talent_opportunity_recommendation
  drop constraint if exists talent_opportunity_recommendation_discovery_run_fkey;

alter table public.talent_opportunity_recommendation
  add constraint talent_opportunity_recommendation_discovery_run_fkey
  foreign key (discovery_run_id)
  references public.opportunity_discovery_run(id)
  on delete set null;

create table if not exists public.opportunity_ingestion_run (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued',
  trigger text not null default 'scheduled_refresh',
  source_scope jsonb not null default '{}'::jsonb,
  coverage jsonb not null default '{}'::jsonb,
  error_message text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint opportunity_ingestion_run_status_check
    check (status in ('queued', 'running', 'completed', 'failed', 'partial')),
  constraint opportunity_ingestion_run_trigger_check
    check (trigger in ('scheduled_refresh', 'manual_admin_refresh', 'scope_expanded'))
);

create table if not exists public.talent_recommendation_settings (
  talent_id uuid primary key references public.talent_users(user_id) on delete cascade,
  recommendation_batch_size integer not null default 10,
  periodic_enabled boolean not null default true,
  periodic_interval_days integer not null default 7,
  last_periodic_run_at timestamptz null,
  updated_by text not null default 'user_settings',
  source_conversation_id uuid null references public.talent_conversations(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint talent_recommendation_settings_batch_size_check
    check (recommendation_batch_size between 1 and 20),
  constraint talent_recommendation_settings_interval_check
    check (periodic_interval_days between 1 and 30),
  constraint talent_recommendation_settings_updated_by_check
    check (updated_by in ('user_settings', 'conversation', 'admin'))
);

create table if not exists public.opportunity_source_document (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  source_type text not null default 'job_posting',
  provider text not null,
  content_hash text null,
  raw_title text null,
  raw_text_summary text null,
  fetched_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz null,
  status text not null default 'fresh',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint opportunity_source_document_type_check
    check (source_type in ('job_posting', 'career_page', 'company_homepage', 'news', 'interview_article')),
  constraint opportunity_source_document_status_check
    check (status in ('fresh', 'stale', 'blocked', 'not_found', 'parse_failed'))
);

create unique index if not exists opportunity_source_document_url_hash_uidx
  on public.opportunity_source_document (source_url, content_hash)
  where content_hash is not null;

create table if not exists public.opportunity_source_registry (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  company_workspace_id uuid null references public.company_workspace(company_workspace_id) on delete cascade,
  base_url text not null,
  search_url_template text null,
  parser_type text null,
  role_family_tags text[] not null default '{}'::text[],
  keyword_tags text[] not null default '{}'::text[],
  location_tags text[] not null default '{}'::text[],
  company_archetype_tags text[] not null default '{}'::text[],
  priority integer not null default 50,
  demand_score integer not null default 0,
  enabled boolean not null default true,
  allowed_access_mode text not null default 'public_page',
  rate_limit_per_minute integer null,
  default_ttl_hours integer not null default 24,
  refresh_interval_hours integer not null default 24,
  next_refresh_at timestamptz null default timezone('utc', now()),
  created_from_run_id uuid null references public.opportunity_discovery_run(id) on delete set null,
  last_checked_at timestamptz null,
  last_success_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint opportunity_source_registry_access_mode_check
    check (allowed_access_mode in ('api', 'public_page', 'manual', 'blocked')),
  constraint opportunity_source_registry_priority_check
    check (priority between 0 and 100),
  constraint opportunity_source_registry_ttl_check
    check (default_ttl_hours > 0 and refresh_interval_hours > 0)
);

create unique index if not exists opportunity_source_registry_provider_base_url_uidx
  on public.opportunity_source_registry (provider, base_url);

create table if not exists public.opportunity_market_scan_scope (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  query text not null,
  role_family text null,
  excluded_role_family text null,
  location text null,
  company_archetype text null,
  keyword_tags text[] not null default '{}'::text[],
  priority integer not null default 50,
  demand_score integer not null default 0,
  enabled boolean not null default true,
  allowed_access_mode text not null default 'public_page',
  refresh_interval_hours integer not null default 24,
  next_refresh_at timestamptz null default timezone('utc', now()),
  created_from text not null default 'seed',
  created_from_run_id uuid null references public.opportunity_discovery_run(id) on delete set null,
  last_checked_at timestamptz null,
  last_success_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint opportunity_market_scan_scope_access_mode_check
    check (allowed_access_mode in ('api', 'public_page', 'manual', 'blocked')),
  constraint opportunity_market_scan_scope_created_from_check
    check (created_from in ('seed', 'admin', 'user_discovery_run')),
  constraint opportunity_market_scan_scope_priority_check
    check (priority between 0 and 100),
  constraint opportunity_market_scan_scope_refresh_check
    check (refresh_interval_hours > 0)
);

create unique index if not exists opportunity_market_scan_scope_provider_query_uidx
  on public.opportunity_market_scan_scope (
    provider,
    query,
    (coalesce(location, '')),
    (coalesce(role_family, ''))
  );

create table if not exists public.talent_opportunity_chat_preview (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.talent_conversations(id) on delete cascade,
  assistant_message_id bigint not null references public.talent_messages(id) on delete cascade,
  discovery_run_id uuid not null references public.opportunity_discovery_run(id) on delete cascade,
  recommendation_id uuid not null references public.talent_opportunity_recommendation(id) on delete cascade,
  rank integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint talent_opportunity_chat_preview_rank_check
    check (rank > 0)
);

create unique index if not exists talent_opportunity_chat_preview_message_rank_uidx
  on public.talent_opportunity_chat_preview (assistant_message_id, rank);

create index if not exists opportunity_discovery_run_talent_recent_idx
  on public.opportunity_discovery_run (talent_id, created_at desc);

create index if not exists opportunity_discovery_run_conversation_active_idx
  on public.opportunity_discovery_run (conversation_id, status, created_at desc)
  where status in ('queued', 'running');

create index if not exists opportunity_ingestion_run_recent_idx
  on public.opportunity_ingestion_run (created_at desc);

create index if not exists opportunity_source_registry_due_idx
  on public.opportunity_source_registry (enabled, next_refresh_at, priority desc);

create index if not exists opportunity_market_scan_scope_due_idx
  on public.opportunity_market_scan_scope (enabled, next_refresh_at, priority desc);

create index if not exists talent_opportunity_recommendation_run_rank_idx
  on public.talent_opportunity_recommendation (discovery_run_id, rank);

create or replace function public.set_opportunity_worker_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists opportunity_discovery_run_set_updated_at
  on public.opportunity_discovery_run;
create trigger opportunity_discovery_run_set_updated_at
before update on public.opportunity_discovery_run
for each row execute function public.set_opportunity_worker_updated_at();

drop trigger if exists opportunity_ingestion_run_set_updated_at
  on public.opportunity_ingestion_run;
create trigger opportunity_ingestion_run_set_updated_at
before update on public.opportunity_ingestion_run
for each row execute function public.set_opportunity_worker_updated_at();

drop trigger if exists talent_recommendation_settings_set_updated_at
  on public.talent_recommendation_settings;
create trigger talent_recommendation_settings_set_updated_at
before update on public.talent_recommendation_settings
for each row execute function public.set_opportunity_worker_updated_at();

drop trigger if exists opportunity_source_document_set_updated_at
  on public.opportunity_source_document;
create trigger opportunity_source_document_set_updated_at
before update on public.opportunity_source_document
for each row execute function public.set_opportunity_worker_updated_at();

drop trigger if exists opportunity_source_registry_set_updated_at
  on public.opportunity_source_registry;
create trigger opportunity_source_registry_set_updated_at
before update on public.opportunity_source_registry
for each row execute function public.set_opportunity_worker_updated_at();

drop trigger if exists opportunity_market_scan_scope_set_updated_at
  on public.opportunity_market_scan_scope;
create trigger opportunity_market_scan_scope_set_updated_at
before update on public.opportunity_market_scan_scope
for each row execute function public.set_opportunity_worker_updated_at();

alter table public.opportunity_discovery_run enable row level security;
alter table public.opportunity_ingestion_run enable row level security;
alter table public.talent_recommendation_settings enable row level security;
alter table public.opportunity_source_document enable row level security;
alter table public.opportunity_source_registry enable row level security;
alter table public.opportunity_market_scan_scope enable row level security;
alter table public.talent_opportunity_chat_preview enable row level security;

drop policy if exists opportunity_discovery_run_select_own
  on public.opportunity_discovery_run;
create policy opportunity_discovery_run_select_own
  on public.opportunity_discovery_run
  for select
  using (talent_id = auth.uid());

drop policy if exists talent_recommendation_settings_select_own
  on public.talent_recommendation_settings;
create policy talent_recommendation_settings_select_own
  on public.talent_recommendation_settings
  for select
  using (talent_id = auth.uid());

drop policy if exists talent_recommendation_settings_update_own
  on public.talent_recommendation_settings;
create policy talent_recommendation_settings_update_own
  on public.talent_recommendation_settings
  for update
  using (talent_id = auth.uid())
  with check (talent_id = auth.uid());

drop policy if exists talent_recommendation_settings_insert_own
  on public.talent_recommendation_settings;
create policy talent_recommendation_settings_insert_own
  on public.talent_recommendation_settings
  for insert
  with check (talent_id = auth.uid());

drop policy if exists talent_opportunity_chat_preview_select_own
  on public.talent_opportunity_chat_preview;
create policy talent_opportunity_chat_preview_select_own
  on public.talent_opportunity_chat_preview
  for select
  using (
    exists (
      select 1
      from public.talent_conversations tc
      where tc.id = talent_opportunity_chat_preview.conversation_id
        and tc.user_id = auth.uid()
    )
  );
