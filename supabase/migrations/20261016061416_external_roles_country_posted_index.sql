-- On a populated production database, build this index CONCURRENTLY outside
-- the migration transaction first, then verify pg_index.indisvalid/indisready.
-- Applying this migration afterward records the same schema without rebuilding.
-- Equality on country precedes the optional posting-date range. Keeping the
-- partial predicate to source_type also supports readers with different live
-- role eligibility clauses; all eligibility checks remain in their queries.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  -- Even CREATE INDEX IF NOT EXISTS takes a table lock before skipping an
  -- existing index. Check the catalog first when recording the online build.
  IF to_regclass('public.company_roles_external_country_posted_idx') IS NULL THEN
    CREATE INDEX company_roles_external_country_posted_idx
      ON public.company_roles (country_code, posted_at DESC NULLS LAST)
      WHERE source_type = 'external';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_index
    WHERE indexrelid = 'public.company_roles_external_country_posted_idx'::regclass
      AND indisvalid AND indisready
  ) THEN
    RAISE EXCEPTION 'Complete the concurrent country/posting-date index build before recording this migration';
  END IF;
END $$;
