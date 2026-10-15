-- Initial population only. The following migration restores HNSW after bulk loading.
-- V2 runtime has not been deployed; no production reader depends on this index yet.
set local lock_timeout='5s';
drop index if exists public.external_role_title_embeddings_hnsw;
