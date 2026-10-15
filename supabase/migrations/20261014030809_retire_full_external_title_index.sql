-- The live-title partial index replaces the full dictionary index. In production
-- first run build_external_title_index.py --retire-full-index --apply so the
-- potentially long retirement uses CONCURRENTLY outside this transaction.
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='external_role_title_embeddings_live_ivfflat'
      AND i.indisvalid
  ) AND EXISTS (
    SELECT 1 FROM public.external_role_title_embeddings WHERE embedding IS NOT NULL
    OFFSET 9999 LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Build a valid live-title index before retiring the full title index';
  END IF;
END $$;
DROP INDEX IF EXISTS public.external_role_title_embeddings_ivfflat;
