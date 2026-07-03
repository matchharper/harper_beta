create extension if not exists pgcrypto;

create table if not exists public.opportunity_scheduler_checks (
  id uuid primary key default gen_random_uuid(),
  talent_id text not null,
  conversation_id text,
  check_kind text not null default 'periodic_refresh',
  status text not null default 'skipped',
  check_payload jsonb not null default '{}'::jsonb,
  skip_reasons text[] not null default '{}',
  discovery_run_id uuid references public.opportunity_discovery_run(id) on delete set null,
  dedupe_key text,
  checked_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint opportunity_scheduler_checks_kind_check
    check (check_kind in ('periodic_refresh')),
  constraint opportunity_scheduler_checks_status_check
    check (status in ('queued', 'skipped', 'failed')),
  constraint opportunity_scheduler_checks_payload_object_check
    check (jsonb_typeof(check_payload) = 'object')
);

comment on table public.opportunity_scheduler_checks is
  'Lightweight scheduler audit/checkpoint table. opportunity_discovery_run rows are reserved for agent/LLM execution.';

comment on column public.opportunity_scheduler_checks.checked_at is
  'Timestamp used as the periodic refresh check cadence anchor.';

create index if not exists opportunity_scheduler_checks_talent_kind_checked_idx
  on public.opportunity_scheduler_checks (talent_id, check_kind, checked_at desc);

create index if not exists opportunity_scheduler_checks_status_checked_idx
  on public.opportunity_scheduler_checks (status, checked_at desc);

create unique index if not exists opportunity_scheduler_checks_dedupe_key_uidx
  on public.opportunity_scheduler_checks (dedupe_key)
  where dedupe_key is not null;
