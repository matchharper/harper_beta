drop table if exists public.talent_update_logs;

create table if not exists public.talent_activity_events (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  conversation_id uuid null references public.talent_conversations(id) on delete set null,
  message_id bigint null references public.talent_messages(id) on delete set null,
  source text not null default 'system',
  event_type text not null,
  summary text not null,
  impact_level text not null default 'low',
  changed_domains text[] not null default '{}'::text[],
  related_entity_type text null,
  related_entity_id text null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint talent_activity_events_impact_level_check
    check (impact_level in ('low', 'medium', 'high')),
  constraint talent_activity_events_summary_not_empty_check
    check (length(trim(summary)) > 0)
);

create index if not exists talent_activity_events_talent_recent_idx
  on public.talent_activity_events (talent_id, occurred_at desc, created_at desc);

create index if not exists talent_activity_events_conversation_recent_idx
  on public.talent_activity_events (conversation_id, occurred_at desc, created_at desc)
  where conversation_id is not null;

create index if not exists talent_activity_events_type_recent_idx
  on public.talent_activity_events (talent_id, event_type, occurred_at desc);

create index if not exists talent_activity_events_changed_domains_idx
  on public.talent_activity_events using gin (changed_domains);

alter table public.talent_activity_events enable row level security;

drop policy if exists talent_activity_events_select_own
  on public.talent_activity_events;
create policy talent_activity_events_select_own
  on public.talent_activity_events
  for select
  using (talent_id = auth.uid());

drop policy if exists talent_activity_events_insert_own
  on public.talent_activity_events;
create policy talent_activity_events_insert_own
  on public.talent_activity_events
  for insert
  with check (talent_id = auth.uid());
