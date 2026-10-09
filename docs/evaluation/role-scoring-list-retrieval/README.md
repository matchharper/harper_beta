# Role scoring-list retrieval evaluation

## Objective and unit

Find candidates worth spending shared fit evaluation on. Compare first-run retrieval and cumulative discovery over six runs, at 100 candidates/role/run. Retrieval is not fit, route selection or recommendation delivery.

This user-requested retrospective evaluation is separate from the old Wonderful blind Top10 benchmark. Historical outcomes are used to freeze labels before model calls. Codex has reviewed those outcomes; this is an unblinded development/regression evaluation, not an independent blind benchmark.

## Frozen dataset and gold

`private/v1/` contains the frozen 2026-10-07 isolated inspection snapshot, full eligible profile/active Brief corpus, three exact source role snapshots, source event evidence and private identifier mapping. Wonderful Korea FDE is the development role; SBVA investment and Sierra engineering are supplemental generalization checks. Role fixtures are created only in the dedicated localhost inspection DB, marked `testOnly`/`testFixture` before insertion and paused. JD and internal request are unchanged; no fit/recommendation is written for them.

Gold v1 is frozen before retrieval calls. Technical-interview progression is the primary Wonderful positive evidence; initial-call and actual company acceptance are separate supporting labels. Candidate requests/acceptance, prior model fit and archive/stop alone are not positive or negative gold. Explicit role mismatch examples are manually reviewed challenge negatives. Unlabelled candidates remain unknown. Reviewer: Codex; independent team review pending.

## Input and canonical runner

`harper_worker/llm_evals/role_scoring_list_retrieval/eval.py`: `capture --source-role-map <owner-only private JSON>`, then `baseline --run-id <new id>`; `--role` repeats one role, `--treatment` appends the documented general contract v2. Capture is a one-time frozen v1 step and refuses to overwrite it. The baseline imports production `create_query_plan`, prompt/input builder, SQL validator, repair and executor. Its role ID is the isolated clone, without fit history; company evidence/history and role behavior are omitted from all planner inputs. It is a controlled cold-start retrieval baseline, not a full normal run. Production SQL may search talent behavior/context rows, which is a limitation of that arm; embedding challengers omit Behavior and Memory. Profiles are imported using the common runtime projection; full active Brief is captured. Behavior version/text is captured but not embedded as truth.

Experiments use frozen corpora and ledger simulation rather than writing fit rows. A candidate counts as reviewed only after simulated successful evaluation; refresh of previous results is a distinct budget. Failed retrieval calls are recorded, never interpreted as zero relevant candidates.

`experiment.py plan --run-id <new id>` builds generic capability/direction search queries using the configured planner model. `compare --run-id <new id> --baseline-run <id> --query-run <id>` runs exact cosine, PostgreSQL FTS, RRF, novelty and exploration variants against the same corpus/gold; `--profile-chars 3000` tests a shorter index projection without changing the frozen evidence. Each lane applies its role scope and deduplication before top-k. Fixed SQL six-round comparisons are ledger replays, not six independently generated SQL plans; actual planner variability was separately measured with three Wonderful calls.

`summarize.py --run-id <new id> --baseline-runs <first three-role run> <Wonderful repeat> <Wonderful repeat>` recomputes the separate planner-variability replay and warm inventory from saved queries/source facts, with no model calls or DB writes. Earlier aggregate files are preserved.

`runtime_replay.py --run-id <new id> --query-run <new baseline id>` validates the implemented `rank_vectors` and `merge_retrieval_lanes` against v1. The planner emits SQL plus capability queries in one call only with explicit `--semantic-ordering` / runtime semantic ordering enabled. The production default keeps SQL ordering; the optional vector arm failed the general-role gate in the follow-up runs. Corpus/gold/profile embeddings remain frozen; only those query texts receive fresh `text-embedding-3-small` calls. Every replay round removes simulated assessed pairs before re-ranking. SQL-only/repeat, SQL-only/novel, vector/novel and vector/novel/5% exploration use the same SQL pool. This is six ledger replays of one actual generated query per role, not six live runs. `--capability-run <frozen focused-plan run>` holds the SQL pool fixed while comparing separately generated semantic queries. Separate disposable Postgres tests exercise the real before-budget novelty/refresh predicates, cache access restrictions and deletion. Production embeddings use a content hash of the current canonical Profile projection; the replay deliberately retains the immutable v1 embedding source.

`judge.py --run-id <new id> --comparison-run <id>` freezes a hash-sampled 20-person set per method/role before calls, removes method/rank/outcome/gold labels from input, and evaluates the union once with GPT-6 Luna high/0.1. `--reuse-run <id>` reuses identical-prompt/configuration judgments for identical frozen candidates and only evaluates new samples. These judgments are **silver**, not human precision. They read full Profile/Brief and frozen Behavior, which may indirectly mention historical events. The first prompt incorrectly rejected a strong candidate solely for unknown language/authorization; v2 explicitly distinguishes admission to fit assessment from final eligibility and was rerun on the same sample. No keyword-based judgment/output correction is used.

## Completed runs and interpretation

[2026-10-08 결과와 권장 구조](reports/2026-10-08-retrieval-quality.md) contains the aggregate comparison, actual SQL planner variability, quality sample review, failed/negative experiments, warm inventory and deployment limits. Raw artifacts are under ignored `runs/20261008-*`.

[2026-10-08 five-role ranking results](reports/2026-10-08-five-role-ranking.md) compares 11 ranking methods, two query-plan replicas per role and 581 distinct method-blind silver judgments on frozen v2. SQL + weighted FTS RRF improves macro silver quality from 21.5% to 31.0%, but Wonderful first-100 historical-positive recall drops; the predeclared default-change gate is therefore **not passed**. This is the embedding-free development finalist, not a released default. The actual matching default remains SQL; novelty/exploration changes remain intact. Canonical aggregate is ignored `runs/20261008-ranking-v2-summary-r3/summary.json`.

Follow-up runtime work is local/unreleased: novelty before budget, separate refresh admission, all valid cache membership, pair-scoped scoring, and a seven-day original-plan TTL. Optional vector ordering is implemented but defaults OFF after `20261008-runtime-vector-v10-r1`, `20261008-runtime-vector-v11-r1` and `20261008-runtime-standalone-queries-r1` failed the general-role gate. `20261008-runtime-sql-default-v12-r1` / `20261008-runtime-sql-default-replay-r2` record the actual default SQL and its non-online replay. Use `runtime_replay --sql-only --role <name>` for a SQL-only captured run. 304 related checks passed with disposable Postgres. This is not deployment or evidence of higher recommendation response rates.

The 4,649-person universe becomes 4,646 Wonderful / 4,647 SBVA after role-specific blocked-company filtering. Two historical Wonderful positives are excluded from the current eligibility frame. Original Wonderful and Sierra roles already have historical fit for every currently eligible person; this does not imply a valid V2 fit or a reusable current cache. The source-clone cold-start evaluation therefore cannot be described as the original role's live incremental recall.

The three-role baseline plus two Wonderful repeats and three contract-v2 calls ran without SQL repair/fallback. One initial focused-query prototype rejected an unnecessary exact query-count requirement; that check was relaxed to a bounded structural contract. Its failed-call raw output/usage was not retained, so there is no complete total-cost claim. Query prototype failures are distinct from production SQL failures.

## Metrics and gate

- Eligible known-positive recall at 100, 300 and 600 assessment slots, with numerator/denominator.
- Unique assessed candidates, repeated slots, source coverage and mean first discovery round.
- Explicit challenge-negative inclusion, separate from precision. Unknown is not negative.
- Model planner calls/repair/fallback, measured query/model time and provider usage.
- Supplemental role results never pooled with Wonderful as one accuracy.

Promotion requires zero isolation/authorization/output-contract violations; no loss of cumulative gold recall against baseline and useful first-run yield; independent candidate-quality review plus a new role holdout before claiming general production precision. Sparse historical labels cannot establish population precision or causal recommendation response improvement.

## Model, provenance and privacy

Baseline uses the configured production query planner (`openrouter:z-ai/glm-5.3-flash`, high, temperature 0.4, max 32768, configured fallback). Exact model/usage, dirty source hashes, frozen input hashes, timing and errors are saved per run. Evaluation iterations use new run directories against v1; input/gold changes require a new dataset version.

Original production capture used `connect_read_only`; this evaluation reads that isolated snapshot. Local writes are restricted to test fixture role rows and derived search experiments. No worker queue, fit persistence, recommendation, company communication or deployment. Source facts sent to configured LLM providers for the explicitly requested evaluation; embeddings, if evaluated, use OpenAI `text-embedding-3-small` and are a private reconstructible search cache. Provider retention is not independently verified here.

Raw profiles, UUIDs, private company briefs, prompts and model outputs stay in ignored `private/` or `runs/` with owner-only permissions. Only anonymous gold, reproducibility hashes and aggregate reports are tracked. Current profiles may postdate historical outcomes; the old retrieval policy biased which people have labels. Availability for already-ended processes is deliberately excluded from this discovery replay; normal runtime route guards stay intact.

## V2 five-role ranking experiment — contract frozen before calls

User-requested expansion isolates **ranking quality**, holding assessment-ledger novelty and 5% broad exploration constant. V2 inherits the immutable v1 corpus and labels, adds Config Robotics Systems Engineer and SBVA Communications role inputs from the same localhost snapshot, and retains Wonderful Korea FDE, SBVA investment and Sierra Agent Engineer. The extra fixtures are paused and marked before insertion; no new fit is written. V1 is not overwritten. `gold-v2.json`/`manifest-v2.json` record this input expansion and label-review history. Pending connection, sharing/connected and archive alone are never new company-positive labels.

Canonical runner: `harper_worker/llm_evals/role_scoring_list_retrieval/ranking_eval.py`, with `capture`, `plans`, `compare`, `judge`. Two independent configured-planner generations per role measure query sensitivity. For each replica, SQL and a general weighted-concept plan are created without candidate/outcome/gold input. The external role search's actual `fts_query_parts` builds weighted `ts_rank_cd` SQL. Only session-local search documents are indexed; no production migration or search configuration is changed.

Predeclared arms, all 100 assessment slots/run for six successful-assessment-ledger replays and 5% broad exploration:

| Arm | Ranking/admission |
| --- | --- |
| `sql` | Actual current production-shaped generated SQL order |
| `fts_global` | Weighted Profile/Brief FTS across the eligible corpus |
| `sql_fts` | The same FTS score within the identical SQL pool |
| `sql_fts_length` | Within-pool FTS with document-length normalization 2 |
| `sql_fts_english` | Normalized within-pool FTS with English stemming |
| `sql_vector` | Within-pool frozen Profile vectors / new capability queries |
| `sql_fts_rrf` | RRF of SQL and weighted FTS order in the same SQL pool |
| `sql_hybrid` | RRF of SQL, length-normalized FTS and semantic order |
| `sql80_fts15` | SQL 80 + global FTS 15 + broad exploration 5, deduped/refilled |

Profile FTS uses the frozen canonical readable career document; Brief FTS uses the entire active Brief separately. Memory/Behavior are not indexed. Weights and bilingual alternatives come from the model-facing general contract, not role-specific keyword lists. A zero lexical score is a retrieval miss, not a fit rejection. Rank functions/sum/RRF are information retrieval, never post-hoc correction of fit reasoning.

Primary decision: first-100 method-blind quality across all five roles plus no material cumulative-positive recall loss on the two roles with historical positive gold. Judge samples 20 candidates per arm/role/replica (seven declared main arms), freezes membership before calls, evaluates the deduped union with unchanged GPT-6 Luna high/0.1 rubric, and hides retrieval method/rank/gold/outcome. Full Profile/Brief are supplied, but Behavior is omitted for every arm to reduce outcome leakage. Silver agreement is not human precision. Missing/failed judgments remain incomplete, never negatives. Results include per-role/per-replica counts, macro quality, paired sample uncertainty, positive recall at 100/300/600, repeated slots, pool coverage, query timings and actual provider usage.

A local default recommendation requires a stable five-role quality gain, no clear per-role regression and useful early/cumulative positive recall; otherwise retain SQL and report an inconclusive/negative result. Independent team review remains a production-precision release gate. Arms/hyperparameters are development comparisons on exposure-biased sparse gold, not a new blind holdout. Any follow-up prompt adjustment creates a new run against the same v2 inputs/labels and is explicitly reported as development tuning.

After the initial two-replica results, `ranking_followup.py` compares two additional, embedding-free arms against the **same** plans/corpus/gold: SQL + length-normalized FTS RRF, and SQL 50 + normalized FTS 45 + broad 5. This is an unblinded development follow-up, not a new holdout. Its method-blind quality sample also completes the English-stemming and vector-only ablations; prior identical-input judgments are reused and new candidate/role pairs are evaluated once. `ranking_summary.py` provides per-role/per-replica metrics and a shared-candidate Bayesian-bootstrap sampling interval. That interval does not represent human-label, judge-model or query-generation uncertainty.

## V3 broader role inspection — declared before additional calls

The user requests an engineering conclusion combining quality, first discovery,
cost, stability and periodic coverage, plus qualitative inspection of more real
internal roles even when historical gold is unavailable. V3 preserves the frozen
v2 corpus, snapshots and inherited gold, adding eight active-role inputs selected
for function/seniority diversity before retrieval outputs: Aleph Kids performance
marketing, vooy product design, Gaudiolab finance lead, Sierra Korea enterprise
sales engineer, Wonderful APAC partnerships, Mistral lead applied scientist,
NARWHAL junior product engineer and Aeolo technical co-founder. Fixtures are
localhost-only, paused and canonically testOnly before insertion. No request/JD is
rewritten. Missing Hiring Brief remains missing rather than being invented.

Canonical runner: `harper_worker/llm_evals/role_scoring_list_retrieval/broad_ranking.py`.
The original five roles reuse both immutable v2 query generations; each additional
role receives one production-shaped SQL plan and one unchanged weighted-concept
plan. This is a development generalization check, not a new blind holdout or an
estimate of production population precision. The original five still report
per-generation positive recall; the other eight have no fabricated gold.

Compare SQL, within-SQL weighted FTS, vector, SQL+FTS RRF, SQL+normalized-FTS+vector
RRF, plus two predeclared protected-prefix variants. Each protected variant reserves
the first 25 currently unassessed SQL candidates, takes 70 more distinct candidates
from the corresponding RRF order, then 5 broad exploration candidates. Exhausted
lanes refill without duplicate/previously-assessed slots. The 25/70/5 split is a
general development budget, not tuned per company or historical positive position.
All methods retain the same 100-slot/six-round novelty and exploration contract.

Before quality calls, hash-sample 20 first-slate candidates per method/role/query
generation. Use the unchanged method-blind judge rubric/config and full Profile +
entire Brief, without Behavior. Reuse prior v2 judgments only when the exact
candidate documents, role snapshot and judge contract match. Report incomplete
judgments separately, never as negatives. Inspect model reasons against source
profiles for a small fixed, method-hidden first-slate sample; Codex spot review is
qualitative and cannot create human gold. Keep all source/output/IDs in ignored
owner-only private/runs. Report per-role counts, equal-role mean, first/cumulative
gold discovery, SQL repair/fallback, observed times/usage and embedding tokens.

No method is promoted simply because it maximizes one silver average. The final
recommendation must explain mutual-quality evidence limitations, title/career-
transition coverage, lexical length/vocabulary bias, semantic false friends,
baseline-prefix tradeoffs, profile-cache amortization, query/model overhead and
the retained assessment/recommendation boundaries. Any deployment or production
ranker implementation is outside this additional inspection request.

V3 completed results and engineering recommendation:
[13-role broader ranking conclusion](reports/2026-10-08-broad-ranking-conclusion.md).
885 distinct current sample pairs (470 exact reused + 415 new), zero incomplete
judgments; 16 source-inspection observations over the extra eight roles. Three-way
SQL/normalized-FTS/vector RRF improves equal-role silver 22.9%→38.1%, with no lower
per-role mean in this sample. Protected-prefix RRF offers only +0.4pp and worsens
Wonderful mean, so it is not recommended. Recommend implementing three-way RRF,
preserving novelty and exploration; the strict first-discovery gate remains
unpassed and runtime ordering remains SQL. No deployment or production writes.
Original role documents are preserved, including any company-authored reference
profile anchors. No extra retrieved-candidate/outcome/gold list is supplied to the
planner; preserving such an anchor is nevertheless an exposure limitation,
especially for Sierra Sales, and must not be described as independent holdout.


## Production-path hybrid implementation verification — local, unreleased

The user subsequently authorized implementing the v3 engineering recommendation.
The strict historical first-discovery gate remains unpassed; this explicit local
implementation decision is not a claim that the earlier gate passed. Production
release and independent quality/response-rate validation remain separate.

Canonical runner: `harper_worker/llm_evals/role_scoring_list_retrieval/hybrid_runtime.py`.
`plans --run-id <new id>` runs the actual production `create_query_plan` and SQL
executor on all 13 unchanged frozen v3 roles. SQL, weighted `lexicalGroups` and
`capabilityQueries` are generated in one configured planner call (contract repair
may add a call). The exact same readable production Company/Role input is used;
no candidate, outcome or gold list enters planning. `replay --run-id <new id>
--query-run <plans id>` uses production `rank_hybrid` and `merge_retrieval_lanes`
with the identical immutable corpus, gold and Profile vectors. Only generated
semantic query texts receive new embeddings. Each replay removes successful
assessment pairs before the SQL pool cap and three-way re-ranking. SQL and hybrid
use the same new plan, 100 slots and 5% broad exploration, for six ledger replays.
A failed SQL plan uses the same SQL fallback behavior as runtime; failures and
repairs are recorded separately. Existing v2/v3 results and frozen files remain
unchanged. This new one-call prompt is a new run, not a relabelled old experiment.

The runtime default now enables SQL + length-normalized weighted FTS + Profile
cosine RRF (k=60). The stored `semantic_ordering_enabled` key is retained for
compatibility; explicit false still disables enrichment. Profile and full active
Brief have separate FTS vectors; Profile embeddings retain the 8,000-character
projection/model/content-hash contract and worker-only shared cache. SQL-pool
FTS vectors are computed set-wise for the bounded pool, with no permanent FTS
index or candidate-summary call. Zero lexical relevance contributes no FTS rank,
but does not remove a SQL/semantic candidate. Missing cache/provider/query or
optional index failure keeps SQL order and records the reason. Admission,
refresh, valid-fit merging, fit evaluation, route and delivery are unchanged.

Disposable PostgreSQL tests validate real length normalization, full Brief
career-direction discovery, RRF scope/deduplication, embedding-cache reuse and
access boundaries, SQL fallback, novelty-before-budget and plan cache TTL.
Run metadata freezes source/prompt hashes and actual provider/model/usage files.
Raw new plans, source projections, vectors and results remain ignored owner-only
`runs/`; no production DB changes, fit, queue, recommendation, messages or deploy.


`hybrid_runtime.py parity --run-id <new id>` performs zero-provider-call exact-order
regression against all 18 frozen SQL/FTS/vector v3 orders (13 roles, two replicas
for the original five). It recomputes the production FTS and three-way fusion with
identical documents/concepts and stored semantic ranks; no old result is replaced.
`quality --run-id <new id> --replay-run <id> --role <name>` freezes 20 first-slate
samples per SQL/hybrid arm before calls, uses the existing v3 method-blind silver
rubric and GPT-6 Luna high/0.1, and reuses judgments only after corpus, snapshot,
prompt and model configuration identity checks. Full Profile/Brief, no Behavior;
failed/missing judgments are never negatives. This is development inspection,
not independent human validation or recommendation feedback measurement.

The first combined v13 output example still showed the old SQL-only schema.
Three initial role calls needed contract repair, including SELECT-star mistakes.
The v14 production prompt gives one complete combined schema and clarifies
explicit column projection in intermediate SQL. Frozen inputs/gold remain v3;
these prompt generations are new runs rather than dataset changes.


Local implementation verification is complete. See
[actual runtime implementation and limits](reports/2026-10-08-hybrid-runtime-implementation.md):
93 checks, exact parity on all 18 frozen orders across 13 roles, final v14 one-call
planning on six roles without contract repair/SQL fallback, six-round 600-unique
ledger replays for each. New three-role silver is mixed (Wonderful 11→10/20,
SBVA 6→13/20, Sierra 8→4/20); Wonderful cumulative positive gold is 4→1 at 600.
Do not reuse the earlier 13-role 38.1% as a result of the new one-call plans.
The strict recall gate remains unpassed. Local default is implemented by explicit
user authorization, with no deployment, cache migration or outcome claim.
