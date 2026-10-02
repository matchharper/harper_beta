# External fit qualitative pilot

## Objective and unit

Compare unchanged current external DeepSeek scoring (A) against Jev-native typed judgments (B), before any LLM reranker. Unit: one frozen candidate × external role. This is a three-person, purposefully selected qualitative pilot, not a production accuracy estimate or a release decision.

`pilot-v4`: requested account, Korea-based earlier-career engineer, Korea-based CRM/business analyst with sales operations experience. Select the latter two before viewing model output from a deterministic initial account sample; selection is based on relevant work experience, not protected attributes or a claim of personal worth. Private selection rationale and identity mapping stay in `private/`.

## Input and provenance

Capture current Profile + full Search Brief + existing Behavior Context through the production matching projection, without refreshing/writing it. Reuse the most recent completed saved external search plan; retrieve at most 200 current external cards and freeze the first up to 30 eligible live roles (all when fewer exist), preserving order. Apply production blocked-company, prior-delivery, liveness filters and test-only exclusion; liveness uses `persist_expired=False`.

The current snapshot and historical saved search plan are intentionally different timestamps. This tests the scorer on current eligible roles, not a faithful replay of an old recommendation. No planner, new behavior builder, reranker or recommendation delivery is run. The capture uses retrieval card facts; selector-side company funding/leadership enrichment is not refreshed or separately attached. Thus this is a fixed-input scorer comparison, not a full production recommendation replay.

Canonical runner: `harper_worker/llm_evals/external_fit_qualitative/eval.py`. It imports the current production A system prompt, input builder, transport, normalizer and `ranked_fit_roles`. `production_a.py` runs the canonical `run_deepseek_fit_scoring` scheduler and missing-output recovery with a local replay transport; saved responses are reused after exact system/input hash equality checks. Source HEAD, dirty diff fingerprint, runner hash, prompt hashes and fixture hash are recorded. A fixture cannot be overwritten. Any change of inputs creates another dataset version. Each model/prompt run gets a new run directory; successful saved calls are reused on interrupted-run resume, never silently rerun.

## Model and output contract

- A: `configured_llm_call(EXTERNAL_FIT_SCORING_CALL)` including environment override. Current default is OpenRouter `deepseek/deepseek-v4.1-flash`, provider chosen by OpenRouter price routing, medium reasoning. Production batches of 10, unchanged score and neutral role-summary output. Historical pilot-v4 calls used `deepseek/deepseek-v4-flash-0731` pinned to Relace; new model runs require a new run ID against the same frozen input. No extra dimensions are requested from A because that would change the control.
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

The user explicitly requested these three real-user model calls. Production is accessed only with canonical `connect_read_only(load_config())`, verifying `transaction_read_only=on`. Raw profile, Brief, Behavior Context, role/company data, IDs and model output are confined to ignored `private/` / `runs/`, directories 0700/files 0600. No secrets in manifests. Model requests transmit the matching projection and public role facts through OpenRouter to its selected DeepSeek provider and TypeSafe/Jev, with `data_collection=deny`. Historical pilot-v4 DeepSeek requests used Relace. No production cache, fit, recommendation, message or status writes.

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
