create or replace function public.set_company_roles_opportunity_search_tsv()
returns trigger
language plpgsql
as $$
begin
  new.opportunity_search_tsv :=
    setweight(to_tsvector('simple', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.request, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(new.location_text, '')), 'D') ||
    setweight(to_tsvector('simple', coalesce(new.work_mode, '')), 'D') ||
    setweight(to_tsvector('simple', array_to_string(coalesce(new."type", '{}'::text[]), ' ')), 'D');
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
  "type"
on public.company_roles
for each row execute function public.set_company_roles_opportunity_search_tsv();

update public.company_roles
set opportunity_search_tsv =
  setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(request, '')), 'C') ||
  setweight(to_tsvector('simple', coalesce(location_text, '')), 'D') ||
  setweight(to_tsvector('simple', coalesce(work_mode, '')), 'D') ||
  setweight(to_tsvector('simple', array_to_string(coalesce("type", '{}'::text[]), ' ')), 'D');
