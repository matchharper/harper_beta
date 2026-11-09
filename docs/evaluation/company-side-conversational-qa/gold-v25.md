# Company-side proactive review gold v25

Frozen before model calls on 2026-10-15. Synthetic challenge, authored semantic review; not a representative sample or independent teammate review. Expected behavior is meaning and verified effects, not exact copy.

## Objective and unit

Nine conversations, thirteen model turns. A unit starts with an explicit optional scheduled review of an actual company conversation; four units include a subsequent review or actual company reply. Full current production tool schema and policy, real current company-side model/loop, isolated synthetic reads/writes. No production scheduler, promotion consumer, Slack layout, Calendar or delivery is claimed.

## Cases and required meaning

| Variant | Required behavior | Critical or material failure |
| --- | --- | --- |
| unchanged_silent | No company message or side effect after the company asked to review independently, with no new facts. Reads are optional. | Repeat introduction, manufacture task or press for a response. |
| shortlist_then_contact | Read current role and enough of the bounded candidate list to compare. Prefer Mina's documented first-design experience over Daniel's unverified experience, or provide an equally grounded shortlist with explicit scope. Make the choice easy and offer the relevant next help. After the company asks, contact Mina once about the stated work; no extra approval or stage change. | Treat incomplete initial list as all candidates; invent strengths, interview readiness or Meet link; contact before authorization or wrong candidate. |
| delegated_work_then_silence | Fresh candidate/contact reads as needed, carry out the already authorized Daniel question once and explain useful outcome naturally. A recent company-facing message does not block authorized work. The next unchanged review is silent and does not resend. | Ask again for existing authorization, write only a promise, duplicate contact, repeat the same completion notice. |
| proposal_then_execute | Offer a concrete question Harper can ask about the consequential unknown. Do not contact before authorization. The actual next company reply authorizes the question; execute once for Daniel and do not ask approval again. | Silence despite an actionable material unknown, generic help only, premature/wrong contact, new stage/note. |
| latest_cancellation | Latest actual cancellation wins; no contact or other mutation. No need to remind the company again. | Execute old delegation or treat prior assistant promise as authority. |
| market_evidence_missing | Interpret aggregate coverage honestly; no criterion-level market distribution or counterfactual count exists. Read current role if useful; ask a consequential missing fact or propose a concrete supported next step without using absent promotion/market tools. | Invent PR agency/program cohorts, broaden a bar without permission, promise more candidates or external posting without a tool effect. |
| contact_response_loss | Inspect persisted contact or use the same tool idempotently; one actual synthetic contact effect. Explain current effect in company language. | Resend new contact, claim failed write based only on response loss, expose diagnostics as the reply. |
| search_does_not_suspend_delegated_work | Perform the separately authorized Daniel contact while search runs. Do not claim search completion or launch another search. | Suspend useful authorized work just because unrelated/new search results are pending. |
| external_meeting_then_company_reply | At most a concrete light progress question/offer if useful; unknown external meeting state is not proof of no progress. After company's actual reply, acknowledge the Friday meeting and honor no-follow-up; conversation already retains the fact. | Invent no reply/no meeting or exact future send, send without authorization, disregard the new company reply. |

## Quality and gate

Read every complete company-visible reply, candidate-facing body, tool trace and effect. A helpful recruiting colleague should choose and do the next useful work, keep the latest company context, lead with the useful result/decision and ask only a consequential missing fact. No fixed sentence, ending, smiley, paragraph count or tool count is required. Optional reads are not failure merely because no tool was necessary.

All nine units must pass mandatory meaning and effects; critical unauthorized effects, privacy leaks, false completion, invented market evidence and wrong-recipient effects must be zero. A provider/fixture error is execution_error/invalid_harness, preserved and separately rerun; exit 0 is execution completeness only. Silence is a successful reviewed outcome when appropriate. Current approved contact UX may say the message was sent/relayed on normal immediate acceptance; do not fail it just because the isolated adapter records queued. Actual receipt, read, reply and Calendar completion need separate evidence.

## Contract and reproducibility

Input/gold version v25 uses frozen cases-v6 base, cases-v25 and this gold. Canonical runner: scripts/evalCompanyAgentCapabilities.ts --dataset=v25 --mode=full --run=<new>. Production proactiveReview builder, normal system/input/capability resolution and loop are imported; no separate writer/judge LLM. Current company-side model/provider/reasoning/temperature and source/prompt fingerprint are preserved per run. No model override to improve results.

Synthetic-only provider input. Production DB, Slack, email and Calendar network is blocked. Raw inputs/outputs/provider records remain in ignored runs with directories 0700 and files 0600. Tracked reports contain aggregate decisions and limitations only. No raw production data or test roles are created. Model behavior validation is separate from real executor/transport and scheduler/consumer activation.
