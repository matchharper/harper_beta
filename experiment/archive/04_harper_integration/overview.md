# Mission: High-Performance Hybrid Search Integration

## 1. Objective
Improve the search speed and quality of the `harper_beta` service by integrating research findings from `archive/`:
- **Speed:** Goal is < 1s for typical searches.
- **Quality:** Implement **Hybrid Search** (Semantic + Keyword) using `pgvector`.
- **Consistency:** Use optimized LLM prompts for reliable SQL generation.

## 2. Target Context (`harper_beta`)
- **Main Logic:** `src/app/api/search/parse.ts`
- **Prompts:** `src/lib/prompt.ts`
- **Database:** Supabase (PostgreSQL) with `pgvector` extension.

## 3. Reference Research (`archive/`)
- `01_query_optimization`: SQL performance (GIN trgm, EXISTS).
- `02_prompt_optimization`: Refined logic for LLM-generated SQL.
- `03_hybrid_architecture`: Hybrid scoring logic and schema enhancement.

---

## 4. Master Action Plan

### Phase 1: Codebase Analysis & Mapping (Completed)
- [x] Map `harper_beta` database schema to our research schema.
- [x] Identify all entry points for search (`/api/search/start`, `/api/search/run`).
- [x] Document current SQL generation flow in detail.

### Phase 2: Database & Infrastructure Setup (Completed)
- [x] Verify `pgvector` extension in the target Supabase environment.
- [x] Add `embedding` column (`VECTOR(1536)`) to the `candid` table.
- [x] Create HNSW index for the `embedding` column.
- [x] Implement/Run `profile_text` aggregation script to prepare for embedding generation.

### Phase 3: Prompt & Logic Integration (Completed)
- [x] Replace/Merge `src/lib/prompt.ts` with optimized prompts.
- [x] Update `src/app/api/search/parse.ts` to:
    1. Generate embeddings for the user query (via OpenAI).
    2. Execute Hybrid SQL (combining `pgvector` similarity and `ts_rank`).
    3. Maintain existing filters (location, experience, etc.) as hard constraints.

### Phase 4: Verification & Benchmarking (Completed)                                        │
- [x] Compare search results quality (Keyword-only vs Hybrid).                              │
- [x] Measure execution time for complex queries.                                           │
- [x] Verify error handling and fallback modes.

---

## 5. Progress Tracking (Current Task)
- **Current Step:** Mission Completed.
- **Final Status:** Hybrid Search engine is integrated and verified for quality.
Performance optimization (HNSW) is in progress at the database level.
