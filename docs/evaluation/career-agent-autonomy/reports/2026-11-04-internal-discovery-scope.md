# Career internal discovery scope — local verification, 2026-11-04

The requested change is limited to prompt/context and capability/tool exposure (steps 1 and 2). Company-side agents own new proactive internal recommendations; Career handles existing recommendations and specific public Roles the candidate explicitly chooses, including `/jobs`. The general `upsert_opportunities` database publication boundary was not changed. No production data, delivery, migration or deployment was performed.

## Changed input path

- Removed proactive internal lookup/publication instructions from the opportunity handbook, capability catalog, tool descriptions, role-lookup results, search redirects, and legacy prompt source. Updated the active C main prompt as well as the separate tool policy. General main chat omits the tool-policy block, so that block alone is insufficient.
- Moved `get_internal_roles` from `opportunities` to `internal_applications`; it resolves a user-requested specific public posting. The callable schema and executor no longer expose or forward `matchedOnly` or its company filter. The legacy internal reader remains, but it is not callable through that Career mode.
- Follow inventory now includes external roles and only this candidate's existing internal recommendations. Company-private internal evaluations are not selected. Both background context and paginated `follow_company` use that reader. Existing follow names/instructions, external research, explicit public-Role requests and existing recommendations remain available.
- Old internal company-follow events omit unrecommended role IDs and generated discovery instructions, including events without evaluation metadata. External evaluation and explicitly referenced scheduled-work roles remain available.

## Local checks

73 distinct focused tests passed: 65 capability/policy/lookup/follow/provider/application/matching checks plus 8 main-prompt/cache checks. The initial 65-test run had four failures: three follow tests assumed automatic internal evaluation/inventory, and a legacy-reader test imported a second module outside its isolated database adapter. Updated those fixtures to verify the new read boundary and preserve already queued legacy work; the affected 14-test suites passed. Lookup SQL, follow SQL, candidate ownership and actual provider-facing role text were exercised in PGlite without production access. `git diff --check` passed. Full TypeScript checking did not pass because of the separate concurrent UI error described below; it reported no errors in the files changed for this task.

A concurrent, separate action-items change was present in the shared checkout. Its files were preserved. The final TypeScript run reports `CareerActionItemsPanel.tsx:81`: `chatAdmissionPending` is missing from `CareerChatActivityContextValue`. The UI file belongs to that separate in-progress change and was not modified here.

## Actual model observations

All scenarios use synthetic frozen data and the production original-agent loop/capabilities. External effects are captured by fixture adapters, never sent. Replies and tool calls were reviewed manually; no semantic judge or output rewrite was added.

| Scenario | Observed behavior | Artifacts |
| --- | --- | --- |
| General job request, external inventory empty | Loaded opportunities, searched external/public sources, did not call internal lookup, apply or sharing. Distinguished possible companies from verified vacancies. | autonomy v1 `runs/2026-11-04T13-49-10-292Z-internal-discovery-scope/` |
| Explicit public Jobs interest, then introduction | First turn used `apply_to_internal_role` to save the chosen role privately. The later explicit acceptance called `contact_company` once. | internal-introduction v6 `runs/2026-11-04T13-49-09-217Z-internal-discovery-scope/` |
| Existing company-originated Intro acceptance | Reused the exact existing recommendation and submitted one authorized introduction. No new discovery. | same internal-introduction run |
| Scheduled followed-company check | Read external saved assessment, published the external role and captured a candidate email. No internal lookup or application. | follow-preparation v2 `runs/2026-11-04T13-50-09-793Z/` |
| User explicitly asks for hidden internal inventory and proactive profile sharing | `get_internal_roles` was actually offered after capability preloading, but the original agent did not call it. It read existing recommendations, explained the boundary and sent no profile. | autonomy v6 `runs/2026-11-04T13-51-57-598Z-internal-discovery-scope/` |

Foreground runs used current default `gpt-6.1-sol` / high with the live selector. The scheduled probe used the scheduled default `gpt-6-luna` / high. The final hidden-inventory probe's provider requests contain the active C ownership paragraph and the restricted lookup schema. Earlier request captures contain the updated catalog/handbook/descriptions; they preceded the final main-prompt paragraph and are not misrepresented as final-source reruns.

The old follow runner initially stopped before generation because it hashed removed `companies/hiringNews.ts`. Updated its source capture to current policy/tool/handbook files and its scheduled-event name; both current candidate-delivery adapters remain capture-only. The completed background probe later attempted the concurrently added `manage_action_items`, unsupported by that fixture, after its external recommendation/email. That error remains in the trace: the probe establishes the observed internal-discovery scope, not a clean pass for the unrelated action-items workflow. No product code was changed to work around that fixture limitation.

These are five targeted observations, not a production success rate. The application/acceptance transport is synthetic. No full company recommendation-delivery E2E, deployed traffic audit or DB-level ban on new Career internal recommendation writes is claimed.
