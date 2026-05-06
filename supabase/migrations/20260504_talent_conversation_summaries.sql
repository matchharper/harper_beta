create table if not exists public.talent_conversation_summaries (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  conversation_id uuid not null references public.talent_conversations(id) on delete cascade,
  from_message_id bigint null references public.talent_messages(id) on delete set null,
  to_message_id bigint not null references public.talent_messages(id) on delete cascade,
  message_count integer not null default 0,
  source_char_count integer not null default 0,
  summary_text text not null default '',
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint talent_conversation_summaries_message_count_check
    check (message_count >= 0),
  constraint talent_conversation_summaries_source_char_count_check
    check (source_char_count >= 0)
);

create index if not exists talent_conversation_summaries_conversation_recent_idx
  on public.talent_conversation_summaries (conversation_id, created_at desc);

create index if not exists talent_conversation_summaries_talent_recent_idx
  on public.talent_conversation_summaries (talent_id, created_at desc);

create unique index if not exists talent_conversation_summaries_to_message_uidx
  on public.talent_conversation_summaries (conversation_id, to_message_id);

alter table public.talent_conversation_summaries enable row level security;

drop policy if exists talent_conversation_summaries_select_own
  on public.talent_conversation_summaries;
create policy talent_conversation_summaries_select_own
  on public.talent_conversation_summaries
  for select
  using (talent_id = auth.uid());

drop policy if exists talent_conversation_summaries_insert_own
  on public.talent_conversation_summaries;
create policy talent_conversation_summaries_insert_own
  on public.talent_conversation_summaries
  for insert
  with check (talent_id = auth.uid());
