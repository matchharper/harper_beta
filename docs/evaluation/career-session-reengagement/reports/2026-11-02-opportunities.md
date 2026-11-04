# Re-engagement recommendation context — local implementation

2026-11-02. Local changes only; no deploy, production recommendation write or candidate/company message delivery.

## Implemented behavior

Both session-return entry points identify the invocation with the existing `session_reengagement` message provenance. After onboarding, the shared `chatTurn` reads a compact opportunity context and supplies the `opportunities` capability and `opportunity_search` handbook on the first provider call. The selector does not need to rediscover this known capability. Ordinary tools, ownership checks and list/evaluation contracts remain in place.

The initial page contains ten highest-ranked, not-previously-recommended, currently eligible external roles from the most recently searched active matching. It uses the latest assessment per role across that matching's runs. The context includes frozen matching criteria, role facts, assessment references/dates, list revision, result counts/cursor, latest attempt, last completed search and active runs. Publication count and further search remain model decisions. An unsuccessful last attempt does not discard earlier evaluation results.

Without a searched active matching, the historical fit cache supplies prior candidates. These are explicitly historical and lack current publication evaluation references. The existing search tool can evaluate chosen exact roles; no background full search or migration was added. Missing source reads remain unknown, not zero results.

The source lifecycle purpose now combines a return greeting with useful Career work. Search and publication contracts reuse the existing opportunity handbook and tool descriptions. No scripted greeting, qualitative runtime filter or judge model was added.

## Verification

- Focused source/runtime/SQL tests: 12 passed, 6 unrelated cases excluded.
- Existing external evaluation reader tests: 11 passed (HTTP + PGlite coverage).
- TypeScript `tsc --noEmit --incremental false`: passed.
- ESLint on modified executable paths: passed.
- Existing-account SELECT-only read through the new production loader: ten candidates returned, 19,232 characters. Private context is in ignored owner-only `runs/20261102-real-read-only/context.txt`; it was not sent to the live evaluation provider.
- Actual provider evaluation: frozen synthetic `cases-v4.json` and `gold-v4.json`; actual prompt builder, chatTurn assembly, capability runtime, tool schemas/handbook and provider loop. Search/read evidence is synthetic. The actual publication tool uses an in-memory RPC that checks role/evaluation identity and list revision. No actual recommendation was saved.

| Case | Observed tool behavior | Synthetic publication |
| --- | --- | --- |
| Ready candidates | Read matching/details, then publish supplied evaluations | 5 roles |
| Old exhausted results | Search external/internal, publish completed external results | 2 roles |
| Explicit pause | No tools; no-message outcome | 0 |
| Historical cache | Create matching, evaluate selected role IDs, publish results | 2 roles |

Actual inputs/responses, intermediate visible messages, tool arguments/results and stored fixture effects are in ignored `runs/20261102-opportunities-v4/outputs.json`; `manifest.json` contains source/data hashes, and `review.json` records manual review. Earlier v2/v3 fixture gaps and outputs are preserved. The gaps were unsupported reads/internal search and a recommendation read that did not reflect fixture writes; v4 supplies the complete synthetic evidence and mutable fixture state.

## Material limitations observed

This is functional confirmation, not a clean wording/first-tool-call quality pass.

- The current route's Haiku configuration rejects an assistant-ended conversation on the first call (HTTP 400, assistant prefill unsupported). The existing fallback uses Sol/high, then subsequent tool-loop calls return to Haiku. The observed model sequence is in the raw trace. Model configuration and provider fallback behavior were not changed by this implementation.
- In the ready-candidate case, a publication call omitted list revision and succeeded after correction. Its final response also contradicted the supplied remote-work evidence. This wording fails the qualitative gate.
- In the historical-cache case, the model first omitted required evaluation references. The execution boundary rejected it, after which the model evaluated the exact roles and published successfully. Intermediate prose exposed matching/evaluation mechanics, so wording still needs improvement.
- The new-search case naturally welcomed the returning user and published the verified fixture results. The explicit-pause case respected the pause.
- Production search execution, production writes, browser rendering and delivery were not run. Stored historical cache reads are covered by the SQL fixture; the real account read exercised the modern matching branch.

No outputs were rewritten or screened to conceal these limitations.
