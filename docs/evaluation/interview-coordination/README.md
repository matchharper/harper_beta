# Conversational interview coordination

Local implementation evaluation. Frozen runs and the initial local run send no invitations; the separately authorized live Google run below sends real test Calendar invitations. No production migration or deployment.

- Objective/unit: one original company-side LLM turn, including capability loading, tool requests and final response. Cases cover starting without personal Calendar and resuming a delegated appointment after a candidate reply.
- Frozen input and gold: `cases-v1.json`, `gold-v1.md`; hashes in `manifest-v1.json`. Synthetic identities and dates, authored from the scheduling contract on 2026-11-08. Gold is reviewer-only and is not sent to the model.
- Production input: `runOrgAgentToolLoop` and `runOrgAgentCompletion`, production capability registry/policies/tool schemas/result formatter. Tool effects use an isolated in-memory adapter. No real DB, candidate or Calendar calls.
- Canonical runner: `npx tsx --tsconfig scripts/tsconfig.json scripts/evalInterviewCoordination.ts`. Uses the production model resolved from local configuration; run manifest records the exact model, source hashes, runtime clock and input hash.
- Metrics/gate: manually inspect complete provider input, tool trace and response for purpose completion, delegation, existing connection state, Calendar priority, accurate delivery claims and natural questions. A tool receipt alone is not a pass. All changed-path DB/provider tests must also pass. No keyword or separate judging model gate.
- Privacy: only provider requests are allowed by the runner's network guard. Exact inputs/outputs stay in ignored `runs/`, directories 0700 and files 0600. Credentials/HTTP headers are never recorded.
- Limitations: synthetic tools do not establish real delivery or candidate-agent conversation quality. Shared Google account authentication, Workspace Meet access settings, migration application and a real invitation need separate validation before release. Unit tests cover execution boundaries and provider response loss.

The user-requested local runtime test with the named accounts is reviewed in [the local conversation report](live-local-2026-11-08.md). It uses real company/Career model calls and local PostgreSQL executors; mail is captured and Google is unconfigured. Its initial request is deliberately shorter than v1. These exploratory inputs and failures do not replace the frozen cases.

Google conditional modifications: https://developers.google.com/workspace/calendar/api/guides/version-resources
Composio proxy: https://docs.composio.dev/reference/api-reference/tools/postToolsExecuteProxy

The authenticated shared-account browser test is reviewed in [the live Google report](live-google-2026-11-09.md). It uses local isolated identities, real company/Career model turns and real Google Calendar invitations to the user-designated test recipients. Ordinary email remains captured locally. It is exploratory and does not replace the frozen cases.
