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

-- Do not backfill existing rows in this migration.
-- Recomputing opportunity_search_tsv for every company_roles row rewrites the
-- large GIN index in one transaction and can exhaust the production database.
-- Existing rows will be corrected when one of the trigger columns changes, or
-- by running a small external batch backfill outside the migration transaction.
