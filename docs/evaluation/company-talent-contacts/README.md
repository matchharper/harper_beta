# Unified company/talent contact scenario QA

## Objective and evaluation unit

Verify a complete stateful company → candidate → company-side LLM round trip under the unified contact contract. v2 has five challenge scenarios: role choice, renewed consent, proactive contact, conditional non-consent, and a partial response to resume/timing requests. This is not an estimate of production-wide model accuracy.

## Frozen input and gold

`cases-v1.json` / `gold-v1.json` remain unchanged. `cases-v2.json` / `gold-v2.json` were frozen before the new calls. v2 explicitly names the proactive Role, adds two cases, and follows the user's clarified delivery contract: saying “전달했습니다” is acceptable and is not a queued-versus-sent wording failure. Candidate/workspace aliases are de-identified; identity mappings stay in ignored `private/`. Adaptive clarifications must be recorded, never silently substituted into frozen inputs.

## Runtime contract and canonical runner

`scripts/evalUnifiedCompanyContacts.ts` uses the current company-side runner, candidate tool contract and real PostgreSQL contact/pipeline functions. Schema capture is owned by `harper_worker/scripts/capture_company_contact_test.py`, using `connect_read_only()`. Production schema capture is read-only. Apply pending migrations only to an isolated local database; never change production functions to run this test.

The runtime uses real production-configured LLM providers and tool executors. External email/Slack transport may be captured locally; when it is, report that limitation explicitly and never count a simulated send as real inbox delivery. No synthetic tool success result may substitute for a real database mutation.

## Metrics and gate

Per scenario: correct target, faithful meaning/conditions, expected state, no unauthorized side effect, usable replies, inline candidate→company delivery and retry idempotency. Gate: all five v2 cases pass and zero critical failures. An accepted durable send may be described as delivered; do not infer company readership or decisions. Record failures before fixes/reruns.

## Models and run manifest

Use current runtime model/provider/reasoning defaults without override. Save actual settings, dirty source/diff hashes, prompt hashes, frozen fixture hashes, durations, tool traces, final state and exact transcript in owner-only `runs/<run-id>/`. A changed prompt creates a new run against the same frozen gold.

## Privacy, provenance and isolation

Inputs are synthetic business requests mapped to the two explicitly authorized fixture accounts. Copy only their identity and minimum Harper workspace context; do not capture private chat histories, resumes, passwords or provider credentials. Every synthetic Role is marked `testOnly=true`, `testFixture=unified-company-talent-contact-qa`, and exact `testTalentIds` before insertion. Role matching is not run. All mutable data stays in local PostgreSQL and is removed or the isolated cluster stopped after testing. Raw model output and account mapping remain gitignored and mode 0600.

## Limitations

Five examples in one workspace are regression/challenge evidence only. Local auth/queue/provider adapters do not validate Supabase Auth, production scheduling or real mail/Slack receipt. Record unavailable surfaces and schema differences; never claim live deployment validation.

## Latest result

[v2 retest](reports/2026-09-23-v2.md): five behavioral scenarios passed after fixing immediate delivery, requestId-dependent stale context, and CC coupling. The first v2 run exposed incomplete draft copy; its evidence is retained. The final fresh-fixture run needed no business clarification or draft correction.

[Original v1 report](reports/2026-09-23.md) is retained as historical evidence of the reopening and routing failures. Its queued-versus-sent wording criticism was incorrect under the user's clarified policy and is not part of the current gate.

## Reproduction

This local replica was tested on macOS arm64 with `embedded-postgres@17.6.0-beta.15` and the official PostgREST v16.3 arm64 binary. Install both only in a dedicated `mktemp -d /tmp/harper-contact-live.XXXXXX` directory; the sandbox expects `<dir>/node_modules/embedded-postgres` and `<dir>/postgrest`. It binds only loopback ports 55437–55439. No repository dependency or lockfile change is required.

1. Obtain explicit authorization for the exact two fixture accounts. Run the read-only capture from `harper_worker`: `python3 scripts/capture_company_contact_test.py --workspace-name <internal-workspace> --talent-email <candidate-a> --talent-email <candidate-b> --output ../harper_beta/docs/evaluation/company-talent-contacts/private/schema-and-identities-v2.json`. Do not overwrite a frozen capture when changing inputs; preserve the previous private artifact and use a new dataset version when the semantic inputs change.
2. From `harper_beta`, start `CONTACT_QA_SANDBOX=<dir> node scripts/companyContactQaSandbox.mjs`. It restores the captured schema and applies only the two explicitly named migrations to the isolated database.
3. Set a unique `CONTACT_QA_RUN_ID`. Run `CONTACT_QA_SANDBOX=<dir> node --env-file=.env.local node_modules/tsx/dist/cli.mjs --tsconfig scripts/tsconfig.json scripts/evalUnifiedCompanyContacts.ts setup`, then the same runner with `preflight`. Stop before any model call if preflight fails.
4. Run `company` for UCT01, UCT02, UCT04, UCT05, inspect each exact draft, then `company <case> <approval-text>`. Run `deliver-candidate`, `candidate`, `event` for each. Candidate→company delivery uses the real inline service and MUST NOT need `deliver-company`. The external company→candidate email alone is captured locally.
5. Run `candidate-first UCT03`, then `event UCT03`. Continue with `company UCT03`, `deliver-candidate UCT03`, `candidate UCT03`, `event UCT03`. Record any extra clarification; do not relabel corrected follow-ups as first-pass success.
6. `replay-event UCT01` checks terminal-turn idempotency. `replay-delivery UCT03` checks delivery-trigger deduplication without forcing an already completed silent job through the model again.
7. Run `verify`, then `audit` before `cleanup`, inspect the exact responses as well as database state, and stop the sandbox gracefully. Private data is owner-only and gitignored. Do not kill a pre-existing development server or production process. v2 identity capture is `private/schema-and-identities-v2.json`; preserve the v1 capture. On an existing isolated replica, `refresh-local-functions` updates only its explicitly named functions after a code change.
