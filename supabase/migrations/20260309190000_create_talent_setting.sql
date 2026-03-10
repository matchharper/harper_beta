create table if not exists public.talent_setting (
  user_id uuid primary key
    references public.talent_users (user_id)
    on delete cascade,
  profile_visibility text not null default 'exceptional_only'
    check (profile_visibility in ('open_to_matches', 'exceptional_only', 'dont_share')),
  blocked_companies text[] not null default '{}'::text[],
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.talent_setting enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'talent_setting'
      and policyname = 'Users can read own talent_setting'
  ) then
    create policy "Users can read own talent_setting"
      on public.talent_setting
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'talent_setting'
      and policyname = 'Users can insert own talent_setting'
  ) then
    create policy "Users can insert own talent_setting"
      on public.talent_setting
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'talent_setting'
      and policyname = 'Users can update own talent_setting'
  ) then
    create policy "Users can update own talent_setting"
      on public.talent_setting
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;
