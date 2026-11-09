# Search OS — five additional repetitions, 2026-11-09

Requested continuation of the [three-startup review](2026-11-09-startup-email.md). Run the existing `startup-email-v1` Search OS FDE case five more times, resetting the same six-opportunity checkpoint each time. Exact user text: `Search OS · FDE에 지원해줘.` with the normal role mention and Apply saved-interest action. No email, recipient or source hints are added.

## Configuration and evidence

- Canonical runner: `scripts/evalCareerScenarios.ts --registry docs/evaluation/career-application-scenarios/startup-email-v1.json --only search-os-fde --repeat 5 --label search-os-five-more --execute`.
- GPT-6.1 Terra, reasoning high; product guidance, application handbook `2026-11-09-v12`.
- Checkpoint: `305a0b34a2af27d9bb99edcb3db3ff0515b989dad42652824223c06bcde1547c`.
- Private owner-only evidence: `runs/2026-11-08T18-03-12-342Z-search-os-five-more/`. Source snapshots match the preceding six-case run exactly. No product edits during these repetitions.
- Real model, research, browser preparation, document/form persistence and final replies. Server runtime evaluation; no rendered UI clicking. Employer email and application submission are blocked at the executor boundary. Applicant verification side effects, if any, are reported separately.

## Manual review

| Additional run | Minutes | Recipient and saved email | Final presentation / remaining work |
| --- | ---: | --- | --- |
| 1 | 7.11 | Official recruiting email independently found; recipient, subject, body and exact tailored resume revision saved in form. | Email selected as primary. Review/approval form and Gmail connection shown. Conflicting source dates disclosed; approval and connection pending. |
| 2 | 9.45 | Official recruiting email found; complete email draft and exact resume revision saved in form. Resume also attached to official application. | Visible form offers official form (default) or founder email, explicit approval/hold and unchecked privacy consent. Missing web-form personal facts and authorization remain. |
| 3 | 3.48 | Official and founder recruiting email found; recipient, editable subject/body and exact resume revision saved in form. | Email primary; form approval/revision and Gmail connection shown. Three internal capability-loader calls rejected UI status metadata, so final reply also reports unavailable sending capability. |
| 4 | 8.70 | Official/founder email found; recipient, subject, body and proposed resume saved in private mail document. Resume attached to official form. | Final reply links alternative mail draft. Official application primary; visible form gathers missing personal facts rather than final email approval. |
| 5 | 9.95 | Official/founder email found; complete mail draft and proposed resume revision saved privately. Official form/resume also prepared. | **Email not surfaced:** final reply and visible form only cover official application and personal facts. The email document is only in relatedRefs, which does not render a document link. |

All five executions completed with no terminal runtime failure. Human review of sources, saved documents/forms and final replies gives:

- Public recruiting recipient discovery: **5/5**, consistently `evan@searchos.io`.
- Durable recipient + subject + body + proposed resume preparation: **5/5**.
- Email draft surfaced through the final reply or its visible form: **4/5**. Run 5 saves it but does not show it.
- Email selected as primary: runs 1 and 3. Run 2 recommends official form but offers an email choice; runs 4 and 5 prioritize official form.
- Runs 1–3 include review/approval actions; runs 4–5 first request personal facts. No user approved or sent anything. Gmail connection and appropriate final review remain before sending.

Saved form content counts as a durable email draft; a separate markdown document is not required. Reviewable preparation does not mean a Gmail draft, delivery or application submission. The two earlier Search OS runs plus these five yield **7/7 saved drafts and 6/7 surfaced drafts**, under the same captured product source and fixture. This is observed behavior in seven live runs, not a guaranteed general success rate.

Latency is still substantial: **3.48–9.95 minutes, median 8.70 minutes** per new case, including reset and cleanup. Browser inspection/attachment is the main observed wait. One open_url text extraction exception in run 1 recovered; internal loader failures in run 3 are detailed below. No actual employer send, application submission or blocked delivery attempt was recorded.

All six owned browser-session cleanup receipts report `closed`. Each case resets the same account, so the live account retains the final run's materials; earlier states are captured privately. Product code and frozen inputs were not changed; no deployment occurred.

## Additional finding: capability-loader rejection

Run 3's native provider transcript contains three failed `load_career_capabilities` calls. They ask for real catalog IDs, but also include `_uiStatusMessage`, which the loader schema does not advertise. `CareerCapabilityRuntime.load` requires exactly one input key and returns `invalid_capability_ids` for an extra key, listing the requested IDs as available. Thus the request violates the schema, while the returned error misidentifies the reason. Browser/document tools already available to the turn still work; the model saves and presents the email draft, but its final reply also reports that it could not load sending capability.

These are internal loader failures, so they do not appear in the runner's domain-tool `calls` exception array. Review used raw provider inputs and outputs as well. They are not send attempts and were not caused by the test's delivery blocker. No product fix was made during the requested fixed-condition repetitions.

The first Terra input of all five runs was checked directly: the ordinary Apply request and stored `2–10 team members` range are present, and `evan@searchos.io` is absent. This check is preserved privately in `input-review.json`; the agent discovers the address through live research.


## Run 5 presentation gap

The mail was successfully saved, but `suggest_form.items` contains only application facts, the resume and personal questions. The email document appears only in `relatedRefs`. `CareerFormCard` renders form items; the related-reference projection only uses browser references to associate cards with replies, not to render document links. The final assistant message also omits the email. This locates the observed omission in the generated artifact/reply presentation, rather than a failed save or a broken email link. The report does not claim that rendered UI interactions were exercised.
