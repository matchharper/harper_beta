-- Harper's suggestions on a Role's To-do ("이거 할까요?"), the kinds a
-- team asked Harper to stop suggesting, and the updates each person has read.
--
-- company_todo_suggestions: one row per suggestion. `title` is the line the
--   team reads, `plan` is what Harper does once the team says go, both
--   written by the company-side LLM. status moves pending → approved → done,
--   or pending → dismissed; a pending row past expires_at is no longer shown.
--   The approval is sent to the Role chat as the team's own message
--   (approval_message_id), and the reply to it marks the work done.
--   `source` is where it was suggested (web chat, Slack); kind is free text.
--   `talent_stages` records each named candidate's pipeline column when the
--   suggestion was made; once a candidate has moved on, the suggestion is
--   no longer shown.
-- company_todo_suggestion_mutes: "이런 제안 그만". The company-side LLM reads
--   these before suggesting; nothing filters suggestions by keyword.
create table if not exists public.company_todo_suggestions (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  kind text not null,
  title text not null,
  plan text not null,
  talent_ids uuid[] not null default '{}',
  talent_stages jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  source text,
  conversation_id uuid,
  slack_thread_id uuid,
  expires_at timestamptz not null default now() + interval '3 days',
  decided_at timestamptz,
  decided_by uuid,
  approval_message_id bigint,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Added after the first local version of this table.
alter table public.company_todo_suggestions
  add column if not exists talent_stages jsonb not null default '{}'::jsonb;

create index if not exists company_todo_suggestions_role_idx
  on public.company_todo_suggestions (role_id, status, created_at desc);

create table if not exists public.company_todo_suggestion_mutes (
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  kind text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (role_id, kind)
);

alter table public.company_todo_suggestions enable row level security;
alter table public.company_todo_suggestion_mutes enable row level security;
revoke all on public.company_todo_suggestions from public, anon, authenticated;
revoke all on public.company_todo_suggestion_mutes from public, anon, authenticated;
grant all on public.company_todo_suggestions to service_role;
grant all on public.company_todo_suggestion_mutes to service_role;

-- company_todo_reads: updates (알림) a person marked as read on a Role's
-- To-do. Per person, so one teammate reading does not hide it for others.
create table if not exists public.company_todo_reads (
  user_id uuid not null,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  item_id text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, role_id, item_id)
);

alter table public.company_todo_reads enable row level security;
revoke all on public.company_todo_reads from public, anon, authenticated;
grant all on public.company_todo_reads to service_role;
