# External fit qualitative pilot

## Objective and unit

Compare external fit scorers on frozen real candidate × external-role inputs before any LLM reranker. The original `pilot-v4` compares the then-current DeepSeek scorer (A) with Jev-native typed judgments (B). The `pilot-v5` and `pilot-v6` extensions compare DeepSeek V4.1 Flash with GPT-6 Luna on the same production scoring contract. These pilots are not production accuracy estimates or release decisions.

`pilot-v4`: requested account, Korea-based earlier-career engineer, Korea-based CRM/business analyst with sales operations experience. Select the latter two before viewing model output from a deterministic initial account sample; selection is based on relevant work experience, not protected attributes or a claim of personal worth. Private selection rationale and identity mapping stay in `private/`.

## Input and provenance

Capture current Profile + full Search Brief + existing Behavior Context through the production matching projection, without refreshing/writing it. Reuse the most recent completed saved external search plan; retrieve at most 200 current external cards and freeze the first up to 30 eligible live roles (all when fewer exist), preserving order. Apply production blocked-company, prior-delivery, liveness filters and test-only exclusion; liveness uses `persist_expired=False`.

The current snapshot and historical saved search plan are intentionally different timestamps. This tests the scorer on current eligible roles, not a faithful replay of an old recommendation. No planner, new behavior builder, reranker or recommendation delivery is run. The capture uses retrieval card facts; selector-side company funding/leadership enrichment is not refreshed or separately attached. Thus this is a fixed-input scorer comparison, not a full production recommendation replay.

Canonical runner: `harper_worker/llm_evals/external_fit_qualitative/eval.py`. It imports the current production A system prompt, input builder, transport, normalizer and `ranked_fit_roles`. `production_a.py` runs the canonical `run_deepseek_fit_scoring` scheduler and missing-output recovery with a local replay transport; saved responses are reused after exact system/input hash equality checks. Source HEAD, dirty diff fingerprint, runner hash, prompt hashes and fixture hash are recorded. A fixture cannot be overwritten. Any change of inputs creates another dataset version. Each model/prompt run gets a new run directory; successful saved calls are reused on interrupted-run resume, never silently rerun.

## Model and output contract

- Historical `pilot-v4` A: `configured_llm_call(EXTERNAL_FIT_SCORING_CALL)` at the time of that run. Those calls used OpenRouter `deepseek/deepseek-v4-flash-0731` pinned to Relace, with medium reasoning. The `pilot-v5`/`pilot-v6` DeepSeek arm used `deepseek/deepseek-v4.1-flash`, high reasoning, and OpenRouter default provider selection. The post-pilot working-tree scorer default is direct OpenAI `gpt-6-luna`, high reasoning; the frozen historical arms and inputs remain unchanged. Production batches of 10 keep the same score and neutral role-summary output.
- B: OpenRouter Decisions API `https://openrouter.ai/api/alpha/decisions`, pinned `typesafe/jev-1.13`; record resolved dated model in each response. Six questions per candidate-role, one call per pair, no repetitions or result-driven tuning. Native API has no chat explanation, reasoning effort or temperature setting. 180-second response timeout.
- B `roleFit`, `talentPreferenceFit`, `companyPreferenceFit`, `overallRecommendationFit`: five anchored ordinal levels 0–4, returned expectation scaled to 0–100. These are rubric scores, not hiring probabilities. Company preference means documented employer-side qualification match; private employer preferences are unavailable.
- B `passHardConstraint`: native Noul probability of **no demonstrated violation** of explicit nonnegotiable candidate constraints. Missing facts alone are not a failure unless confirmed terms are explicitly required. Preserve the probability; do not turn it into an arbitrary boolean threshold.
- B `evidenceSufficiency`: sufficient / partial / insufficient, preserving native choice probabilities in raw output.
- B gets exactly the same profile and projected facts for the target role as A. A rates ten roles independently per batch; B rates one role with six questions. This batching/output-contract difference is part of the intended system comparison and prevents attributing everything solely to model weights. Original Korean remains intact in both arms.

## Ordering and review

Show every captured role sorted by each model's raw overall score, including weak/excluded roles. Separately show the actual pre-rerank eligible list using the same existing postprocessor in both arms: raw-score threshold, company cap, company bonus, recent-company penalty and ordering. B uses rounded holistic overall score, not a weighted average of diagnostic axes. No additional semantic gate or score repair is introduced. Flag inconsistent B gate/overall judgments for human review; do not hide them.

Absolute A/B scores are not calibrated to one another. Compare which roles rise/fall and whether the reasons follow profile, Brief and JD evidence. The existing threshold applied to B is diagnostic, not a validated deployment threshold.

Review rubric is frozen in `gold-review-v1.json`; **there are no human gold labels yet**. Review role feasibility, candidate value, employer screen plausibility, explicit constraints, unknown-vs-mismatch handling, and meaningful within-person ordering. Inspect both promoted and demoted roles, not only the first few. Model agreement and high scores are not evidence of correctness. Any assistant-authored narrative is labeled separately from model output.

Structural checks: the captured pair count per arm, no unknown or missing role IDs, finite scores in range, unchanged input hash, no rerank or DB write. There is no quantitative quality release gate in this pilot. Promotion requires independent human review with broader frozen cases and validated gating/calibration; this run alone authorizes no deployment.

## Privacy and execution

The user explicitly requested the three real-user `pilot-v4` model calls. Production is accessed only with canonical `connect_read_only(load_config())`, verifying `transaction_read_only=on`. Raw profile, Brief, Behavior Context, role/company data, IDs and model output are confined to ignored `private/` / `runs/`, directories 0700/files 0600. No secrets in manifests. Historical pilot-v4 model requests transmitted the matching projection and public role facts through OpenRouter to Relace and TypeSafe/Jev, with `data_collection=deny`. The pilot-v5/v6 DeepSeek V4.1 arm left provider and sort selection to OpenRouter. No production cache, fit, recommendation, message or status writes.

From workspace root:

```sh
./myenv/bin/python harper_worker/llm_evals/external_fit_qualitative/eval.py capture harper_beta/docs/evaluation/external-fit-qualitative/private/selection-v4.json
./myenv/bin/python harper_worker/llm_evals/external_fit_qualitative/eval.py run pilot-v4-once
```

Known limitations: 3 purposively selected people; at most 30 top retrieved roles each rather than full retrieval; saved-plan staleness; incomplete JD requirements; existing profile/behavior errors; multilingual capability; one stochastic A run; native Jev ordinal calibration; public employer preferences only; no observed interview/hire/user satisfaction labels; assistant qualitative review is not independent human gold.

## Dataset history

- pilot-v1: captured 30 / 11 / 2 roles; never sent to either model. Two roles for the initial brand/PR slice do not support meaningful ranking review.
- pilot-v2: retain C01/C02 identical snapshots; replace C03 with a Korea-based CRM/business analyst before any model output. The original v1 fixture remains frozen. Selection changed for candidate-pool breadth, not model performance.

- pilot-v2 run invalidated during structural input audit before inspecting model scores: the historical benchmark helper still used legacy keyed insights and omitted authoritative Search Brief rows. Its partial raw calls are retained under runs with INVALIDATED.json, not compared.
- pilot-v3: identical frozen role cards and users, current production `talent_contexts` projection with complete Search Brief, no legacy duplicate insights, same existing Behavior Context. Brief counts 5/13/7 checked before model calls. C02/C03 remain valid and are reused in v4; C01 was superseded after the user confirmed test contamination and selected a different account.

- pilot-v4 (final): user explicitly replaced the original test-contaminated C01 account with a different account. C01 is freshly captured from a completed periodic external scoring run; C02/C03 snapshots and all successful model calls are reused byte-for-byte from v3. No prior C01 score is used. Capture now requires a saved run with actual external scoring coverage, excluding the old C01 test-internal delivery plan.
- A response-recovery follows the actual production scheduler, including split retries only for missing output. Successful semantic decisions are not repeated. Local replay verifies frozen request equality before reusing any saved result. Model prompts/rubrics stay unchanged across valid comparisons.

## Pilot-v5: DeepSeek V4.1 Flash vs GPT-6 Luna

- Objective: compare the current Worker's external-fit **scoring stage** for speed, measured API usage cost, output completeness and raw score ordering. This does not measure independent fit accuracy, candidate response or the final reranked slate.
- Frozen input: `manifest-pilot-v5.json` records the 2026-10-07 capture, source revision/diff fingerprint and input hashes. Two previously reviewed real accounts (C01/C02) supplied 30 + 11 current live roles. The former C03 had no eligible live role at capture time and was excluded before either model ran. The current production prompt matched each frozen case exactly. The most recent saved search plan and current candidate/role snapshots are different timestamps by design.
- Canonical runner: `harper_worker/llm_evals/external_fit_qualitative/compare_deepseek_luna.py`; the source notebook is `harper_worker/llm_evals/external_fit_qualitative/external_fit_deepseek_vs_gpt6_luna.ipynb`. The notebook invokes the production `run_deepseek_fit_scoring` scheduler, its 10-role batches, parallelism, and missing-output recovery with an exact-input checked, resumable local transport. The executed notebook and raw calls are ignored, owner-only files in `runs/deepseek-v41-vs-gpt6-luna-pilot-v5-20261007/`.
- Arms: OpenRouter `deepseek/deepseek-v4.1-flash` with Worker default routing and `data_collection=deny`, versus direct OpenAI `gpt-6-luna`; both use `high` reasoning and one model run per frozen case. At evaluation time GPT-6 Luna was an explicit scorer override; it became the local default only after the pilots. No rerank, persistence or delivery runs.
- Observed, two cases/41 pairs: DeepSeek 6 API responses including one invalid-item recovery, 98.77 seconds summed case wall time, $0.048100 actual OpenRouter `usage.cost`; GPT-6 Luna 5 responses, 103.34 seconds, $0.018314 Worker token-price estimate. Both returned 41/41 role evaluations. API-call P50/P95 were 31.46/75.23 seconds and 44.92/56.94 seconds respectively. The top-five raw-score lists overlapped by 2/5 for each candidate, with different top-ranked roles.
- Interpretation: 41 pairs across two selected people and one run per model cannot establish general latency or fit accuracy. Top-five overlap is model agreement, not correctness. The review rubric remains `gold-review-v1.json`; independent human labels are still pending. Do not use this run alone as a replacement gate.
- Privacy: read-only production capture via `connect_read_only()`. Full Profile, Search Brief, Behavior Context and public role facts were sent to OpenRouter/DeepSeek and OpenAI for this explicitly requested evaluation. Raw inputs, identity mapping, responses, displayed rankings and usage remain only in ignored `private/` and `runs/` with owner-only permissions.

## Pilot-v6: five additional people, qualitative review

- Objective: compare recommendation quality from the same two **scoring-stage** models, excluding cost and latency from the judgment. Five new people were selected by distinct job family from recent real external-fit runs before viewing either model's pilot-v6 outputs: business planning, PR, medical-device sales, marketing operations, and robotics software. They do not duplicate pilot-v5. Selection details and identities are private.
- Frozen input: `manifest-pilot-v6.json` records five current production projections and 30 + 30 + 30 + 17 + 30 currently eligible external roles (137 candidate-role pairs). This is a new dataset version because the examples changed. The source notebook `harper_worker/llm_evals/external_fit_qualitative/external_fit_deepseek_vs_gpt6_luna_v6.ipynb` and canonical runner `compare_deepseek_luna.py` use the same production batch scorer, prompt/input checks, model configuration and response-resume contract as pilot-v5. The executed notebook, review notes and raw calls are ignored owner-only files in `runs/deepseek-v41-vs-gpt6-luna-pilot-v6-20261007/`.
- Structural result: DeepSeek evaluated 132/137 roles; one business-planning batch left five roles missing after production retry, including a directly relevant corporate-strategy role. GPT-6 Luna evaluated 137/137. Raw-score top-five overlap by case was 4, 4, 2, 3, 3 roles. These are completeness and agreement observations, not accuracy metrics.
- Assistant qualitative review: inspect the union of each arm's top five, the candidate's Profile/Brief and the relevant job requirements, emphasizing explicit exclusions, plausible employer screening and role direction. The private `qualitative-review-v6.md` records case-level evidence. On this limited review, GPT-6 Luna is preferred in four of five new cases, with one inconclusive case; the two pilot-v5 cases were also spot-checked (one Luna preference, one inconclusive). This is an assistant judgment, **not** independent human gold or a statistical win rate.
- Failure modes: both models promoted roles that conflict with a candidate's desired work or likely qualifications. In particular, the medical-device sales and marketing-operations retrieval sets offered few strong choices, and the robotics career changer was often scored as though training projects were years of production robotics experience. Do not infer downstream recommendation quality from this scoring-only pilot. The existing review rubric remains `gold-review-v1.json`; no gold labels or release threshold were changed.
- Follow-up implementation in the Worker working tree: regular `external_fit_scoring` now defaults to direct OpenAI `gpt-6-luna` with high reasoning, matching the evaluated Luna arm. The external-fit cache evaluator key was versioned so earlier DeepSeek score rows are not read as Luna results. This is a local code change; deployment requires separate authorization.
