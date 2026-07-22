create table if not exists public.internal_role_matching_run_memory (
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  run_id text not null,
  content text not null constraint internal_role_matching_run_memory_content_check check (
    char_length(btrim(content)) between 1 and 1500
  ),
  created_at timestamptz not null default now(),
  primary key (role_id, run_id)
);

alter table public.internal_role_matching_run_memory
  drop constraint if exists internal_role_matching_run_memory_content_check;

alter table public.internal_role_matching_run_memory
  add constraint internal_role_matching_run_memory_content_check check (
    char_length(btrim(content)) between 1 and 1500
  );

create index if not exists idx_internal_role_matching_run_memory_latest
  on public.internal_role_matching_run_memory(role_id, created_at desc);

alter table public.internal_role_matching_run_memory enable row level security;

revoke all on table public.internal_role_matching_run_memory from anon, authenticated;
grant select, insert, update, delete on table public.internal_role_matching_run_memory to service_role;

drop policy if exists "internal role matching run memory service role only"
  on public.internal_role_matching_run_memory;

create policy "internal role matching run memory service role only"
  on public.internal_role_matching_run_memory
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
