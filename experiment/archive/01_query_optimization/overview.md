# Optimization Task: Candidate Search Query Performance

## 1. Objective
**Primary Goal:** Reduce the execution time of the SQL query in `sample_query.sql` to **under 1 minute** (currently ~3 minutes).
**Secondary Goal:** Eliminate dependency on Supabase if feasible, or optimize within the Supabase/PostgreSQL context.

## 2. Context & Constraints
*   **Current Infrastructure:** Supabase (PostgreSQL).
*   **Data Volume:** ~140,000 rows in the `candid` (user) table.
*   **Current Performance:** Query takes ~3 minutes to execute and return results to the frontend.
*   **Flexibility:**
    *   Open to migrating to a self-hosted PostgreSQL or MariaDB if it simplifies testing or improves performance.
    *   Open to moving complex logic from DB layer to Application layer.

## 3. Technical Analysis
### The Query (`sample_query.sql`)
*   **Logic:** Filters candidates based on:
    *   Experience duration (`<= 144` months).
    *   Location (wildcard match).
    *   Education (School name wildcard match).
    *   Work Experience (Company name & Role wildcard matches).
*   **Performance Bottlenecks:**
    *   Extensive use of `ILIKE ANY (ARRAY['%pattern%', ...])`.
    *   `OR` conditions between main table and sub-queries (`EXISTS`).
    *   `JOIN` operations across `candid`, `edu_user`, `experience_user`, and `company_db`.
    *   Ordering by `ts_rank` (Full Text Search).

### The Schema (`schema.sql`)
*   **Tables:** `candid`, `edu_user`, `experience_user`, `company_db`, etc.
*   **Indexes:**
    *   `GIN` indexes with `gin_trgm_ops` exist on text columns (`headline`, `school`, `role`, `name`, etc.), suggesting `pg_trgm` extension is intended for `LIKE` optimization.
    *   Standard `btree` indexes on foreign keys.

## 4. Resources
*   `sample_query.sql`: The target query to optimize.
*   `schema.sql`: DDL for reproducing the database structure.
*   `database/data/*.csv`: Sample data for population (essential for local reproduction).

## 5. Action Plan
1.  **Environment Setup:**
    *   Set up a local PostgreSQL instance (Docker recommended).
    *   Import `schema.sql`.
    *   Load CSV data from `database/data/` into the tables.
2.  **Baseline Measurement:**
    *   Execute `sample_query.sql` locally and record the execution plan (`EXPLAIN ANALYZE`) and timing.
3.  **Optimization Iterations:**
    *   **Index Optimization:** Verify if `pg_trgm` is enabled and effectively used by the `ILIKE` clauses.
    *   **Query Refactoring:**
        *   Test removing `OR` conditions (union approach).
        *   Optimize `EXISTS` subqueries.
        *   Consider denormalization if joins are too costly.
    *   **Configuration:** Tune PostgreSQL parameters (`work_mem`, `random_page_cost`, etc.) for the dataset size.
4.  **Verification:**
    *   Compare new execution time against the baseline and the < 1 minute target.
