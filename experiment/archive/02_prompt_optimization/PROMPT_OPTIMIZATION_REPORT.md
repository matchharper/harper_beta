# Prompt Optimization & Robustness Test Report

## 1. Overview
This report summarizes the improvements made to `prompt1.md` and `prompt2.md` to ensure high-performance SQL generation for the candidate search pipeline, along with validation results from various search scenarios.

## 2. Key Prompt Improvements
### Objective A: Index Utilization
- **Enforced `ILIKE ANY (ARRAY[...])`**: Replaced the non-standard pipe (`|`) syntax with `ILIKE ANY` to ensure PostgreSQL consistently uses GIN trigram indexes on `location`, `company_db.name`, and `experience_user.role`.
- **Statistics-Aware Guidance**: Added explicit instructions in `prompt2.md` to prioritize columns with high-precision statistics (`SET STATISTICS 1000`).

### Objective B: Structural Efficiency
- **EXISTS over JOIN/DISTINCT**: Mandated the use of `EXISTS` for same-row matching and filtering. This prevents data multiplication (fan-out) issues and allows the PostgreSQL planner to use more efficient Semi-Join execution plans.
- **FTS Phrase Matching**: Clarified the use of the `<->` operator in `to_tsquery` to ensure accurate phrase matching in the `fts` (summary) column.

## 3. Validation Results (Scalability Testing)
A total of 8 diverse test cases were executed against the local database to verify execution plans.

| Test Case | Intent | Result | Execution Plan Highlights |
| :--- | :--- | :--- | :--- |
| 1. Specific Co + Role | Kakao + PM | **SUCCESS** | Index Scan on `idx_candid_fts`, `idx_exp_user_candid_id` |
| 2. Loc + Edu + Tech | Seoul + SNU + Python | **SUCCESS** | Index Scan on all criteria, Bitmap Heap Scan |
| 3. Niche Intent | Blockchain + Founder | **SUCCESS** | Efficient SubPlan usage with EXISTS |
| 4. Pub Heavy | Lidar Sensor + Research | **SUCCESS** | Index Scan on Publications and Experience |
| 5-8. Version w/ Exp | (Above + 5-10 yrs exp) | **SUCCESS** | Efficient filtering on `total_exp_months` |

### Execution Plan Analysis
In all cases, the PostgreSQL optimizer correctly chose **Index Scans** or **Bitmap Index Scans**. No full table scans (Sequential Scans) were detected on core tables, ensuring the system will scale gracefully to 140,000+ rows.

## 4. Final Recommendations
- The updated prompts should be deployed to the production LLM environment immediately.
- Regular monitoring of `total_exp_months` data quality is recommended, as it is a frequent filter in complex queries.
