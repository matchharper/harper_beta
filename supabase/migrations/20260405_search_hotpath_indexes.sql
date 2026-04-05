-- Hot-path composite indexes for the LLM-driven candidate search workload.
-- Target queries: harper_worker/db.py fetch_candidate_rows + ensemble SQL variants.
-- Safety: every index uses IF NOT EXISTS. Run these via Supabase dashboard so it can
-- apply CREATE INDEX CONCURRENTLY transparently when the table is hot.
--
-- Priority order (most impactful first):
--   1. FK lookups on candid_id (LATERAL joins in fetch_candidate_rows)
--   2. FTS GIN index on candid.fts (fallback TSVECTOR search path)
--   3. Bridge-table FKs (scholar_contributions, github_repo_contribution)
--   4. Composite (candid_id, text_col) for combined FK + WHERE predicates
--
-- Each index has a comment documenting which query it serves.

-- ---------------------------------------------------------------------------
-- experience_user: JOIN candid_id + WHERE role/description in LLM SQL
-- Query sites: fetch_candidate_rows LATERAL joins (db.py ~L515-670),
--              ensemble variant SQL filtering on role / company_id.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS experience_user_candid_id_idx
  ON public.experience_user (candid_id);
CREATE INDEX IF NOT EXISTS experience_user_company_id_idx
  ON public.experience_user (company_id);

-- ---------------------------------------------------------------------------
-- edu_user: JOIN candid_id, WHERE school/degree/field
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS edu_user_candid_id_idx
  ON public.edu_user (candid_id);

-- ---------------------------------------------------------------------------
-- publications: JOIN candid_id, WHERE title/venue in LLM SQL
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS publications_candid_id_idx
  ON public.publications (candid_id);

-- ---------------------------------------------------------------------------
-- extra_experience: JOIN candid_id, WHERE title/description
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS extra_experience_candid_id_idx
  ON public.extra_experience (candid_id);

-- ---------------------------------------------------------------------------
-- scholar_profile: JOIN candid_id (and existence-check pattern)
-- Query site: db.py fetch_candidate_rows scholar/mixed branches
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS scholar_profile_candid_id_idx
  ON public.scholar_profile (candid_id);

-- ---------------------------------------------------------------------------
-- scholar_contributions: bridge table scholar_profile_id → paper_id
-- Query site: papers aggregation per scholar candidate
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS scholar_contributions_scholar_profile_id_idx
  ON public.scholar_contributions (scholar_profile_id);
CREATE INDEX IF NOT EXISTS scholar_contributions_paper_id_idx
  ON public.scholar_contributions (paper_id);

-- ---------------------------------------------------------------------------
-- github_profile: JOIN candid_id + existence-check pattern (db.py L515, L623)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS github_profile_candid_id_idx
  ON public.github_profile (candid_id);

-- ---------------------------------------------------------------------------
-- github_repo_contribution: bridge table github_profile_id → repo_id
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS github_repo_contribution_github_profile_id_idx
  ON public.github_repo_contribution (github_profile_id);
CREATE INDEX IF NOT EXISTS github_repo_contribution_repo_id_idx
  ON public.github_repo_contribution (repo_id);

-- ---------------------------------------------------------------------------
-- synthesized_summary: UNIQUE(candid_id, run_id) + run_id filtering
-- Query site: rerank.IncrementalReranker flush + runs_pages aggregation
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS synthesized_summary_run_id_idx
  ON public.synthesized_summary (run_id);

-- ---------------------------------------------------------------------------
-- FTS fallback: candid.fts GIN index (TSVECTOR_PROMPT fallback path)
-- Only create if the column exists as tsvector and no GIN index is already present.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'candid'
      AND column_name = 'fts'
      AND data_type = 'tsvector'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'candid'
      AND indexdef ILIKE '%USING gin%fts%'
  ) THEN
    EXECUTE 'CREATE INDEX candid_fts_gin_idx ON public.candid USING GIN (fts)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Verification queries (run manually after migration):
--   SELECT indexname, tablename FROM pg_indexes
--    WHERE schemaname = 'public' AND indexname LIKE '%_idx'
--      AND (tablename IN ('experience_user','edu_user','publications',
--                         'extra_experience','scholar_profile','scholar_contributions',
--                         'github_profile','github_repo_contribution',
--                         'synthesized_summary','candid'))
--    ORDER BY tablename, indexname;
-- ---------------------------------------------------------------------------
