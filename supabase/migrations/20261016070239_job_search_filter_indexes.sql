-- Production applied 2026-10-16; history version 20261016072128.
-- All three indexes were built CONCURRENTLY and verified valid/ready first.
-- Build these indexes CONCURRENTLY on a populated database before recording
-- this migration. Do not block ongoing role ingestion/recommendation writes.
-- Index predicates mirror static eligibility only; expires_at and the rolling
-- postingRecency cutoff remain query conditions. No vectors/JD text in INCLUDE.
-- The remote subset serves remote-only country branches. The recommendation
-- pair index supports NOT EXISTS without fetching a candidate's history rows.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF to_regclass('public.company_roles_searchable_country_posted_idx') IS NULL THEN
    CREATE INDEX company_roles_searchable_country_posted_idx
  ON public.company_roles (country_code, posted_at DESC NULLS LAST)
  WHERE source_type = 'external'
    AND COALESCE(is_expired, false) = false
    AND status NOT IN ('ended', 'expired', 'closed', 'inactive', 'archived')
    AND COALESCE(source_provider, '') <> 'user_submitted'
    AND lower(coalesce(information->>'testOnly', 'false')) <> 'true'
    AND title_embedding IS NOT NULL
    AND title_embedding_text = name;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = 'public.company_roles_searchable_country_posted_idx'::regclass AND indisvalid AND indisready) THEN
    RAISE EXCEPTION 'Index company_roles_searchable_country_posted_idx is not ready; complete the concurrent build first';
  END IF;

  IF to_regclass('public.company_roles_searchable_remote_country_posted_idx') IS NULL THEN
    CREATE INDEX company_roles_searchable_remote_country_posted_idx
  ON public.company_roles (country_code, posted_at DESC NULLS LAST)
  WHERE source_type = 'external'
    AND COALESCE(is_expired, false) = false
    AND status NOT IN ('ended', 'expired', 'closed', 'inactive', 'archived')
    AND COALESCE(source_provider, '') <> 'user_submitted'
    AND lower(coalesce(information->>'testOnly', 'false')) <> 'true'
    AND title_embedding IS NOT NULL
    AND title_embedding_text = name
    AND lower(coalesce(work_mode, '')) = 'remote';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = 'public.company_roles_searchable_remote_country_posted_idx'::regclass AND indisvalid AND indisready) THEN
    RAISE EXCEPTION 'Index company_roles_searchable_remote_country_posted_idx is not ready; complete the concurrent build first';
  END IF;

  IF to_regclass('public.talent_external_recommendation_talent_role_idx') IS NULL THEN
    CREATE INDEX talent_external_recommendation_talent_role_idx
  ON public.talent_opportunity_recommendation (talent_id, role_id)
  WHERE opportunity_type = 'external_jd';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = 'public.talent_external_recommendation_talent_role_idx'::regclass AND indisvalid AND indisready) THEN
    RAISE EXCEPTION 'Index talent_external_recommendation_talent_role_idx is not ready; complete the concurrent build first';
  END IF;
END $$;
