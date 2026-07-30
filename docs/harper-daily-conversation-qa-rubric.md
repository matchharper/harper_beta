# Harper Daily Conversation QA Rubric

- Version: 1.2
- Last updated: 2026-07-29
- Applies to: `Harper Daily Conversation QA`
- Default audit window: the previous complete KST calendar day

## 1. Purpose

This document is the stable source of truth for Harper's daily user-experience
QA. The daily automation must read this document before each audit and use the
same definitions, severity levels, sampling rules, and output structure.

The audit has two distinct goals:

1. Find user-impacting errors and conversation-quality failures.
2. Evaluate external and internal recommendation quality separately and derive
   evidence-backed improvements.

The audit is read-only. It must not modify production data, repository files,
or external messages. It must never send a Slack message.

## 2. Non-negotiable judgment rules

1. Judge user impact, not the presence of an error label alone.
2. Treat Harper's claims about actions or facts as valid only when supported by
   the corresponding source of truth.
3. Do not count a recovered or intentional guardrail failure as an unrecovered
   user-facing failure.
4. Treat hard eligibility failures as invalid recommendations, not weak
   preferences.
5. Read the surrounding conversation before classifying an individual message.
6. Do not turn one anecdote into a product insight unless it is severe by
   itself. A recurring insight needs at least two independent conversations or
   a quantified cohort.
7. Separate confirmed findings, probable findings, and items needing
   verification.
8. Group incidents with the same root cause and report both incident count and
   affected-user count when possible.

## 3. Time window and evidence

### 3.1 Target window

- Count incidents and messages created during the previous complete KST day,
  `00:00:00` through `23:59:59`.
- To determine whether a target-day failure later recovered, read subsequent
  events through the audit execution time. Do not count those later events as
  target-day incidents.
- For onboarding-to-recommendation SLA checks, include cohorts whose SLA
  deadline expired during the target day.
- In addition to the target-day audit, compute a rolling comparison over the
  preceding seven complete KST days when the data source permits it. Use this
  comparison only to identify recurrence, concentration, and direction of
  change; do not add older incidents to the target-day incident count.
- Normalize comparable issues by root-cause signature and product stage so the
  report can distinguish a recurring problem from a one-day anomaly. At
  minimum, compare failed/recovered run classes, conversation complaint
  categories, wrong-language exposure, onboarding-to-value failures, and
  external/internal recommendation-quality signals.
- If no durable historical finding store exists, derive the seven-day baseline
  directly from source data and state which signals could not be reconstructed.
  Never infer a trend from the target day alone.

### 3.2 Preferred evidence order

Use the most direct source available:

1. Database side effect or deterministic status record
2. Tool result, worker/run state, delivery record, or structured log
3. User and assistant message content with surrounding context
4. Inference from multiple consistent signals

Never present an inference as a confirmed fact.

For external-role availability, a database `active` flag is not sufficient
proof that a posting is open. Confirm an invalid posting from explicit user
evidence or a live check of the original URL. When network access is available,
live-check up to 20 high-risk URLs selected from complaints, negative feedback,
old posting dates, and source inconsistencies. If live checking is unavailable
or blocked, label availability as `Needs verification`.

### 3.3 Evidence-query safety

- Do not select or print raw `coverage`, `payload`, `meta_data`, email body, or
  similar JSON/text blobs. They may contain email addresses, names, reply
  addresses, resume material, or provider details.
- Query allowlisted scalar fields and aggregate counts. Extract only the exact
  nested error/status/reason field needed for the judgment.
- Redact any unexpected PII before it enters notes or task output.

### 3.4 Privacy

- In the routine report, use only the first eight characters of
  `conversation_id`, `run_id`, or similar identifiers.
- Omit names, email addresses, phone numbers, resume text, signatures, and
  other PII.
- Use a name only in a separate, explicit follow-up request from an authorized
  operator.

## 4. Severity and confidence

### 4.1 Severity

| Level | Meaning | Typical examples |
| --- | --- | --- |
| `S0 Critical` | Immediate trust, privacy, or multi-user risk | Cross-user data exposure, wrong recipient, opt-out violation, fabricated important external action, widespread core-path outage |
| `S1 High` | A user was materially blocked or seriously misled | Invented internal-opportunity status/date, unrecovered recommendation failure, all delivered roles invalid, promised retry never queued |
| `S2 Medium` | Degraded experience with a workaround or limited scope | Repeated question, wrong language fragment, recovered tool failure with poor explanation, one mismatched recommendation |
| `S3 Insight` | No direct incident, but repeated evidence supports improvement | Recurring explanation weakness, inventory gap, confusing follow-up pattern |

If one root cause affects multiple users, raise urgency even when each
individual incident would otherwise be `S2`.

### 4.2 Confidence

| Label | Rule |
| --- | --- |
| `Confirmed` | Direct message plus deterministic DB/tool/log evidence, or an explicit user-visible contradiction |
| `Probable` | Multiple consistent signals, but one source of truth is missing |
| `Needs verification` | Plausible issue with insufficient evidence or ambiguous context |

Only `Confirmed` findings may be written as facts. Phrase other findings with
their confidence label.

## 5. Failure classification and root-cause analysis

Every `failed`, `partial`, timed-out, or tool-error event must be assigned one
of these outcomes:

| Outcome | Definition |
| --- | --- |
| `user_impacting_unrecovered` | The user did not receive the expected value and no successful recovery occurred |
| `user_impacting_recovered` | The failure was user-visible, but a later retry or fallback delivered the expected value |
| `silent_recovered` | The failure was not user-visible and a later attempt succeeded |
| `benign_guardrail` | The failure represents intended protection, such as a duplicate-prevention guard, with no lost user value |
| `observability_only` | The status or log is wrong, but the user-facing result completed correctly |
| `needs_verification` | Evidence is insufficient to determine impact or recovery |

For each non-benign failure, identify:

- failing component and step;
- normalized error signature;
- affected trigger/run mode/tool;
- whether the user saw an error or misleading promise;
- retry/fallback existence and result;
- final DB side effect and delivery state;
- likely root-cause category.

Use one of these root-cause categories:

- `infra_db`
- `provider_model`
- `schema_parse`
- `worker_orchestration`
- `tool_contract`
- `prompt_reasoning`
- `data_quality`
- `inventory_gap`
- `delivery_ui_tracking`
- `ops_process`
- `unknown`

## 6. Sampling and direct-message review

Quantitative and structured checks should scan all relevant target-day rows.
Direct message reading uses risk-based sampling.

### 6.1 Candidate generation

Generate candidates from the full target-day message set using:

- explicit anger, complaint, correction, or repeated question;
- unanswered user message or unusually delayed response;
- apology, contradiction, uncertainty, or research/tool error;
- action claims such as saved, sent, shared, connected, retried, or completed;
- expired, closed, invalid, wrong-link, or unavailable-role language;
- locale or script mismatch;
- internal-opportunity status, date, resume-share, or company-response claims;
- recommendation feedback, rejection, or repeated recommendation;
- onboarding completion followed by missing or invalid recommendation value;
- failed/partial/stale runs and tool failures;
- abrupt abandonment after a substantive request.

### 6.2 Priority

Review in this order:

1. `S0`/`S1` candidates and explicit complaints
2. Post-onboarding conversations
3. Final onboarding turns and the onboarding-to-recommendation boundary
4. Internal/external recommendation conversations
5. Earlier onboarding conversations

When the day contains more than 1,000 messages, reserve at least 70% of direct
review capacity for post-onboarding and late-onboarding messages.

### 6.3 Review size and context

- If there are at most 1,000 messages, read all of them.
- Otherwise, directly inspect up to 1,000 risk-prioritized target-day messages.
- For every selected candidate, load enough adjacent messages to understand the
  complete request, Harper response, correction, and outcome. Prefer the whole
  compact episode; otherwise use at least five messages before and after when
  available.
- Context rows may extend beyond the target day and do not change the incident
  date.
- Report total target-day messages, selected messages, context messages, and
  reviewed conversations separately.
- Maintain a deduplicated review ledger while auditing:
  - selected target-day message IDs;
  - context-only message IDs;
  - reviewed conversation IDs.
  Derive coverage counts from these sets rather than estimating them manually.
  If the execution environment cannot meter one of these sets, state that
  limitation instead of inventing a count.

## 7. Core conversation and system checks

### 7.1 Explicit user-impacting errors

Check:

- chat response or message-save failure;
- user message without a later assistant response;
- call save, transcript, wrap-up, or terminal-state failure;
- stale `pending` or `active` calls;
- `opportunity_discovery_run` failed, partial, or stuck;
- recommendation creation, storage, delivery, and visible-message mismatch;
- failed or skipped delivery/email without a valid reason or fallback;
- invalid recommendation URL, role, or company mapping;
- LLM/tool JSON parsing, timeout, rate-limit, provider, or DB errors.

Ignore console warnings and internal errors that demonstrably have no user
impact.

### 7.2 Action-claim integrity

Whenever Harper claims it saved, updated, sent, shared, connected, scheduled,
retried, completed, or will follow up automatically, verify the corresponding
side effect.

Classify as `S1` when an important action is claimed as completed without
evidence, or when an automatic future action is promised but not queued.

### 7.3 Factual grounding and consistency

Check for:

- invented or changing status, dates, company decisions, or resume-share facts;
- company, role, funding, compensation, location, or URL contradictions;
- claims of "confirmed records" without a deterministic source;
- conflicts with previous turns or known structured data;
- confident answers after an earlier admission that the information is
  unavailable.

Internal-opportunity status and chronology must come from deterministic status
data, not free-form inference.

### 7.4 Memory and preference integrity

Check whether Harper:

- asks again for information already provided;
- ignores a correction or returns to a stale value;
- claims a profile/preference update that is not persisted;
- applies one channel's update inconsistently in another channel;
- treats rejection of an invalid/expired role as a negative taste signal;
- repeats a blocked company, rejected role, or equivalent opportunity.

### 7.5 Conversation outcome

Check whether the user actually received the requested value:

- direct answer versus generic response;
- repeated follow-up questions without execution;
- failure message without fallback, retry control, or honest limitation;
- explicit frustration, anger, abandonment, or repeated request;
- assistant response present but substantively non-responsive;
- premature closure or unnecessary continuation after the user is done.

### 7.6 Privacy and target integrity

Always check for:

- another user's name, profile, experience, or recommendation;
- wrong email/message recipient;
- opt-out violation;
- cross-conversation memory leakage;
- recommendation or internal opportunity associated with the wrong talent.

Any confirmed case is `S0 Critical`.

## 8. Language and locale checks

### 8.1 Candidate detection

Treat the following as candidates:

- any Hangul in the current schema path
  `company_roles.summary.en.content` (and in
  `company_roles.summary.content.en` only if a legacy row actually uses that
  shape);
- any Hangul in assistant-visible content for a user whose effective locale is
  English;
- unintended English template/error text for a Korean-locale user;
- mixed-language sentences or a return to the old language after a language
  switch;
- locale mismatch in chat, recommendation copy, email, company snapshot, call
  transcript summary, or wrap-up.

### 8.2 Effective locale

Determine locale in this order:

1. User's latest explicit language request
2. Sustained language in recent substantive user turns
3. Language of the current direct user request
4. Persisted preferred locale
5. Older conversation language

Two consecutive substantive user turns in another language are enough to
override a stale persisted locale. A direct request such as "answer in English"
or "한국어로 답해줘" overrides everything immediately. A single borrowed word,
proper noun, pasted JD, URL, or quoted document does not establish a switch.

Audit both directions:

- English user context receiving Korean assistant output
- Korean user context receiving English assistant output

Do not limit candidate generation to users whose persisted locale already
matches the expected language; stale locale values are themselves a likely
cause of wrong-language responses.

### 8.3 Exemptions and severity

Exclude:

- user-authored text;
- clearly marked quotations of user-authored text;
- unavoidable official Korean proper nouns when the surrounding explanation
  remains in the correct language.

Any Hangul in an English field or assistant output remains a review candidate.
Classify actual user exposure as:

- `S1` when a substantial card, summary, or answer is in the wrong language;
- `S2` for a limited fragment that harms polish or comprehension;
- `S3/data_quality` when stored content is wrong but was not exposed.

Report both stored-content anomalies and confirmed user-visible exposures.

## 9. Onboarding-to-value checks

Build a cohort of users whose recommendation promise SLA expired during the
target day. Use the product's configured SLA; if it cannot be determined,
state the assumed window and mark it for verification.

Anchor the SLA at the earliest deterministic promise that applies to the user:

1. Harper explicitly says a search has started and gives an expected delivery
   window; or
2. the user explicitly opts into external recommendations and Harper confirms
   that the first external search is running; or
3. a recommendation run/tool is actually queued.

Do not start the external-recommendation SLA from onboarding completion alone
when the user has not opted in, selected direct connections only, or has not
answered the channel question. Do not treat a possibly stale
`get_external_recommendation` setting as stronger evidence than the user's
latest explicit choice.

For every user without a valid delivered recommendation, determine the first
broken stage:

1. onboarding completion not recorded;
2. discovery run not created;
3. run queued/running beyond SLA;
4. run failed or partial;
5. completed run produced zero recommendations;
6. recommendation stored but not delivered;
7. delivery sent but inaccessible or missing in chat/email;
8. recommendations delivered but all invalid, expired, duplicate, or hard-fit
   mismatches;
9. user received value after the SLA through a later recovery.

Report affected-user counts by root cause, not only the total without
recommendations.

Distinguish these zero-result outcomes:

- search or tool was never triggered after a concrete promise;
- search ran and found no inventory, but the user was not told;
- search ran, found no inventory, and the user received an honest no-result
  explanation;
- valid recommendations arrived after the stated SLA.

## 10. Recommendation quality evaluation

Recommendation quality is a separate report section from conversation/errors.
Evaluate external and internal recommendations independently.

### 10.1 Shared definitions

A recommendation is:

- `Invalid` if the role is unavailable, the URL/role/company mapping is wrong,
  or a hard user constraint is violated.
- `Valid but weak` if it is actionable but poorly matched, repetitive, or
  insufficiently explained.
- `Good` if it is actionable, respects hard constraints, is meaningfully
  relevant, and has a grounded explanation.
- `Needs verification` if availability or source-of-truth data cannot be
  established.

Do not average away invalid recommendations with high fit scores.

For each source type report, where data allows:

- recommendations delivered and users reached;
- valid / invalid / needs-verification sample counts;
- expired or closed rate;
- hard-constraint violation count;
- wrong-link/company/role mapping count;
- duplicate or previously rejected recurrence;
- explicit positive/negative feedback and complaint count;
- users who received no good recommendation;
- top repeated root causes.

Always give the denominator and the evaluated sample size. Never label the
unevaluated remainder as valid. If only complaint-linked and stratified samples
were inspected, report `sample Good / Invalid / Valid but weak / Needs
verification` rather than presenting those counts as the quality rate for all
recommendations.

### 10.2 External recommendation quality

Evaluate these dimensions:

1. **Availability and freshness**
   - role still accepts applications;
   - source URL resolves to the intended role;
   - stale or closed roles are excluded before delivery.
   - a source-table `active` status without a live/user confirmation remains
     `Needs verification`, not `Good`.
2. **Hard eligibility**
   - location, remote requirement, visa/work authorization, employment type,
     seniority boundary, and blocked companies;
   - distinguish must-have constraints from soft preferences.
3. **Current request match**
   - the latest explicit request is the primary retrieval target;
   - broad profile context must not override the current request.
4. **Profile fit**
   - skills, scope, domain, leadership/IC preference, and plausible seniority;
   - no unsupported claim that the user has a required qualification.
5. **Novelty and diversity**
   - no previously delivered role, equivalent fingerprint, rejected role, or
     excessive same-company concentration;
   - inventory gaps should not be disguised as personalization.
6. **Explanation quality**
   - fit reasons and tradeoffs are grounded in the user profile and role;
   - uncertainty is explicit;
   - CTA and role details are consistent with the stored recommendation.

Sampling:

- inspect all externally recommended roles tied to explicit complaints,
  negative feedback, expired-role signals, or tool/run failures;
- add a stratified sample across trigger, locale, and delivery channel when
  volume remains;
- live-check up to 20 original posting URLs from the highest-risk sample when
  network access and the source site permit it;
- identify whether the dominant problem is retrieval, source freshness,
  shortlist/final selection, explanation, delivery, or inventory.

### 10.3 Internal recommendation quality

Evaluate these dimensions:

1. **Role and company truth**
   - company, role, status, and presented details match internal source data;
   - no public/external role is confused with an internal opportunity.
2. **Fit and selectivity**
   - recommendation is supported by concrete user evidence;
   - dealbreakers and blocked companies are respected;
   - the rationale does not overstate the user's experience.
3. **Acceptance and handoff integrity**
   - accept/reject feedback is stored correctly;
   - accepted opportunities enter the expected ops/handoff flow;
   - claims of resume sharing, company awareness, or outreach have a
     deterministic record.
4. **Progress and chronology**
   - user-facing progress follows the internal status mapping;
   - dates and stage transitions are not invented;
   - terminal or stale opportunities are not presented as actively moving.
5. **Follow-up quality**
   - unanswered company-side delays receive the correct status copy;
   - Harper does not promise outreach or a decision it cannot guarantee;
   - user questions about status are answered from the status tool.
6. **Recommendation fatigue**
   - rejected or closed internal opportunities do not recur;
   - repeated internal suggestions add new value rather than restating the same
     opportunity.

Sampling:

- inspect every internal recommendation with acceptance/rejection, status
  question, ops-stage change, complaint, or handoff claim during the window;
- when volume is manageable, inspect all target-day internal recommendations;
- classify whether the dominant issue is fit, source data, status grounding,
  handoff, ops delay, or conversation handling.

### 10.4 Recommendation insight rules

Keep recommendation insights separate from general conversation insights.

A recommendation insight must include:

- observed pattern;
- quantitative support or at least two independent examples;
- affected source type: external, internal, or both;
- likely pipeline stage;
- proposed improvement;
- a measurable verification signal.

When a comparable seven-day baseline exists, include whether the target-day
signal is improving, stable, or worsening. If the baseline is unavailable or
not definitionally comparable, say so rather than assigning a direction.

Examples of measurable signals include valid-role rate, expired-role complaint
rate, hard-constraint violation rate, duplicate rate, acceptance rate, view or
click rate, and onboarding-to-first-good-recommendation time.

## 11. General insight rules

General insights may combine structured and unstructured data, but must be
traceable to evidence.

Good insight:

> Four users were told Harper would retry after a recommendation-tool failure,
> but none had a later queued run. Only use retry language after a retry row is
> created, and track promised-retry completion rate.

Invalid insight:

> Harper should generally be more helpful.

Prefer improvements to:

- tool and prompt contracts;
- fallback and recovery UX;
- profile/preference storage;
- recommendation filtering and source freshness;
- deterministic status surfaces;
- observability that connects assistant claims to side effects.

## 12. Next-action rules

Every actionable finding must end with a concrete next action.

| Priority | Meaning | Expected action |
| --- | --- | --- |
| `P0 Now` | `S0` or active multi-user/core-path incident | Contain impact, identify affected users, stop bad delivery, fix/reprocess |
| `P1 Today` | `S1` or repeated unrecovered issue | Root-cause check, targeted recovery, add deterministic guard |
| `P2 Planned` | `S2` or recurring quality weakness | Prompt/data/UX improvement with a validation metric |
| `P3 Observe` | Low-confidence or early signal | Add instrumentation or monitor before changing behavior |

Each action should include:

- the affected component or owner area, if known;
- immediate recovery for impacted users;
- structural prevention;
- how to verify the fix.

Do not invent a human owner. Use an area such as `worker`, `career chat`,
`company_roles data`, `delivery`, `internal ops`, or `prompt/tool contract`.

## 13. Daily output format

The task output has five sections. The executive summary stays compact; detail
sections may be longer when evidence exists.

```text
Harper Daily QA · YYYY-MM-DD

1) Executive summary
• Up to five lines covering the highest-severity error, conversation problem,
  recommendation-quality result, and most important action.

2) Detailed conversation and system findings
- [Severity | Confidence] issue — affected users/incidents
  Evidence: identifier prefixes and concise observed behavior
  Cause/recovery: normalized cause and whether user value recovered

3) Recommendation quality
External
- Volume/sample, valid/invalid/needs-verification, recurring problems, insight
Internal
- Volume/sample, valid/invalid/needs-verification, recurring problems, insight

4) Next actions
- P0/P1/P2/P3 — action, affected area, verification signal

5) Coverage and limitations
- Total messages, selected messages, context messages, conversations reviewed
- Complete structured scans performed
- Seven-day comparison window and which trend signals were reconstructable
- Missing data, assumptions, or needs-verification items
```

When there are no actionable findings or evidence-backed insights, output:

```text
Harper Daily QA · YYYY-MM-DD
• actionable finding 없음
• Coverage: target messages N, reviewed messages N, conversations N
```

If the audit cannot access required DB/log sources, do not estimate results.
Output an explicit audit failure, the missing source, and the next diagnostic
action.

## 14. Primary data sources

Use the currently available schema and adapt names only when the schema has
changed:

- `talent_messages`
- `talent_conversations`
- `talent_users`
- `talent_setting`
- `talent_activity_events`
- `talent_calls`
- `opportunity_discovery_run`
- `talent_opportunity_recommendation`
- `talent_opportunity_delivery`
- `company_roles`
- internal opportunity stage/tag records
- `career_email_messages`
- tool/application logs
- `llm_logs`

If a required source has changed or disappeared, report it as an audit
limitation and update this rubric before silently substituting a materially
different signal.
