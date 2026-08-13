-- LinkedIn company IDs are protected by company_db_linkedin_company_id_uidx.
-- Collisions remain visible in the crawler's per-run JSONL output, so the
-- separate database log table is redundant.
drop table if exists public.linkedin_company_id_collision_log;
