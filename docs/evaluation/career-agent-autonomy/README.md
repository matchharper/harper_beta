# Career agent autonomy

## v5: concurrent delegation and chat authority

`cases-v5.json`, `gold-v5.json`, and `manifest-v5.json` freeze two synthetic development probes before generation: ten distinct application requests in one message, and delegation of ten already prepared reviews through chat. The evaluation unit is a complete foreground agent turn, including all work/form calls and the final reply. It uses the production model, selector, prompts, tool schemas and loop. A memory adapter records durable work and form effects with production projections; it does not execute child agents or real submissions. Native PostgreSQL tests in `src/lib/career/work/database.test.ts` separately verify the actual admission, revision, approval and dispatch transactions.

Run `NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --dataset v5 --repeat 1 --label concurrent-work`. Inspect complete provider inputs and outputs manually against frozen semantic criteria. All ten responsibilities must be accounted for, explicit scoped delegation must not create another mandatory confirmation, and submission completion must not be invented. Tool counts are diagnostics. No automatic qualitative judge or hidden retries. Existing owner-only ignored artifacts and network isolation apply. These probes cannot establish production delivery, browser recovery, or general reliability. The removed top-level registry was read at `463d83cb^`; its deletion is preserved.

Current product selection: **C**, by the user's 2026-11-03 decision. See [selection and A rollback](../../agent-guidance/career-guidance-selection.md) for the exact references and scoped rollback patch. The comparison below remains historical evidence; it is not an active production A/B switch.

Compare the current Career agent after making web tools core with a simplified general guidance configuration. The evaluation unit is the first complete assistant turn, including its live capability selector, tool loop, intermediate text, final reply and saved artifacts. Four cases cover sparse experience, empty indexed opportunity results, a blocked application route and sufficient material requiring no extra research.

## Frozen data and review

`cases-v1.json`, `gold-v1.json` and `manifest-v1.json` are frozen before baseline generation. People, companies, postings, documents, mailbox state and public pages are synthetic. Gold never enters model input. Public searches use the same small lexical source index in both variants; page reading returns exact frozen bodies. No expected tool sequence is prescribed. Read the complete output and state manually against the semantic criteria. Tool counts and elapsed time are diagnostics, not quality scores. No qualitative regex, runtime grader, extra judging model or hidden quality retry is used.

## Canonical runner

From `harper_beta`, run:

```sh
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --validate-only
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --repeat 2 --label baseline
```

The runner imports production Career model defaults, tool schemas, capability selector/runtime, prompts, handbooks and provider/tool loop. It exposes the full eligible post-onboarding tool set, with the same account context in both variants. No model, temperature or output budget override is applied. Each case starts fresh; there are no fabricated user answers. Two trials per case help expose variability. Each trial has a 360-second execution deadline, provider requests 150 seconds, and two trials can run concurrently. The runtime may recover ordinary tool-input errors; no extra evaluation response retry is added.

The fixture adapter uses actual document authoring, structured-resume validation, source ownership/revision checks, document reads and production model projections over isolated memory tables. Forms use the production schema and formatter with memory persistence. Profile edits use the production pure edit function. Matching, account, search and browser observations are synthetic. Unconfigured effects fail visibly, and all attempted external actions are recorded without execution. The experiment tests the original agent's decisions, not real browser execution or search quality.

## Artifacts, privacy and reproducibility

Raw requests/responses, exact source snapshots, source/fixture hashes, selector choices, full tool results, final documents/forms and transcripts are saved under ignored owner-only `runs/`. Headers and credentials are never recorded. Network is limited to the configured OpenAI model and Decisions endpoints. Database, email, company and browser networks are disabled. No production user or internal Role is created. The baseline product snapshot is commit `463d83cb`; each run records its own exact source hashes and revision.

The repository evaluation README had already been deleted in the user's workspace. Its HEAD version was read before the baseline snapshot; the deletion is preserved. This directory registers the new task without restoring removed documents.

## Interpretation and gate

Report each trial's usefulness, factual grounding, user effort and scope/permission behavior with evidence. A favorable comparison requires useful progress across the challenging cases without degrading the sufficient-material control or inventing candidate achievements. Failures and infrastructure limitations must remain visible. Four synthetic cases cannot establish general reliability, isolate every individual prompt change, or authorize deployment. Company delivery, PDF rendering, real browser behavior, production DB authorization and voice/background conversations are outside this experiment.

## Recorded comparison

[2026-11-02 comparison](reports/2026-11-02-comparison.md) records all 16 trials, observed gains, unchanged behavior and remaining failures. Baseline source is `84c52faa` (product baseline `463d83cb`); simplified source is `0967d691`. Raw provider traces and readable full transcripts remain in ignored `runs/`. The comparison is not a deployment or general-reliability gate pass.

## v2 transfer and side-effect comparison (2026-11-03)

`cases-v2.json`, `gold-v2.json` and `manifest-v2.json` add 12 cases frozen before generation: interview preparation, portfolio selection, sufficient-resume review, exact document edit, unknown personal application facts, English recruiter reply, ambiguous employer identity, corrected team metric, one-off overseas exploration, career tradeoff advice, unavailable source and privacy-limited public bio. These were written after inspecting v1, so they are new transfer probes, not an independently sampled blind holdout. Two trials per case per variant produce 48 trials. Product guidance stays frozen; no production source edits are made for v2.

The runner's `--guidance-revision` replays the exact committed main prompt, handbook bodies, catalog metadata and Memory description inside the evaluation process. It uses the existing `adaptPromptBlocks` hook for the main block and installs the committed handbook/catalog values before tool construction. It does not change the checkout. `replayed-guidance.json` preserves the source and effective text, and the run manifest stores its hashes. Selector, model, eligible tools and execution loop remain the same. The helper is `scripts/evaluation/careerAutonomyGuidance.ts`, never imported by product code. Fixture rows now allow frozen document metadata so an existing editable document can exercise real update/revision behavior.

```sh
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --dataset v2 --guidance-revision 463d83cb --validate-only
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --dataset v2 --guidance-revision 0967d691 --validate-only
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --dataset v2 --guidance-revision 463d83cb --repeat 2 --label v2-A
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --dataset v2 --guidance-revision 0967d691 --repeat 2 --label v2-B
```

Review both useful completion and unwanted behavior: over-research, cosmetic rewriting, scope expansion, unsupported facts, missing essential questions, language drift, private disclosures, durable preference changes and unreviewed external actions. No runtime quality filter or automatic judge is added. Failed source replay/preflight is infrastructure failure and must be fixed before model generation. Any later fixture failure remains visible in results.

## v3 fixture consistency correction

During v2 review, two cases inherited the generic profile helper's company/contact values while their documents named different employers and emails. The model correctly noticed these contradictions, so those extra questions cannot be counted as unnecessary questioning. `v3` corrects only these profile facts in `sufficient_resume_review` and `missing_personal_fields`, keeps messages/pages/gold criteria unchanged, and repeats both A/B twice (8 additional trials). All v2 data and outputs remain unchanged. Use the v2 commands with `--dataset v3` and labels `v3-A` / `v3-B`. No product-guidance changes follow the observed outputs.

[2026-11-03 transfer and side-effect report](reports/2026-11-03-transfer-and-side-effects.md) records the exact prompt additions, 48 v2 trials, 8 declared fixture-correction trials, unnecessary document creation, preserved boundaries and tool-contract errors. It revises the earlier broad B-is-better interpretation. Product guidance remains unchanged.

## C: retain useful A guidance (2026-11-03)

The user's follow-up asks for less aggressive shortening: keep web tools core and the two public-context/independent-work sentences, restore useful A guidance, and remove harmful B instructions without scenario-specific additions. C restores A's focused-question and substantive-edit criteria, full language contract, existing-decision handling, introduction preparation judgment, schedule/follow constraints and matching stewardship detail. It removes B's blanket document-saving instruction and restores the resume catalog's requested-document scope. No model, tool schema, fixture or gold changes are made.

Live verification is deliberately limited to **two trials total**, one on each previously failing scenario: v2 `ambiguous_employer` (unnecessary document saving) and v1 `blocked_application` (external-content language). This is a targeted check, not a repeat of the 56-trial comparison or an assessment of final resumes after user answers.

```sh
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --dataset v2 --only ambiguous_employer --repeat 1 --label retained-c-ambiguity
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --dataset v1 --only blocked_application --repeat 1 --label retained-c-application
```

[C retained-guidance report](reports/2026-11-03-retained-guidance.md) records the restoration/deletion diff and the two completed trials. Both initial attempts failed before model output because of connection errors; those artifacts are preserved. After connectivity recovered, the same two cases were each executed once with unchanged product guidance and data. The completed runs did not repeat B's unnecessary file creation or email-language error. The Atlas case still asked for company identification without web research, so this does not establish improved research autonomy.

## Targeted action-outcome wording check (2026-11-03)

The main prompt's preparation/execution/delivery distinctions were condensed into grounding action outcomes in tool-confirmed facts. Async result reads and duplicate-execution prevention remain. Successful Gmail sends now report acceptance for sending without a routine recipient-receipt disclaimer; failure and uncertain-send results are unchanged.

The unchanged v2 `recruiter_reply` and `unavailable_source` fixtures ran once each with current product defaults (`gpt-6.1-sol`, high reasoning), using `--dataset v2 --only recruiter_reply,unavailable_source --repeat 1 --label outcome-evidence-cleanup`. Exact requests, outputs, source snapshots and the dirty-workspace diff are in ignored `runs/2026-11-03T07-52-53-434Z-outcome-evidence-cleanup/`. Provider requests contain the revised main prompt. External actions remain isolated by the existing fixture adapter.

- The recruiter case produced the requested English draft with the supplied availability and no tool calls, but still added an unsolicited non-send statement. This change has **not** established elimination of that behavior.
- The unavailable-source case read the saved evidence, attempted public retrieval, disclosed the missing company-specific evidence and delivered useful interview preparation without inventing company facts or candidate cost savings. Necessary uncertainty remained visible.
- These are two post-change observations, not a before/after frequency comparison. They do not exercise real Gmail delivery. The existing email-tool and main-prompt tests passed 11/11; an initial test invocation lacked the import-time OpenAI credential and was rerun with a synthetic test key. No deployment was performed.

## v4: external posting import for application requests (2026-11-03)

Two new synthetic URL-only requests reuse the v1 application source facts: applying to an unsaved posting and analyzing the same posting. `cases-v4.json`, `gold-v4.json` and `manifest-v4.json` were frozen before generation. These are targeted development probes reviewed by Codex, not a blind holdout. The fixture's optional `roleStored=false` omits the selected role and ID from model context until import; existing datasets retain their selected-role context. The save adapter records the import and returns identifiers without any real DB or external action. Existing save/import unit tests separately exercise the production importer.

The product change updates the save tool description and both capability catalog entries. No main prompt, handbook, execution permission or model configuration changes are part of this task. Read actual provider inputs and full output manually: the application request should import and continue preparation without a save-permission question; analysis alone should remain analysis. Neither case should send an application before final review. Each case runs once under the same defaults, network boundary and artifact retention as the canonical runner above.

```sh
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --dataset v4 --repeat 1 --label application-posting-import
```

This checks agent behavior with synthetic tool observations, not real website submission or production persistence. Two trials do not establish general reliability or a before/after improvement rate.

The run `runs/2026-11-03T09-19-37-993Z-application-posting-import/` completed both cases with `gpt-6.1-sol` / high reasoning. Manual review of the full provider requests, calls and replies confirmed:

- The application case queried existing recommendations, imported the unsaved URL without a save-permission question, researched the official application route, and prepared a review form with the returned role ID, email body and exact resume revision. No external send/submission was attempted. Completion took 38.3 seconds.
- The analysis case read public sources and the resume, then delivered a grounded fit analysis. It made no save or application calls and no mutations. Completion took 36.6 seconds.
- Actual provider requests contained the revised capability descriptions and `save_job_posting` schema description. Both cases met their targeted semantic criteria. These post-change observations are not a controlled comparison.
- The production importer and capability/tool suites passed 36 tests in total. The first test invocation could not import two suites because synthetic DB environment variables were missing; those two suites passed after supplying test-only values. No production writes, sends or deployment occurred.

[2026-11-03 concurrent work report](reports/2026-11-03-concurrent-work.md) records the initial missing-tool failure, its source correction, the unchanged-v5 rerun, exact replies and the distinction between model delegation, native DB checks, local UI checks and unperformed external submissions.
