-- Production applied 2026-10-16; history version 20261016092927.
-- Build these country graphs CONCURRENTLY on live databases before recording.
-- They preserve the same metric/eligibility and avoid cross-country heap reads.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF to_regclass('public.company_roles_searchable_jp_title_hnsw_idx') IS NULL THEN
    CREATE INDEX company_roles_searchable_jp_title_hnsw_idx
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
        AND country_code = 'JP';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index
    WHERE indexrelid = 'public.company_roles_searchable_jp_title_hnsw_idx'::regclass
      AND indisvalid AND indisready
  ) THEN
    RAISE EXCEPTION 'Complete the concurrent HNSW build before recording this migration';
  END IF;
END $$;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF to_regclass('public.company_roles_searchable_gb_title_hnsw_idx') IS NULL THEN
    CREATE INDEX company_roles_searchable_gb_title_hnsw_idx
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
        AND country_code = 'GB';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index
    WHERE indexrelid = 'public.company_roles_searchable_gb_title_hnsw_idx'::regclass
      AND indisvalid AND indisready
  ) THEN
    RAISE EXCEPTION 'Complete the concurrent HNSW build before recording this migration';
  END IF;
END $$;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF to_regclass('public.company_roles_searchable_us_title_hnsw_idx') IS NULL THEN
    CREATE INDEX company_roles_searchable_us_title_hnsw_idx
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
        AND country_code = 'US';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index
    WHERE indexrelid = 'public.company_roles_searchable_us_title_hnsw_idx'::regclass
      AND indisvalid AND indisready
  ) THEN
    RAISE EXCEPTION 'Complete the concurrent HNSW build before recording this migration';
  END IF;
END $$;

-- The generated query now merges independently ordered country streams before
-- its global candidate LIMIT. Relaxed ordering is not suitable for Merge Append.
SELECT public.vector_dims('[1,0]'::public.vector);
ALTER FUNCTION public.search_external_roles_filter_first(text)
  SET hnsw.iterative_scan = 'strict_order';
