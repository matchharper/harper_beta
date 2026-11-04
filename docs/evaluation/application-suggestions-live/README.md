# Actual-data resume suggestion review

This task evaluates one initial Apply with Harper suggestion batch, without application inspection, browser automation, session creation, resume saving or submission. It covers useful evidence additions, preservation of adequate writing, consequential questions and concise reasons. It does not evaluate the subsequent editing conversation or hiring outcomes.

## Frozen inputs and gold

`live-account-v1` contains one explicitly authorized existing talent account, two existing generated resumes and six different active external roles, captured read-only on 2026-10-29. The earlier resume is already substantive; the newer one contains additional research evidence. Neither is an uploaded original. Exact records, identifiers, provenance and hashes are in ignored `private/2026-10-29-daniel-live-v1/`. `gold-live-account-v1.json` holds de-identified, pre-run editorial expectations and the manual rubric. Prior deleted registry files are not restored; the historical application-suggestions contract was read from Git HEAD.

This is a diagnostic challenge, not a random sample or an independent benchmark. The same person's previous generated documents may contain prior model wording. Source claims must be checked against confirmed profile/context facts; a generated document alone is not independent confirmation. No minimum or maximum suggestion count is a quality target.

## Canonical path

- Page: `/ops/debugging/application-suggestions`.
- Canonical runner: `scripts/evalApplicationSuggestionsLive.ts`.
- Shared input: `src/lib/career/simulation/suggestionInput.ts`, also used by the real Apply preparation path.
- Shared model execution: `writeApplicationSuggestions` and `buildApplicationSuggestionsRequest` from the actual `suggestionWriter.ts`.
- Ops service prepares stored sources and invokes that same writer. The runner uses the same service, without a copied prompt or evaluator-only rewrite.

Prepare all six live inputs once with `--prepare --capture <frozen-inputs.json>`. Use `--prepared <prepared-inputs-v1.json> --case ASL01 --phase iteration-1` to run a frozen real input with current runtime code. Each changed prompt/model creates a new run; input changes require a new input version. Existing run files and gold are never overwritten to improve results.

## Model and execution contract

The default matches Apply mode: `claude-haiku-5-5`, using the existing provider and model adapter. `--model` uses an existing application model ID. Actual outgoing requests and responses, including adapter-applied sampling/reasoning and any fallback/retry, are recorded by request-local `withLlmProviderTrace`. Requested temperature is not claimed as effective when the provider adapter removes it. The existing writer tool budget is retained. Each call has a 180-second deadline.

Available tools are the real read-only candidate context and document readers plus the finish tool. There is no added reviewer LLM, semantic validator, hidden rewrite, quota or scenario branch. Initial context contains the whole profile projection, existing Brief/Memory projection, selected resume and saved role facts. Public company research and application-page inspection are outside this isolated unit.

## Review and reporting

Manual 100-point rubric: factual precision 25, important evidence use 25, edit selection/completeness 20, question selection 15, titles/reasons 15. Review all output against original sources, not keywords or counts. Record grounded omissions, redundant edits, unnecessary/repeated questions, unsupported claims, misleading reasons and source gaps separately. Suggested release gate: no invented substantive claim or private disclosure, no important known evidence repeatedly omitted, and appropriate intervention on both source adequacy slices. Structural success is not a quality pass. Scores are assistant judgments, not calibrated probabilities or independent human ratings.

At least six different-role runs are reviewed sequentially, with general production-prompt improvements between them when evidence warrants. Final unchanged-prompt checks separate the current state from intermediate failures. Roles differ between iterations, so chronological scores alone cannot establish a causal improvement rate.

## Privacy and reproducibility

The human explicitly authorized real data for `daniel@matchharper.com` to be processed by the existing model for this task. Provider requests use the existing project API configuration; no provider retention/training setting is changed or independently verified. The default endpoint is Anthropic's existing API compatibility endpoint. Exact endpoints/models are recorded per call.

The CLI permits production database GET/HEAD and the existing read-only context search RPC only. It blocks DB writes, including normal usage-log inserts, and all non-provider external actions. No candidate facts, documents, recommendations, sessions or employer messages are changed. Ops uses internal authentication and only the same read operations/model execution; normal cost telemetry may still use the existing logging path.

Raw input/output, full provider bodies, review notes with identifying quotations and exact runtime source snapshots stay in ignored `private/` or `runs/`, directories 0700/files 0600. No authorization headers or secrets are captured. Every run stores input/gold/source/prompt hashes, repository revision, code snapshots, selected model, timing, tool evidence and failure details. JSON exports open in the Ops viewer; raw personal data is never placed in public reports or committed. Local artifacts are not recoverable from a fresh clone.

## 2026-10-29 recorded outcome

The final retained prompt/model scored 92.17/100 across the six fixed cases, but important coverage passed only 4/6. Specific requested experiment reasoning/outcomes and a required authentic work sample were still missed. This is not a complete quality pass. Existing substantial resume evidence was preserved, and the two enriched documents received zero edits and two questions each.

Six sequential different-role iterations were followed by six fixed-prompt checks, two model comparisons, two rejected prompt experiments and one actual Ops UI run: 17 total batches. The last experimental change was reverted to the exact final-fixed prompt and shared policy. Model defaults remain unchanged. Full judgments, original before/after text, source snapshots and provider requests/responses are in the ignored runs. `manifest-live-account-v1.json` records reproducibility hashes.

Open `private/review-report.html` for the complete Korean report; import `private/all-runs.json` into Ops for all 17 results, or `private/final-runs.json` for the six final cases. The UI run used identical input and prompt to frozen ASL01, and its downloaded JSON was received on disk. The final bundle was not reimported through the browser after its login session changed; preservation was checked through the import/export code path.

Targeted tests: 23 passed. New-file lint passed. Final full TypeScript check found one out-of-scope TS2352 in `OfficialJobMention.test.tsx`; the earlier full check had passed. No production deployment, migration, document save or submission was performed.

Prompt design references directly consulted: [Anthropic context engineering](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents) (2025-09-29), [Google prompt design](https://ai.google.dev/gemini-api/docs/prompting-strategies) (last updated 2026-10-13 when read), and [Harvard resume guidance](https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/) (current page, publication date unverified). These support clearer task/context boundaries and factual relevant evidence; they do not establish this prompt's quality without evaluation.
