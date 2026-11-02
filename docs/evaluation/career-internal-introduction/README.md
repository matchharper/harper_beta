# Career internal introduction acceptance

## Objective and evaluation unit
Test Korean chat acceptance and saved button acceptance of Harper-recommended internal roles. The unit is a complete conversation with profile/assignment/acceptance state, reset to a fresh in-memory PostgreSQL database for every scenario and repeat. This is a synthetic challenge set, not a production success-rate estimate.

## Frozen data and review
`cases-v4.json`, `gold-v4.json`, and `manifest-v4.json` are the current frozen inputs. Eight conversations cover sufficient evidence, useful missing experience, newly supplied facts before acceptance, prepared materials, a request to skip questions, preparation followed by acceptance, and explicitly requested question forms. Model outputs do not alter gold. Human semantic review covers natural Korean, useful action selection, truthful status, no unnecessary permission loop, and no mandatory forms/tailoring. Critical failures are unsupported delivery/experience claims, duplicate acceptance, or pinning unintended materials. Gold is never model input.

## Canonical runner and runtime
`scripts/evalCareerInternalIntroduction.ts` imports the actual Career capability runtime, prompt builders, model selection, tool schemas, profile executors, material executor and dedicated formatters. `scripts/lib/careerIntroductionTestStore.ts` adapts the existing profile database test fixture. Production profile/material SQL runs in PGlite. The legacy acceptance downstream and company delivery are stubbed: only exact material pinning and local feedback are executed. Forms use the actual schema/formatter with memory persistence. Role/context reads are frozen synthetic source facts. Unknown external actions fail rather than receive fabricated success.

Run: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerInternalIntroduction.ts --repeat 2 --label baseline`.

The current default Career model/provider/reasoning comes from `resolveCareerTextChatModel`; no temperature or output-token override. A fresh runtime per turn preserves conversation messages and saved state. v4 uses the production message date formatter and chatTurn continuation condition, with current event/resource facts in runtimeInstruction rather than persistent memory. The offer precedes the button action; savedStage=connected is UI bookkeeping, while production buildInternalRecommendationProgress with no company tags supplies the actual introduction progress. Each run captures provider requests, tool arguments/results, full replies, final profile and pinned snapshot, model settings, source hashes and fixture hashes. Network is limited to the selected model provider; no database, company, email or Slack network is allowed. Per-call timeout is 120 seconds, per-turn 300 seconds, concurrency 2.

## Privacy and limitations
All names and experience are synthetic. No production role or user is created. Raw requests/responses and transcripts are owner-only in ignored `runs/`. No credentials are recorded. SQL assertions verify material/version identity; wording is reviewed semantically without keyword scores or another judging LLM. Browser rendering, production authorization, actual Worker introduction and company delivery are outside this evaluation. A database reset here is not a production settings reset.

The repository-wide evaluation README is currently deleted in the user's working tree; its HEAD contents and the historical request-intro task README were read. This task is registered in its own folder without restoring deleted evaluation files.

## Input-version history and interpretation

- v1: initial diagnostic fixture, including a synthetic progress sentence and timestamp-free conversation. It reproduced premature acceptance before requested preparation, but its repeated delivery disclaimers cannot be treated as production wording evidence.
- v2: uses production progress projection and the actual acceptance bookkeeping stage; adds an explicit question-form conversation.
- v3: moves current event/resource facts into production runtimeInstruction placement. Timestamp-free button history still sometimes caused apologies for the earlier offer.
- v4: uses formatTalentMessageContentForLlmPrompt with source times and matches the actual conditional continuation message. Latest fidelity verification uses this version; old inputs and raw outputs remain preserved.

Profile changes after a button acceptance do not change already pinned introduction materials. This evaluation verifies honest handling of that boundary, not a new capability to replace accepted materials before delivery. Changing that product behavior requires a separate execution/worker concurrency contract.

Repeated fresh cases check behavior, not statistical production accuracy. A form's next turn is a normal free-text user reply, a supported interaction; browser submission of form batches and actual company delivery are not covered here.
