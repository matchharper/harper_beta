create extension if not exists pgcrypto;

create table if not exists public.talent_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.talent_users(user_id) on delete cascade,
  conversation_id uuid null references public.talent_conversations(id) on delete set null,
  kind text not null,
  status text not null default 'active',
  state jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default timezone('utc', now()),
  last_active_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint talent_calls_kind_not_empty_check check (length(btrim(kind)) > 0),
  constraint talent_calls_status_check check (
    status in ('active', 'completed', 'abandoned')
  ),
  constraint talent_calls_state_object_check check (
    jsonb_typeof(state) = 'object'
  )
);

create index if not exists talent_calls_user_recent_idx
  on public.talent_calls (user_id, last_active_at desc, created_at desc);

create index if not exists talent_calls_conversation_idx
  on public.talent_calls (conversation_id)
  where conversation_id is not null;

create unique index if not exists talent_calls_one_active_career_onboarding_uidx
  on public.talent_calls (user_id, kind)
  where kind = 'career_onboarding' and status = 'active';

alter table public.talent_calls enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.talent_calls to service_role';
  end if;

  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    execute 'grant select, insert, update on public.talent_calls to harper_worker';

    execute 'drop policy if exists talent_calls_harper_worker_all on public.talent_calls';
    execute 'create policy talent_calls_harper_worker_all on public.talent_calls for all to harper_worker using (true) with check (true)';
  end if;
end;
$$;
