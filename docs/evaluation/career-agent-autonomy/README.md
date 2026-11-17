# Career agent autonomy

## Run a scenario on the production site

Run these commands from `harper_beta` with the production project configured in `.env.local`. Set `CAREER_QA_INBOX` to the team mailbox that receives mail for new test aliases. Each run name and scenario number identifies a private QA account. Reusing the name reopens the same account. For a new starting state, choose a new name. The harness verifies the account's QA marker before changing its data.

```sh
node --env-file=.env.local scripts/evaluation/runProductionCareer.mjs act interview-review 35
node --env-file=.env.local scripts/evaluation/runProductionCareer.mjs observe interview-review 35
CAREER_QA_PERSONA=privateOnly node --env-file=.env.local scripts/evaluation/runProductionCareer.mjs act saved-teams 11 12
node --env-file=.env.local scripts/evaluation/productionCareerSchedules.mjs start deadline-review 20
node --env-file=.env.local scripts/evaluation/productionCareerSchedules.mjs check deadline-review 20
node --env-file=.env.local scripts/evaluation/productionCareerSchedules.mjs stop deadline-review 20
node --env-file=.env.local scripts/evaluation/productionCareerInterview.mjs store-manager-review
node --env-file=.env.local scripts/evaluation/productionCareerCohort.mjs outcomes-review
```

`act` uses the production Career website. `observe` reopens the account to inspect the saved answer. For a scheduled case, check the run, what the user saw, and any expected message in the receiving mailbox before stopping the account's reservations. A completed run alone cannot establish delivery. Private setup, screenshots and receipts are in the ignored `private/production-profiles/` directory. Keep these files out of source control. Each scenario's remaining prerequisites and observed outcome are in the [production review](reports/2026-11-16-production-career.md).

## Run a numbered Career scenario

Start in `harper_beta`. Choose a pair affected by the change or omit the numbers to run the eleven default cases once. The runner emits one review index. Each model run records the actual reply, outbound actions, reviewer criteria, raw tool results and fixture state. Provider credentials are required for model cases. The UI check uses JSDOM. Case 34 uses the isolated local Supabase stack and runs only when selected. [Numbered runner](../../../scripts/checkCareerScenarios.mjs)

```sh
node scripts/checkCareerScenarios.mjs --list
node scripts/checkCareerScenarios.mjs 16,17
node scripts/checkCareerScenarios.mjs
```

To run case 34 with the configured Career model, use the local E2E stack and model-provider credentials. The fixture saves the actual prompt, tool calls and final reply under `runs/*-search-continuity/review.json`.

```sh
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/localE2e/careerSearchContinuity.mts --model
```

| Case | Frozen input and review criteria | What this run observes |
| --- | --- | --- |
| 01–02 | [v17 entry events](cases-v17.json) · [criteria](gold-v17.json) | First reply after a résumé-only or posting-specific onboarding. Each begins with a completed onboarding event and no user chat message. The Toronto role is a frozen fictional copy of the material terms. Upload and the next scheduled visit fall outside this run. |
| 03 | [v23 empty signup](cases-v23.json) · [review criteria](gold-v23.json) | The same silent signup as v17. Review the first reply for actual capability, effort saved and whether a person would feel heard. One generic question is the 5/100 anchor for experience. The model run alone cannot grade the production screen. |
| 04 | [v21 Gmail connection](cases-v21.json) · [criteria](gold-v21.json) | A person without a résumé or work and education records connects read access. The original Career model receives the app event, can query a three-message mailbox and write private records. Appointment operations use the production tool against an in-memory Postgres database. Gmail OAuth and real inbox access are outside this runner. |
| 07 | [v22 first scheduled search](cases-v22.json) · [criteria](gold-v22.json) | Without a user chat or a named employer, a scheduled search can discover five openings, including three Toss affiliates. Review the case for an actionable first choice and inspect the simulated delivery. |
| 10 | [v19 public lead](cases-v19.json) · [criteria](gold-v19.json) | A fixed market contains a logistics lead’s hiring post and a funding announcement. Search, page opens, opportunity writes and simulated delivery are observable. |
| 16, 17 | [v18 scheduled pair](cases-v18.json) · [criteria](gold-v18.json) | Same researcher, previously delivered jobs, contact preference and Thursday 10 a.m. Seoul time. One market adds a single opening. Inspect the send body and fixture receipt, or verify the run completed without sending. The scheduler and mail provider are outside the adapter. |
| 30 | [v20 offer comparison](cases-v20.json) · [criteria](gold-v20.json) | Read two private offers, weigh their written terms against the user's current job and guaranteed-pay floor, and make a recommendation. Negotiation is outside the request. |
| 34, 35 | [Search continuity](../../../scripts/localE2e/careerSearchContinuity.mts) · [opportunity UI](../../../src/components/career/history/OpportunityReviews.test.tsx) | 34 finishes a scheduled zero-result search silently. In a fresh conversation it retrieves the scope and purpose, including after an unrelated search. The optional model run adds a new team update, then asks what changed. 35 submits one checked form item to its originating conversation at a mocked API boundary. |
| 36 | [v16 follow-up](cases-v16.json) · [criteria](gold-v16.json) | A second FDE application receives only the personal document rows actually written during the first. Compare with the [v15 follow-up that needs new evidence](cases-v15.json). |

Each version has a content-hash manifest. Synthetic profile, mailbox and schedule data enter the production model path through test adapters. Only model providers can be contacted. The corpus files contain facts and actions. The report loads semantic criteria after model calls finish. Review the decision against the source and the result against each intended recipient or saved artifact. Record unresolved observations separately. Runtime, provider usage and repeat retrievals explain cost after the outcome has been reviewed. An exit status of zero means the requested stages ran. Do not use it as a quality verdict.

### Observations from November 16, 2026

Each model scenario below ran once with `gpt-6.1-terra`. The first main-model request in each v17 case contained a system message and zero user messages. Reviewed outcomes depend on these inputs.

| Case | Result that a reviewer could verify |
| --- | --- |
| 01, 02, 03 | With only a résumé, Harper identified both projects but followed with a general question about future work. The personalized next step was weak. With the Toronto posting, it connected purchase budgets to ownership of inventory investment with the CEO and gave the right location and pay. With no materials, it asked a question the user could answer without a résumé. |
| 04 | Before the guidance change, six mailbox calls found the interview but missed the capstone. That run also lacked an appointment writer in its adapter. After the change, six calls read both source threads. A private document attributed the accessibility-test design to the candidate and implementation to a teammate. The appointment row held the November 18, 2 p.m. KST interview and its original message and thread IDs. The broad final scan reread metadata and returned an unrelated order receipt, which Harper left out of the record. |
| 07 | Before the change, Harper reviewed the two other employers and three Toss affiliates and emailed three equal choices. After the change, it named the Toss Securities market-data team as the first opening to review and explained the different work at Toss Bank and Toss Payments. It published three recommendation cards. The next run repeated that result after the publishing contract changed. A final run with the comparison-link guidance in its actual system prompt led with Toss Securities and described Toss Bank as a comparison. It sent one simulated email and published both as recommendation cards. Across the last three runs the first choice was consistent, but the card counts were 3, 3 and 2. The one-card criterion remains unmet. The fixed search adapter returns all five candidates on a general resource search, so this measures selection after retrieval. |
| 10 | It selected the engineering lead's post, saved a personal opportunity and requested a candidate email with a simulated receipt. The model also tried to edit the schedule. The frozen adapter has no schedule-write surface, and the email reported that fixture error to the candidate. The live edit outcome is unverified. |
| 16, 17 | The new opening generated one simulated email with a direct link, the three-person research team, launch ownership and base pay of KRW 140–160 million. The email left the comparison with the user's KRW 130 million floor implicit. With the same market as last week there was no candidate message or mutation. Both runs completed. |
| 30 | After reading both offers Harper compared all three options. Yeoul's base clears the move threshold by KRW 5 million and costs two additional office days per week. Ieum's base falls short by KRW 10 million. The answer did not assign cash value to the options. |
| 34, 35, 36 | Case 34 recovered the automatic execution record without a note or ID. After a newer, unrelated search, the configured model linked a new community-product update to the earlier scope with zero repeated market searches. It made eight local reads and attempted two writes outside the read-only fixture. The JSDOM test submitted the résumé selection and left email unchecked. The second model turn in 36 read the document the first application created and wrote a grounded draft, with zero additional Gmail calls. |

To view an archived model run without another provider call, set `RUN_DIRECTORY_NAME` to its directory name and run the command below. It verifies the frozen hashes and expected turns, preserves the annotated `review.md` and writes `review-rendered.md` alongside it.

```sh
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --review-from "$RUN_DIRECTORY_NAME"
```

Raw provider input and output stay in the ignored, owner-only `runs/` directories. Re-running the command produces new evidence without changing the frozen case or comparison criteria.


## v12: complete service scenarios (2026-11-15)

[Implementation and review](reports/2026-11-15-service-review.md) records all 42 attempted turns (40 final responses, two timeouts), input corrections, entry-source and scoped-memory fixes, draft-language iterations, 72 boundary checks, real UI interactions and the limits of unperformed live delivery.

V13 retains V12 unchanged and corrects two fixture/input issues: the entry case said materials were uploaded while its document list was empty, and a broad prohibition on operations discouraged even isolated saves. V13 explicitly allows isolated workspace changes and gives the entry invocation the same one-time continuation guide as production. Use `--dataset v13` for the follow-up; the source facts and reviewer criteria otherwise stay fixed. This declared correction is not evidence of a pure prompt-only improvement.

V14 is an entry-only follow-up. Inspection of V13's actual model input showed that production entry context omitted the public posting's body and URL. V14 supplies that same frozen public source through the corrected entry-context fields. No new policy or expected-answer text enters the model. Use `--dataset v14 --repeat 1 --label entry-source`.

`cases-v12.json`, `gold-v12.json`, and `manifest-v12.json` freeze 16 synthetic development probes from [the service scenarios](../../career-service-scenarios-and-verification-ko.md). They cover exact entry, introduction follow-through, no materials, recommendation value, preparation, continued help, conflicting goals, internal growth, career transition, corrections, changed evidence, confidentiality, parallel scopes, changed counterpart terms, interviews and offers. Existing v2/v11 fictional sources are reused; this is not an independent holdout. Optional history and entry facts flow into the production prompt builder. Gold is never provided to the model.

Run the canonical runner with `--dataset v12 --repeat 1 --label service-review`. The unchanged production model/selector/tools execute with isolated fixture storage and frozen retrieval. Network remains restricted to the model provider. Inspect complete outputs, source inputs, prepared artifacts and effects manually for actual progress, fidelity, scope, user burden and continuity. Tool sequence and phrases are not quality gates. These turns do not prove live delivery, real-market recall, scheduled execution or DB transactions; those require separate boundary and UI checks. Raw traces are owner-only under ignored `runs/`. Failures and fixture limitations remain in the review report. Deployment requires separate authorization.

## v11: practical discovery, comparison and preparation (2026-11-14)

Four requests in `cases-v11.json` reuse v10's explicitly fictional public evidence: discovery beyond funding news, a persistent comparison, a temporary geographical correction with retained travel limits, and application writing without a new resume or sending. New incident facts are explicitly synthetic user evidence. Inputs and reviewer-only semantic gold were frozen before generation; `manifest-v11.json` records their hashes. Run the canonical runner with `--dataset v11 --repeat 1 --label <label>` using unchanged production model defaults.

[2026-11-14 review](reports/2026-11-14-prompt-and-experience-review.md) records the eight baseline/refined turns, missing destination and draft-language fixes, actual generated-view rendering, responsive comparisons, validation failures and their resolution, and the remaining live-system limits.

Review complete provider inputs, tool results, saved artifacts and final replies for useful discovery, truthful tradeoffs, accessible results, correction scope and finished preparation. No tool sequence, keyword score or extra judge defines success. This is a development probe over isolated storage and frozen retrieval, not a real-market benchmark or live external execution. Original inputs, outputs, source hashes and failures remain in owner-only ignored `runs/`. The UI checks use production components in the development preview with isolated transport.

## v10: explicitly fictional shared-evidence simulation (2026-11-14)

`cases-v10.json`, `gold-v10.json`, and `manifest-v10.json` retain v9's company facts and personal contexts and explicitly scope the user's request to a fictional simulation. This revision followed the model correctly noticing `.example` URLs and declining to publish fictional facts as real vacancies. V9 remains unchanged. Gold is outside model input; no preferred company or prescribed tool sequence was added.

Run the same canonical runner with `--dataset v10 --repeat 1`. This uses the production original-model selector, prompts, capability runtime and tool schemas with isolated provider/storage fixtures. It tests the model's judgments and user-facing results, not live market retrieval. No real mail, calendar, application or DB mutation occurs.

Reviewed development runs (raw requests, responses, calls, state and failures remain in owner-only ignored `runs/`):

| Run suffix | Finding |
| --- | --- |
| `16-35-13-917Z-shared-opportunities` | Product defect: the post-onboarding allowlist omitted the registered generic tools. Fixed the actual allowlist and added chat/background exposure checks. |
| `16-40-11-057Z-exposed-resources` | New tools were used. V9's implicit real-vacancy request conflicted with its fictional source metadata; refusing to present those as real was appropriate. |
| `16-42-54-775Z-hypothetical-shared-evidence` | V10 produced personally distinct choices but the fixture ignored `saved` and incorrectly demanded `primaryRef` on patches. The model accurately disclosed the failed save. Fixed fixture storage, not the expected recommendation. |
| `16-45-21-030Z-repaired-fixture-storage` | Both V10 turns published and saved appropriate, distinct opportunities. A considered the operating role without a conventional listing; B chose the remote engineering role. Explanations connected scope, compensation and constraints to the current alternative, distinguished possible P&L progression from a promise, and rejected funding-only/field-travel evidence as sufficient reasons. No actual send was claimed. |

This is a targeted development review, not an independent holdout or proof of superiority. The model did not use `evaluate_resources` in these two successful turns. That API is verified separately below. Full response and tool-history review—not a string/keyword gate—supports the stated judgment.

### Real provider execution contracts

`scripts/probeCareerResourceDecisions.ts` freezes the exact request and manifest before its call, reuses a V10 public note, and invokes the production Decisions builder/transport/parser with predicate, choice and score criteria. It restricts network destinations to the selected Decisions endpoint and disables production DB configuration. This is an execution-contract smoke check, not a new recommendation-quality benchmark. The request, raw response, usage and errors are preserved in ignored owner-only run artifacts.

The `2026-11-13T16-59-38.044Z-resource-decisions-contract` OpenAI run completed all three types using 671 input tokens. Returned values were sponsorship probability `1`, P&L `possible_progression`, operating-scope score `1.99` on the declared 0–2 scale. These values were inspected with the supplied original evidence; they are not runtime acceptance thresholds. Jev's generic adapter was not called in this implementation check.

The isolated live web adapter probe in `runs/provider-contracts/web-search.json` sent `numResults=12`, a publication date and three ATS domain restrictions through the production `runWebSearch`. Exa returned 12 results; 12 public source payloads were captured in memory, with provider-reported cost USD 0.009. No production source was written. This verifies parameter transmission and capture, not completeness, freshness of every result, or job suitability.

### Stateful processing and UI

`src/lib/career/resources/database.test.ts` executes the SQL migrations in PGlite/pgvector and calls the actual resource processor through `scripts/evaluation/resourcePgliteTransport.ts`. Provider responses are isolated fixtures. One failed item is retried, a completed child is reused across parents, earlier partial-set membership/projections stay immutable, and the three actual provider calls retain parent/child usage attribution. The older operation reservation transport is a fixture; source access, sets, leases, cache processing and writes use the implementation under review.

The development-only `/dev/career-resources` page reuses production detail/list/collection components with a browser-local transport that intercepts API calls. Actual browser checks covered 500-item select-all, exclusions across pages and navigation, stale revisions, retry identity, empty/deleted sources, archive/restore, manual order, mobile width, keyboard save and original-source links. It is separate from the SQL checks and does not establish a deployed full-stack or live OAuth/send result.

## v9: shared evidence and personally useful opportunities (2026-11-14)

`cases-v9.json`, `gold-v9.json`, and `manifest-v9.json` freeze two independent synthetic candidate contexts over the same four public company notes before generation. The evaluation unit is the complete original-model turn: discovery/read calls, optional explicit Decisions calculations, published opportunity bodies, and final user explanation. The source collection includes a promising operating role without a conventional job listing, a quiet profitable company with an engineering role, a fresh funding announcement whose field role conflicts with both candidates, and funding without hiring. Gold remains outside model input.

Canonical runner: `NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --dataset v9 --repeat 1 --label shared-opportunities`. Production model defaults, selector, runtime, tool schemas, resource projections and Decisions adapter are imported directly. `scripts/evaluation/careerResourceFixture.ts` supplies frozen public observations and isolated memory persistence; retrieval deliberately returns the entire small candidate pool and does not encode a preferred company. No live DB, mail, calendar or browser effect is allowed. Original requests, outputs, source hashes, usage and failed attempts remain in ignored owner-only `runs/`.

Read every provider input, tool result, published explanation and final reply against the frozen semantic criteria. Report whether useful progress is grounded in this candidate's goals, verified work/conditions, material uncertainty and an actual access route. Tool counts/cost are diagnostics; there is no qualitative keyword gate or extra judging model. Both contexts must preserve personal privacy and avoid false send/application claims. This targeted probe does not measure real search recall, user response, queue latency or superiority over a generic agent. SQL sharing/ownership, partial processing and retention have separate executable database checks. Any observed fixture limitation or product failure must remain visible, and changed input requires a new frozen version.

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

## v6: internal discovery scope (2026-11-04)

A single synthetic development probe asks for hidden internal inventory and proactive profile sharing. `cases-v6.json`, `gold-v6.json`, and `manifest-v6.json` are frozen before generation. It reuses the v1 empty-inventory candidate, with no public source pages. Review full model inputs, tool calls and reply: company-side selection must remain the owner of new internal recommendations, with no inventory browsing or unsolicited sharing. Existing recommendations and user-chosen public Roles remain supported. No response script, semantic regex grader or additional judge model is used. This is not a representative reliability benchmark.

Canonical runner: `NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --dataset v6 --repeat 1 --label internal-discovery-scope`. Current default model and selector, provider-only network and owner-only ignored artifacts follow the contract above. Companion checks reuse unchanged v1 `empty_inventory`, internal-introduction v6 `job_initial_then_introduce,company_intro_response`, and follow-preparation v2 `new_fit_and_hiring`. No real company or candidate delivery.

[Internal discovery scope report](reports/2026-11-04-internal-discovery-scope.md) records the five targeted observations, local checks, actual-input verification, concurrent-work fixture limitation and unimplemented DB publication boundary.

## v7: selected internal proposals and Harper recommendation ownership (2026-11-06)

`cases-v7.json`, `gold-v7.json`, and `manifest-v7.json` freeze two synthetic development probes: asking for all available connections with no selection, and introducing an already selected, unpublished Role. The unit is the complete original Career turn, including provider input, tools, final reply and captured effects. The fixture supplies candidate-safe selected Role facts and records publication; it cannot create selections, contact companies or write to production. These are targeted development probes, not a blind holdout. Review the full output manually for recommendation ownership, useful company/work/fit detail, confidentiality and reuse of existing selections. Tool counts are diagnostics, not a quality grade. No extra judging model or scripted reply is used.

Canonical runner: `NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --dataset v7 --repeat 1 --label selected-internal-proposals`. Product model/selector defaults, provider-only network, source snapshots and ignored owner-only artifacts follow the contract above. The final targeted check also reuses unchanged v6 `hidden_internal_inventory`. SQL publication/ownership and onboarding execution are checked separately by `src/lib/career/internalSelections.test.ts` and Worker tests; the fixture is not evidence of real delivery or DB authorization.

[Implementation and verification report](reports/2026-11-06-selected-internal-proposals.md) records all nine trials, fixture failures and corrections, source cleanup, exact observed replies, local boundary checks and remaining check failures. No deployment or production migration was performed.

[End-to-end follow-up review](reports/2026-11-06-talent-first-end-to-end-review.md) checks the real daily model separately, connects the existing source/publication/receipt SQL, and includes the previously omitted production INSERT trigger. It reproduces a conditional `both` publication conflict and inconsistent ownership/confidentiality wording. These remain open findings; the earlier targeted checks are not an overall pass.

## v8: summary depth and selective source reads (2026-11-06)

Two synthetic frozen cases (`cases-v8.json`, `gold-v8.json`, `manifest-v8.json`) check a complete recommendation turn with sufficient summaries and with a material missing degree requirement. The existing runner uses actual default Career models, prompts, schemas and projections; the fixture exposes stored evaluations and executes the real Role reader against isolated rows. No production data or external effects. Review actual provider requests, exact calls and full final replies manually for useful recommendations, fact accuracy, unnecessary rereads and preserved ability to resolve gaps. Tool counts and elapsed time are diagnostics, not hard quality thresholds. These targeted development cases are not a blind holdout or a latency benchmark. The shared open_url batch executor is checked separately with cached-page fixtures, including per-page failure.

Canonical run: `NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --dataset v8 --repeat 1 --label summary-depth`. Raw requests/results remain in ignored owner-only `runs/`. No extra judge model.

[Local implementation and verification](reports/2026-11-06-role-summary-reads.md) records all six probes, intermediate unnecessary reads, final behavior and remaining limits.

## Reusing private application evidence in a new conversation

v15 follows a synthetic FDE applicant across two conversations one week apart. v16 keeps the same first application and changes only the follow-up role and request. A saved private document is discoverable by its metadata. Its contents must be read. The second conversation receives the same authorized mailbox, an ordinary profile and the actual document rows produced by the first. Previous chat messages and reviewer expectations are excluded. Only document persistence crosses this fixture boundary. See the [observations and reproduction commands](reports/2026-11-16-private-application-evidence.md).

### ML Engineer preparing a first FDE application

Use `scripts/evaluation/runProductionFdeReview.mjs <branch> <run-label>` with the same production QA credentials and team inbox as the scenario runner. Each new label creates an isolated candidate. Reusing it opens the saved conversation. The candidate has search-ranking and inference deployment experience, a short résumé, no FDE title and no Gmail grant.

| Branch | What the user does |
| --- | --- |
| `cognition` | Opens the saved Cognition Korea role and clicks Apply with Harper. |
| `choices` | Uses the wording sent by the revised button in production chat. |
| `wonderful` | Asks to see how Harper would introduce them to Wonderful. |
| `contact` | Asks for a draft after supplying the team's contact address. |

Inspect the saved screen for the offered choices, editable content and actual recipient. For the exact Wonderful introduction request with external effects intercepted, use [the frozen ML cases](cases-v25.json). For the revised button, use [the button cases](cases-v26.json). [Run evidence](reports/2026-11-16-fde-application.md)
