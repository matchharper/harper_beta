# Action Plan: Prompt Optimization & Scalability Testing

## Phase 1: Knowledge Integration (Completed)
- [x] Review `archive/01_query_optimization/OPTIMIZATION_REPORT.md` and `database/optimized_query.sql` to extract concrete rules for the prompts.
- [x] Analyze existing `prompt1.md` and `prompt2.md` for gaps regarding these rules.

## Phase 2: Prompt Refinement (Completed)
- [x] Update `prompt1.md` to improve logical structuring and initial keyword selection (Integrated `ILIKE ANY` and `EXISTS` rules).
- [x] Update `prompt2.md` to enforce high-performance PostgreSQL patterns (e.g., `ILIKE ANY` usage with `pg_trgm`, `EXISTS` optimization, statistics-aware query structure).

## Phase 3: Validation & Testing (Completed)
- [x] Create a test suite of 8 varied user search prompts, including cases with "Years of Experience" (연차).
- [x] For each test case:
    - [x] Generate SQL using the new prompts.
    - [x] Run `EXPLAIN ANALYZE` on the local database.
    - [x] Verify that no unexpected sequential scans occur on indexed columns.
- [x] Iterate on prompts to ensure high recall and performance (Confirmed Index Scans for all 8 cases).

## Phase 4: Finalization (Completed)
- [x] Consolidate results into a final report (`PROMPT_OPTIMIZATION_REPORT.md`).
- [x] Final check of all deliverables against `overview.md`.