-- Production applied 2026-10-16; history version 20261016092038.
-- Build CONCURRENTLY first on a live database, then record this migration.
-- KR searches were discarding ~25k global neighbors to retain 3k roles.
-- Keep the same halfvec metric and eligibility; restrict only the index graph.
-- Other countries and multi-country searches retain the global HNSW index.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF to_regclass('public.company_roles_searchable_kr_title_hnsw_idx') IS NULL THEN
    CREATE INDEX company_roles_searchable_kr_title_hnsw_idx
      ON public.company_roles USING hnsw
      ((title_embedding::public.halfvec(1536)) public.halfvec_cosine_ops)
      WITH (m = 16, ef_construction = 64)
      WHERE source_type = 'external'
        AND COALESCE(is_expired, false) = false
        AND status NOT IN ('ended', 'expired', 'closed', 'inactive', 'archived')
        AND COALESCE(source_provider, '') <> 'user_submitted'
        AND lower(coalesce(information->>'testOnly', 'false')) <> 'true'
        AND title_embedding IS NOT NULL
        AND title_embedding_text = name
        AND country_code = 'KR';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index
    WHERE indexrelid = 'public.company_roles_searchable_kr_title_hnsw_idx'::regclass
      AND indisvalid AND indisready
  ) THEN
    RAISE EXCEPTION 'Complete the concurrent HNSW build before recording this migration';
  END IF;
END $$;
