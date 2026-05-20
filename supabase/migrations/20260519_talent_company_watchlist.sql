create table if not exists public.talent_company_recommendation (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  conversation_id uuid null references public.talent_conversations(id) on delete set null,
  company_db_id integer not null references public.company_db(id) on delete cascade,
  company_workspace_id uuid null references public.company_workspace(company_workspace_id) on delete set null,
  source text not null default 'tool',
  reason_summary text null,
  recommendation_reasons jsonb not null default '[]'::jsonb,
  signal_summary text null,
  latest_signal text null,
  next_signal text null,
  active_role_count integer not null default 0,
  score numeric null,
  rank integer null,
  viewed_at timestamptz null,
  clicked_at timestamptz null,
  dismissed_at timestamptz null,
  recommended_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint talent_company_recommendation_active_role_count_check
    check (active_role_count >= 0)
);

create unique index if not exists talent_company_recommendation_talent_company_uidx
  on public.talent_company_recommendation (talent_id, company_db_id);

create index if not exists talent_company_recommendation_talent_recent_idx
  on public.talent_company_recommendation (
    talent_id,
    dismissed_at,
    rank asc nulls last,
    recommended_at desc
  );

create index if not exists talent_company_recommendation_talent_fresh_idx
  on public.talent_company_recommendation (
    talent_id,
    dismissed_at,
    recommended_at desc
  );

create table if not exists public.talent_company_follow (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  conversation_id uuid null references public.talent_conversations(id) on delete set null,
  company_db_id integer not null references public.company_db(id) on delete cascade,
  company_workspace_id uuid null references public.company_workspace(company_workspace_id) on delete set null,
  source text not null default 'watchlist',
  tracking_summary text null,
  discovery_channel_summary text null,
  followed_at timestamptz not null default timezone('utc', now()),
  unfollowed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists talent_company_follow_talent_company_uidx
  on public.talent_company_follow (talent_id, company_db_id);

create index if not exists talent_company_follow_talent_active_idx
  on public.talent_company_follow (talent_id, unfollowed_at, followed_at desc);

create index if not exists company_roles_watchlist_active_recent_idx
  on public.company_roles (updated_at desc)
  where status = 'active' and is_expired is not true;

create index if not exists company_roles_watchlist_workspace_recent_idx
  on public.company_roles (
    company_workspace_id,
    posted_at desc nulls last,
    updated_at desc nulls last
  )
  where status = 'active' and is_expired is not true;

create index if not exists company_workspace_company_db_quality_idx
  on public.company_workspace (
    company_db_id,
    test_score desc nulls last,
    updated_at desc nulls last
  );

create or replace function public.set_talent_company_watchlist_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists talent_company_recommendation_set_updated_at
  on public.talent_company_recommendation;

create trigger talent_company_recommendation_set_updated_at
before update on public.talent_company_recommendation
for each row execute function public.set_talent_company_watchlist_updated_at();

drop trigger if exists talent_company_follow_set_updated_at
  on public.talent_company_follow;

create trigger talent_company_follow_set_updated_at
before update on public.talent_company_follow
for each row execute function public.set_talent_company_watchlist_updated_at();

alter table public.talent_company_recommendation enable row level security;
alter table public.talent_company_follow enable row level security;

drop policy if exists talent_company_recommendation_select_own
  on public.talent_company_recommendation;
create policy talent_company_recommendation_select_own
  on public.talent_company_recommendation
  for select
  using (talent_id = auth.uid());

drop policy if exists talent_company_recommendation_insert_own
  on public.talent_company_recommendation;
create policy talent_company_recommendation_insert_own
  on public.talent_company_recommendation
  for insert
  with check (talent_id = auth.uid());

drop policy if exists talent_company_recommendation_update_own
  on public.talent_company_recommendation;
create policy talent_company_recommendation_update_own
  on public.talent_company_recommendation
  for update
  using (talent_id = auth.uid())
  with check (talent_id = auth.uid());

drop policy if exists talent_company_follow_select_own
  on public.talent_company_follow;
create policy talent_company_follow_select_own
  on public.talent_company_follow
  for select
  using (talent_id = auth.uid());

drop policy if exists talent_company_follow_insert_own
  on public.talent_company_follow;
create policy talent_company_follow_insert_own
  on public.talent_company_follow
  for insert
  with check (talent_id = auth.uid());

drop policy if exists talent_company_follow_update_own
  on public.talent_company_follow;
create policy talent_company_follow_update_own
  on public.talent_company_follow
  for update
  using (talent_id = auth.uid())
  with check (talent_id = auth.uid());
