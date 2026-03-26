create table if not exists public.worker_runtime_settings (
  name text primary key,
  variant_candidate_limit integer not null,
  review_candidate_limit integer not null,
  found_threshold integer not null,
  summary_concurrency integer not null,
  rerank_batch_size integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_runtime_settings_variant_candidate_limit_check
    check (variant_candidate_limit > 0),
  constraint worker_runtime_settings_review_candidate_limit_check
    check (review_candidate_limit > 0),
  constraint worker_runtime_settings_found_threshold_check
    check (found_threshold > 0),
  constraint worker_runtime_settings_summary_concurrency_check
    check (summary_concurrency > 0),
  constraint worker_runtime_settings_rerank_batch_size_check
    check (rerank_batch_size > 0)
);

create or replace function public.set_worker_runtime_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists worker_runtime_settings_set_updated_at
  on public.worker_runtime_settings;

create trigger worker_runtime_settings_set_updated_at
before update on public.worker_runtime_settings
for each row
execute function public.set_worker_runtime_settings_updated_at();

insert into public.worker_runtime_settings (
  name,
  variant_candidate_limit,
  review_candidate_limit,
  found_threshold,
  summary_concurrency,
  rerank_batch_size
)
values ('default', 200, 600, 10, 20, 20)
on conflict (name) do nothing;

alter table public.worker_runtime_settings enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    execute 'grant select on table public.worker_runtime_settings to harper_worker';
    execute 'drop policy if exists worker_worker_runtime_settings_select on public.worker_runtime_settings';
    execute $policy$
      create policy worker_worker_runtime_settings_select
      on public.worker_runtime_settings
      for select
      to harper_worker
      using (true)
    $policy$;
  end if;
end
$$;
