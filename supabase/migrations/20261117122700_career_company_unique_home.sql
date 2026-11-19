-- On a live database prebuild this index with scripts/prepareCareerCompanyIndexes.sql.
-- Fresh installs can create it directly. Keep any scan and its locks out of the
-- marker and writer transactions. Reject an unfinished concurrent build.
set local lock_timeout='2s';
set local statement_timeout='3s';
do $$
begin
  if to_regclass('public.company_public_data_home') is null then
    create unique index company_public_data_home on public.company_workspace(company_db_id)
      where is_public_data_home and company_db_id is not null;
  elsif not exists(select from pg_index where indexrelid='public.company_public_data_home'::regclass
                   and indisunique and indisvalid and indisready and indrelid='public.company_workspace'::regclass) then
    raise exception 'Complete the online company_public_data_home index build before installing the writer';
  end if;
end $$;

-- Fresh databases also start with indexed directory lookups. On a populated
-- directory the online script builds these while the existing app writes.
do $$
begin
  if not exists(select from public.company_db limit 1) then
    create index if not exists career_directory_website_identity on public.company_db(public.career_company_url_key_v1(website_url));
    create index if not exists career_directory_linkedin_identity on public.company_db(public.career_company_url_key_v1(linkedin_url));
    create index if not exists career_directory_name_identity on public.company_db(lower(btrim(name)));
  end if;
end $$;
