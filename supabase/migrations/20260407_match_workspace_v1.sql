create extension if not exists pgcrypto;

create table if not exists public.company_workspace (
  company_workspace_id uuid primary key default gen_random_uuid(),
  company_name text not null,
  homepage_url text null,
  linkedin_url text null,
  logo_url text null,
  company_description text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.company_roles (
  role_id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  name text not null,
  external_jd_url text null,
  description text null,
  information jsonb null default '{}'::jsonb,
  type text[] not null default '{}'::text[],
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.company_user_workspace (
  id uuid primary key default gen_random_uuid(),
  company_user_id uuid not null references public.company_users(user_id) on delete cascade,
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  role text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint company_user_workspace_unique unique (company_user_id, company_workspace_id)
);

create table if not exists public.company_role_matched (
  id uuid primary key default gen_random_uuid(),
  candid_id uuid not null references public.candid(id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  harper_memo text null,
  status text not null default 'pending',
  feedback_text text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint company_role_matched_unique unique (candid_id, role_id)
);

create index if not exists company_workspace_updated_idx
  on public.company_workspace (updated_at desc);

create index if not exists company_roles_workspace_updated_idx
  on public.company_roles (company_workspace_id, updated_at desc);

create index if not exists company_user_workspace_user_idx
  on public.company_user_workspace (company_user_id, company_workspace_id);

create index if not exists company_role_matched_role_updated_idx
  on public.company_role_matched (role_id, updated_at desc);

create index if not exists company_role_matched_candidate_idx
  on public.company_role_matched (candid_id, updated_at desc);

do $$
begin
  alter table public.company_roles
    add constraint company_roles_status_check
    check (status in ('top_priority', 'active', 'ended', 'paused'));
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.company_roles
    add constraint company_roles_type_check
    check (
      coalesce(type, '{}'::text[]) <@ array['full_time', 'part_time']::text[]
    );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.company_role_matched
    add constraint company_role_matched_status_check
    check (status in ('pending', 'requested', 'rejected', 'hold'));
exception
  when duplicate_object then null;
end
$$;

alter table public.company_workspace enable row level security;
alter table public.company_roles enable row level security;
alter table public.company_user_workspace enable row level security;
alter table public.company_role_matched enable row level security;

drop policy if exists company_workspace_select_member on public.company_workspace;
create policy company_workspace_select_member
  on public.company_workspace
  for select
  using (
    exists (
      select 1
      from public.company_user_workspace cuw
      where cuw.company_workspace_id = company_workspace.company_workspace_id
        and cuw.company_user_id = auth.uid()
    )
  );

drop policy if exists company_workspace_update_member on public.company_workspace;
create policy company_workspace_update_member
  on public.company_workspace
  for update
  using (
    exists (
      select 1
      from public.company_user_workspace cuw
      where cuw.company_workspace_id = company_workspace.company_workspace_id
        and cuw.company_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.company_user_workspace cuw
      where cuw.company_workspace_id = company_workspace.company_workspace_id
        and cuw.company_user_id = auth.uid()
    )
  );

drop policy if exists company_workspace_insert_authenticated on public.company_workspace;
create policy company_workspace_insert_authenticated
  on public.company_workspace
  for insert
  with check (auth.uid() is not null);

drop policy if exists company_roles_select_member on public.company_roles;
create policy company_roles_select_member
  on public.company_roles
  for select
  using (
    exists (
      select 1
      from public.company_user_workspace cuw
      where cuw.company_workspace_id = company_roles.company_workspace_id
        and cuw.company_user_id = auth.uid()
    )
  );

drop policy if exists company_roles_insert_member on public.company_roles;
create policy company_roles_insert_member
  on public.company_roles
  for insert
  with check (
    exists (
      select 1
      from public.company_user_workspace cuw
      where cuw.company_workspace_id = company_roles.company_workspace_id
        and cuw.company_user_id = auth.uid()
    )
  );

drop policy if exists company_roles_update_member on public.company_roles;
create policy company_roles_update_member
  on public.company_roles
  for update
  using (
    exists (
      select 1
      from public.company_user_workspace cuw
      where cuw.company_workspace_id = company_roles.company_workspace_id
        and cuw.company_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.company_user_workspace cuw
      where cuw.company_workspace_id = company_roles.company_workspace_id
        and cuw.company_user_id = auth.uid()
    )
  );

drop policy if exists company_user_workspace_select_member on public.company_user_workspace;
create policy company_user_workspace_select_member
  on public.company_user_workspace
  for select
  using (
    exists (
      select 1
      from public.company_user_workspace viewer
      where viewer.company_workspace_id = company_user_workspace.company_workspace_id
        and viewer.company_user_id = auth.uid()
    )
  );

drop policy if exists company_user_workspace_insert_authenticated on public.company_user_workspace;
create policy company_user_workspace_insert_authenticated
  on public.company_user_workspace
  for insert
  with check (auth.uid() is not null);

drop policy if exists company_user_workspace_update_member on public.company_user_workspace;
create policy company_user_workspace_update_member
  on public.company_user_workspace
  for update
  using (
    exists (
      select 1
      from public.company_user_workspace viewer
      where viewer.company_workspace_id = company_user_workspace.company_workspace_id
        and viewer.company_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.company_user_workspace viewer
      where viewer.company_workspace_id = company_user_workspace.company_workspace_id
        and viewer.company_user_id = auth.uid()
    )
  );

drop policy if exists company_role_matched_select_member on public.company_role_matched;
create policy company_role_matched_select_member
  on public.company_role_matched
  for select
  using (
    exists (
      select 1
      from public.company_roles cr
      join public.company_user_workspace cuw
        on cuw.company_workspace_id = cr.company_workspace_id
      where cr.role_id = company_role_matched.role_id
        and cuw.company_user_id = auth.uid()
    )
  );

drop policy if exists company_role_matched_insert_member on public.company_role_matched;
create policy company_role_matched_insert_member
  on public.company_role_matched
  for insert
  with check (
    exists (
      select 1
      from public.company_roles cr
      join public.company_user_workspace cuw
        on cuw.company_workspace_id = cr.company_workspace_id
      where cr.role_id = company_role_matched.role_id
        and cuw.company_user_id = auth.uid()
    )
  );

drop policy if exists company_role_matched_update_member on public.company_role_matched;
create policy company_role_matched_update_member
  on public.company_role_matched
  for update
  using (
    exists (
      select 1
      from public.company_roles cr
      join public.company_user_workspace cuw
        on cuw.company_workspace_id = cr.company_workspace_id
      where cr.role_id = company_role_matched.role_id
        and cuw.company_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.company_roles cr
      join public.company_user_workspace cuw
        on cuw.company_workspace_id = cr.company_workspace_id
      where cr.role_id = company_role_matched.role_id
        and cuw.company_user_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'match-workspace-logos',
  'match-workspace-logos',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;
