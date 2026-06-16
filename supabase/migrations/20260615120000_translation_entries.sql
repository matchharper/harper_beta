create table if not exists public.translation_entries (
  id uuid primary key default gen_random_uuid(),
  namespace text not null default 'career',
  key text not null,
  locale text not null,
  value text not null default '',
  status text not null default 'draft',
  description text,
  updated_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint translation_entries_locale_check
    check (locale ~ '^[a-z]{2}(-[A-Za-z0-9]+)?$'),
  constraint translation_entries_status_check
    check (status in ('draft', 'reviewed', 'published'))
);

create unique index if not exists translation_entries_namespace_key_locale_uidx
  on public.translation_entries (namespace, key, locale);

create index if not exists translation_entries_namespace_key_idx
  on public.translation_entries (namespace, key);

create index if not exists translation_entries_updated_at_idx
  on public.translation_entries (updated_at desc);

create or replace function public.set_translation_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists translation_entries_set_updated_at
  on public.translation_entries;

create trigger translation_entries_set_updated_at
before update on public.translation_entries
for each row execute function public.set_translation_entries_updated_at();

alter table public.translation_entries enable row level security;

