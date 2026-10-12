# Local integration verification — 2026-10-12

PR #155 is integrated into local main only. The sections dated 2026-10-10 below describe the older implementation and historical tests, not the current application executor or a new deployment.

The application planner now has an Agents API `environment: none`, no shell/filesystem or arbitrary JavaScript, and programmatic tool calling disabled. It requests only inspect/navigate/fill/select/check/attach/click actions through `applicationBrowserActions.ts`. Harper owns the Chromium executor in an ephemeral Vercel Sandbox (`persistent: false`, 30-minute expiry), with private-network egress denied, no public command port and no model/provider credentials passed into the VM. The sandbox SDK authenticates through deployment OIDC or an explicitly supplied external token/team/project trio. There is no live cloud-Sandbox verification from this checkout because those credentials are unavailable locally.

`applicationBrowserDriver.ts` intercepts outgoing requests. The server-provided initial role URL may be read; subsequent navigation and foreground writes are held. After personal input, background requests are aborted, WebSockets are closed, and service workers are blocked. An explicit Send choice releases only the immutable HTTP request tied to its method/destination/body hash, observed form snapshot and owner-checked document versions. Free text, skip and Cancel deny it. Later DOM changes cannot replace the held request body. Changes to saved documents invalidate approval. Approval command IDs and durable delivery receipts prevent replay; a lost/expired browser is never resumed or restarted automatically. Same-origin GET redirects from that approved request may be followed to inspect the receipt.

This is deliberately conservative: initial POST-backed application loading, background autosave, multi-request upload/submit protocols, login and CAPTCHA may require manual application. At most one non-read request per gesture is released; additional writes are blocked. A click or sent request alone never establishes success. User approval and the website's observed receipt are separate facts. Long waits can also lose a pending browser request; do not retry an ambiguous submission.

Canonical safety checks are `applicationBrowserDriver.test.ts`, `applicationBrowserRuntime.test.ts` and `applicationBrowser.test.ts`. The live driver test uses the exact shipped driver, local Chromium, loopback forms and synthetic bytes only. It verifies POST/GET withholding, explicit denial, forged-scope rejection, immutable-body behavior, real multipart attachment bytes/filename, and duplicate approval without a second submission. Runtime mocks verify fixed commands, document-ID bounds, no model code/approval tool, expiry/loss handling and provisioning cleanup. No employer form or production data is touched.

The mode keeps shared Memory/Brief/Profile tools, respects caller bounds, and returns to the common capability runtime after a confirmed switch. Provider/SSE/fallback regression tests cover current schemas/policies and refreshed terminal tools. Actual-model dialogue fixtures and version history are registered under `docs/evaluation/career-capability-loading/` (v6/v7/v8). The current Profile writer supports name, bio, current location, personal links and row memos; it does not directly rename an experience's company field.

---

# Application browser upload verification — 2026-10-10

The application browser now uses an owned Playwright Chromium inside the Agents API's OpenAI-hosted environment. It does not connect to the native `computer_use` browser via an undocumented CDP endpoint. The existing Agents session, function-tool wait/resume, cancellation and final submission confirmation remain in place.

Implementation: `src/lib/career/simulation/applicationPlaywright.ts`.

- Setup installs pinned Playwright 1.64.0 and Chromium with Linux dependencies.
- A detached process owns the page/context. Local driver requests require a generated workspace-only token.
- The agent controls this same page from initial navigation through attachment and submission. Waiting for function input does not switch browsers.
- Driver loss stops the run; it must not restart and risk submitting twice.

## Observed synthetic checks

Only loopback HTTP forms and synthetic text files were used. No real resumes or employer forms were submitted.

1. Baseline upload: HTTP 200; 41 source/received bytes matched exactly. Chromium initially failed because `libnspr4.so` was missing; standard `playwright install --with-deps chromium` resolves that setup requirement.
2. Initial persistent-driver trial: plain `nohup` did not survive the function-tool wait. Resume returned `ECONNREFUSED`; no upload/submission was attempted.
3. Detached-session trial: `subprocess.Popen(..., start_new_session=True)` with detached standard streams survived `pause_test` and its tool-result response. The same page retained its input value, document token and navigation timestamp. `setInputFiles` attached the file; the upload-complete page matched the server receipt. All 29 bytes matched SHA-256 `1d2e8b3eb733b9ec5f88e2235cd0c872e6fcc443a2643ddf9aba2d5396776d0c`. Exactly one multipart submission occurred. The production launcher uses this detached-session approach.

These checks establish workspace file transfer, Chromium attachment and state persistence across an Agents function wait. They do not establish support for every ATS, login, CAPTCHA, or employer-specific upload validation. Existing native-browser runs keep their existing provider session; new runs use the new driver.

References: [OpenAI-hosted environments](https://developers.openai.com/api/docs/guides/agents-api/environments/openai-hosted), [function-tool continuation](https://developers.openai.com/api/docs/guides/agents-api/tools/functions).

## Question continuation incident and verification — 2026-10-10

Sixfold activity `e58f118d-20c4-4730-9e7f-4feebd58c25b` recorded an information question after reporting file attachment, then a submitted answer bundle. There was no final submission approval or website receipt. The server terminal-event fallback produced the generic uncertain result and deleted the provider session, so the precise provider failure is no longer recoverable. This is not evidence of a successful employer submission.

Corrected two control-flow weaknesses:

- Browser questions have their own continuation description. The main-chat description said to end the turn and execute no further work, which conflicted with a browser resuming after the function result.
- A terminal event now reconciles pending provider actions and the latest root turn before ending the application. A completed turn without an outcome gets one continuation in the same browser, with an explicit no-repeat-submission boundary. Terminal/error diagnostics are bounded and saved before resource cleanup. Raw diagnostics are not sent to the final-writing model.

Regression tests cover pending questions arriving alongside completion, a newer running root turn, a completed child turn, and duplicate completion notifications. Ten browser/transport tests passed; TypeScript and scoped ESLint passed.

A fresh hosted Agents API run using the production Playwright files and browser function descriptions completed this synthetic sequence:

1. Attached `resume.txt` (21 bytes) to a loopback multipart form.
2. Asked for the missing contact, then consumed `fixture-contact` from a function result.
3. Continued in the same page and requested final approval with the exact fields and file.
4. Submitted after approval and observed `Application received. Receipt TEST-2026. File and contact verified.` The test server checked the uploaded bytes and contact value before returning that receipt.
5. Reported `succeeded` through `report_application_outcome`. The successful test session was cancelled and deleted (HTTP 200).

This validates the browser question/approval/attachment path, not an actual Sixfold submission. No employer application or production data was changed. The first synthetic attempt failed at sandbox setup; its cleanup request returned HTTP 409 (`hosted session provisioning or resource creation has not settled`) even after cancellation. Provider reference for cleanup: `sess_038e1ad4e052b46a006ac9378f6acc819a8d028fea37b9a1bf`.

## WorkOS TLS trust failure — 2026-10-10

The WorkOS run stopped at initial navigation with `net::ERR_CERT_AUTHORITY_INVALID`, before form entry, attachment or submission. In a disposable hosted environment, Chromium reproduced the failure while curl verified TLS and returned HTTP 200. The hosted environment's Envoy proxy CA was already installed in `/usr/local/share/ca-certificates` and trusted by `/etc/ssl/certs/ca-certificates.crt`, but Chromium's local NSS database was absent.

Importing that existing trusted CA into the NSS database and restarting Chromium resolved navigation: HTTP 200, title `Product Engineer - Enterprise @ WorkOS`, ten application inputs and a visible Submit application button. No employer form was filled or submitted.

Production setup now installs `libnss3-tools` and runs the bundled `trust.py` before launching Chromium. It imports only local CA certificates that verify against the system bundle, with content-derived names for repeatable imports. It never trusts certificates obtained from target websites and does not disable TLS verification. Setup failures stop provisioning instead of silently continuing without the trust configuration. New browser environments receive this setup; existing provider sessions are not modified in place.

A second fresh hosted environment used the exact updated production `playwrightFiles` and `playwrightSetup`, without agent-side setup/trust changes. WorkOS navigation returned HTTP 200 with the expected title. A synthetic local file input accepted a 38-byte fixture, and a synthetic field retained its value across separate persistent-driver calls. Thus both the automatic trust bootstrap and the existing attachment/state path were exercised. No personal data or employer submission was used. The four composer/analysis tests and ten browser/transport tests passed, as did TypeScript and scoped ESLint.

## Application work-progress UI — 2026-10-10

The browser worker now persists completed public `agent.session.turn.output_text.done` parts (up to 40 entries, 800 characters each) in the existing browser payload. Stable item/content IDs deduplicate replayed updates. Reasoning, command arguments and tool output are not displayed. Progress-save failures do not abort the application. The browser prompt requests brief, user-language updates at meaningful transitions and distinguishes intended work from observed results.

The timeline reuses `ChatThinkingLogPanel`: Working while executing or preparing the outcome reply, no active spinner while awaiting user answers, and saved logs on the ordinary outcome message through the existing `thinking_logs` field. Thus completed and failed attempts remain expandable after reload. There is no new table or progress-only chat message. Live updates use the existing three-second activity refresh; text is shown when each output part completes, not token by token. The old standalone browser-status shimmer is removed.

Sixteen focused tests cover public-text filtering, bounded storage, duplicate events, worker-to-question persistence, input-wait rendering without a spinner, and outcome-message handoff. TypeScript and scoped ESLint were checked. This UI verification does not submit an employer application or establish application success.
