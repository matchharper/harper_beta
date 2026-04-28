create table if not exists public.talent_mock_interview_session (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  conversation_id uuid not null references public.talent_conversations(id) on delete cascade,
  opportunity_recommendation_id uuid null references public.talent_opportunity_recommendation(id) on delete set null,
  role_id uuid null references public.company_roles(role_id) on delete set null,
  company_name text not null,
  role_title text not null,
  status text not null default 'preparing',
  interview_type text not null default 'mixed',
  duration_minutes integer not null default 15,
  setup_payload jsonb not null default '{}'::jsonb,
  research_payload jsonb not null default '{}'::jsonb,
  feedback_payload jsonb not null default '{}'::jsonb,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint talent_mock_interview_session_status_check
    check (status in ('preparing', 'ready', 'in_progress', 'completed', 'cancelled', 'failed')),
  constraint talent_mock_interview_session_type_check
    check (interview_type in ('technical', 'fit', 'mixed')),
  constraint talent_mock_interview_session_duration_check
    check (duration_minutes between 5 and 60)
);

create index if not exists talent_mock_interview_session_talent_recent_idx
  on public.talent_mock_interview_session (talent_id, created_at desc);

create index if not exists talent_mock_interview_session_conversation_active_idx
  on public.talent_mock_interview_session (conversation_id, status, created_at desc)
  where status in ('preparing', 'ready', 'in_progress');

create or replace function public.set_opportunity_worker_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists talent_mock_interview_session_set_updated_at
  on public.talent_mock_interview_session;
create trigger talent_mock_interview_session_set_updated_at
before update on public.talent_mock_interview_session
for each row execute function public.set_opportunity_worker_updated_at();

alter table public.talent_mock_interview_session enable row level security;

drop policy if exists talent_mock_interview_session_select_own
  on public.talent_mock_interview_session;
create policy talent_mock_interview_session_select_own
  on public.talent_mock_interview_session
  for select
  using (talent_id = auth.uid());

drop policy if exists talent_mock_interview_session_insert_own
  on public.talent_mock_interview_session;
create policy talent_mock_interview_session_insert_own
  on public.talent_mock_interview_session
  for insert
  with check (talent_id = auth.uid());

drop policy if exists talent_mock_interview_session_update_own
  on public.talent_mock_interview_session;
create policy talent_mock_interview_session_update_own
  on public.talent_mock_interview_session
  for update
  using (talent_id = auth.uid())
  with check (talent_id = auth.uid());
