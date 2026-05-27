alter table if exists public.company_snapshot
  drop column if exists normalized_company_name,
  drop column if exists source_urls;
