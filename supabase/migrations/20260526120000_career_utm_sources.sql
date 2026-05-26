create table if not exists public.career_utm_sources (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  description text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint career_utm_sources_source_check
    check (source ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  constraint career_utm_sources_description_length_check
    check (char_length(coalesce(description, '')) <= 500)
);

create unique index if not exists career_utm_sources_source_uidx
  on public.career_utm_sources (source);

create index if not exists career_utm_sources_created_at_idx
  on public.career_utm_sources (created_at desc);

create or replace function public.set_career_utm_sources_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists career_utm_sources_set_updated_at
  on public.career_utm_sources;

create trigger career_utm_sources_set_updated_at
before update on public.career_utm_sources
for each row execute function public.set_career_utm_sources_updated_at();

alter table public.career_utm_sources enable row level security;
