drop index if exists public.opportunity_role_match_index_match_tsv_idx;

alter table public.opportunity_role_match_index
  drop column if exists match_tsv;

drop index if exists public.company_workspace_opportunity_search_tsv_idx;

alter table public.company_workspace
  drop column if exists opportunity_search_tsv;

drop index if exists public.company_roles_opportunity_search_tsv_idx;

alter table public.company_roles
  drop column if exists opportunity_search_tsv;

alter table public.company_roles
  add column opportunity_search_tsv tsvector;

create or replace function public.set_company_roles_opportunity_search_tsv()
returns trigger
language plpgsql
as $$
begin
  new.opportunity_search_tsv :=
    setweight(to_tsvector('simple', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.description_summary, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.request, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.description, '')), 'C') ||
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
  description_summary,
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
  setweight(to_tsvector('simple', coalesce(description_summary, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(request, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(description, '')), 'C') ||
  setweight(to_tsvector('simple', coalesce(location_text, '')), 'D') ||
  setweight(to_tsvector('simple', coalesce(work_mode, '')), 'D') ||
  setweight(to_tsvector('simple', array_to_string(coalesce("type", '{}'::text[]), ' ')), 'D')
where opportunity_search_tsv is null;

create index if not exists company_roles_opportunity_search_tsv_idx
  on public.company_roles
  using gin (opportunity_search_tsv);
