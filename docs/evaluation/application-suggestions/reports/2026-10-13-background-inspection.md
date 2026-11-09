# Background application inspection — local verification, 2026-10-13

## Scope and outcome

Local, uncommitted implementation only. No deployment. Synthetic model inputs and owner/revision-checked in-memory storage; no real-company application or candidate data was sent. Existing frozen v1 inputs/gold were preserved. Review is manual, assistant-authored and unblinded, not an independent accuracy measurement.

- Haiku 5.5 initial v1: 3/3 structural passes, reviewed grounded edits, observed-only material and sensitive-field exclusion. Run `2026-10-13T07-08-37-770Z`.
- Haiku 5.5 pending-inspection v2: 2/2 structural passes. Batches contain 2 and 3 relevant questions respectively, within 3 questions / 7 changes / 10 total. No application-only contact/material requests before inspection. No invented facts observed. Run `2026-10-13T07-10-27-730Z`.
- Haiku 5.5 journeys-v2: 3/3 turns completed without tool errors. Required LinkedIn link and motivation draft were the only follow-up items; login-required and unverified access saved the approved resume copy and linked direct application without offering assisted submission. Original source and unrelated education remained intact. Run `journey-2026-10-13T07-10-29-230Z`.
- The first required-field run called readiness before publishing its essential follow-up. This did not submit an application, but was premature. The prompt now requires resolving application requirements before readiness. Same frozen case rerun `journey-2026-10-13T07-12-51-193Z` called read tools and published the follow-up, with no premature ready call or tool error.
- Known qualitative limitation: some final handoff replies are longer than ideal and repeat unchanged-content assurances. They were factually grounded, but this small set does not establish consistently concise production writing.

Full outputs and manifests remain in the task’s ignored owner-only `runs/` directories. v2 provenance/hashes are in `manifest-v2.json` and `manifest-journeys-v2.json`.

## Runtime and UI verification

54 targeted tests passed across foreground orchestration, background claim/merge/recovery, concurrent answer and end requests, pending/unsupported application guards, ready document handling, original-preserving edits, actual PGlite activity SQL, composer, background polling during chat, answer history and end confirmation. Source lint passed. Full TypeScript checking passed. Waiting/retry UI rendering was additionally verified after the 53-test run.

Actual local browser: desktop 1440px and mobile 390px. Verified inline edits, accepted text retention, numeric text input without shortcut interference, Enter progression, history disclosure, end cancel/confirm and completed progress visual. No browser error/warning logs on the fresh preview origin. The preview uses synthetic fixtures, not an authenticated full Career conversation or a real employer submission.

Separate actual hosted form-reader run `application-form-inspection/runs/2026-10-13T07-16-31-887Z-login`: 78.43 seconds, inaccessible login form correctly reported unsupported access, no write evidence, owned sessions/environments verified removed (404). Existing inventory-v2 gold unchanged; support status manually reviewed as an additional diagnostic. This validates the login branch, not all ATS providers.
