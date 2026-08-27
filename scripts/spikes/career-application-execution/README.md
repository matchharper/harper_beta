# Career application execution spike

This is an isolated local verification environment for the planning document
`docs/career-universal-application-execution-plan-ko.md`. It is not product
code and never submits to a real employer.

## What it exercises

- A single-page application form with a PDF upload.
- A three-step form that adds a new mandatory question late in the flow.
- A login and candidate-only OTP takeover (`482913`).
- A provider that records an application and then returns HTTP 504.
- Duplicate detection by provider, role, and email.
- A persisted `/career` request queue with leases and worker events.
- A long-running server worker and the same worker invoked once by a scheduler.

## Run

From `harper_beta/`:

```bash
node scripts/spikes/career-application-execution/server.mjs
node scripts/spikes/career-application-execution/worker.mjs --max 3
```

Open `http://127.0.0.1:4317` in a separate browser session. Generated state,
the resume fixture, screenshots, and traces belong under
`output/playwright/career-application-execution/`.

## Test identity

- Name: Harper Test Candidate
- Email: use a unique `harper.test+<case>@example.com` address per success case
- Phone: `010-1234-5678`
- Work authorization: yes
- Sponsorship: no
- Start date: `2026-09-15`
- Work mode: hybrid
- Travel up to 20%: yes
- OTP: `482913`

Narrative answers must be grounded in this fictional fixture only:

- Built an internal opportunity triage dashboard from discovery through launch.
- Coordinated product, engineering, and operations stakeholders.
- Reduced manual review time in the fictional test scenario.
- Led a fictional security incident review and remediation plan.

## Safety

- Do not point the spike at a public job board.
- Do not enter real candidate credentials or PII.
- Do not treat browser button clicks as verified submission without a receipt.
- A 504 from `TimeoutATS` is intentionally ambiguous; inspect `/api/receipts`
  before any retry.
- The OTP simulates a user takeover boundary. The browser agent should pause at
  that page, a test operator should enter the code, and the agent should resume.

