# LinqAlpha web and email preparation — 2026-11-09

Status: **existing-history recovery passed twice; fresh web preparation is not revalidated**. Application handbook v16 is implemented locally. Two actual model/tool/persistence runs now save and present the complete recruiting email alongside the earlier web preparation. Local browser interaction also verified reopening and single-form placement. No deployment was performed.

## Frozen input and execution

`linqalpha-chat-v1`, the authorized QA account and six-opportunity checkpoint. Exact user message: `링크알파 지원해줘`, without Apply metadata, email instructions or preparation hints. GPT-6.1 Terra, high reasoning. Shared external JD points to the user-requested Greeting application URL; the operating DB update was read back and the public URL returned HTTP 200.

Private run: `2026-11-09T01-39-18-619Z-linqalpha-dual-v14`. The actual provider input contains the exact user message and v14 dual-preparation handbook. One web search used `"링크알파코리아" 채용 hiring founder LinkedIn email`. The official LinkedIn recruitment post published recruiting-contact addresses; it describes web applications and email/coffee-chat inquiries separately.

## Live result

- Elapsed: 606,901 ms (10m07s), including setup and cleanup. This is not a fast demo result.
- One browser session, three sequential preparation runs. Later runs reused the session to inspect email verification and resolve conflicting consent observations. No simultaneous new browsers.
- The browser reported accepted name, email, phone, Korea location, career/portfolio URLs, and an uploaded resume PDF. It reported sending an applicant verification email after clicking the site's verification control; it did not verify the applicant's inbox or complete authentication.
- Two personal-data consents were ultimately observed as required; third-party consent was optional. The site's label and explanatory text differed for one item. No consent was selected and no application was submitted.
- The final saved response referenced a real review form with the resume, web preparation and remaining questions. **It omitted the recruiting email entirely**, despite the source and v14 instructions being present. No email subject/body was saved by this test.
- The first resume save failed because optional `source_refs.entry_id` accepted only UUIDs while the model used a numeric profile entry identifier. Its next save succeeded after omitting that field.
- Completion raised `Career reply claim lost before completion`. During the run, a separate, non-test user message requested a Wonderful FDE introduction in the same account. A second application invocation processed that request and also read the LinqAlpha preparation. The legacy direct test turn held an eight-minute claim without the normal inbox path; the other invocation acquired the conversation after expiry. This run therefore cannot establish isolated end-to-end reliability.
- A second repetition stopped before restoring the baseline because another operation was active. The non-test introduction created new company-contact history; that history was not removed or rewritten. The test-owned browser is confirmed closed.

## Corrections and bounded verification

The v15 handbook places both outcomes in the goal, distinguishes formal application intake from published recruiting contact/coffee-chat email, and prepares the resume and contact draft before web work. The contact email must not claim to replace the official application. A final form includes web state, editable email subject/body, recipient/source and the exact resume revision. Gmail connection and authentication remain execution requirements; private preparation does not imply a delivered email.

The resume source annotation now preserves its original identifier format. Ownership continues to be verified using `kind` and `id`; the unused UUID restriction on annotation metadata is removed. A reproduction test accepts numeric annotations, and source-unavailable/lookup-failure tests still prevent saving an unverified source.

The canonical runner now checks for non-test user messages before another reset, tool execution or assistant persistence, preserving concurrent real conversation activity rather than treating it as part of the frozen case. This is test isolation, not a production conversation-policy change.

Read-only decision probe: `2026-11-09T01-51-41-624Z-decision-probe`, using the exact captured request immediately before the defective review form. Only the application handbook body changed; all observed sources, browser results, history, tools and model configuration stayed fixed. Each arm was repeated twice:

| Arm | Web state in proposed form | Complete recruiting email in proposed form |
| --- | --- | --- |
| Captured v14 | 2/2 | 0/2 |
| Current v15 | 2/2 | 2/2 |

Both v15 proposals contained `operations@linqalpha.com`, editable subject/body, the same resume revision, source context and an explicit optional email choice. Both correctly treated it as recruiting outreach alongside the web application. These returned tool calls were **not executed**: they do not prove form persistence, rendered interaction, final inline presentation, a fresh-account run, Gmail readiness or delivery. The comparison supports the guidance correction at this decision point, not a universal reliability claim.

Focused capability/lifecycle/history checks passed (45 tests), actual-provider-input tests passed (5), the new annotation reproduction and existing source checks passed, and final TypeScript/scoped lint checks passed. No employer sending or application submission was executed by the test runner. The separate Wonderful introduction is outside this test and must not be erased by its reset.

The later preserved-history retest below completes the baseline and saved-form checks. Fresh browser preparation and its latency remain distinct from that retest; the diagnostic probes alone never established them.

## Quality follow-up

The source review found three instruction/execution-contract mismatches. The dual-preparation goal now explicitly concerns external postings, rather than also directing an internal introduction to prepare web/email applications. The one-search limit concerns finding a recruiting email, not independent research to recover a blocked/stale web intake. A shared `effect_key` is retained for retries or alternative transports of the same submission; a separately approved recruiting contact has its own purpose and identity. This avoids suppressing a distinct authorized contact after a web submission while preserving duplicate-effect protection.

The evaluation runner had no host deadline, whereas the web path supplies a 200-second budget. It now supplies that budget and uses its existing checkpoint/continuation path, allowing a long browser operation to finish without holding an expiring direct claim. Foreign-input errors now use `TOOL_RUNTIME_CONTROL`; a real provider-adapter test verifies one provider request and immediate propagation instead of further model/tool retries. Checks also cover finalization, followup insertion and the dependency-wait loop. Failed domain calls are flushed to their artifact even if no later call succeeds. No product lease, DB receipt or ownership check was weakened.

The existing browser, provider continuation and form execution tests passed (42 tests). The two isolation tests passed after fixing a missing system-block argument in the new test harness. Four DOM interaction tests passed for grouped answers, retry identity, stale revisions, checkbox defaults, displayed selected labels, lost HTTP replies, retained drafts and moving form references. An initial UI invocation named a nonexistent test file and was corrected before execution. TypeScript and scoped ESLint passed.

Repeated the same captured next-decision comparison with v16: private run `2026-11-09T01-56-08-298Z-decision-probe`. Captured v14 again omitted recruiting email in 2/2; v16 included recipient, subject, body and the same resume in 2/2. The actual returned form objects passed the product form parser, and all consent/email opt-in checkbox initial values were false, including a text-valued consent item. Returned calls were not executed. This adds evidence at the failing decision point, not a live end-to-end or latency pass. The account's new company-contact history was not reset for this audit.

## Preserved-history live retest and UI review

The user confirmed the account was no longer being used elsewhere. A separate read-only checkpoint captured all current history, including the real introduction, rather than weakening reset guards or erasing that activity. Frozen `linqalpha-chat-v2` preserves 61 messages and 5 documents. The original six-opportunity checkpoint remains unchanged. Each repetition restores this new checkpoint and sets the selected LinqAlpha opportunity to new; it sends exactly `링크알파 지원해줘` with no Apply metadata or email hints. The actual provider input contains v16 and GPT-6.1 Terra high.

Private run: `2026-11-09T02-01-50-921Z-linqalpha-v16-preserve-intro`.

| Repetition | Time | Actual calls | Saved/presented result |
| --- | --- | --- | --- |
| 1 | 58,704 ms | form read, action-item list, form update | Web preparation summary, resume revision 1, published recipient, editable subject/body, unchecked separate email choice; one final inline form reference |
| 2 | 76,049 ms | Same three calls | Same outcomes; recipient shown with source in markdown, editable subject/body, unchecked separate email choice; one final inline form reference |

Both updated the same existing form from revision 1 to 2 with no recorded tool/runtime errors. Both reused the prior real browser receipt and resume; neither launched a browser or sent another applicant verification email. Both explicitly state that the browser has closed and that inputs/attachments must be prepared or checked again on submission. Therefore these times measure recovery using existing research and preparation, not a fresh browser application. Neither result establishes an authenticated, live ATS session ready for immediate submission. Conflicting career dates, consent and possible site verification remain visible; Gmail connection is required to send the contact email.

Localhost UI review used the same authenticated account. The final form rendered its resume, source, email subject/body, and unchecked privacy/email choices. Clicking the home follow-up sent its ordinary stored “show the review again” request; it completed in 15 seconds and referenced the existing form without starting a browser. Only one editable form remained at the latest reference. Clicking an earlier chat reference scrolled to that latest form. No approval, consent, upload or employer-send button was pressed during this UI review. The follow-up's elapsed time is a UI observation, separate from the two frozen runs.

A final read-only snapshot at 11:06 KST verified unchanged company follow/followup records, contact queue, career emails, delivery records and meeting/agent schedules against the preserved baseline. There was one additional completed Career invocation for the UI reopening request, with no new external-send operation. A background candidate evaluation added one row; it was preserved rather than reset. All original message IDs remain present. No real introduction was erased, no employer email was sent, and no application was submitted by these tests.

The new checkpoint capture/resolver passed TypeScript and scoped ESLint. The earlier focused browser/provider/form/isolation checks remain applicable. Still outstanding for a fresh-demo readiness claim: repeat the full browser preparation under the new handbook and measure its cold-path latency. The earlier 10-minute browser result must not be replaced by the 59–76-second recovery times.
