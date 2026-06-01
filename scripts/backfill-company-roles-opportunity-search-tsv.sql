-- Optional production backfill for company_roles.opportunity_search_tsv.
--
-- Run this manually in small transactions after applying
-- 20260528130000_remove_description_summary_from_company_roles_opportunity_search_tsv.sql.
-- Increase/decrease the LIMIT based on DB load. 200-1000 is a reasonable range.
--
-- Re-run until "updated_rows" returns 0.

set lock_timeout = '2s';
set statement_timeout = '15s';

with target as (
  select role_id
  from public.company_roles
  where opportunity_search_tsv is distinct from (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(request, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(location_text, '')), 'D') ||
    setweight(to_tsvector('simple', coalesce(work_mode, '')), 'D') ||
    setweight(to_tsvector('simple', array_to_string(coalesce("type", '{}'::text[]), ' ')), 'D')
  )
  order by updated_at nulls first, role_id
  limit 300
  for update skip locked
),
updated as (
  update public.company_roles cr
  set opportunity_search_tsv =
    setweight(to_tsvector('simple', coalesce(cr.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(cr.description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(cr.request, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(cr.location_text, '')), 'D') ||
    setweight(to_tsvector('simple', coalesce(cr.work_mode, '')), 'D') ||
    setweight(to_tsvector('simple', array_to_string(coalesce(cr."type", '{}'::text[]), ' ')), 'D')
  from target
  where cr.role_id = target.role_id
  returning cr.role_id
)
select count(*) as updated_rows from updated;
