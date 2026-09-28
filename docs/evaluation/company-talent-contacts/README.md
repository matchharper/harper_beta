# Unified company/talent contact scenario QA

## Local full-stack reply round trip (2026-09-28)

`local-full-stack-reply-v1.json` freezes two synthetic company question/reply cases before execution:
candidate email and Career chat. The evaluation unit is each complete question → response → company-visible
relay. The existing local full-stack runbook and `scripts/localE2e/stack.mjs` own setup, isolation and worker
execution; application UI, signed local inbound webhook, actual workers, PostgreSQL functions and company
conversation rendering are exercised. This is separate from the synthetic-tool model evaluation.

Use current runtime model/provider settings. Preserve source/input hashes, transport mode, exact mail/chat
outputs, request/relay/queue IDs and final state in a fresh ignored `runs/<id>` with owner-only permissions.
The two explicitly authorized account mappings stay private. The existing Role is marked testOnly with its
exact testTalentIds; establish connection through the normal Intro flow. Do not copy production profiles,
queues or tokens. No production database, scheduler or worker fallback is allowed.

Manual full-output gate: correct target, authorized meaning/conditions preserved, company-visible reply,
no duplicates and no unrelated state changes. Capture transport does not establish real Gmail receipt;
record real inbox receipt/reply only after Gmail reauthentication and an observed mailbox round trip.
This small local test does not establish production reliability, Slack ingress/reply handling or Calendar behavior.

[2026-09-28 local full-stack result](reports/2026-09-28-local-full-stack-reply.md):
both email and Career answers reached the company with conditions preserved and no duplicate delivery
or pipeline/Role change. Email transport was captured; one reply was visually checked in real test Slack,
and the other has Slack post receipts. Career's immediate chat display, production URLs in local links,
Slack formatting and a long company-model call remain observed issues. Real Gmail was expired and untested.
This result has not passed a complete user-experience gate.

## Current frozen contract: v3

`cases-v3.json`, `gold-v3.json`, `context-v1.json`, `manifest-v3.json` freeze the same five
user conversations with explicit synthetic company facts and adjudication boundaries.
Read [the shared evaluation contract](../company-side-conversational-qa/evaluation-contract-v1.md)
before execution. v2 outputs informed this regression; this is not a blind holdout.
Start the sandbox with `CONTACT_QA_SERVICE_EXAMPLES=empty`. Run the canonical runner with
`CONTACT_QA_DATASET=v3 CONTACT_QA_ROLE_DATASET=v3 CONTACT_QA_RUN_ID=<fresh-id>`.
Run setup and preflight before any model call. All frozen hashes and a fixed runtime source
cohort are checked; code changes require a new run/fresh fixture. Role v3 uses the same local
environment but is separately scored. Existing objective, metrics, provider capture, privacy,
transport limitations and 5/5 gate below still apply. Empty service-example retrieval is an
explicit test input, not successful vector search. No production database or deployment write.

The v3 runner also enforces each frozen dialogue's command order in the private run ledger.
A candidate-initiated case must begin with `candidate-first`, not its later `candidate` reply.
Message overrides are rejected; `verify` requires every frozen step. This is evaluation protocol
validation, not production agent orchestration. A wrong-order run is retained as invalid and
restarted with fresh fixtures, never repaired into passing evidence.

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

## Latest result — 2026-09-26 / v3

[Contract, execution and fixes](../company-side-conversational-qa/reports/2026-09-25-contract-v8.md):
`20260926-contact-v3-contract-r5` completed all five frozen dialogues in order. Manual review of
five actual outbound bodies, six inline candidate relays, both sides' replies and database effects
passes the local behavioral/meaning gate, with zero critical failures. Candidate completion replies
no longer predict company reactions or invent future automatic delivery. Conditional non-consent,
private salary and withheld-resume boundaries hold. Event/delivery replays add no duplicate effect;
fit/meeting rows are zero, and exact-ID cleanup leaves zero fixture roles/fits/queues.
Role v3 also completes all five turns with source-preserving qualifications and final-consent activation.
This is Codex's unblinded review, not independent certification. External email/Slack/queue workers,
Auth, uploads and live vector retrieval remain outside this local gate. No deployment or production write.

## Previous results

[2026-09-25 execution report](../company-side-conversational-qa/reports/2026-09-25-execution-and-improvements.md):
fresh UTF8 v2 final-r5 passes five state/authority/privacy assertions, six inline candidate relays,
and replay deduplication with zero fit/meeting rows. Full quality gate remains **NO-GO** because
some candidate replies add unsupported reassurance. Real `transport-v1` separately verified inbox
receipt, manual candidate reply and company mirror; deployed inbound meaning drift remains a failure.
These are local-branch tests plus one mixed-version transport smoke, not deployment certification.

[v2 retest](reports/2026-09-23-v2.md): five behavioral scenarios passed after fixing immediate delivery, requestId-dependent stale context, and CC coupling. The first v2 run exposed incomplete draft copy; its evidence is retained. The final fresh-fixture run needed no business clarification or draft correction.

[Original v1 report](reports/2026-09-23.md) is retained as historical evidence of the reopening and routing failures. Its queued-versus-sent wording criticism was incorrect under the user's clarified policy and is not part of the current gate.

## Reproduction

### Real transport smoke (`transport-v1`)

`transport-v1.json` freezes one email round trip and its gold before execution. It is
not a replacement for the five behavioral cases. Canonical runner:
`scripts/evalCompanyContactTransport.ts send|status`, with `.env.local`, a unique
`CONTACT_TRANSPORT_RUN`, and an explicitly authorized existing
`CONTACT_TRANSPORT_RECOMMENDATION`. Only the user's two allowlisted accounts in
the internal Harper workspace may be used. It refuses synthetic production Roles;
it never creates Roles, recommendations, stage changes or routing configuration.
The starting state and raw traces are saved privately, and `status` verifies the
Role and pipeline are unchanged. Open the exact test email in the authorized
account, reply with the frozen candidate text, and inspect the incoming relay and
company conversation. Record inbox receipt separately from DB queue acceptance.
Local company-side code and deployed inbound/event consumers are different source
boundaries: passing transport does not establish deployment of the local branch.
The test correspondence stays in the user's test-account history; no unrelated
history is deleted. This single smoke is not a latency or reliability estimate.

### Isolated five-case behavioral run

This local replica was tested on macOS arm64 with `embedded-postgres@17.6.0-beta.15` and the official PostgREST v16.3 arm64 binary. Install both only in a dedicated `mktemp -d /tmp/harper-contact-live.XXXXXX` directory; the sandbox expects `<dir>/node_modules/embedded-postgres` and `<dir>/postgrest`. It binds only loopback ports 55437–55439. No repository dependency or lockfile change is required.

1. Obtain explicit authorization for the exact two fixture accounts. Run the read-only capture from `harper_worker`: `python3 scripts/capture_company_contact_test.py --workspace-name <internal-workspace> --talent-email <candidate-a> --talent-email <candidate-b> --output ../harper_beta/docs/evaluation/company-talent-contacts/private/schema-and-identities-v2.json`. Do not overwrite a frozen capture when changing inputs; preserve the previous private artifact and use a new dataset version when the semantic inputs change.
2. From `harper_beta`, start `CONTACT_QA_SANDBOX=<dir> node scripts/companyContactQaSandbox.mjs`. It initializes UTF8/locale C, rejects non-UTF8 clusters, restores the captured schema and applies only the two explicitly named migrations to the isolated database. The earlier embedded default SQL_ASCII incorrectly treated Korean character limits as byte limits; those Role-write failures are invalid harness evidence, not established production defects. Preserve those failed runs and start a fresh cluster; do not rewrite their outcomes.
3. Set a unique `CONTACT_QA_RUN_ID`. Run `CONTACT_QA_SANDBOX=<dir> node --env-file=.env.local node_modules/tsx/dist/cli.mjs --tsconfig scripts/tsconfig.json scripts/evalUnifiedCompanyContacts.ts setup`, then the same runner with `preflight`. Stop before any model call if preflight fails.
4. Run `company` for UCT01, UCT02, UCT04, UCT05 and inspect the exact contact. These explicit delivery instructions should send directly under the current contract. An unnecessary draft approval is a regression, not a required test step; record any adaptive recovery separately. Run `deliver-candidate`, `candidate`, `event` for each only after verifying the send. Candidate→company delivery uses the real inline service and MUST NOT need `deliver-company`. The external company→candidate email alone is captured locally.
5. Run `candidate-first UCT03`, then `event UCT03`. Continue with `company UCT03`, `deliver-candidate UCT03`, `candidate UCT03`, `event UCT03`. Record any extra clarification; do not relabel corrected follow-ups as first-pass success.
6. `replay-event UCT01` checks terminal-turn idempotency. `replay-delivery UCT03` checks delivery-trigger deduplication without forcing an already completed silent job through the model again.
7. Run `verify`, then `audit` before `cleanup`, inspect the exact responses as well as database state, and stop the sandbox gracefully. Private data is owner-only and gitignored. Do not kill a pre-existing development server or production process. v2 identity capture is `private/schema-and-identities-v2.json`; preserve the v1 capture. On an existing isolated replica, `refresh-local-functions` updates only its explicitly named functions after a code change.
