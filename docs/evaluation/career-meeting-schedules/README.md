# Career appointment continuity

Objective: verify the original Career agent records confirmed interview facts from email, corrects/cancels the same appointment, and manages useful work reservations. No separate classifier or judge model.

- Unit: one synthetic background invocation. Frozen `cases-v1.json`, `gold-v1.json`, `manifest-v1.json`.
- Canonical runner: `scripts/evalCareerMeetingSchedules.ts`; `node --import tsx scripts/evalCareerMeetingSchedules.ts`.
- Runtime: production capability runtime, common main prompt, proactive handbook, tool schemas, appointment and work-reservation executors, real SQL functions in isolated PGlite. Gmail source and candidate email transport are synthetic; outgoing mail is captured, never sent.
- Model: current default from `resolveCareerTextChatModel`; provider requests and selected settings recorded. Deadline 240 seconds per case; no output-based retries or model judge.
- Gate: exact saved appointment identity/time/status, no company/Calendar effects, relevant reservation references, no misleading external-action claims on manual review of full output/tool traces.
- Privacy/network: fictional talent/company, `.test` email addresses. Only model provider network allowed. Raw requests/replies are ignored `runs/` artifacts with owner-only permissions.
- Provenance: synthetic challenge cases, v1 written before the first model run. These cases are not a production accuracy estimate.
- Limitations: does not test real Gmail credentials, hosted PostgREST, deployment, or email delivery. UI rendering and delivery boundaries have separate focused tests.
- Parent registry README was removed by pre-existing workspace changes; its HEAD contract was read without restoring it. This directory registers this new task.

V2 (`--v2`) preserves the three v1 examples and adds unconfirmed availability, repeated invitation, and cancellation of a referenced appointment outside the 72-hour window with no discovery matches. It uses the actual `prepareCareerInboxContext` and upcoming-context reader, with a frozen clock and synthetic Gmail transport. The optional activity read returns the fixture's actual empty prior-contact history. Inputs/gold are frozen in `cases-v2.json`, `gold-v2.json`, `manifest-v2.json`; all six cases run without output-based retries. Tentative availability must leave the confirmed-appointment count at zero; other cases retain the v1 identity/time/status gates. These six synthetic examples do not estimate production accuracy.

`--case=<id>` records a targeted run in its manifest. The fixture also serves the confirmed minimal profile facts to `read_profile`; it has no saved project history or profile documents. See [retest results](retest-2026-11-02.md) for fixture corrections and full scope.

V3 (`--v3`) adds a four-invocation continuous lifecycle in the same isolated database: invitation → rescheduling → a due saved reminder → late cancellation. Captured email history is supplied to the following invocation. Two independent cases cover mixed-company email, an unknown Role, Los Angeles time with no end time, and Gmail retrieval failure. Input/gold hashes are frozen before execution in `manifest-v3.json`; all raw provider input, tool results, output and DB rows stay in ignored owner-only runs. Existing v1/v2 data is unchanged. Review complete email bodies for factual accuracy and unsupported action claims in addition to the stored identity/time/status/ownership gates.

The v3 simulated clock is supplied to context readers and the original model. Due work is selected from actual previously saved reservations; its handoff is simulated locally because SQL uses the real wall clock. Source completion uses the real `finish_career_source_events` RPC. This does not exercise the deployed scheduler/queue, Gmail OAuth, actual email provider, or notification delivery. Email delivery remains a capture transport. Continuity cases must run together, without `--case`. Missing synthetic tools and runtime errors must be reported, not silently treated as product successes.

`node --import tsx scripts/replayCareerMeetingDelivery.ts <v3-run-directory>` replays the captured reminder through the production email renderer and outbox SQL in another isolated PGlite database. It checks sealed content, duplicate reservations, one-time history, and a late appointment revision blocking provider admission. Its provider receipt is explicitly synthetic; network is disabled. The existing background migration-test schema is reused verbatim and fingerprinted. See [continuous verification](verification-2026-11-02.md).
