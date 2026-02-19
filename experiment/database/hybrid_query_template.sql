-- Unified Hybrid Search Query Template
-- Combines pgvector semantic search + Full-Text Search (FTS) + Relational Filtering

WITH hybrid_search AS (
    SELECT 
        c.id,
        -- 1. Semantic Similarity (pgvector)
        -- Using cosine distance, so 1 - distance = similarity
        (1 - (c.embedding <=> $1::vector)) as vector_score,
        
        -- 2. Keyword Rank (FTS)
        ts_rank(c.fts, to_tsquery('english', $2)) as keyword_score,
        
        -- Include fields for filtering/display
        c.name,
        c.headline,
        c.location,
        c.total_exp_months
    FROM public.candid c
    WHERE 
        -- Optional keyword pre-filter to reduce vector calculation overhead (if needed)
        -- c.fts @@ to_tsquery('english', $2) 
        -- OR
        -- Just let the ranking handle it
        TRUE
)
SELECT 
    id,
    name,
    headline,
    location,
    total_exp_months,
    vector_score,
    keyword_score,
    -- 3. Hybrid Scoring Formula: (Vector * 0.6) + (Keyword * 0.4)
    (COALESCE(vector_score, 0) * 0.6 + COALESCE(keyword_score, 0) * 0.4) as final_score
FROM hybrid_search
WHERE 
    -- 4. Relational Filters (Previous optimization results)
    total_exp_months <= 144
    AND (
        location ILIKE ANY (ARRAY['%korea%', '%seoul%'])
        OR EXISTS (
            SELECT 1 FROM edu_user eu 
            WHERE eu.candid_id = id 
            AND eu.school ILIKE ANY (ARRAY['%snu%', '%seoul national%'])
        )
    )
ORDER BY final_score DESC
LIMIT 10;
