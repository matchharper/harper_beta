alter table if exists public.scholar_contributions
  drop column if exists is_first_author;

alter table if exists public.scholar_contributions
  drop column if exists author_order;

alter table if exists public.publications
  drop column if exists abstract;

alter table if exists public.company_db
  drop column if exists funding;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'company_roles'
      and column_name = 'information'
  ) then
    update public.company_roles
    set source_job_id = information->>'zighang_recruitment_id'
    where source_provider = 'zighang'
      and information ? 'zighang_recruitment_id'
      and coalesce(information->>'zighang_recruitment_id', '') <> ''
      and source_job_id is distinct from information->>'zighang_recruitment_id';
  end if;
end $$;

alter table if exists public.company_roles
  drop column if exists information;

alter table if exists public.scraped_additional_links
  drop column if exists identifier;

alter table if exists public.papers
  drop column if exists external_link,
  drop column if exists abstract;

drop index if exists public.jobs_companies_sources_jobkorea_url_uidx;
drop index if exists public.jobs_companies_sources_groupby_url_uidx;

alter table if exists public.jobs_companies_sources
  drop column if exists jobkorea_company_name,
  drop column if exists jobkorea_company_url,
  drop column if exists groupby_company_name,
  drop column if exists groupby_company_url;
