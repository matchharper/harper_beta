create or replace function public.list_translation_entry_groups(
  p_namespace text default 'career',
  p_query text default null,
  p_min_ko_length integer default null,
  p_after_key text default null,
  p_limit integer default 50
)
returns table (
  key text,
  ko text,
  en text,
  description text,
  updated_at timestamptz,
  updated_by text
)
language sql
stable
security definer
set search_path = public
as $$
  with grouped as (
    select
      translation_entries.key,
      max(translation_entries.value) filter (where translation_entries.locale = 'ko') as ko,
      max(translation_entries.value) filter (where translation_entries.locale = 'en') as en,
      max(translation_entries.description) filter (where translation_entries.description is not null) as description,
      max(translation_entries.updated_at) as updated_at,
      max(translation_entries.updated_by) filter (where translation_entries.updated_by is not null) as updated_by
    from public.translation_entries
    where
      translation_entries.namespace = p_namespace
      and translation_entries.locale in ('ko', 'en')
    group by translation_entries.key
  )
  select
    grouped.key,
    coalesce(grouped.ko, '') as ko,
    coalesce(grouped.en, '') as en,
    grouped.description,
    grouped.updated_at,
    grouped.updated_by
  from grouped
  where
    (p_after_key is null or grouped.key > p_after_key)
    and (
      p_min_ko_length is null
      or char_length(coalesce(grouped.ko, '')) >= p_min_ko_length
    )
    and (
      nullif(trim(coalesce(p_query, '')), '') is null
      or grouped.key ilike '%' || trim(p_query) || '%'
      or coalesce(grouped.ko, '') ilike '%' || trim(p_query) || '%'
      or coalesce(grouped.en, '') ilike '%' || trim(p_query) || '%'
      or coalesce(grouped.description, '') ilike '%' || trim(p_query) || '%'
    )
  order by grouped.key
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

grant execute on function public.list_translation_entry_groups(
  text,
  text,
  integer,
  text,
  integer
) to authenticated, service_role;
