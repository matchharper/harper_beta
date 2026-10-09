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
