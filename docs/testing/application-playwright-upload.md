# Local integration verification — 2026-10-12

PR #155 is integrated into local main only. The sections dated 2026-10-10 below describe the older implementation and historical tests, not the current application executor or a new deployment.

The application planner has an Agents API `environment: none`, no shell/filesystem or arbitrary JavaScript, and programmatic tool calling disabled. It requests only inspect/navigate/fill/select/check/attach/click and bounded field-batch actions through `applicationBrowserActions.ts`. New runs provision Chromium through **Agents API `openai_hosted`**, not Vercel Sandbox or a browser on Harper/user machines. A separate executor session runs deterministic setup and a persistent browser/command process; it receives **no agent input and runs zero model turns**. Planning-model code therefore cannot alter or bypass the submission guard. The executor expires its browser and removes attachments after 30 minutes. Existing Vercel resources are supported for cleanup only and cannot resume through the new executor.

Commands arrive through the documented live environment Files API. A signed upload grant returns one encrypted result to the existing private document bucket, under a random `_application-browser/<uuid>` prefix; no new table, bucket, callback endpoint, service, migration or deployment is required. Each result uses a separate AES-256-GCM key; neither Storage admin keys nor OpenAI keys enter the sandbox or model context. Results are removed after reading and remaining objects are cleared after environment deletion. The hosted network requires its HTTPS proxy, so a fixed Python publisher uses standard proxy settings and the already-trusted system CA bundle. TLS verification remains enabled. Files are installed in verified 1 MiB chunks, retaining the existing 10 MiB total attachment limit despite the inline Files API limit.

`applicationBrowserDriver.ts` intercepts outgoing requests. Product startup permits public HTTPS destinations and refuses loopback/private address resolutions. The fresh browser has no candidate credentials, fields or attachments, so anonymous initial form-loading requests may run, including POST-based form schema reads. The hosted browser diagnostic sink `bzr.openai.com` is denied. Inspection does not count as a foreground input gesture. Subsequent navigation and foreground writes are held. After personal input, background requests are aborted, WebSockets are closed, and service workers are blocked. An explicit Send choice releases only the immutable HTTP request tied to its method/destination/body hash, observed form snapshot and owner-checked document versions. Free text, skip and Cancel deny it. Later DOM changes cannot replace the held request body. Changes to saved documents invalidate approval. Approval command IDs and durable delivery receipts prevent replay; a lost/expired browser is never resumed or restarted automatically. Same-origin GET redirects from that approved request may be followed to inspect the receipt.

This is deliberately conservative: background autosave after candidate input, multi-request upload/submit protocols, login and CAPTCHA may require manual application. At most one non-read request per gesture is released; additional writes are blocked. A click or sent request alone never establishes success. User approval and the website's observed receipt are separate facts. Long waits can also lose a pending browser request; do not retry an ambiguous submission.

Canonical safety checks are `applicationBrowserDriver.test.ts`, `applicationBrowserRuntime.test.ts`, `applicationBrowserResultStore.test.ts` and `applicationBrowser.test.ts`. Local regression checks use synthetic bytes only and cover POST/GET withholding, explicit denial, forged-scope rejection, immutable-body behavior, real multipart bytes/filename, duplicate approval, fixed commands, ownership bounds, large-file chunks, encryption integrity, expiry/loss and cleanup.

`scripts/verifyAgentsHostedApplicationRuntime.ts` also exercised the shipped runtime through live Agents API and the real private Storage transport, with an isolated synthetic HTTPS fixture inside OpenAI. It retained entered values across requests, attached all 833 PDF bytes unchanged, observed no receipt before approval, refused a forged scope, and produced exactly one receipt after approval. Duplicate approval produced no additional submission. The executor's actual turn list was empty. Session/environment cleanup returned 404 and encrypted temporary results were cleared. The test writes no applicant/Role/document/message rows and sends no real employer application. Frozen inputs, provenance and limits are under `docs/evaluation/agents-hosted-resume-upload/` (`runtime-v2`); prior model-capability experiment assets remain frozen at v1.

The mode keeps shared Memory/Brief/Profile tools, respects caller bounds, and returns to the common capability runtime after a confirmed switch. Provider/SSE/fallback regression tests cover current schemas/policies and refreshed terminal tools. Actual-model dialogue fixtures and version history are registered under `docs/evaluation/career-capability-loading/` (v6/v7/v8). The current Profile writer supports name, bio, current location, personal links and row memos; it does not directly rename an experience's company field.

`simulate_application` public form inspection now uses the same hosted executor in a separate read-only configuration. Ashby's public-schema fast path remains first. The fallback planner defaults to `gpt-6.1-sol` with reasoning `low`, independent of the applying planner's `APPLICATION_BROWSER_MODEL`. Its only browser commands are inspect/navigate/click; input, selection, file installation/attachment, form-control clicks, submission and approval are refused by the executor, not just the prompt. No candidate facts or documents enter the inspection session. Visible iframe text and native required/file-type/max-length metadata are included. The inspection model reports current observed field refs, and the server copies exact source attributes; missing constraints remain unknown. The work deadline is 180 seconds including hosted setup, with separate bounded cleanup. Login/CAPTCHA, unknown requirements and conditional fields stay unverified.

Agents API conversation-only (`environment:none`) sessions currently require initial input at creation. Both the inspector and new applying planners send their task in the create request; applying planners persist the dispatch flag with the provider reference and do not send the same task again. Existing question/approval continuations still use matching tool results. The executor itself continues to receive no model input.

Frozen synthetic plain/linked-iframe/login checks and their canonical runner are registered in `docs/evaluation/application-form-inspection/`. Earlier Luna runs and the 2026-10-13 Sol low runs establish read-only retrieval through the OpenAI-hosted path; they do not establish compatibility with every employer form or successful submission.

Subsequent live-JD checks expanded retrieval from preparation-item selection to the full visible application input inventory. The inspector retains basic/contact/file/link fields, factual and written questions, choices and consent; the existing application analysis continues to decide which items need preparation. Ashby likewise retains its full public schema. Browser snapshots use accessible/native labels and surrounding DOM source text for unbound questions, preserve checkbox-group context, identify custom comboboxes and exclude hidden mirror inputs. An observed `_blank` link can be followed in the owned page without losing the browser reference. Public Lever/Ashby/Greenhouse evidence and the canonical live runner are registered as `live-v2`/`live-v3`; the earlier preparation-only synthetic gold remains frozen at v1, and full-inventory synthetic gold is versioned separately as inventory-v2.

## Apply with Harper improvements — 2026-10-13 (local, not deployed)

Both the applying planner and read-only fallback now default to GPT-6.1 Sol with explicit low reasoning. Existing independent model overrides remain available. New applying planners receive the actual initial page snapshot at creation, avoiding a model turn just to open/inspect the starting page. The existing browser tool can now fill multiple confirmed text/select/checkbox/file controls using refs from one snapshot. This batch cannot click, navigate, submit, authorize a request or name an arbitrary file path. All attachment IDs are owner-bound before the command is dispatched. A held request or invalid input interrupts the batch; remaining fields are completed only after inspecting the current page. The exact-request approval and duplicate-submission guard remain in place.

Text entry uses Playwright native fill/input events and blur, with retained-value and browser-validity checks. Approved long Korean answers are no longer typed one character per browser operation. The planner reuses returned snapshots, avoids unnecessary dropdown enumeration/reinspection and reads the actual receipt URL rather than guessing a confirmation route.

The production planner/tool/runtime passed a frozen owned ten-control application: one batch entered all ten fields including the PDF and two approved Korean answers; one submit click was held until explicit synthetic approval; exactly one matching-byte receipt was observed before the outcome report. Work including hosted setup took 110.406 seconds, cleanup-inclusive time 120.447 seconds, with three model tool calls. Costs were unavailable in the API aggregates and are not assumed zero. Frozen inputs/runner, manual review and limits are registered as product-submission-v5 in agents-hosted-resume-upload. The approval actor replaces chat UI/SessionStore; this is not a full UI or real-employer E2E claim.

Read-only Sol checks passed the existing inventory-v2 plain, linked-iframe and login gold in 147.731/78.850/79.823 seconds including cleanup, with zero observed fixture writes and zero executor model turns. All sessions/environments verified 404 deletion. Focused browser/inspection tests passed 27/27, and four attachment ownership/byte/export checks passed. Full-project TypeScript still reports two existing unrelated email-runtime errors; a separate scoped check covers the changed modules and canonical runner. Details: [product verification report](../evaluation/agents-hosted-resume-upload/reports/2026-10-13-apply-with-harper-product-ko.md).

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
