-- Career public-source and company-fact reads match ids as text, which no index
-- served, so each lookup scanned the whole table (production, 2026-11-21):
--   documents: doc.id::text = observation.resource_ref->>'id'
--     (career_company_datum_json_v1, career_company_observations_v1,
--      career_company_evidence_v1, career_exact_company_sources_v1, ...);
--     a company summary with eight sources took 1.2 s.
--   career_public_observations: resource_ref->>'id' = documents.id::text
--     (career_public_company_sources_changed_v1 on every web capture,
--      career_public_scope_revoked_v1); 0.9 s per capture.
--   company_db: id::text in (...)
--     (career_public_company_sources_changed_v1); 3.9 s.
-- career_company_facts_v1 reads team counts per company from experience_user
-- by company_id; the covering index lets those reads skip the table.
--
-- Production builds these with CREATE INDEX CONCURRENTLY outside a transaction;
-- this file creates the same indexes for other environments.
create index if not exists documents_id_text_idx
  on public.documents ((id::text));
create index if not exists career_public_observations_resource_id_idx
  on public.career_public_observations ((resource_ref->>'id'));
create index if not exists company_db_id_text_idx
  on public.company_db ((id::text));
create index if not exists experience_user_company_facts_idx
  on public.experience_user (company_id, start_date) include (candid_id, end_date, created_at);
