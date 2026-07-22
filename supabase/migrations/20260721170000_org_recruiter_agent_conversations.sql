-- Org recruiter agent conversations are shared at the workspace + role level.

create table if not exists public.company_conversations (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  title text,
  last_message_at timestamptz,
  last_message_id bigint,
  summary_cursor_message_id bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_workspace_id, role_id)
);

create index if not exists idx_company_conversations_workspace_role
  on public.company_conversations(company_workspace_id, role_id);

create index if not exists idx_company_conversations_last_message_at
  on public.company_conversations(company_workspace_id, last_message_at desc);

create table if not exists public.company_messages (
  id bigserial primary key,
  conversation_id uuid not null references public.company_conversations(id) on delete cascade,
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  company_user_id uuid references public.company_users(user_id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  message_type text not null default 'chat',
  model text,
  status text not null default 'completed',
  mentions jsonb not null default '[]'::jsonb,
  thinking_logs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_company_messages_conversation_id_id
  on public.company_messages(conversation_id, id desc);

create index if not exists idx_company_messages_workspace_role_created_at
  on public.company_messages(company_workspace_id, role_id, created_at desc);

create table if not exists public.company_conversation_summaries (
  id bigserial primary key,
  conversation_id uuid not null references public.company_conversations(id) on delete cascade,
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  source_start_message_id bigint not null,
  source_end_message_id bigint not null,
  message_count integer not null,
  content text not null,
  model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (conversation_id, source_start_message_id, source_end_message_id)
);

create index if not exists idx_company_conversation_summaries_conversation_id
  on public.company_conversation_summaries(conversation_id, source_end_message_id desc);

alter table public.company_conversations enable row level security;
alter table public.company_messages enable row level security;
alter table public.company_conversation_summaries enable row level security;

drop policy if exists "company conversations service role only" on public.company_conversations;
create policy "company conversations service role only"
  on public.company_conversations
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "company messages service role only" on public.company_messages;
create policy "company messages service role only"
  on public.company_messages
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "company conversation summaries service role only" on public.company_conversation_summaries;
create policy "company conversation summaries service role only"
  on public.company_conversation_summaries
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
