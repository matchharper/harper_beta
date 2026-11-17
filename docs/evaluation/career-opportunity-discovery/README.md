# Live Career opportunity discovery

2026-11-15. User asks whether Harper discovers the most personally worthwhile companies, regardless of database search, model knowledge or web search. This evaluation tests actual discovery rather than choosing among supplied fictional employers.

## Contract

- Unit: a complete authenticated `/api/talent/chat` turn through the existing local Next app, production Career prompt/context/capability/tool runtime, live public web providers, and marked local Supabase persistence. Inspect returned conversation, evidence, published opportunities and rendered destination.
- Inputs: `cases-v1.json`; synthetic people with no preferred employer list. The first four cases are development comparisons; the last two are transfer probes frozen before baseline. `gold-v1.json` is reviewer-only and never supplied to the product. No expected tool sequence, fixed number of recommendations or required company names.
- Freeze the input/gold SHA-256 manifest before any generation. Preserve every attempted run, including failures. Reuse identical requests on fresh accounts for comparisons. Public search is live, so source availability may change; save exact provider requests/responses and interpret comparisons accordingly.
- Production model defaults; no model, reasoning or output-budget override. Two simultaneous user turns at most. HTTP observation deadline 850 seconds, matching the app's long-running turn contract with observation margin. No hidden quality retries or judging model.
- Quality is manually reviewed from full outputs: personal value relative to staying/current alternatives; breadth and discrimination of candidate hypotheses; actual work and access feasibility; critical constraints and unknowns; support of material claims; specificity of recommendation and useful next action. A famous employer or a successful tool call is not a pass. Compare opposing goals with similar experience. Additional independent source checks may reveal a missed better alternative; log them separately from product behavior.
- Privacy: synthetic test accounts in localhost Supabase only, verified through the `local_e2e.environment` marker. No production user rows, email, company contacts, applications or Calendar connections. Live model/search providers receive only synthetic career context and public queries. Existing shared public cache in the local DB may be reused; each run captures counts and source versions rather than claiming a cold-cache comparison.
- Raw model inputs/outputs, source bodies, tokens and account sessions stay in owner-only ignored `runs/`; no credentials in console or public reports. The app observer reuses `scripts/localE2e/applicationMemoryTrace.mjs`, which records provider bodies without headers and does not change requests.
- Runner: `node scripts/localE2e/opportunityDiscovery.mjs app` starts a separately logged local app on port 3025 in the same checkout; `node scripts/localE2e/opportunityDiscovery.mjs run <label> <comma-separated-case-ids>` creates fresh local accounts and sends the exact frozen requests. `inspect <run-directory>` refreshes local durable evidence. Do not restart other local apps.
- Limits: local directory is sparse and does not represent the production market inventory; this deliberately exercises discovery beyond indexed jobs. A small live sample cannot establish global-best recommendations, response/interview/offer improvement, production throughput or deployed behavior. A code change remains local unless separately released. DB permission does not imply web deployment.

## Release judgment

Retain a product change only with an identified source defect and meaningful improvement on the same development requests without undermining transfer cases. No fixed answer shape, employer list or workflow may be copied into production instructions. Record unresolved weaknesses and actual market-source uncertainty. The final report must distinguish implementation, observed behavior, manual judgment and unverified outcomes.

## 2026-11-15 result

[Discovery review](reports/2026-11-15-discovery-review.md) records four before/after comparisons, two pre-frozen transfer probes, one actual browser follow-up, source checks, UI/ownership verification and limitations. Keep the revised goal-based discovery guide and explicit tool contracts. Do not claim globally optimal recommendations, faster overall responses or deployed behavior.

The separate browser follow-up is frozen in `followup-v1.json` / `followup-manifest-v1.json`; it is not a replacement for a failed first-turn case. Raw runs and sessions are ignored.

## Local schema prerequisite

The [November 16 review](../career-conversation-quality/reports/2026-11-16-conversation-quality-review.md) adds [complete real-market reference conversations](ideal-dialogues-v3.md). Run `HARPER_DISCOVERY_DATASET=v3 node scripts/localE2e/opportunityDiscovery.mjs run comparison` against the marked local app. Real prior replies carry into the next user turn. The ownership comparison was written after independently reading the original sources of two leads discovered in v2, then frozen before v3. The review distinguishes that comparison from blind discovery.

The runner checks the local environment marker and the existing Role retrieval helpers before generation. The first baseline exposed local drift: three helper functions were absent and the user-submitted Role guard predated the own-agent import allowance. The report identifies the existing migrations used to restore only the local definitions and the before/after receipt. Inspect local state before replaying any migration; do not run index-building migrations or mutate production merely to make an evaluation pass. Production read-only comparison found these definitions already present there.

## Compare what a fixed budget bought

Run `node scripts/localE2e/compareOpportunityDiscovery.mjs BEFORE_RUN AFTER_RUN REVIEW.json` on two discovery runs of the same case. Each run needs its own account. The report reads the run's model and provider receipts, scoring operations and reused results. An older capture without model costs, a failed operation, an unpriced retry or an unpriced receipt leaves total cost and cost per useful result unknown. Run the existing `inspect` command to refresh a capture while its evaluation account still exists.

Before reading the outputs, a team member lists independently identified worthwhile opportunities as stable keys in `referenceKeys` and specifies `budgetUsd`. Then review what each user actually received. Under `before` and `after`, list each useful outcome once, using the same key for the same opportunity. Give a reason and cite an owned message or visible opportunity. For a person who says how Harper helped, quote their words in `decisions`. A changed application stage alone cannot answer that question.

For each reference absent from the useful results, classify it in `misses` as not found, found, scored or insufficient trace. Cite the search or scoring operation for an inspected candidate. Record why it was missed from the evaluated evidence. Costs from live runs remain descriptive unless both fit the same budget and the reviewer can document the same available market. A spend difference by itself does not establish savings from reuse. Use the same user question and source inventory with and without earlier research, and compare the useful results and reuse receipts.

```json
{
  "caseId": "example-case",
  "budgetUsd": 1,
  "referenceKeys": ["company-a", "company-b"],
  "sameMarketEvidence": "The dated source inventory used for both accounts",
  "before": {
    "useful": [{"key":"company-a","evidence":"opportunity:<id>","reason":"The team owns the work the candidate wants."}],
    "misses": {"company-b":{"stage":"scored","evidence":"operation:<id>","reason":"Its evaluation used an obsolete location."}},
    "decisions": [{"evidence":"message:<id>","quote":"The candidate's exact words"}]
  },
  "after": {
    "useful": [{"key":"company-b","evidence":"opportunity:<id>","reason":"The current source confirms the candidate can work there."}],
    "misses": {"company-a":{"stage":"insufficient_trace","reason":"The trace does not show whether this company was inspected."}}
  }
}
```
