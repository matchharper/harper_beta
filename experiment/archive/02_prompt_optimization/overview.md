# Task Overview: LLM Search Pipeline Prompt Optimization & Scalability Testing

## 1. Context & Assumptions
- This task builds upon the findings in `archive/01_query_optimization/`.
- The established optimization strategies (e.g., GIN trgm indexes on `location`, `name`, `role`, and using `EXISTS` / `ILIKE ANY` / `fts`) are considered valid and must be enforced.
- In this system, LLM generates a SQL query based on a user prompt to retrieve a candidate set.

## 2. Background
The current SQL generation pipeline uses two prompts:
1.  **`prompt1.md` (Logic Design):** Focuses on capturing user intent and structuring the WHERE clause logically (grouped ORs, ANDs, and same-row enforcement via `EXISTS`).
2.  **`prompt2.md` (Optimization):** Refines the output of Stage 1 into a high-performance PostgreSQL query, focusing on `ILIKE ANY`, `fts`, and efficient execution plans.

The reference optimized query is located at `database/optimized_query.sql`.

## 3. Objectives
### Objective A: Prompt Refinement (Consistency & Best Practices)
Refine `prompt1.md` and `prompt2.md` so that the LLM consistently generates queries that:
- Adhere to the performance strategies discovered in the previous optimization phase (e.g., avoiding patterns that trigger sequential scans, correctly using `ILIKE ANY` with the `pg_trgm` index).
- Use the most efficient SQL constructs (e.g., `EXISTS` for same-row matching, `INTERSECT` vs. `AND` where appropriate).
- Maintain high recall for Stage 1 while minimizing redundant or non-selective conditions.

### Objective B: Scalability & Robustness Testing
Validate the updated prompts and the overall search logic against a diverse set of search scenarios.
- Generate various complex user prompts (e.g., multi-intent, niche roles, specific company/school combinations).
- Analyze the generated SQL execution plans (`EXPLAIN ANALYZE`) on the local dataset.
- Identify and mitigate edge cases where the LLM might generate queries leading to full table scans or poor performance as data scales to ~140,000+ rows.

## 4. Deliverables
- Updated `prompt1.md` and `prompt2.md` in `current_works/`.
- A set of test cases and their corresponding execution results/plans in a new report file.
- Final validation that generated queries consistently stay under the target performance threshold (estimated < 1s on sample data, < 1m on production-scale data).