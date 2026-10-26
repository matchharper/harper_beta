-- 2026-10-22: helper and all 14 missing indexes were applied directly to the live
-- database with the concurrent builder. Existing indexes were reused. Web/Worker
-- were not deployed. Inspect live definitions before any later migration replay.
-- For a live database, build indexes CONCURRENTLY with
-- scripts/buildJobSearchComparisonIndexes.ts before recording this migration.
-- Country/intern membership is maintained automatically as company_roles change.
-- Do not change this immutable function's semantics without rebuilding indexes.
CREATE OR REPLACE FUNCTION public.external_role_has_type(p_types text[], p_matches text[])
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
 SELECT EXISTS (
   SELECT 1 FROM unnest(COALESCE(p_types, ARRAY[]::text[])) AS t(value)
   WHERE lower(btrim(t.value)) = ANY(p_matches)
 )
$$;

-- No SECURITY DEFINER and no table reads: this pure function only inspects its
-- arguments. It must also be executable while ordinary role writes maintain the indexes.
GRANT EXECUTE ON FUNCTION public.external_role_has_type(text[], text[]) TO PUBLIC;

DO $migration$
DECLARE
 country text;
 non_intern boolean;
 index_name text;
 predicate text := $predicate$source_type = 'external'
 AND COALESCE(is_expired, false) = false
 AND status NOT IN ('ended', 'expired', 'closed', 'inactive', 'archived')
 AND COALESCE(source_provider, '') <> 'user_submitted'
 AND lower(coalesce(information->>'testOnly', 'false')) <> 'true'
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name$predicate$;
BEGIN
 FOREACH country IN ARRAY ARRAY[NULL,'AE','AU','CA','GB','HK','KR','SG','US']::text[] LOOP
  FOREACH non_intern IN ARRAY ARRAY[false,true] LOOP
   index_name := 'company_roles_searchable'
     || CASE WHEN country IS NULL THEN '' ELSE '_' || lower(country) END
     || CASE WHEN non_intern THEN '_no_intern' ELSE '' END || '_title_hnsw_idx';
   IF to_regclass('public.' || index_name) IS NULL THEN
    EXECUTE format('CREATE INDEX %I ON public.company_roles USING hnsw
      ((title_embedding::public.halfvec(1536)) public.halfvec_cosine_ops)
      WITH (m=16,ef_construction=64) WHERE %s%s%s',
      index_name,predicate,
      CASE WHEN country IS NULL THEN '' ELSE format(' AND country_code = %L',country) END,
      CASE WHEN non_intern THEN $nointern$ AND NOT public.external_role_has_type(type, ARRAY['internship','intern','인턴']::text[])$nointern$ ELSE '' END);
   END IF;
   IF NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.' || index_name) AND indisvalid AND indisready) THEN
    RAISE EXCEPTION 'Index % is incomplete; finish the concurrent build first',index_name;
   END IF;
  END LOOP;
 END LOOP;
END
$migration$;
