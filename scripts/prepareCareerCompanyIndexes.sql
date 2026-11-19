-- For populated online installations use psql -f directly (autocommit).
-- The normal Supabase v2 migration batch cannot build indexes concurrently.
-- The marker migration is additive and rerunnable, including when migrations
-- are later recorded by the normal migration runner.
\set ON_ERROR_STOP on
begin;
\ir ../supabase/migrations/20261117122500_career_company_workspace_marker.sql
commit;

-- A cancelled concurrent build can leave an invalid index. Drop only these
-- named, invalid builds, then continue. Valid indexes are reusable.
select format('drop index concurrently %s', i.indexrelid::regclass)
from pg_index i
where not i.indisvalid and (
  (i.indrelid='public.company_workspace'::regclass and i.indexrelid=to_regclass('public.company_public_data_home'))
  or (i.indrelid='public.company_db'::regclass and i.indexrelid in (
    to_regclass('public.career_directory_website_identity'),to_regclass('public.career_directory_linkedin_identity'),
    to_regclass('public.career_directory_name_identity')))
)
\gexec

create unique index concurrently if not exists company_public_data_home on public.company_workspace(company_db_id)
  where is_public_data_home and company_db_id is not null;
create index concurrently if not exists career_directory_website_identity on public.company_db(public.career_company_url_key_v1(website_url));
create index concurrently if not exists career_directory_linkedin_identity on public.company_db(public.career_company_url_key_v1(linkedin_url));
create index concurrently if not exists career_directory_name_identity on public.company_db(lower(btrim(name)));
alter table public.company_workspace validate constraint company_public_data_home_identity;
