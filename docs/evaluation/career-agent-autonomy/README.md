# Career agent autonomy

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
