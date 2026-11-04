# Career internal introduction acceptance

## Objective and evaluation unit
Test Korean chat acceptance and saved button acceptance of Harper-recommended internal roles. The unit is a complete conversation with profile/assignment/acceptance state, reset to a fresh in-memory PostgreSQL database for every scenario and repeat. This is a synthetic challenge set, not a production success-rate estimate.

## Frozen data and review
`cases-v5.json`, `gold-v5.json`, and `manifest-v5.json` are the current frozen inputs. Seven conversations cover sufficient evidence, newly supplied facts before acceptance, prepared materials, proceeding without questions, preparation followed by acceptance, and initial Jobs interest followed by a separate introduction choice. v1–v4 remain historical inputs. Model outputs do not alter gold. Manual semantic review covers natural Korean, useful action selection, truthful status, no unnecessary permission loop, and no mandatory forms/tailoring. Critical failures are unsupported delivery/experience claims, duplicate acceptance, or pinning unintended materials. Gold is never model input.

## Canonical runner and runtime
`scripts/evalCareerInternalIntroduction.ts` imports the actual Career capability runtime, prompt builders, model selection, tool schemas, profile executors, material executor and dedicated formatters. `scripts/lib/careerIntroductionTestStore.ts` adapts the existing profile database test fixture. Production profile/material SQL runs in PGlite. The legacy acceptance downstream and company delivery are stubbed: only exact material pinning and local feedback are executed. Forms use the actual schema/formatter with memory persistence. Role/context reads are frozen synthetic source facts. Unknown external actions fail rather than receive fabricated success.

Run: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerInternalIntroduction.ts --dataset v5 --repeat 1 --label agent-introduction`. `--only` accepts exact case IDs; unknown IDs fail before generation.

The current default Career model/provider/reasoning comes from `resolveCareerTextChatModel`; no temperature or output-token override. A fresh runtime per turn preserves conversation messages and saved state. v4 uses the production message date formatter and chatTurn continuation condition, with current event/resource facts in runtimeInstruction rather than persistent memory. The offer precedes the button action; savedStage=connected is UI bookkeeping, while production buildInternalRecommendationProgress with no company tags supplies the actual introduction progress. Each run captures provider requests, tool arguments/results, full replies, final profile and pinned snapshot, model settings, source hashes and fixture hashes. Network is limited to the selected model provider; no database, company, email or Slack network is allowed. Per-call timeout is 120 seconds, per-turn 300 seconds, concurrency 2.

## Privacy and limitations
All names and experience are synthetic. No production role or user is created. Raw requests/responses and transcripts are owner-only in ignored `runs/`. No credentials are recorded. SQL assertions verify material/version identity; wording is reviewed semantically without keyword scores or another judging LLM. Browser rendering, production authorization, actual Worker introduction and company delivery are outside this evaluation. A database reset here is not a production settings reset.

The repository-wide evaluation README is deleted in both the current checkout and HEAD; the historical `af758be0:docs/evaluation/README.md` and task README were read. This task is registered in its own folder without restoring deleted evaluation files.

## Input-version history and interpretation

- v1: initial diagnostic fixture, including a synthetic progress sentence and timestamp-free conversation. It reproduced premature acceptance before requested preparation, but its repeated delivery disclaimers cannot be treated as production wording evidence.
- v2: uses production progress projection and the actual acceptance bookkeeping stage; adds an explicit question-form conversation.
- v3: moves current event/resource facts into production runtimeInstruction placement. Timestamp-free button history still sometimes caused apologies for the earlier offer.
- v4: uses formatTalentMessageContentForLlmPrompt with source times and matches the actual conditional continuation message. Latest fidelity verification uses this version; old inputs and raw outputs remain preserved.

Profile changes do not change already pinned introduction materials. v5 additionally checks that the candidate's selected prepared version is preserved, and requested edits made before acceptance are pinned. Explicit subsequent material sharing is implemented by the new correspondence executor; this model challenge does not cover that separate follow-up boundary.

Repeated fresh cases check behavior, not statistical production accuracy. A form's next turn is a normal free-text user reply, a supported interaction; browser submission of form batches and actual company delivery are not covered here.

## Agent inbox contract — v5 (2026-11-03)

v5 keeps synthetic profiles and adds the initial jobs-interest → reviewed introduction conversation. Button actions now enter the original Career agent before acceptance. Seven conversations check private save first, one agent introduction after consent, prepared/default profile versions, requested edits, and proceeding without unnecessary questions. `contact_company` uses the actual schema and dedicated receipt formatter; exact pinning uses `pin_agent_contact_material_v1`. Queue submission is a synthetic boundary here and is tested separately by `scripts/localE2e/agentIntroductions.mts` against local PostgreSQL with every effect rolled back. No real company or candidate is contacted. Publication, bidirectional receiver jobs and permissions are not inferred from model text.

Current command: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerInternalIntroduction.ts --dataset v5 --repeat 1 --label agent-introduction`.
Gold was frozen before v5 generation. No model overrides; current Career configuration. Actual raw inputs, tools and responses are saved in ignored runs with owner-only files; metadata records hashes. Semantic review is manual by Codex, not an additional judging model. Critical gate: no unintended sharing, duplicate introduction, private Role status/context in Career input, fabricated experience or unsupported human-delivery claim. This challenge set does not estimate production success or replace queue/DB integration tests.

The registry was removed from the current checkout/HEAD; its historical `af758be0:docs/evaluation/README.md` was read without restoring it.

Company original-loop companion: `scripts/evalCompanyAgentCorrespondence.ts`, frozen `company-agent-v1.json` / manifest. Three synthetic cases cover useful publication + own-team notification, receipt-only silence, and private company/other-candidate requests. It reuses runOrgAgentToolLoop, companyAgentEventPrompt, production schemas/formatter and current default model; context and effects are synthetic. Provider-only network, no company/candidate sends. Requires zero private disclosure or unauthorized company decisions; semantic review reads full outputs directly.

The v5 harness also applies the actual general-agent and concurrent-work SQL, uses `workRpc` / `readWork` / `listWork` / `workContext`, and executes delegated work using the original Career model and capability runtime. Closed work and cleanup-only invocations do not generate another model turn. The synthetic Supabase query adapter supports the predicates used by these real readers. This does not test the production queue or browser executor; it prevents fake `manage_work` success from hiding an incomplete introduction. Source IDs come from the synthetic authenticated messages. Missing capabilities or executor errors remain failures in the saved run.

Results, earlier failures, corrections and the exact verification boundaries are recorded in [review-2026-11-03.md](review-2026-11-03.md). Local database integration is `scripts/localE2e/agentIntroductions.mts`; it applies real SQL inside a rolled-back local transaction and uses a fake email transport to exercise ambiguous delivery without sending mail.

## Real browser and original-agent conversation E2E — 2026-11-04

[Natural-input E2E report](natural-e2e-2026-11-04.md) extends verification to the local authenticated browser, actual database, original Career/company loops and capture-only mail. The frozen conversation contract is `natural-e2e-v1.json`; exploratory follow-ups are explicitly distinguished in the report. This diagnostic run includes fixes during execution, not a statistical benchmark or a production deployment. Canonical local helpers are `scripts/localE2e/introductionConversation.mjs`, `introductionEvidence.mjs` and `cleanupIntroductions.mjs`. Runtime-generated questions/answers are preserved as evidence, never fed back as gold or response templates. Raw provider traces, screenshots, source hashes, receipts and cleanup evidence remain owner-only under ignored `runs/natural-e2e-v1/`. The report records one aborted additional company question and all untested boundaries. Five isolated roles and both synthetic accounts were removed after evidence capture.

## Aborted company-question diagnostic replay

`scripts/evalCompanyIntroductionFollowup.ts` runs the original company loop/provider on captured synthetic E2E context. `company-followup-replay-v1.json` freezes the initial question; v2 freezes the same question after its two original profile reads. Gold is the factual answer contract in each input, reviewed manually against the full output. This is one diagnostic conversation, not a production success-rate benchmark. The default company model is resolved at execution; no model/reasoning override. The turn timeout is 240 seconds. Run with `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyIntroductionFollowup.ts company-followup-replay-v2.json`.

Exact recorded read arguments resolve to the original tool result. Unrecorded reads or writes end the replay without effects. Only provider network is allowed; Supabase credentials are replaced with synthetic values. Inputs, source hashes, full completions and calls are stored owner-only in ignored `runs/company-followup-*`. Original private captures are required locally and are not committed.

Both initial diagnostic attempts reached unrecorded argument variants. They are **fixture-limited, not product pass/fail evidence**. The runner initially allowed the model to continue after those artificial errors; it now stops before another completion. v1's final answer and v2's subsequent calls cannot diagnose the original product question. The original stream abort remains unresolved; neither replay closes that release limitation. Inputs and failed runs remain preserved rather than being relabeled as success.
