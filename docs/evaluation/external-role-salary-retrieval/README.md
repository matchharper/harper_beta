# External role salary retrieval

## Objective and unit

Evaluate whether annual compensation satisfaction improves the initial 500-role
list without eliminating unknown compensation or overwhelming title relevance.
Unit: a frozen actual search pool × annual KRW target × ranking variant.
This evaluates retrieval ordering, not candidate interest or offer accuracy.

## Frozen input, gold and provenance

Datasets v1/v2 capture production external role pools using the existing frozen
country-quota search vectors and read-only database bridge. Raw role IDs, original
JDs and candidate context stay in ignored owner-only `private/` or `runs/`.
Published annual/monthly structured salary defines the comparable-pay slice.
Gold before ranking runs: pay at/above target is financially sufficient, a band
entirely below 60% of target is materially short, other bands are mixed; unknown
pay is unknown. These are numeric retrieval labels, not qualitative fit labels.
Targets are explicit experimental salary scenarios, not inferred candidate facts.
The representative and challenge slices are reported separately. Any changed
pool or labels creates a new version; ranking weights create new runs.

## Contract and canonical runner

2026-10-16: capture의 추가 제목 벡터 조회는 공고의 현재 제목과 일치하는 `company_roles.title_embedding`을 읽는다. 이전 사전 조회를 제거했으며 기존 frozen v1/v2 입력·gold는 변경하지 않았다. 새 capture는 기존 파일을 덮어쓰지 않고 새 데이터 버전으로 관리한다. 이번 변경에서 capture나 모델 평가는 실행하지 않았다.

`scripts/evalExternalRoleSalaryRetrieval.ts` imports production SQL, salary
normalization and band utility. Capture uses Worker
`llm_evals/external_recommendations_v2/read_only_capture.py` and its enforced
`connect_read_only()` transaction. It never writes production roles, fit,
recommendations, settings or messages. Inference prefill is a separate authorized
operation owned by `scripts/prefillExternalRoleSalaries.ts`.

The utility averages `min(1,(annualPay/target)^2)` across both disclosed endpoints.
Meeting the target saturates. A lower bound below target has unknown ceiling and stays neutral; a lower bound meeting target scores 1. An upper bound at/above target has unknown floor and stays neutral; an upper bound below target scores half its squared ratio.
Missing/invalid period/currency/bounds stay neutral at 0.5. Salary is a bounded
multiplicative adjustment to semantic/lexical relevance. Predicted role pay never
enters downstream LLM inputs. FX is the versioned ECB snapshot, with source/date.

## Metrics, gate and configuration

Compare salary weights 0 / 0.2 / 0.35 / 0.5 against the same frozen pool. Measure
top-500 sufficient-pay share/count, materially-short share/count, unknown share,
baseline topical-rank retention and topical loss, country quotas, and SQL time.
Gate: no hard salary exclusion, no invented currency/period, preserved geographic
eligibility and country quotas; sufficient-pay share improves and materially-short
share falls while unknown coverage and topical ordering remain useful. Pure salary
ranking is a diagnostic extreme, not a runtime candidate.

v2 expands v1 to four pools (ML KR/US, ML US, support US, sales US), using pre-existing role-title embeddings; v1 is preserved. There are 80 fixed-condition comparisons.

No LLM calls in ranking replay. SQL timeout 30s, model/reasoning not applicable.
Optional prefill estimates are explicitly labeled predictions, never gold. Manifests
record frozen fixture and runtime source hashes, dirty revision, target scenarios,
FX date, output receipts and chosen configuration.

## Privacy and limits

Raw artifacts 0600, directories 0700. No candidate data leaves this machine in
ranking experiments. Published pay has selection bias and may mix base/cash; it
does not prove an offer. Titles and numeric pay alone cannot establish career fit.
Old observed pools do not represent all production candidates or unknown salaries.

## Actual-user v4 (2026-10-15)

User requested Daniel plus approximately three accounts. v4 uses Daniel and two fixed-seed hash-random eligible accounts, three total. Actual Profile, complete Brief, existing same-version Behavior Context and settings are frozen read-only before model calls. Account identities and source context remain only in owner-only private/users-v4.json. manifest-v4-users.json records the frozen hash; gold-v4-users.json is a de-identified pre-call rubric, not true compensation labels.

Canonical runner: scripts/evalExternalSalaryUserRetrieval.ts, capture with --capture, then run without that flag. Use pnpm exec tsx --env-file=.env.local --tsconfig scripts/tsconfig.json. It imports production getSearchPlan, v2CompletionRequest and buildHybridSql, uses the same Responses adapter (Luna low, max 8000, store=false, no retry/fallback), and caps planner reserves at USD0.50. It blocks all production HTTP writes and executes SQL through the enforced read-only bridge. It does not call downstream fit/summary/rerank or persist recommendations/defaults/context.

The same inferred plan produces weight0 and weight0.35 lists of500. Prepared forecasts enter a SELECT-only CTE after source-hash and missing-pay checks, modeling the prepared values without exposing them to old live readers. Raw query/response/list artifacts stay in runs. Metrics include pool size, eligible countries, target, pay provenance, sufficient/short/unknown counts, baseline retention, distinct companies, and top20 examples. Explicit compensation indifference must produce a null salary target. Human qualitative review remains Codex-only; three searches do not prove production interest or acceptance improvements.

Completed v4 findings: [actual-user report](reports/2026-10-15-users-v4.md).
The initial and revised planner calls are preserved separately (six paid responses
total). The final user-1/user-3 comparisons reuse captured production pools and the
production salary-ranking SQL in local PGlite; user-2 ran read-only production SQL.
Do not interpret local replay timings as production latency. Per-case top-20 lists,
SQL links and artifact hashes stay in owner-only ignored
`runs/users-v4-completed-20261015/`. No new paid calls were made to finish reporting.

## Career market-value v5 (2026-10-15)

v5 intentionally changes the salary interpretation under the user's new instruction: infer professional market pay from demonstrated career responsibilities, achievements and skills, even when compensation is irrelevant to the user. Requested pay does not set this benchmark. The shared production prompt adapts responsibility/market reasoning from `roleSalaryEstimation.prompts.json`; no additional inference stage is introduced. Existing v4 null-on-indifference labels and reports remain historical.

`manifest-v5-users-market-value.json` reuses the exact private v4 snapshot/hash; `gold-v5-users-market-value.json` freezes the new rubric before calls. Unit: one frozen user → production planner. Canonical command: `pnpm exec tsx --env-file=.env.local --tsconfig scripts/tsconfig.json scripts/evalExternalSalaryUserRetrieval.ts --market-value --plan-only`. This mode skips SQL and prepared role predictions; it calls production `getSearchPlan` in dry-run mode. Same Luna low / Responses / store=false / 8000-token / 90s / no-retry / USD0.50 reserve configuration. Existing user-authorized profiles, Brief and Behavior are sent to the configured OpenAI endpoint solely for this requested check; raw requests, responses, receipts and hashes stay owner-only in ignored runs.

Gate: all three career-bearing contexts produce positive annual KRW benchmarks; manually inspect local-market grounding and unit conversion, especially compensation-indifferent user-3. No defaults, recommendations, Brief/Memory or role pay written. Unknown-pay eligibility and SQL arithmetic are unchanged. This checks the requested inference contract, not salary accuracy or recommendation improvement; three known examples are not an independent holdout.

Completed v5 findings: [career-market salary check](reports/2026-10-15-users-v5-market-value.md). Three positive benchmarks; user-3 null → KRW131 million, without any production writes.

## Fixed-plan execution v6 (2026-10-15)

User authorized retrieval improvements and one bounded comparison, excluding per-country salary targets/weight experiments and any change to synchronous salary filling. `manifest-v6-execution.json` freezes the three v5 plans, title vectors, targets, exclusions and pre-change compiled SQL in owner-only `private/execution-v6/`; `gold-v6-execution.json` records pre-comparison invariants. Canonical runner `scripts/evalExternalRetrievalExecution.ts` imports the current production SQL builder. `--freeze` is one-time, then `--two-rounds` runs baseline/updated followed by updated/baseline for three saved cases. `--case=user-1 --variant=baseline --explain` captures a bounded diagnostic plan. All production access uses the existing enforced read-only Worker bridge with the same 30-second query limit and ANN settings. No LLM call, salary persistence, recommendation, fit, message or settings write. Raw SQL/results/IDs/plans are owner-only under ignored private/runs. Shared manifests contain hashes, source revision and case aliases only.

Metrics: actual query execution time where EXPLAIN is used; subprocess/connection/query/transfer wall time separately; timeout rate, unique role count, ordered top-500 overlap, company breadth, salary unknown/sufficient/short count and top-50 salary utility. Fixed targets and salary weight 0.35. Source hashes and captured plan hashes identify runs; database rows remain live and can change. The local synthetic SQL regression covers equal-title/keyword ties and eligibility; observed lists are not human fit gold. No claim of production recommendation improvement or general p95 from this small sample.

Optional `--case=user-1 --salary-replay` captures the before-salary candidate pools from both exact compilers, then applies the already prepared predictions locally only when role source hash matches and no published pay exists. It imports production salary normalization/utility/rank with fixed 0.35, preserves the single-country selection and final tie ordering, and keeps pool/forecast hashes and overlaid count in the run. This is a sensitivity check of list composition, not measured pay accuracy or live persisted-pay latency. It does not perform new salary inference or write forecasts to production. The versioned sources and original frozen plans are unchanged.

## Combined multilingual title query v7 (2026-10-15)

The user's added instruction requires local-language role titles for the preferred countries, comma-space joining all titles into one text, and exactly one search embedding/ANN lookup, including `recommend_job_postings`. v7 preserves the v4 private input hash and v5 salary rubric, adds Korean/Japanese/English language coverage and the single-vector structural gate before calls. Run the existing canonical planner runner with `--combined-titles --plan-only` (same Luna low / store=false / no retries / USD0.50 reserve / owner-only runs). No profile, default, recommendation or salary persistence. The search titles can change recall; neither the old role list nor salary predictions are relevance gold. Performance comparisons reuse the original v6 countries, scalar salary target, keywords and eligibility, changing only titles/vectors and the requested retrieval implementation. No per-country salary/weight experiment.

`manifest-v7-execution.json` / `gold-v7-execution.json` freeze the paired retrieval inputs before comparison. Prepare once with `scripts/evalExternalRetrievalExecution.ts --combined-titles --freeze-combined=<private planner run directory>`, then run `--combined-titles --two-rounds`. This keeps the v6 baseline SQL and all non-title inputs unchanged. Localized titles/vectors come from the captured v7 planner, with a new owner-only dataset directory; no older fixture is overwritten. Runtime changes such as the one-ANN neighbor budget create separate runs against this same dataset. The 1,000-neighbor combined-query trial is retained even if rejected for recall loss. The final candidate uses 5,000 neighbors in one pass, preserving the former maximum five x 1,000 budget. Existing scalar salary target, 0.35 weight, country rules, synchronous fill and downstream scoring are unchanged. Optional `--combined-titles --case=user-1 --salary-replay` uses the same frozen setup and prepared predictions locally; predictions are not gold.

Completed v7 findings: [combined-title execution and limits](reports/2026-10-15-combined-title-execution.md). Final ABBA search wall time averaged 7.40s to 6.81s, with two slower cases and one faster case; zero timeouts in both final variants. List recall and salary replay results are mixed. v6 is historical: its multiple-vector input belongs to the preserved pre-combination SQL, while current runtime comparisons require `--combined-titles`.

## Additional random users v8 (2026-10-15)

User requested about ten other random people, error/list checks, cost and time. `scripts/evalExternalSalaryUserRetrieval.ts --random-ten --capture` uses a fresh UUID seed and hash-random ordering over eligible completed-onboarding external-recommendation users with existing experience, Brief and Behavior, excluding all three frozen v4 accounts. It captures exactly ten without replacing failures; the seed, eligible population, context-read timing and immutable snapshot hash are recorded in `manifest-v8-random-ten.json`. `gold-v8-random-ten.json` freezes structural and manual-review criteria before model calls. Raw IDs/Profile/Brief/Behavior remain in owner-only ignored `private/users-v8-random-ten.json`.

Run `pnpm exec tsx --env-file=.env.local --tsconfig scripts/tsconfig.json scripts/evalExternalSalaryUserRetrieval.ts --random-ten`. It imports current production planner, request adapter and initial retrieval SQL with the same list-only projection as Ops. Planner: Luna low, Responses store=false, 8000 max output, 90s, no retries/fallbacks, USD0.50 conservative reserve cap. Embedding: production text-embedding-3-small, one comma-joined input, 1536 dimensions, 45s. Search: read-only production bridge, 30s SQL timeout, limit500, salary weight0.35; no country/weight experiment. No role-salary filling, scoring/rerank, context/default/recommendation writes or delivery. Only the selected context is sent to the existing configured model provider for this authorized check.

Metrics: first-attempt success/error/empty counts, distinct role/company count, missing fields/URLs, source-row audit of country/remote/availability/history/testOnly/company blocks, manually reviewed top-ten relevance and plan interpretation, context/planner/embedding/retrieval latency, per-user and aggregate cost. Context timing comes from the frozen capture; total is the sum of those stages, not a contiguous production request. Audit/review time is outside search latency. Planner cost comes from provider token receipts and repository pricing; embedding usage is captured from the actual response and estimated at USD0.02/million tokens ([official model pricing](https://developers.openai.com/api/docs/models/text-embedding-3-small), checked 2026-10-15). Failed responses without usage retain a conservative possible reserve rather than claiming zero cost. DB/infrastructure cost is not measurable per query here. Run manifests preserve source hashes and dirty revision. Do not replace frozen cases after seeing failures, or count diagnostic reruns as first-attempt successes. This bounded check is not full recommendation acceptance quality or production reliability.

Audit-only recovery: `--random-ten --audit-run=<original run>` reads the saved first-attempt plans/rows/API receipts and reruns only source-row inspection. The initial v8 audit omitted `public.` on two table names inside the security-scoped search RPC; that evaluation-only error is preserved separately from successful product retrieval. Recovery neither calls models nor reruns retrieval. Original retrieval latency can be recovered from the search-SQL and result-file mtimes (including minimal file I/O); API stage timings remain original monotonic receipts. Report this measurement distinction and preserve the failed audit artifacts. Exact duplicate URLs and repeated company/title pairs are diagnostics, not automatic proof that different locations are duplicate openings.

Completed v8 findings: [ten additional random users](reports/2026-10-15-random-ten.md). Product planner/embedding/retrieval succeeded10/10 with no timeouts; source-row audit recovered10/10 after an evaluation-only schema-path defect. Initial lists contain4,654 rows; mean measured-stage sum28.4s, estimated API costUSD0.00804214 total. Top-list role meaning/seniority/explicit exclusions and44 repeated-URL rows remain quality issues; no blanket list-quality pass.

## Online recommendation outcomes

Live A/B quality, latency and cost use the separate [online measurement contract](../external-recommendation-online/README.md). It compares the existing control/V2 recommendation paths and does not treat the v8 initial pools as final user-visible relevance gold.
