# Company Intro → original Career agent, 2026-11-06

Code is local; production DB preparation was applied on 2026-11-06 (see rollout history). No app deployment, candidate email or company message was executed. The new app explicitly calls `request_company_intro_for_career_v1`; old deployed callers retain legacy delivery.

Request Intro now atomically saves the existing `intro_request` recommendation/list membership and one immediate `career_agent_v1` invocation. The Worker hands it to the existing original Career runtime. The first model input includes the candidate-safe company description, full JD, location/work/compensation, exact company-authored appeal, recommendation/link and previous Role feedback, through `formatCompanyIntroContext`. Private company Hiring Brief and selection evidence are not copied. The common user profile, conversation and tools remain owned by Career.

`contact_user`/`deliver_career_email` write the candidate-visible text. Actual chat/email receipts update `candidate_sent_at` and feed the existing 3/9/18-day follow-up source. Quiet LLM completion is not delivery. Source/owner/consent checks run before composition and again at send admission. Chat and email receipts cannot obscure a pending email outcome. Legacy already-running Worker invocations are not replayed by the migration.

## Validation

- 6 new formatter/loader and PGlite tests pass (including old-caller compatibility and no rerouting on retry): immediate recommendation/list membership, idempotent request, same-run ownership, consent/block/test-fixture boundaries, actual chat/email receipts, source withdrawal, send admission, follow-up body and dates, email-pending outcome after chat.
- Existing background delivery tests: 13 pass. Existing background DB/recovery tests: 16 pass. Existing Worker handoff tests: 16 pass.
- `git diff --check` passes.
- `pnpm exec tsc --noEmit --incremental --pretty false` passes. At the user's request, the existing external salary-fill call now passes only present Role IDs using `flatMap`, fixing its nullable-ID array type error while preserving the other local changes.

## Model input and output review

Frozen dataset `company-intro-v1`; configured ordinary Career model resolved to `gpt-6.1-terra`, high reasoning. Final run: `runs/2026-11-06T08-53-47-592Z/`. Both complete first provider requests contain the entire public JD and company appeal. Both cases call the ordinary email delivery tool once, with no acceptance, company sharing, new search or recommendation publication.

- Fresh company interest: subject “Cedar에서 윤서님께 연결을 요청했어요”. The body explains the company's interest, platform ownership, role and employment facts, preserves uncertainty about on-call, and links to the saved Role.
- Previous decline: the body refers to the candidate's prior request to hear again if conditions change, distinguishes the new two-day office schedule from still-unresolved on-call conditions, and leaves the decision to the candidate.

The first diagnostic run (`runs/2026-11-06T08-48-55-629Z/`) remains preserved. One case supplied an Intro ID as `sourceIds`; the normal tool rejected it before delivery and the original agent corrected its call. The phrase “existing introduction flow” in source facts leaked into awkward Korean wording. The source phrase was simplified, then the same frozen cases were run again; the final run has neither tool error nor that implementation phrase. No semantic output validator, additional judge or hidden regeneration was added.

Limits: synthetic provider/tool-loop evaluation, not production queue/browser/provider delivery. Tool effects are isolated receipts. In particular the existing harness's action-item stub does not persist created items, so repeated action-item writes in traces are not evidence about production action-item idempotency. Candidate email bodies and actual initial model inputs were read in full; no statistical reliability claim is made.
