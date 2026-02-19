# Action Plan: Hybrid Search Core Verification (Schema-Preserving)

## Phase 1: Infrastructure & Schema Preparation
- [x] **Verify pgvector:** Check if the `vector` extension is available in the `harper-postgres` container.
- [x] **Schema Enhancement:**
    - Add `embedding` column (`VECTOR(1536)`) to `public.candid`.
    - Create an HNSW index on `candid.embedding` for optimal search performance.
- [x] **Integrity Check:** Ensure new additions do not conflict with existing `idx_candid_location_trgm` or `fts` indexes.

## Phase 2: Relational Data Aggregation (The "Profile Text" Strategy)
- [x] **Aggregation SQL Development:** Create a SQL query or View that constructs a comprehensive `profile_text` for each candidate by joining:
    - `candid` (name, headline, summary, bio)
    - `experience_user` + `company_db` (roles, descriptions)
    - `edu_user` (schools, fields)
    - `publications` (titles)
- [x] **Validation:** Verify the generated text covers all critical keywords for semantic matching.

## Phase 3: Embedding & Hybrid Search Verification
- [x] **Sample Embedding Generation:**
    - Generate embeddings for a sample set (e.g., top 100 candidates) using the OpenAI API or mock vectors to test the logic.
- [x] **Unified Hybrid Query Implementation:**
    - Develop the final SQL query that combines:
        1. **Semantic Score:** Cosine similarity via `candid.embedding`.
        2. **Keyword Score:** `ts_rank` via `candid.fts`.
        3. **Relational Filters:** `total_exp_months`, `location` matching.
- [x] **Weight Calibration:** Test if the 0.6/0.4 weight ratio produces intuitive results.

## Phase 4: Final Evaluation
- [x] **Performance Benchmarking:** Use `scripts/benchmark.py` to measure the hybrid query speed.
- [x] **Result Comparison:** Compare hybrid results with the previous "SQL-only" optimized query results.
- [x] **Reporting:** Document the core verification results and finalize the architectural feasibility report.