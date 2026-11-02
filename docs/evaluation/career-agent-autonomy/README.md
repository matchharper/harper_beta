# Career agent autonomy

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
