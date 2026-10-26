-- Generated from indexedTitleSearch.ts; disjoint membership, no role data changes.
-- Live DB: use scripts/buildJobSearchEmploymentIndexes.ts --apply (CONCURRENTLY).
-- Applied directly to live DB: all 160 scoped v2 indexes verified ready/valid on 2026-10-23 KST.
-- Inspect actual definitions before rollout; missing migration history is not a reason to rebuild.
-- Non-inlined identity prevents a broader HNSW graph from serving a scoped query.
-- The scope is only an index-expression key; this function does not grant access.
CREATE OR REPLACE FUNCTION public.external_role_index_vector(p_embedding public.vector,p_scope text)
RETURNS public.halfvec LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=''
AS $$ SELECT p_embedding::public.halfvec(1536) $$;
GRANT EXECUTE ON FUNCTION public.external_role_index_vector(public.vector,text) TO PUBLIC;
DO $migration$
DECLARE item record;
BEGIN
 FOR item IN SELECT * FROM (VALUES
('company_roles_search_ae_b0_hnsw_idx','CREATE INDEX company_roles_search_ae_b0_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ae_b0_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AE'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:0e3f9efa128e7c814cd69b99cc8afaefefe1af9ddc187fe550277b5fed14b250'),
('company_roles_search_ae_b1_hnsw_idx','CREATE INDEX company_roles_search_ae_b1_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ae_b1_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AE'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:f4e32bfa0c6d4378534bea218b32b776759497e7b23ecc94e02d186197e08026'),
('company_roles_search_ae_b2_hnsw_idx','CREATE INDEX company_roles_search_ae_b2_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ae_b2_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AE'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:a856db092e24743e81306cd9c4b5845ec48b9d94ccefc0e26a3483156e5ffb5a'),
('company_roles_search_ae_b3_hnsw_idx','CREATE INDEX company_roles_search_ae_b3_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ae_b3_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AE'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:bef77a1dc0c4643c72249f551f4a24f53424898526a21855982abd9386e39067'),
('company_roles_search_ae_b4_hnsw_idx','CREATE INDEX company_roles_search_ae_b4_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ae_b4_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AE'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:9394989a3dea1c598bf0be04d1e6d08dc6a7001d71c9431eff0c5526174e201e'),
('company_roles_search_ae_b5_hnsw_idx','CREATE INDEX company_roles_search_ae_b5_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ae_b5_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AE'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:d226ee55277cd87ffa16563d804ffc4d59d3f6a50c007204cca9a1008b337408'),
('company_roles_search_ae_b6_hnsw_idx','CREATE INDEX company_roles_search_ae_b6_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ae_b6_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AE'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:ddde042e2e47745082cf7681e4b35e894f1481eaff8302f09b85c006d3747797'),
('company_roles_search_ae_b7_hnsw_idx','CREATE INDEX company_roles_search_ae_b7_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ae_b7_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AE'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:673818a18fbb1ff5167d6aa96f5eb6d9bcbf9e41aa64a6579442a3d6da0265bf'),
('company_roles_search_ae_b8_hnsw_idx','CREATE INDEX company_roles_search_ae_b8_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ae_b8_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AE'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:8b16fe6ac754db310bd483c0226a249c701cdf00c3eb82b5a6cf45b33de47ee7'),
('company_roles_search_ae_b9_hnsw_idx','CREATE INDEX company_roles_search_ae_b9_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ae_b9_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AE'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:328b9ae4e8d6c9d71cbe21a90d51d8904ff7561e4fd45a3ce2fff33176b71c00'),
('company_roles_search_ae_b10_hnsw_idx','CREATE INDEX company_roles_search_ae_b10_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ae_b10_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AE'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:1afddf4804b5e54a02805c7be9a379c41a6fa3335c9d66ddc839a3aed1bd63a6'),
('company_roles_search_ae_b11_hnsw_idx','CREATE INDEX company_roles_search_ae_b11_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ae_b11_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AE'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:735f0ccabf9bec8d627dc67ab98af16b9bc9ccf41758b46a8d340447e03a3976'),
('company_roles_search_ae_b12_hnsw_idx','CREATE INDEX company_roles_search_ae_b12_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ae_b12_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AE'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:a4bec367ddc985ee93d32a6e53d3220fefdd2a8ab8ffda751f3910fe727c2479'),
('company_roles_search_ae_b13_hnsw_idx','CREATE INDEX company_roles_search_ae_b13_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ae_b13_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AE'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:210e303066f12f3c6e93d70caf632700cc740146572638731a44674249dd1b91'),
('company_roles_search_ae_b14_hnsw_idx','CREATE INDEX company_roles_search_ae_b14_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ae_b14_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AE'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:b7daa862c1e9583484db56b61a605fc494f8dbb2ef591c0ca975bcd02241472b'),
('company_roles_search_ae_b15_hnsw_idx','CREATE INDEX company_roles_search_ae_b15_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ae_b15_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AE'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:56382f941d7a3a01f9c244b9a92758fbbe68ec3bedbf91c6c01f531ef9ee14e6'),
('company_roles_search_au_b0_hnsw_idx','CREATE INDEX company_roles_search_au_b0_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_au_b0_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AU'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:9d215628f63d14e1e0b327dcc00337a99e9a7628bfdd6cb89eeb067de018699d'),
('company_roles_search_au_b1_hnsw_idx','CREATE INDEX company_roles_search_au_b1_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_au_b1_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AU'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:71c50b005d83030e599e1860d9347f7590a5e7b3f14517617fde335e3f7f12b6'),
('company_roles_search_au_b2_hnsw_idx','CREATE INDEX company_roles_search_au_b2_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_au_b2_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AU'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:912d99421507c0b3b1d29de6b5002deda50cf9459d619075ca20ef5228f11cad'),
('company_roles_search_au_b3_hnsw_idx','CREATE INDEX company_roles_search_au_b3_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_au_b3_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AU'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:a1998b389f2274cd70892d55c77f4d46cb6caff32fbdd8522ddaf299a07cfdb3'),
('company_roles_search_au_b4_hnsw_idx','CREATE INDEX company_roles_search_au_b4_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_au_b4_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AU'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:2b1416123fa1004cd28b05edd151efe339851631075d49c65e87df3e243ddae2'),
('company_roles_search_au_b5_hnsw_idx','CREATE INDEX company_roles_search_au_b5_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_au_b5_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AU'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:cbde719187d9f0addc32d1ff52291fb459a0d3403d897a2ba87e94bbce53c58f'),
('company_roles_search_au_b6_hnsw_idx','CREATE INDEX company_roles_search_au_b6_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_au_b6_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AU'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:f6ce38d171383cfe904c933e2d05e5dd1fee45a6ac777a70b9268be5c3c41dc7'),
('company_roles_search_au_b7_hnsw_idx','CREATE INDEX company_roles_search_au_b7_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_au_b7_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AU'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:8282692cb92bdbc6f57e5103e463f2d671b0e4d560e2fadbd5964b7f1f0ba855'),
('company_roles_search_au_b8_hnsw_idx','CREATE INDEX company_roles_search_au_b8_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_au_b8_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AU'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:fc5966947a64145d2ccb1df88d3dd805d8db3567a6985ab45bcc4753c53c82aa'),
('company_roles_search_au_b9_hnsw_idx','CREATE INDEX company_roles_search_au_b9_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_au_b9_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AU'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:acbae6af9b53e6dc6b77226ecf075a8261308f9d37778627917e780862961ad8'),
('company_roles_search_au_b10_hnsw_idx','CREATE INDEX company_roles_search_au_b10_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_au_b10_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AU'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:393c0bbb263faf12457f32832ce30836dd43a4f64e77b34f9c9169d407e579a8'),
('company_roles_search_au_b11_hnsw_idx','CREATE INDEX company_roles_search_au_b11_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_au_b11_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AU'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:0b8e8b0c45e4e461e844503c7df148558ae276e4a9506db31334fed51370adaf'),
('company_roles_search_au_b12_hnsw_idx','CREATE INDEX company_roles_search_au_b12_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_au_b12_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AU'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:8ee89b9fbd9da2723df5138efbb18b1bd93821f2c8613e37b4965de96a878fc3'),
('company_roles_search_au_b13_hnsw_idx','CREATE INDEX company_roles_search_au_b13_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_au_b13_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AU'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:a880c3f22a2f3bae6eadfbac0f72af57eac0a8fea0e59ed1bb1ebf4f4f64dd55'),
('company_roles_search_au_b14_hnsw_idx','CREATE INDEX company_roles_search_au_b14_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_au_b14_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AU'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:65436867f3c9828be5df450a6f3795d8b887193a1cf6fa8f184fad1476a3e79a'),
('company_roles_search_au_b15_hnsw_idx','CREATE INDEX company_roles_search_au_b15_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_au_b15_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''AU'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:b975d9692878dead4b712f27f732d7073367fe8f970913fd217e3b640f674b2c'),
('company_roles_search_ca_b0_hnsw_idx','CREATE INDEX company_roles_search_ca_b0_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ca_b0_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''CA'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:50651bc1b451cd4634abba6c92a9edb1db1fb3a9bcdc8b84f10429a3dc69584f'),
('company_roles_search_ca_b1_hnsw_idx','CREATE INDEX company_roles_search_ca_b1_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ca_b1_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''CA'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:7105590a0f942f1b006c34fe4f6360b79696658fcdeeec608c20ffa7464b702a'),
('company_roles_search_ca_b2_hnsw_idx','CREATE INDEX company_roles_search_ca_b2_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ca_b2_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''CA'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:fe7e8840d54fbc83e68cf6d33a893f8f3bedcc4e664a38a8d3ed030d49b65ab7'),
('company_roles_search_ca_b3_hnsw_idx','CREATE INDEX company_roles_search_ca_b3_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ca_b3_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''CA'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:15d93bbd8f4ecff370387015984adb2132c53bd89fc58518386598253198f03e'),
('company_roles_search_ca_b4_hnsw_idx','CREATE INDEX company_roles_search_ca_b4_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ca_b4_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''CA'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:a50d240423984d5893be0cd3f86761a0fc3fa09be48468c9258a74ea830aaa65'),
('company_roles_search_ca_b5_hnsw_idx','CREATE INDEX company_roles_search_ca_b5_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ca_b5_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''CA'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:74d82320f2e7c590af0fda743859ec23f28149eb170fa0022deaee2ad3415fbf'),
('company_roles_search_ca_b6_hnsw_idx','CREATE INDEX company_roles_search_ca_b6_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ca_b6_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''CA'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:7f049dc673a2303ee8d1311ef7f10bf125d27ea54f81f18618b46b6be544e68b'),
('company_roles_search_ca_b7_hnsw_idx','CREATE INDEX company_roles_search_ca_b7_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ca_b7_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''CA'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:f22a6d4e6a2086e3bed68d05270a58a13cb9ab9cbb441b791908bfedc74e6f60'),
('company_roles_search_ca_b8_hnsw_idx','CREATE INDEX company_roles_search_ca_b8_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ca_b8_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''CA'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:76ba4191fd5ab5b2c8af1563170be4c8f38cae6b13c12eed3da12a6746fc4dda'),
('company_roles_search_ca_b9_hnsw_idx','CREATE INDEX company_roles_search_ca_b9_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ca_b9_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''CA'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:fd3824e551cd04bbb01bc3c67023cacd49db0ef68850236471c1b3762d677e82'),
('company_roles_search_ca_b10_hnsw_idx','CREATE INDEX company_roles_search_ca_b10_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ca_b10_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''CA'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:322c52ede8713eb03f92e617eed79d6455a0552f6c35edea29ddbd3dc38f81d4'),
('company_roles_search_ca_b11_hnsw_idx','CREATE INDEX company_roles_search_ca_b11_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ca_b11_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''CA'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:ed9b7a6ca1b2276e48b67467e4070cadf5f10992f4166e0222b10b6e88ca8aaf'),
('company_roles_search_ca_b12_hnsw_idx','CREATE INDEX company_roles_search_ca_b12_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ca_b12_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''CA'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:3a15cee240ba9d4de1eac2f4e3e40dcb70f2f334c94784b1c91ad5ee5b7b3356'),
('company_roles_search_ca_b13_hnsw_idx','CREATE INDEX company_roles_search_ca_b13_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ca_b13_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''CA'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:efd5043d0ae8f55a6869771883705087eb76f4868d8c1c9c10d456b554fe3244'),
('company_roles_search_ca_b14_hnsw_idx','CREATE INDEX company_roles_search_ca_b14_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ca_b14_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''CA'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:c750872b400b093949695a723679d84db1445b9162d40098039893f45bd5713c'),
('company_roles_search_ca_b15_hnsw_idx','CREATE INDEX company_roles_search_ca_b15_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_ca_b15_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''CA'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:9caf461fbb4873e9db99b2c6072550f21330417cb05d0aed982fc4513f51fa12'),
('company_roles_search_gb_b0_hnsw_idx','CREATE INDEX company_roles_search_gb_b0_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_gb_b0_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''GB'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:3cde26cb4df7e85369b49058faebd81cfabb3de583b2fc6c4531c5e9018a7513'),
('company_roles_search_gb_b1_hnsw_idx','CREATE INDEX company_roles_search_gb_b1_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_gb_b1_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''GB'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:3a5a00b90e377aaeca37b9dd524d7ae9526f49352f544f1f32f4151d41dfbebb'),
('company_roles_search_gb_b2_hnsw_idx','CREATE INDEX company_roles_search_gb_b2_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_gb_b2_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''GB'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:20cdf028f172550f699ff6967e13ac2c87171705703a4bc9df5a36f2690b93dc'),
('company_roles_search_gb_b3_hnsw_idx','CREATE INDEX company_roles_search_gb_b3_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_gb_b3_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''GB'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:d792c0244cf0f57b55a268c5dcef14533241a338b98f11942c661d23ec125e12'),
('company_roles_search_gb_b4_hnsw_idx','CREATE INDEX company_roles_search_gb_b4_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_gb_b4_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''GB'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:3228adf90e1fd332edbe41f04560c7ec55b4845535f8bfdb1dc0517afd1b5c0b'),
('company_roles_search_gb_b5_hnsw_idx','CREATE INDEX company_roles_search_gb_b5_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_gb_b5_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''GB'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:6bab2e1d7dcba3eadd588a17cf86e99790e8cd3ce234078057cb583754e7bbae'),
('company_roles_search_gb_b6_hnsw_idx','CREATE INDEX company_roles_search_gb_b6_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_gb_b6_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''GB'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:b355a69779167f06c142ca137294951233c6806942795588b7ade017a467b279'),
('company_roles_search_gb_b7_hnsw_idx','CREATE INDEX company_roles_search_gb_b7_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_gb_b7_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''GB'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:8e76ed94665af6f7a2f16cf768dbc6f5562b7c34c530d67b36109c207027aba6'),
('company_roles_search_gb_b8_hnsw_idx','CREATE INDEX company_roles_search_gb_b8_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_gb_b8_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''GB'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:a20efefc9d7d2ce4f27870392174a1a0ce90c1f020a09c18fcf13964929f16f3'),
('company_roles_search_gb_b9_hnsw_idx','CREATE INDEX company_roles_search_gb_b9_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_gb_b9_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''GB'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:9ce49986152e4e62e165fb2adc8a3f90b5052fd9b76cbb6a0692b1641691c448'),
('company_roles_search_gb_b10_hnsw_idx','CREATE INDEX company_roles_search_gb_b10_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_gb_b10_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''GB'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:6cefec61a5217eb655e2955d12997efecf4728213fa7d4717dc90c8ea959999d'),
('company_roles_search_gb_b11_hnsw_idx','CREATE INDEX company_roles_search_gb_b11_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_gb_b11_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''GB'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:4be9dc1a3d1f61a1956075650b9bdb83d743af1e71770dc3700df56ecc02bffa'),
('company_roles_search_gb_b12_hnsw_idx','CREATE INDEX company_roles_search_gb_b12_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_gb_b12_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''GB'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:fb11becd4bcd41e0f85ecc067d042d07162dd66a9abf2e808fe5af35e6914a3c'),
('company_roles_search_gb_b13_hnsw_idx','CREATE INDEX company_roles_search_gb_b13_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_gb_b13_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''GB'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:0a00163a5400b966f93508ac8ed1c3ffe484233969db22decd061b0ca0a8c524'),
('company_roles_search_gb_b14_hnsw_idx','CREATE INDEX company_roles_search_gb_b14_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_gb_b14_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''GB'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:8f9217f23493f9809a7f16d4d7eb1081c5f865c97db2a26c85f1e8d3e5a821f2'),
('company_roles_search_gb_b15_hnsw_idx','CREATE INDEX company_roles_search_gb_b15_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_gb_b15_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''GB'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:282aa5031a1407523f11803190df6b863fee20ade7943285d5d4a26634798090'),
('company_roles_search_hk_b0_hnsw_idx','CREATE INDEX company_roles_search_hk_b0_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_hk_b0_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''HK'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:6c5e681197e1a1e7b6313b693c6894b9acf6f930c90fb66357c78790ab669d6e'),
('company_roles_search_hk_b1_hnsw_idx','CREATE INDEX company_roles_search_hk_b1_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_hk_b1_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''HK'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:8d68774d983c051f7e96f58c9cc5c0a0c5c97aeb36dafc5dd42b6633834b322c'),
('company_roles_search_hk_b2_hnsw_idx','CREATE INDEX company_roles_search_hk_b2_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_hk_b2_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''HK'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:51cecb892d914a8de3a39dc2ba07fb60726fe0dd2381e22f2abf37183e7bef84'),
('company_roles_search_hk_b3_hnsw_idx','CREATE INDEX company_roles_search_hk_b3_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_hk_b3_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''HK'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:9b2641316a53b6ac4f848c6bdd25f4c370feeba55d45bc985f0c4411722b0645'),
('company_roles_search_hk_b4_hnsw_idx','CREATE INDEX company_roles_search_hk_b4_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_hk_b4_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''HK'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:dc46b458ff51a48218fa83c757d46457556a6d401e1f453f42ed6a8b60f083d6'),
('company_roles_search_hk_b5_hnsw_idx','CREATE INDEX company_roles_search_hk_b5_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_hk_b5_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''HK'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:e8ad5fcc7d9b55a7be283e8e98261f48e146499686fbcc25bd50b6d2e38f5320'),
('company_roles_search_hk_b6_hnsw_idx','CREATE INDEX company_roles_search_hk_b6_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_hk_b6_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''HK'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:80d97db86fee0802fee7f033af1094d981f1dcbb6e99b77eabd3c2d6d1a67967'),
('company_roles_search_hk_b7_hnsw_idx','CREATE INDEX company_roles_search_hk_b7_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_hk_b7_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''HK'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:7dcab84eac3792f45b8394f1ebef7ab152028c067648045569aa2bc5a8d0dfc6'),
('company_roles_search_hk_b8_hnsw_idx','CREATE INDEX company_roles_search_hk_b8_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_hk_b8_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''HK'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:17a70552bf6b78ea6d83f7fa68c9f10706fa632032a1e1e52b79451e967859d9'),
('company_roles_search_hk_b9_hnsw_idx','CREATE INDEX company_roles_search_hk_b9_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_hk_b9_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''HK'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:891e2a05d9f9475e9eddafe705782d6b215b2d7179b833663fe05121c4691ece'),
('company_roles_search_hk_b10_hnsw_idx','CREATE INDEX company_roles_search_hk_b10_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_hk_b10_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''HK'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:7a3c553d05f9ea22f9542f734eb54c674362f3fcfca49bc1cbf04009aa7266c5'),
('company_roles_search_hk_b11_hnsw_idx','CREATE INDEX company_roles_search_hk_b11_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_hk_b11_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''HK'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:d322b933a77ff0b1f79f0a9c71c8e7c14fd3e9cf3845fc1cd977126c1966f48f'),
('company_roles_search_hk_b12_hnsw_idx','CREATE INDEX company_roles_search_hk_b12_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_hk_b12_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''HK'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:9077c8d830b503804f34d783a6eedee92d9c9ba823cd43227ed2094bdbc676de'),
('company_roles_search_hk_b13_hnsw_idx','CREATE INDEX company_roles_search_hk_b13_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_hk_b13_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''HK'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:313e4e19519ad93b6e903ae2fc9088c37f715bb3a46015e260fc70b8572468e8'),
('company_roles_search_hk_b14_hnsw_idx','CREATE INDEX company_roles_search_hk_b14_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_hk_b14_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''HK'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:26fd9412dac7bcb3d9636f24df68c40ed8a7b83257e5e8d285e2fb382107896b'),
('company_roles_search_hk_b15_hnsw_idx','CREATE INDEX company_roles_search_hk_b15_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_hk_b15_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''HK'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:9b4d967c6d47e3c7cba128f687e69c3f68bbdf2f706a0fadc2835abfa98fd800'),
('company_roles_search_jp_b0_hnsw_idx','CREATE INDEX company_roles_search_jp_b0_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_jp_b0_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''JP'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:27631eec28e75741f3ab66c3b40a35fca75889b6e54f095afc3d0a83f6275281'),
('company_roles_search_jp_b1_hnsw_idx','CREATE INDEX company_roles_search_jp_b1_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_jp_b1_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''JP'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:a36703cfd320dd846eab93fa089ec1d762e00a35c6729117032b864d81961cdc'),
('company_roles_search_jp_b2_hnsw_idx','CREATE INDEX company_roles_search_jp_b2_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_jp_b2_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''JP'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:9102abf02bbd2f1c8049a6677b3798d403521a2b714180cf7d51f37adb6d3961'),
('company_roles_search_jp_b3_hnsw_idx','CREATE INDEX company_roles_search_jp_b3_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_jp_b3_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''JP'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:4920c7ccf8242251c69ac8af3c86d61fb5926ee8286e82eb459c6326d8ed650f'),
('company_roles_search_jp_b4_hnsw_idx','CREATE INDEX company_roles_search_jp_b4_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_jp_b4_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''JP'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:dfb9ce5f5fa3c3e18683a73fc2d22a6d8bc87d940e5610a0d1037798da51b11c'),
('company_roles_search_jp_b5_hnsw_idx','CREATE INDEX company_roles_search_jp_b5_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_jp_b5_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''JP'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:c25cbc02c8c30674ca4667afdb3c52db2af814f5d301a4760f8ae8e5ced48455'),
('company_roles_search_jp_b6_hnsw_idx','CREATE INDEX company_roles_search_jp_b6_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_jp_b6_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''JP'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:b37edf6e4d4a9dc904a2b5abd6381e0a63fe3d9ba9cbc5245366725346699d02'),
('company_roles_search_jp_b7_hnsw_idx','CREATE INDEX company_roles_search_jp_b7_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_jp_b7_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''JP'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:09e05c1309c466836cfd36b010ab0a362f1915687c17cf16c1df4d430411c23e'),
('company_roles_search_jp_b8_hnsw_idx','CREATE INDEX company_roles_search_jp_b8_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_jp_b8_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''JP'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:89680103c0b957215bcbf4a7211c19a50effa2e9cba606d5241aa66cd335d731'),
('company_roles_search_jp_b9_hnsw_idx','CREATE INDEX company_roles_search_jp_b9_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_jp_b9_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''JP'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:0ba83769cf3066fd0e5c8012878207807fd60b60fdcbc25e329abe5534e645a6'),
('company_roles_search_jp_b10_hnsw_idx','CREATE INDEX company_roles_search_jp_b10_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_jp_b10_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''JP'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:d3f2b5507460c75338e1ecac834d5e8aa743613a74f1d2f14f2a840f446df7ae'),
('company_roles_search_jp_b11_hnsw_idx','CREATE INDEX company_roles_search_jp_b11_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_jp_b11_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''JP'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:28c753d456be5cfa1f9b5ed273c7b853e4b1689db8178f56dcdeb4cb824cdc10'),
('company_roles_search_jp_b12_hnsw_idx','CREATE INDEX company_roles_search_jp_b12_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_jp_b12_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''JP'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:84d26fbbd5d2225c9e86e40517fd0131ca6b37068322b4f0735243bae0c5b7e1'),
('company_roles_search_jp_b13_hnsw_idx','CREATE INDEX company_roles_search_jp_b13_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_jp_b13_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''JP'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:76dd36498d1c677336d57a131228c029c8caec6ef4d83bf1497feae993064a74'),
('company_roles_search_jp_b14_hnsw_idx','CREATE INDEX company_roles_search_jp_b14_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_jp_b14_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''JP'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:34ca261b98c44f4a36b3f4dfb99bba4e9de5e51fb81e67b879c71a3f6ec8a970'),
('company_roles_search_jp_b15_hnsw_idx','CREATE INDEX company_roles_search_jp_b15_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_jp_b15_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''JP'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:ee27487bd357167768342cbffc9ccc8baf539501f0fbf11e6376e7cf9659ee90'),
('company_roles_search_kr_b0_hnsw_idx','CREATE INDEX company_roles_search_kr_b0_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_kr_b0_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''KR'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:781267996ab785c7e6c9cf8003e08f84e34cdbc88e7ed572fda44521fffd7b59'),
('company_roles_search_kr_b1_hnsw_idx','CREATE INDEX company_roles_search_kr_b1_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_kr_b1_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''KR'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:53fb865e2066318cca333bf419ca5a8cfb3daa9f3ed88f6ebec511a42f3907dd'),
('company_roles_search_kr_b2_hnsw_idx','CREATE INDEX company_roles_search_kr_b2_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_kr_b2_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''KR'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:822fff941053b2855c9aa3b96ee2feb741ea4eec5893ab7cb16e68adc9687763'),
('company_roles_search_kr_b3_hnsw_idx','CREATE INDEX company_roles_search_kr_b3_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_kr_b3_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''KR'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:160bb44ddaa1e1f1e2563e073f06ba2615f131fb529c4ec539834e7ac08426c6'),
('company_roles_search_kr_b4_hnsw_idx','CREATE INDEX company_roles_search_kr_b4_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_kr_b4_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''KR'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:f97f4f94c6f89ab37662f43131b596405e6e6d5fcaecbd744616e7b4dddce5f2'),
('company_roles_search_kr_b5_hnsw_idx','CREATE INDEX company_roles_search_kr_b5_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_kr_b5_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''KR'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:1e1e6851d4f140153d01c1319d33f194b21297c3eeeccf254c360a4c83eb69e2'),
('company_roles_search_kr_b6_hnsw_idx','CREATE INDEX company_roles_search_kr_b6_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_kr_b6_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''KR'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:c099e72b021a165fbff557a55c9f2a78a1978ee32d2b537da65a2e7278677c90'),
('company_roles_search_kr_b7_hnsw_idx','CREATE INDEX company_roles_search_kr_b7_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_kr_b7_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''KR'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:099b76b9bc8feb400c2ea8f8f65dec1de7aa6959b3a2bff59ec875fc92e7a7bd'),
('company_roles_search_kr_b8_hnsw_idx','CREATE INDEX company_roles_search_kr_b8_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_kr_b8_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''KR'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:05e9c005efd62d185060a9702129bbb7b03f0de33e6c72e9debf4b6752a266c2'),
('company_roles_search_kr_b9_hnsw_idx','CREATE INDEX company_roles_search_kr_b9_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_kr_b9_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''KR'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:249c8964a0333466f55685bf290fa8304d9dfe0730e50eab44434d500898fb6f'),
('company_roles_search_kr_b10_hnsw_idx','CREATE INDEX company_roles_search_kr_b10_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_kr_b10_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''KR'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:7af55fb93e3e82afd14a950a74074fbbeb8f28a81c708f54b5165a92eadd6d8b'),
('company_roles_search_kr_b11_hnsw_idx','CREATE INDEX company_roles_search_kr_b11_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_kr_b11_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''KR'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:6a3acc7a6053ab1a41484d42ef129be308db4029be698437516637b6a0a9941c'),
('company_roles_search_kr_b12_hnsw_idx','CREATE INDEX company_roles_search_kr_b12_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_kr_b12_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''KR'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:86edae04ea18a8991c62dbc9cf097a50bf20c952676aed254828600412a8ee99'),
('company_roles_search_kr_b13_hnsw_idx','CREATE INDEX company_roles_search_kr_b13_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_kr_b13_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''KR'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:1c345a07f50ba8ecb3bda3f7c523d35c0e0b601920d44e120b7d80aa7c3b2f9a'),
('company_roles_search_kr_b14_hnsw_idx','CREATE INDEX company_roles_search_kr_b14_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_kr_b14_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''KR'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:966ce13c6cbf570252cb79fcedf57899ba16e21e223c27b1dbcdcbee2d41f911'),
('company_roles_search_kr_b15_hnsw_idx','CREATE INDEX company_roles_search_kr_b15_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_kr_b15_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''KR'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:61a88086e7c45120b72bead447026a1558eee01cc699ac1a016d775d2ddef87d'),
('company_roles_search_sg_b0_hnsw_idx','CREATE INDEX company_roles_search_sg_b0_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_sg_b0_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''SG'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:ae65674e9d5d2a0967c513c9d90e9ac73fad7a663175888677662a22dda48ffd'),
('company_roles_search_sg_b1_hnsw_idx','CREATE INDEX company_roles_search_sg_b1_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_sg_b1_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''SG'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:4de1258328736f00c33893828020044122f6d07fed0773a943b1e44c8dcd5e23'),
('company_roles_search_sg_b2_hnsw_idx','CREATE INDEX company_roles_search_sg_b2_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_sg_b2_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''SG'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:8d05afe664e307da1dad657d1afa41ddd48b8bac1cc668f98257c567b7738e0b'),
('company_roles_search_sg_b3_hnsw_idx','CREATE INDEX company_roles_search_sg_b3_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_sg_b3_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''SG'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:4c5a380be08647b0e474e873c49142dbd552e5d3052002e96e8b1799555c585d'),
('company_roles_search_sg_b4_hnsw_idx','CREATE INDEX company_roles_search_sg_b4_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_sg_b4_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''SG'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:0eb70b200cf09d07a1f96ab8d66d827933f87f190768a60a12a66256d2f6f70e'),
('company_roles_search_sg_b5_hnsw_idx','CREATE INDEX company_roles_search_sg_b5_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_sg_b5_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''SG'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:d9e1e2f4bc771dd7581ee39be6defc2e5078176730c74a258753198b11d3cf74'),
('company_roles_search_sg_b6_hnsw_idx','CREATE INDEX company_roles_search_sg_b6_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_sg_b6_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''SG'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:69d9aa77ec26907d629e463e15d7b151e491d3a9857571146d71abf13d9780c6'),
('company_roles_search_sg_b7_hnsw_idx','CREATE INDEX company_roles_search_sg_b7_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_sg_b7_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''SG'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:c89a2547342e4361ccb08d221ec552121857f37081f261fdead08e209ca356a3'),
('company_roles_search_sg_b8_hnsw_idx','CREATE INDEX company_roles_search_sg_b8_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_sg_b8_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''SG'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:d7596f5586dccbb074a903e1168348cc68cce4a8707fed3dbd82adea0805f884'),
('company_roles_search_sg_b9_hnsw_idx','CREATE INDEX company_roles_search_sg_b9_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_sg_b9_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''SG'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:a530735a555261dba8306d02d8e05f428c2d33de53c548ee4d9bd1e3058c67d4'),
('company_roles_search_sg_b10_hnsw_idx','CREATE INDEX company_roles_search_sg_b10_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_sg_b10_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''SG'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:9074fb874298879cd52b27b770a1b89b6c8e5777c9dfddb87e7d01788a003bd9'),
('company_roles_search_sg_b11_hnsw_idx','CREATE INDEX company_roles_search_sg_b11_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_sg_b11_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''SG'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:bd34a7eeed1e75da796ea3c42451c01c6690f254345cc7c7904c02f73a0f004b'),
('company_roles_search_sg_b12_hnsw_idx','CREATE INDEX company_roles_search_sg_b12_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_sg_b12_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''SG'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:149cbe7705ea49b102bc00084f12ce21f477b5431b317be5534fc80e1cd8823b'),
('company_roles_search_sg_b13_hnsw_idx','CREATE INDEX company_roles_search_sg_b13_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_sg_b13_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''SG'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:17c3e6051edce425ef387656a274a8226fcb3f441d4fee0314b7cc62e882e5ce'),
('company_roles_search_sg_b14_hnsw_idx','CREATE INDEX company_roles_search_sg_b14_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_sg_b14_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''SG'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:5e94241238c81022997ac110792e60bb08da24163db98a40f4fc1937236bab0f'),
('company_roles_search_sg_b15_hnsw_idx','CREATE INDEX company_roles_search_sg_b15_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_sg_b15_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''SG'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:9b40ff2f7b05e6453df0669e07beaaac99cecc62b69da57f2b0b25be6d11aa5a'),
('company_roles_search_us_b0_hnsw_idx','CREATE INDEX company_roles_search_us_b0_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_us_b0_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''US'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:9f427b5fd7408d6fc880ccbb9771ebfdd707cc2c6e4b1cb9fdd433b0e68df236'),
('company_roles_search_us_b1_hnsw_idx','CREATE INDEX company_roles_search_us_b1_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_us_b1_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''US'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:0e5ddeec2af53ed2b7423828900dce33b9646c6e33d33a0342a0d99bcc10fa7d'),
('company_roles_search_us_b2_hnsw_idx','CREATE INDEX company_roles_search_us_b2_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_us_b2_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''US'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:431f3994a14f5df5f3df2e8f6a2e6222d645f058aa97983ec870e6377bce56c1'),
('company_roles_search_us_b3_hnsw_idx','CREATE INDEX company_roles_search_us_b3_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_us_b3_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''US'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:337115fc51864ea373de0fd7534242d1456ba40f6deefa6f13514054a6aec0a1'),
('company_roles_search_us_b4_hnsw_idx','CREATE INDEX company_roles_search_us_b4_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_us_b4_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''US'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:40d141942dc5725c334ad9b9565f210ff1fabe1fdba113e06e605cea7789c94d'),
('company_roles_search_us_b5_hnsw_idx','CREATE INDEX company_roles_search_us_b5_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_us_b5_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''US'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:d8a3b80e80d190fd08fc55c1b9928fc19fa54857ce2a89e6628a9e0a8a00af7f'),
('company_roles_search_us_b6_hnsw_idx','CREATE INDEX company_roles_search_us_b6_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_us_b6_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''US'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:f55ab3af061f2a87efbab491621ac4b98538636d833c6db7108d657678379fb8'),
('company_roles_search_us_b7_hnsw_idx','CREATE INDEX company_roles_search_us_b7_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_us_b7_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''US'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:2bc561a2504693426394c55b9b34a8ffb2d3a27808dbc2612e944034aa9a73c8'),
('company_roles_search_us_b8_hnsw_idx','CREATE INDEX company_roles_search_us_b8_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_us_b8_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''US'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:6094f16da45633c7f4e5ae89506872f4f89831548fc07ceddc755a45d650c72d'),
('company_roles_search_us_b9_hnsw_idx','CREATE INDEX company_roles_search_us_b9_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_us_b9_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''US'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:d95f875c1c4eca19189f7601c40138740a1560034c9c64c2567434911bb65d12'),
('company_roles_search_us_b10_hnsw_idx','CREATE INDEX company_roles_search_us_b10_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_us_b10_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''US'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:ad6617bdcbb7f1974ba74715076b03a62c57cf2fe6026b7f38024be8cc773434'),
('company_roles_search_us_b11_hnsw_idx','CREATE INDEX company_roles_search_us_b11_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_us_b11_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''US'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:283798bfe7b6265249da6e8ac3fbd88b5878e9fa7d6633456ebb3bf21b8f4ee4'),
('company_roles_search_us_b12_hnsw_idx','CREATE INDEX company_roles_search_us_b12_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_us_b12_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''US'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:71e3da6da889a0f73b14cc40a8d26aa8001e7d8b23f10f481dae2911e010f0a3'),
('company_roles_search_us_b13_hnsw_idx','CREATE INDEX company_roles_search_us_b13_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_us_b13_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''US'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:5774747ea0d1fddcbe4d48ee8eee4540fad54db5e09756ba98546a3ffffd5051'),
('company_roles_search_us_b14_hnsw_idx','CREATE INDEX company_roles_search_us_b14_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_us_b14_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''US'' AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:4fd85402dacfb33b231c4acea6da6bc8bdfc7f0fb96c95d88e54c4216769e708'),
('company_roles_search_us_b15_hnsw_idx','CREATE INDEX company_roles_search_us_b15_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_us_b15_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND country_code=''US'' AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:03089519e401926841690de0a557b144a9053198c3dd25caa72d5b8f25870603'),
('company_roles_search_all_b0_hnsw_idx','CREATE INDEX company_roles_search_all_b0_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_all_b0_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:60c29337bb1051c741b0310b96155e891876a37df8d62837256da3d12438e514'),
('company_roles_search_all_b1_hnsw_idx','CREATE INDEX company_roles_search_all_b1_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_all_b1_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:0a9203fb964da4a09bb07934071be0c8269ed0c3b2adbef632b0c97a0ef11e30'),
('company_roles_search_all_b2_hnsw_idx','CREATE INDEX company_roles_search_all_b2_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_all_b2_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:287753282c774555c6cf1763adb5dca27e0686ec9032f9d2add590750d26448e'),
('company_roles_search_all_b3_hnsw_idx','CREATE INDEX company_roles_search_all_b3_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_all_b3_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:681c28c0af701bcbe5d6b814509b5d374b8997017e3c94d45ddb0deb5ebe259c'),
('company_roles_search_all_b4_hnsw_idx','CREATE INDEX company_roles_search_all_b4_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_all_b4_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:667c00031f8761c2f121ba8124de24e5c85aa3df881435feb10d5fb0479d60bb'),
('company_roles_search_all_b5_hnsw_idx','CREATE INDEX company_roles_search_all_b5_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_all_b5_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:f1bade74e9165c07dce3aa58ca947d0ff38e124fcbed9aa6a1ea4c65de66d8f6'),
('company_roles_search_all_b6_hnsw_idx','CREATE INDEX company_roles_search_all_b6_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_all_b6_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:9afbddb39800618db830bd3efbbd6c6a4fc3de83446408caf1e2b345ad82addd'),
('company_roles_search_all_b7_hnsw_idx','CREATE INDEX company_roles_search_all_b7_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_all_b7_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND NOT (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:efabf780da2049e98e5f99a559733ed905590e126578b21eb2384f4c28a7ae92'),
('company_roles_search_all_b8_hnsw_idx','CREATE INDEX company_roles_search_all_b8_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_all_b8_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:56be9b6efc67d6b258f1670852d55f01dcc532cfba321d3789445bf641b18d78'),
('company_roles_search_all_b9_hnsw_idx','CREATE INDEX company_roles_search_all_b9_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_all_b9_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:ccd4a37d7abaa7ad7afaddc441d62c988640d4735dc1cf33b4109c2e185ef469'),
('company_roles_search_all_b10_hnsw_idx','CREATE INDEX company_roles_search_all_b10_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_all_b10_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:42ebea8dab67ef859017f6bb1b4ff345243cc0d24e2830417712130588fc70f2'),
('company_roles_search_all_b11_hnsw_idx','CREATE INDEX company_roles_search_all_b11_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_all_b11_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:99fae4e617094b4d45ec3c89827e0b9478b465b8ab6046745945b9d9dacca022'),
('company_roles_search_all_b12_hnsw_idx','CREATE INDEX company_roles_search_all_b12_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_all_b12_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:bb5c5a3eb1100abea086e801324248955058b461babda56c869d02d82dc2b45f'),
('company_roles_search_all_b13_hnsw_idx','CREATE INDEX company_roles_search_all_b13_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_all_b13_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND NOT public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:87b5a43d4d7402eb4641b6f9250389ae3a47f6682d1a4414c6b0a19368a87b0d'),
('company_roles_search_all_b14_hnsw_idx','CREATE INDEX company_roles_search_all_b14_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_all_b14_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND NOT public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:e5d13e0c98482ce795c894779bbc623dde9d4315c69c18c0c06718871342243c'),
('company_roles_search_all_b15_hnsw_idx','CREATE INDEX company_roles_search_all_b15_hnsw_idx
 ON public.company_roles USING hnsw
 ((public.external_role_index_vector(title_embedding,''company_roles_search_all_b15_hnsw_idx'')::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE source_type = ''external''
 AND COALESCE(is_expired, false) = false
 AND status NOT IN (''ended'', ''expired'', ''closed'', ''inactive'', ''archived'')
 AND COALESCE(source_provider, '''') <> ''user_submitted''
 AND lower(coalesce(information->>''testOnly'', ''false'')) <> ''true''
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name AND public.external_role_has_type(type, ARRAY[''internship'',''intern'',''인턴'']::text[]) AND public.external_role_has_type(type, ARRAY[''part_time'',''part-time'',''part time'',''파트타임'']::text[]) AND public.external_role_has_type(type, ARRAY[''contract'',''contractor'',''계약'',''계약직'']::text[]) AND (lower(coalesce(work_mode,''''))=''remote'')','harper:title-bucket:v2:b601d88ad7485fc556a93bffe05ba3d2dc9b1dfbf59c8d3fe969fda7138780dc')
 ) AS definitions(name,ddl,fingerprint) LOOP
  IF to_regclass('public.'||item.name) IS NULL THEN
   EXECUTE item.ddl;
   EXECUTE format('COMMENT ON INDEX public.%I IS %L',item.name,item.fingerprint);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.'||item.name) AND indisvalid AND indisready AND obj_description(indexrelid,'pg_class')=item.fingerprint) THEN
   RAISE EXCEPTION 'Inspect incomplete or mismatched index %',item.name;
  END IF;
 END LOOP;
END
$migration$;
