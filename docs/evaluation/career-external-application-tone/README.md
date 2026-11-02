# Career external application tone

## Objective and unit

Compare two user intents using the current Career conversation prompt and the exact resume/application handbooks: preparing an application to a chosen stretch role, and explicitly requesting an honest fit assessment. One unit is one user turn, its actual tool loop, its proposed form, and the final assistant response. This is a narrow prompt check, not an application/browser E2E or a model benchmark.

## Frozen inputs and gold

`cases-v1.json`, `gold-v1.json`, and `manifest-v1.json` are the frozen v1 inputs, human-review criteria, and provenance contract. They were authored before generation. Changes to inputs or labels require a new version. All names, documents, companies, and URLs are synthetic; no account, internal Role, database row, or external application is created. A short profile deliberately omits details that the full resume contains. The job permits any of three experience areas, so reviewers must preserve that alternative structure.

## Input and execution contract

Canonical runner: [scripts/evalCareerExternalApplicationTone.ts](../../../scripts/evalCareerExternalApplicationTone.ts).

Run from `harper_beta`:

```sh
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerExternalApplicationTone.ts
```

It calls the real `runCareerChatAssistant`, current `buildCareerConversationPromptPlan`, and the current `resume` and `application` handbook bodies. It exposes the current `read_document` and `suggest_form` schemas. These executors operate only in memory: document reading returns a dedicated fact projection, and form creation uses the actual form schema and model formatter. The form represents a proposed edit/question; no document or application is saved externally. Gold criteria never enter the model prompt.

The canonical executor also passes each result through the production `withTalentToolAssistantInstruction` wrapper. The first four runs omitted that wrapper and therefore did not include the current common instruction to keep the reply proportional to the request and evidence. Their observations are retained, but they are not exact reproductions of the current production input contract. The correction is recorded by a new runner hash; frozen cases and gold are unchanged.

The current Career Haiku model constant and production runtime sampling/reasoning defaults are used. The runner records the actual provider request settings, prompt hashes, source revision and dirty-diff hash. Each case runs once, sequentially, with a 180-second wall-clock abort. There is no quality retry or response rewriting. Network access is allowlisted to the configured Anthropic messages endpoint; database and all external action requests are blocked. The runner does not attach a user/account usage context.

## Metrics and release gate

A reviewer reads each entire response, tool call, form, and the provider-visible tool-result text. Record pass/fail with reasons for intent handling, evidence use, respectful practical tone, and action claims. Do not judge qualitative behavior with string matching or a separate grading model. The narrow check passes only if both cases satisfy their gold criteria and have no unsupported action claims. Record tool sequence, elapsed time, actual model and usage as diagnostic facts, not quality scores. A two-case pass is not evidence of general reliability or readiness to deploy.

## Privacy and artifacts

Raw provider bodies/responses and run results live only under ignored `runs/`, with owner-only files and directories. Request headers and credentials are never saved. A run manifest hashes frozen inputs/gold, prompts and runtime sources. A public review may paraphrase observations and cite selected synthetic quotations; raw model outputs remain private. The root evaluation README and old task documents were already deleted in this worktree and are not restored by this task.

## Limitations

Two synthetic single-turn samples do not test live database state, Decisions selection, handbook leases, multi-turn recovery, browser input, PDFs, submission, email, or multilingual/generalized tone. Full resume facts are deterministic fixtures; only the Career LLM is live. Current prompt versions may change across later runs, which must be kept separately.

## 2026-10-30 initial observation

Run `2026-10-29T17-59-45-552Z` used `claude-haiku-5-5`, medium effort, the runtime's 12,288-token limit and no provider temperature parameter. Two turns made five provider requests in total; no external-action or database requests occurred. The preparation turn took 23.1 seconds and the assessment turn took 16.4 seconds.

Manual review: both turns read the full resume first. The application request produced a proposed form without reopening the user's decision; the assessment request only read the document and gave an assessment. Neither claimed external submission or a saved revised document. Both recognized the three required experience alternatives. This narrow intent distinction passed.

The overall gold gate did **not** pass. The preparation response suggested making academic work appear to be industrial experience, and the assessment response expressed uncertainty over whether an explicitly identified academic project was academic or industrial work. These are evidence-use errors, despite the full source being present in the captured provider tool results. The preparation form also grouped role responsibilities with preferred qualifications imprecisely and repeated a cautious qualification list. No response rewriting, additional run, or production change was made by this evaluation.

The preparation turn also called `suggest_form(read, formId=0)` in the same completion as form creation. The in-memory executor supported creation only and returned its unsupported-action error; production would reject the nonpositive ID at its input boundary. This limits fidelity of the final follow-up for that turn. The problematic academic-to-industry suggestion was already present in the generated form before that error. The assessment case had no tool error. Exact responses, calls, provider-visible projections and the manual review remain in the ignored run folder.

## Same-input follow-up

Run `2026-10-29T18-12-36-736Z` preserves the same inputs, gold, runner and model configuration after the source prompt was revised to preserve where/in what capacity work occurred and ground assessment in read sources. Its prompt fingerprint differs from the first run. It made five provider requests; preparation took 22.7 seconds and assessment 15.6 seconds. Both read the resume first; only preparation created a form. There were no tool failures or database/external-action requests.

The earlier academic-to-industrial suggestion and false ambiguity about the explicitly academic project were absent. However, the **overall gold gate remains failed**: preparation still treated industrial model training as a preferred requirement even though the posting did not specify it, and repeated an unnecessary qualification disclaimer. The assessment correctly stated that one of the three experience areas suffices, but treated industrial model training as an added criterion for the training area and ended by asking whether the already-described academic fine-tuning had occurred. These are remaining source-interpretation/context-use issues; the broader intent separation still worked. There was no output rewriting or third run. Two samples do not establish a causal or general quality improvement.

## Subsequent source revisions and final input-contract check

Runs `2026-10-29T18-14-25-603Z` and `2026-10-29T18-16-04-734Z` kept the frozen cases and gold while simplifying the application guidance. The final source paragraph assigns application preparation to the user's chosen goal and reserves fit assessment for an explicit request. The first of these runs still added an industrial-experience criterion; the latter respected the posted alternatives in preparation but retained unnecessary source-check commentary. Neither established an overall quality pass. These runs also lacked the common tool-result wrapper described above.

Run `2026-10-29T18-17-48-300Z` then used the same final source paragraph with the corrected production tool-result wrapper. The provider-visible requests include that wrapper's concise outcome/next-step instruction. Both cases first read the full resume; preparation created a form in 20.7 seconds and assessment performed only the read in 12.6 seconds. The preparation response focused on relevant experience, proposed edits and questions, without reopening the choice to apply or accusing the candidate of inventing experience. The assistant did not claim to save or submit anything.

The **overall gold gate still does not pass**. The assessment described the academic research scale as small without evidence, and the proposed form included entry IDs that the source read did not supply. Some source-check commentary and speculative qualification interpretation remain. This is evidence of the narrower intent/tone behavior in these samples, not full resume-authoring or assessment reliability. No production output filter, rewriting loop, database operation or external application was added.
