# External opportunity company value — frozen feedback pilot

Compare Decisions scoring before and after adding estimated compensation and candidate-relative company value. This is a small, retrospective development experiment, not an online recommendation or hiring-outcome evaluation.

The deleted top-level evaluation registry was read from `463d83cb^:docs/evaluation/README.md`; its deletion is preserved. This folder registers the task under the current evaluation guidance.

## Frozen unit and provenance

One unit is a production external recommendation linked by exact owner/role/evaluation ID to an immutable evaluation input snapshot, with explicit positive or negative feedback timestamped after evaluation. Capture all eligible records once, deduplicate evaluation IDs, exclude test-only roles, and freeze before inference. Historical inputs and feedback never change during comparison. Gold labels are observed feedback, not expert truth; positive may include saving or a progress action. Feedback and reasons never enter model inputs.

Existing salary predictions are captured read-only from the same role. Predictions have no historical timestamp; their addition is a retrospective enrichment, not proof that the value was available at recommendation time. Report JD equality and salary coverage. Do not substitute current user context. Company/source names remain available only in private model evidence.

## Arms and runtime contract

- stored: original saved scores, no new call.
- baseline: frozen v6 rubric and historical input, rerun now.
- salary: frozen v6 rubric plus captured estimated salary.
- prompt: current company-value rubric, historical input without estimated salary.
- combined: current rubric plus estimated salary.

Use the production input builder, request builder and response parser. Freeze each arm's exact requests and hashes before calls. Batch only matching candidate contexts, at most ten roles, identical membership/order across arms. Six existing metrics, gpt-6-luna, OpenAI Decisions. No judge, no production scoring writes, sends or publishing. No reruns after inspecting results.

## Measures and interpretation

Primary: candidateInterest and 30/50/10/10 score AUC over labeled recommendations; paired change against the current-time baseline, with user-cluster bootstrap intervals. Secondary: positive/negative score means, same-user positive-vs-negative ordering (report support), historical-vs-rerun drift, and 65/15/10/10, 45/35/10/10, equal weights and mutual-only sensitivity. Missing feedback is not negative. Scores are not assumed calibrated probabilities of likes. No thresholds or optimal weights are fitted on this set.

Release interpretation: mechanical input/projection/cache tests must pass. A small selected sample with few negative users cannot establish quality improvement or authorize deployment. Report losses and inconclusive results; retain implementation as an explicitly unproven local experiment if evidence is weak. Handbook final-selection effects are outside this scoring experiment.

## Reproduction, budget and privacy

Canonical runner: `scripts/evalExternalCompanyValue.ts` (`prepare`, `run`, `report`); capture query is `capture.sql`. Use local `.env.local` only to supply the existing OpenAI key. The inference runner permits only the Decisions endpoint, uses no production database credentials or SDK writes, and makes no automatic retries. A persisted budget ledger reserves a conservative per-request maximum before dispatch; unknown-cost failed calls retain their reservation. All LLM calls in this task must total at most USD 1, with a USD 0.90 operational ceiling.

`gold-v1.json` and `manifest-v1.json` contain anonymous case/user IDs, labels, hashes and counts. Raw production snapshots, exact requests, responses and cost receipts stay in ignored owner-only `private/` or `runs/` directories. Never overwrite the frozen capture or requests. Cost is calculated from provider token usage and documented Decisions rates, not invoice verification.

## v2 — 50-user historical expansion, frozen before inference

Requested 2026-11-05: expand to about 50 users and explicitly state salary estimates may be inaccurate. v1 artifacts remain unchanged. v2 is an independent historical cohort rather than silently adding restored rows to the 19-user exact-snapshot pilot.

Source: private `matchharper/harper_eval` commit `8b4eadeffa2f63149bce408f6fef611316b74fe5`, cases and prepared scoring inputs for `20260909-20261008/20261017T090550Z`. Source hashes are checked. Preserve the existing seven-day like/dislike pair labels, including its already-applied/closed exclusions. Selection required a matching Brief fingerprint, the source's profile/experience/education equality flags and both labels in the same run. These equality flags compare later exports, not the profile at recommendation time; interpreting them as historical immutability was an error. Of 229 users passing those filters, choose the first 50 by `sha256(company-value-v2:talent_id)`, one latest eligible run per user. Include all roles participating in that run's original pairs: 265 roles, 141 positive, 124 negative, 438 within-run pairs. No selection by score, employer, salary, or feedback reason.

The supplied profile/Brief/JD evidence is held fixed across arms. Behavior text comes from the existing frozen prep: 4 users have exact retained behavior, 46 have previously rebuilt behavior from pre-run evidence. No new behavior-model calls are made. These are restored inputs, not 50 exact original API requests. The historical role cards can already be shortened; preserve them without filling them from current JDs. Current salary values are retrospective enrichment only, applied when current and frozen JD text match after whitespace removal; otherwise omit the estimate. Source age and truncation therefore reduce salary coverage. Target feedback, feedback reasons, old scores and displayed rank are not passed to scoring, and no new profile replacement was made during this experiment. However, the upstream prep used later profile/settings snapshots: all 50 profile update timestamps postdate the recommendation. Indirect post-outcome information therefore cannot be ruled out. This does not establish actual feedback contamination, but these results are not leakage-verified performance estimates and cannot identify a best prompt or weight setting.

Five arms: v6/no salary (`baseline`), v6/old salary wording (`salary`), v8/no salary (`prompt`), v8/new explicit uncertainty wording (`combined`), and frozen v7/old salary wording (`previousCombined`). The fifth isolates the uncertainty revision from the previous implemented version. No repeat or adaptive prompt changes after inspecting outputs. Same role membership, order and batching for each arm; rotate arm order.

Primary v2 metric: mean per-user positive-over-negative ordering under 30/50/10/10 (all 50 users have both labels). Also report pooled pair accuracy, cross-user AUC, candidateInterest AUC, salary-present subset, 5 weight choices and user-cluster paired bootstrap 95% intervals. Compare combined against baseline and previousCombined. User-level averaging prevents prolific raters from dominating. This cohort cannot measure real acceptance or future recommendation outcomes; no weight is fitted on it.

Canonical selection/capture preparation: `scripts/prepareExternalCompanyValueHistory.py`, then `finalize` after read-only salary capture. Exact provider requests: `scripts/evalExternalCompanyValue.ts prepare v2`; execute `run v2`; aggregate `report v2`. Use the same Node environment invocation as v1. The runner imports production builders/parser, freezes actual requests/gold before calls and stores v2 receipts under `runs/v2/`. Cost accounting includes v1's paid calls and a shared exclusive runner lock; total operational ceiling remains $0.90, below the user's cumulative $1 limit. Source archives stay in ignored owner-only `private/source-v2/` and must not be committed.

## v2 weight-only follow-up — 45/35/10/10

The user's follow-up requests comparing 45/35/10/10 against 30/50/10/10 on the same v2 data. `python3 scripts/reportExternalCompanyValueWeights.py` reuses all five arms' frozen scores, checks gold/fixture identity and agreement with the existing sensitivity table, and reports user-equal ordering, pooled pair ordering, changed users/pairs and paired user-bootstrap intervals (2,000 replicates, seed 20261106). No new inference, feedback selection, prompt changes, runtime weight changes or deployment. This is descriptive follow-up analysis on the previously inspected cohort, not an independent holdout or a learned optimum. Aggregate result: `reports/weights-v2-45-35.json`.
