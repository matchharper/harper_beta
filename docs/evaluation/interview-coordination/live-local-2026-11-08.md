# Local runtime conversation test, 2026-11-08

Scope: the user authorized a test with specified company/candidate email addresses in the internal Harper workspace and arbitrary fixture setup. Production account and membership inspection was read-only. The test used isolated local Supabase accounts carrying those email addresses, a paused internal Role with `testOnly`, a stable `testFixture`, and the exact local candidate in `testTalentIds`. Local auth IDs differ from production. The production meeting-delivery v2 RPC and shared Google configuration were absent; no production migration, deployment, mail or Calendar invitation was performed.

The original runtime entry points were `runOrgAgentChat`, `processCareerBackgroundRun`, `runCareerChatTurn` and `processCompanyAgentWebActionJob`. Company model: `google/gemini-3.8-flash`; Career model: `gpt-6.1-terra`. Existing local schema dependencies were brought forward only as needed. Queue claims were driven locally; this does not test a deployed worker/queue transport or the browser UI. Candidate email delivery used the existing local capture transport, with external network delivery blocked.

The initial user message was only “후보자님 인터뷰 잡아줘”, with the actual named candidate in the private input. A test-driver follow-up supplied next Tuesday–Thursday, 14:00–17:00 Asia/Seoul, for one hour, and delegated confirmation without another company approval. The candidate test-driver reply chose November 10, 14:00–15:00. These are simulated user replies, not statements received from the real account owners.

## Observed failures and fixes

- The original short request could fall back to `move_candidate_stage(scheduleInterview=true)` and demand Calendar setup. Its old schema still advertised ordinary interview arrangement; the capability summary also conflated stage management with conversational coordination. The blocked-result formatter asserted user authorization and mandated the same time-selection-page continuation. Corrected these source contracts and removed the result's invented authorization/continuation instructions.
- An accepted legacy relationship had no agent correspondence root, and `read_talent` omitted the recommendation reference required to open one. Added that reference. The general correspondence tool also accepts an exact candidate/Role pair, resolves one currently authorized accepted relationship through the existing scoped reader, and retains transactional consent checks. Conflicting explicit candidate/Role/reference values fail before writing.
- Missing references were reported as uncertain execution despite no send. Added a pre-execution input error for an unresolved target. Clarified the existing agent-contact action and its arguments in the tool contract and meeting guide.
- Successful meeting/correspondence operations were absent from stored tool metadata. They now remain available to subsequent-turn capability loading and review.
- Scheduling evidence summarized date exceptions only as a count. It now includes exact weekly intervals and date overrides, including unavailable dates.
- A background company event's meeting reader used the default membership-mutation permission and failed before reading the delegated request. The service entry now checks scoped read access; the executor still validates the original requesting teammate's actual current permissions, source request, consent and version before mutation. No membership is fabricated for the service principal.

Failed attempts are preserved. Some failed fixture turns were reset/replayed after fixes, including their locally generated outputs. The old local schema initially lacked action-items and company-job usage fields, and the direct Career harness initially omitted its existing `scheduleAfter` adapter. These test-environment issues were corrected without changing product behavior. The original frozen adapter tests had not exposed the missing reference or service-permission bugs.

## Verified conversation and durable effects

1. The short request continued through a natural availability question instead of requiring Calendar setup.
2. With the company's time window, the company agent prepared one meeting and sent `contact_talent(action=send_to_agent)` with the purpose, duration, timezone, time window and meeting reference.
3. The original Career agent read the correspondence and existing context, wrote an availability question, and delivered it to the local capture mailbox and Career history.
4. The candidate's explicit test reply caused `contact_company` to convey November 10, 14:00–15:00 and request confirmation. The candidate response accurately said confirmation was still pending.
5. The background company agent read the original delegation and confirmed the same meeting at that time, advancing it to version 2. It reused that meeting for a delivery retry, then sent confirmation to the candidate agent and the company's Role chat. No repeated company approval or second meeting was created.
6. Calendar delivery failed because Google configuration was unavailable. The saved appointment remained confirmed; no Meet URL or Calendar event was fabricated. The company chat distinguished the agreed time from the missing invitation/link.
7. The candidate agent consumed the confirmation, read the confirmed appointment, and delivered a second captured email and Career-history message. It confirmed the time while saying the interview link/location was still pending, and retained follow-up work for the missing details.

This establishes local agent-to-agent coordination and appointment persistence, not successful Google delivery. `hello@matchharper.com` still needs a real authorized Calendar connection and deployment configuration. Actual external invitations, recipient inbox delivery, RSVP and Meet admission remain unverified.

After preserving evidence, the fixture Role/workspace, meetings, queue jobs and follow-up reservations were removed. The newly created local candidate auth account was deleted and its profile soft-deleted; model-log foreign keys retain the audit profile. The preexisting local company account was preserved. The capture-mail process was stopped and its recipient configuration restored. No active fixture work remains.

## Evidence and checks

Private artifacts: `runs/live-local-20261108/`, including exact company provider requests, returned conversation records, database effects, failed-attempt snapshots, a local runner snapshot and source hashes. Career tool traces and captured mail are retained there; initial Career provider requests were not captured by the first harness version. Raw identities and outputs are not committed. The local runner is an exploratory test driver, not a new reusable frozen evaluation.

Focused DB/provider tests: 37 passed, including exact availability projection and mismatched correspondence targets. Three relevant result-projection tests passed; TypeScript and diff whitespace checks passed. The existing v1 model evaluation was rerun against unchanged frozen cases (`runs/2026-11-08T14-42-34.668Z/`): both branches reached the intended mock effects. Personal-Calendar priority is covered by these injected-provider tests, not an authenticated live account in this run.
