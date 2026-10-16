-- Production applied 2026-10-16; history version 20261016091104.
-- Scope planner settings to this debug search only, and apply them before
-- EXECUTE plans the generated SQL. All settings restore on function exit.
-- Ordinary sorts (FTS/salary reranking) remain possible; penalizing a full
-- distance sort makes the existing ordered HNSW access path win despite the
-- severe cardinality underestimate for title_embedding_text = name.
-- Load pgvector in the migration session so its USERSET parameters are known.
SELECT public.vector_dims('[1,0]'::public.vector);
CREATE OR REPLACE FUNCTION public.search_external_roles_filter_first(p_sql text)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET enable_sort = off
SET jit = off
SET hnsw.ef_search = 100
-- Initial single-stream settings; the country-index migration below switches
-- to strict ordering so that multiple ordered country streams can be merged.
SET hnsw.iterative_scan = 'relaxed_order'
SET hnsw.max_scan_tuples = 100000
SET hnsw.scan_mem_multiplier = 4
AS $$
BEGIN
  RETURN QUERY EXECUTE 'SELECT to_jsonb(result) FROM (' || p_sql || ') result';
END;
$$;
REVOKE ALL ON FUNCTION public.search_external_roles_filter_first(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_external_roles_filter_first(text) TO service_role;
NOTIFY pgrst, 'reload schema';
