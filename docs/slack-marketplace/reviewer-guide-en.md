# Reviewer test guide — finish access setup before submission

App: Harper (`A0BLPDCB4LU`). Service: https://matchharper.com/org. Contact: Chris, chris@matchharper.com.

**Not yet provisioned:** a separate reviewer company account, verified sign-in instructions and synthetic candidate fixtures. Do not submit this guide as if they exist. Reviewers install Harper in their own Slack workspace; never provide Harper staff Slack credentials or a live customer account.

## Review sequence

1. Sign in using the dedicated test-company access supplied privately with the final submission. Confirm the company contains only fictional data and no real candidates or customer conversations.
2. Open Organization → Integrations and choose Connect Slack. Select your own Slack workspace, approve the documented permissions, and return to Harper to verify connection status.
3. Create a dedicated hiring channel in your Slack workspace and select it in Harper. The bot must be the production **Harper**, not Harper Local. For a private channel, invite Harper with `/invite @Harper` first.
4. Send `@Harper What can you help our hiring team with?` in the connected channel. Confirm the response is useful and appears in a thread. Continue a harmless conversation in that thread to verify context. Role-creation and candidate-action tests use only the pre-provisioned fixtures described below.
5. Open the synthetic Role and candidate cards supplied with final test access. Compare a suggested candidate with a candidate who accepted the Role and is waiting for the company. Verify status distinctions and fixture-safe actions without contacting a real person.
6. Share the supplied fixture’s Harper link and confirm the authorized preview/work object. Test a synthetic job document without private personal data. Record the response and any missing-scope error.
7. Verify candidate detail/decision authorization using a dedicated authorized account and a dedicated unauthorized account. Check private-channel content exposure in both Slack and Harper web. Do not use unrelated real accounts for these tests.
8. Verify an unconfigured channel does not begin a recruiting conversation. Cancel an OAuth attempt, remove a configured channel, and check those actions have the expected effect.
9. Disconnect this dedicated integration, reconnect, and finally uninstall the app from the review Slack workspace. Confirm replies stop and the connection becomes inactive. Existing company conversation records are not automatically erased; use the documented personal-data request process.

## Fixture constraints

Prefer a non-production Harper database. If testing the production app requires production company-side fixtures, follow `docs/test-internal-role-isolation-ko.md` and the root AGENTS.md before writing data. A Role must have `information.testOnly = true` and a stable `testFixture` **before insertion**. Any direct recommendation requires dedicated account IDs explicitly allowlisted in `information.testTalentIds`. Verify no fit rows; perform exact-ID cleanup immediately after the test and do not leave an active test Role behind. A test-looking name or internal workspace is insufficient.

A prepared candidate name such as Alex Morgan or Jamie Park is only a fictional label, not an existing fixture. Final instructions must reference actual safely provisioned fixtures and clearly specify which actions have no real-world recipient.

## Assets to capture

Capture actual production-app UI in a dedicated review environment, using synthetic data only. Required listing dimensions are 1600×1000, PNG/JPG, under 2 MB per file, up to six images. Do not substitute generated mockups, Harper Local screens, or the public installation guide for evidence of the app.

1. A connected channel with a helpful @Harper mention/thread conversation.
2. Synthetic candidate review showing the candidate’s real displayed status and relevant actions.
3. A supported fixture link preview or work object with appropriate access.

Create a short install-to-uninstall demonstration: open public installation guide → company sign-in → integration authorization → selected channel → mention/thread → fixture candidate/preview → disconnect → reinstall → uninstall. Show the real experience; omit credentials, authorization tokens, real resumes and unrelated browser tabs. The submitted video must be accessible to Slack’s reviewers without asking Harper to approve each view.

The current evidence screenshots only verify setup changes and the local public guide. No Marketplace app screenshot or demo video is complete yet.
