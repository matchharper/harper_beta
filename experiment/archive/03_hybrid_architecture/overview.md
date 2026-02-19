# Core Architecture Evolution: Hybrid Search Implementation

## 1. Context & Strategic Shift
Building upon the SQL optimization and prompt refinement phases (`archive/01` & `archive/02`), we are now moving towards a fundamental architectural improvement of our retrieval engine. 

The current system operates as a **single-stage SQL retrieval engine**. This task aims to evolve this engine from a "Keyword-only" (FTS + Trgm) approach to a **Hybrid Search** engine, as proposed in `current_works/new_plan.md`, integrating semantic capabilities directly into the SQL layer.

## 2. Fundamental Constraint: Schema Preservation
**CRITICAL:** `new_plan.md` was drafted as a standalone project guide and assumes a simplified/flat schema. However, our implementation **MUST**:
- **Maintain the existing normalized structure** (`candid`, `experience_user`, `edu_user`, `company_db`, `publications`, etc.).
- Integrate `pgvector` and semantic embeddings as an **augmentation** to the current schema, not a replacement.
- Ensure that relational integrity and existing performance optimizations (Trgm indexes, FTS) are preserved.

## 3. Objective
Validate the feasibility and performance of a Hybrid Search retrieval engine (Semantic + Keyword + Logical Filtering) that operates across our existing normalized database structure.

## 4. Technical Implementation Context (Target Stack)
- **Vector Database:** PostgreSQL with `pgvector` extension.
- **Embedding Model:** OpenAI `text-embedding-3-small` (1536 dimensions).
- **Search Logic:** Hybrid scoring combining Vector Similarity (Cosine) and Keyword Rank (ts_rank).
- **Deployment Platform:** Designed for Railway/Supabase-like PostgreSQL environments.

## 5. Core Verification Tasks
### Task A: pgvector Integration & Schema Enhancement
- Verify `pgvector` extension availability in the current environment.
- Add a `VECTOR(1536)` column named `embedding` to the **existing `candid` table**.
- Establish a vector index (HNSW or IVFFlat) and verify coexistence with existing indexes.

### Task B: Cross-Table Data Aggregation for Embeddings
- Define a SQL-based strategy to aggregate a candidate's full profile from normalized tables (`experience_user`, `edu_user`, etc.) into a single `profile_text` string.
- This text will be the source for generating semantic embeddings.

### Task C: Hybrid Scoring Logic Calibration
- Implement a unified SQL query that calculates:
  `final_score = (vector_similarity * 0.6) + (ts_rank(fts) * 0.4)`
- Ensure that logical filters (e.g., `total_exp_months`, `location`) from previous prompt iterations still apply.

## 6. Non-Goals (Out of Scope for this Phase)
- Full implementation of a FastAPI application.
- Setting up Redis caching layers.
- End-to-end deployment to Railway.
- Implementing the "LLM Evaluation Stage" (Stage 2) changes.

## 7. Success Criteria & Deliverables
- **Successful Hybrid Query:** A SQL query that joins multiple tables and returns results based on a combined semantic/keyword score.
- **Feasibility Report:** Proof that semantic search captures relevant candidates that were previously missed by keyword-only logic.
- **Performance:** Core search logic must execute in `< 1s` on the local dataset.
- **Deliverables:** Updated `schema.sql`, sample hybrid query, and a verification report.
