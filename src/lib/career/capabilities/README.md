# Career capabilities

Post-onboarding text only. `server.ts` is shared by the web route and server text runner; debug uses the same lease reader and resolver without writes.

## Modes

Progressive loading is the default, including when `CAREER_CHAT_CAPABILITY_MODE` is unset or unknown. Only `CAREER_CHAT_CAPABILITY_MODE=full` offers the full existing eligible selection. The value is captured once per source user turn. Voice, onboarding and explicit tool-free calls retain their existing paths. Nothing here deploys or migrates a database.

- Default domain tools: context/settings (4) + `research_company`.
- Deferred capabilities: profile editing (2), opportunities (3 subsequent completed turns), company contact (2), web research (1), documents (2), resume authoring (3), coaching (3), activity history (1), connected inbox (1).
- Active Apply with Harper always provides its four eligible application tools: `manage_simulation_session`, `manage_application_suggestions`, `ready_for_role`, and `apply_for_role`. Shared capabilities use the ordinary loader, preloads and leases; entering Apply does not load them all.
- Profile editing supports scoped row reads and add/update/delete operations; document authoring saves Markdown with PDF preview/download. Neither returns the written body. Specific external posting imports reuse the history import. Apply with Harper includes public web research and general document authoring within its existing capability boundary.
- The entire eligible catalog remains visible regardless of loading. Company research remains in the catalog but is always callable when eligible; a fully core capability is excluded from loader IDs.
- Always preserve existing schema/policy text. `conversationPlan.ts` removes only the deferred recommendation guidance; the full assembled raw guidance remains byte-for-byte equal to its original.

## Execution

1. Resolve the existing channel/onboarding/caller/account allowlist first.
2. Insert server-owned `careerCapabilityTurn` into the original user row with the message.
3. Restore only the contiguous valid completed progressive source prefix, at most three older rows; a 30-minute adjacent gap or an incomplete/full/invalid record breaks older leases.
4. Snapshot offered tools per completion. A loader affects the next completion, never another call in the same response. Hard authorization failures can still revoke access immediately.
5. Keep domain budget (8 when resume is eligible, otherwise 4), with two separate loader attempts. No loader UI, domain execution, status card or external effect.
6. Resolve eligible tools and application mode from current server facts before every completion. Active applications preload only `application_support`; shared Profile, web research, documents and opportunity readers remain deferred unless loaded through the normal path. Brief/Memory retain their normal core availability. Ending preserves unanswered preparation batches, confirmed answers and saved documents without submitting, and returns to the normal progressive selector. The same `manage_simulation_session` tool is deferred in ordinary chat for a compact `list` of saved preparations and `resume` by sessionMessageId; only the selected preparation enters context. Website attempts and submission outcomes are retained, never automatically replayed. Refresh current coaching/profile/settings/context after actual calls. Executor coaching receipts survive a follow-up read failure. Update `used` only for successful active deferred capabilities; carried visibility never refreshes N.
7. Mark completion only after the normal delivery path succeeds. CAS preserves concurrent unrelated payload fields. Errors/cancellation remain `in_progress`; persistence failure never retries business effects.

The original conversation carries offers and consent. Leases are availability hints, never authorization. No keyword router, intent classifier, planner state or new persistence table is used. Terminal company reports retain the existing turn-ending contract.

## Extending

Add the real tool to the existing selector/registry and its policy to the existing policy builder. Assign its schema to core or an existing/new reusable capability, with an effect/permission-aware catalog summary. Do not add scenario-specific capabilities. Shared readers are deduplicated; using one refreshes only active owners. A partial allowlist advertises only supported effects. Resume authoring requires its two readers and writer together.

`eligibleNames/eligibleIds` describe account/caller availability; `offeredNames` is the current completion contract; `loadableIds` excludes capabilities already fully provided by core. The ownership coverage test must keep passing when tools are added.

## Observability and verification

Existing `llm_logs` receive request/user/conversation/source-message IDs, web/server origin, actual offered tool names, mode/step/capabilities and ordinary token/cache/cost fields via request-local async context. Domain tool attribution remains `costKind=attribution`; exclude it when summing billed estimates. Capability events record only execution metadata, never another domain tool charge.

Canonical challenge runner: `scripts/evalCareerCapabilities.ts`; frozen inputs and gates: `docs/evaluation/career-capability-loading/README.md`. Provider tests cover native/SSE/OpenAI/OpenRouter/fallback, same-response denial, hidden loader UI, and tool-free recovery after a write. Persistence tests use mocked PostgREST and perform no production writes.

Application entry still requires resume selection and a start-card click. Unrelated work first confirms ending the mode. Caller allowlists (including an empty list), onboarding and voice boundaries apply before capability loading. Terminal tool names refresh per completion alongside schemas and policies.
