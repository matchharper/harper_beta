create or replace function public.set_company_roles_opportunity_search_tsv()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- The weekly cold-storage sweep intentionally removes the search vector
  -- from expired roles that must remain because another row references them.
  -- Keep those rows out of the search index until they become live again.
  if tg_op = 'UPDATE' then
    if coalesce(new.is_expired, false) = true
       and old.opportunity_search_tsv is null then
      return new;
    end if;
  end if;

  new.opportunity_search_tsv :=
    setweight(to_tsvector('simple', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.request, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(new.location_text, '')), 'D') ||
    setweight(to_tsvector('simple', coalesce(new.work_mode, '')), 'D') ||
    setweight(
      to_tsvector(
        'simple',
        array_to_string(coalesce(new."type", '{}'::text[]), ' ')
      ),
      'D'
    );

  return new;
end;
$$;

drop trigger if exists company_roles_set_opportunity_search_tsv
  on public.company_roles;

create trigger company_roles_set_opportunity_search_tsv
before insert or update of
  name,
  request,
  description,
  location_text,
  work_mode,
  type,
  is_expired
on public.company_roles
for each row
execute function public.set_company_roles_opportunity_search_tsv();

comment on function public.set_company_roles_opportunity_search_tsv() is
  'Maintains role search vectors and restores a cleared vector when an expired role becomes live again.';
