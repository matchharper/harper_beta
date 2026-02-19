-- Hybrid Search Setup Migration
-- This script adds vector search capabilities without modifying existing columns.

-- 1. Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add the embedding column to the candid table
-- Using VECTOR(1536) for OpenAI's text-embedding-3-small model.
ALTER TABLE public.candid 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. Create an HNSW index for high-performance vector similarity search
-- m=16, ef_construction=64 are standard starting values for balancing build speed and search quality.
-- We use cosine distance (vector_cosine_ops) which is standard for OpenAI embeddings.
CREATE INDEX IF NOT EXISTS idx_candid_embedding_hnsw 
ON public.candid USING hnsw (embedding vector_cosine_ops);

ANALYZE public.candid;

-- 4. Verify the changes (Optional info)
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'candid' AND column_name = 'embedding';
