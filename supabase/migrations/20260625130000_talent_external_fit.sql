create table if not exists public.talent_external_fit (
  talent_id uuid not null,
  role_id uuid not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists talent_external_fit_talent_role_uidx
  on public.talent_external_fit (talent_id, role_id);

create index if not exists talent_external_fit_created_at_idx
  on public.talent_external_fit (created_at);

alter table public.talent_external_fit enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.talent_external_fit to service_role';
  end if;

  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    execute 'grant usage on schema public to harper_worker';
    execute 'grant select, insert, update, delete on public.talent_external_fit to harper_worker';

    execute 'drop policy if exists talent_external_fit_harper_worker_all on public.talent_external_fit';
    execute 'create policy talent_external_fit_harper_worker_all
      on public.talent_external_fit
      for all
      to harper_worker
      using (true)
      with check (true)';
  end if;
end;
$$;
