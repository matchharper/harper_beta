# Harper Daily Conversation QA Rubric

- Version: 2.0
- Last updated: 2026-08-31
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

The audit is read-only except for the narrowly scoped expired-posting
remediation in Section 3.5. It must not otherwise modify production data or
repository files. After the final report is fixed, it must create exactly one
Notion page in the
`Debugging Logs` database (`collection://3b87277d-26df-80d5-b777-000b8d7b67bb`)
with the title determined in Section 3.1 and the complete five-section report
as its body. It must fetch the database schema before each creation and use
only its `Name` property; never overwrite or update an earlier daily page.

The only permitted production writes are the exact `company_roles` field
changes authorized by Section 3.5, the one Notion page, and the one Slack DM.
The top of every Notion page must be a small, problem-level checklist before
the five report sections:

1. Read the five most recent Daily QA pages before creating today's page. Use
   their title dates and checkbox state, not only their creation timestamp.
2. Add `## 문제 체크리스트` first. It contains `### 최근 5일 미체크 중요 이슈`
   followed by at most two unresolved carryovers, then `### 오늘 새 이슈` for
   today's newly observed actionable issues.
3. Each checkbox represents one normalized root-cause/problem signature, never
   an individual run, delivery, user, or recommendation. Include a short
   stable `추적 키` so later runs can recognize the same problem.
4. Keep the combined checklist to 3–8 items. Include only actionable findings
   or important evidence-backed follow-ups; do not turn a high-volume cohort
   into dozens of boxes.
5. A carryover is eligible only when its matching key remains unchecked in the
   recent pages. Once a reviewer has checked that key, do not repeat it merely
   because an older page still contains an unchecked copy. Carry forward only
   `P0`/`P1`, `S0`/`S1`, or a repeated material `S2` issue, and state the
   current confidence rather than converting uncertainty into a fact.

After the Notion page is created, it must send exactly one compact summary DM
through Codex's connected Slack workspace. Use the signed-in workspace user's
self-DM by default (currently `Daniel(나)`), unless the operator explicitly
selects another DM. Do not use the legacy Harper bot token, a configured
channel ID, or `harper_worker/scripts/send_daily_conversation_qa_slack.py` for
the daily delivery. Confirm that the intended DM is visibly open before
sending. These are the only permitted external writes: no channel post, reply,
follow-up message, or raw data export is allowed.

The Slack DM is a concise alert, not a second report:

- order findings by `S0` → `S3`, then `P0` → `P3`;
- include at most three findings, each as `P# · S# | confidence` plus one short
  sentence; prefer actionable `S0`/`S1`/`S2` findings;
- include one next action and a pointer to the task's final report;
- include the newly created Notion page link when it is available;
- start with up to two eligible recent-five-day unchecked checklist items, then
  include today's findings; keep all listed items combined to three;
- when there are no actionable findings, send only the date and that result;
- when the audit fails, send the missing source and next diagnostic action;
- never include PII, raw message/email content, tokens, payloads, or IDs longer
  than the report's allowed eight-character prefixes.

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
9. Prove the relevant execution path before interpreting a final status, count,
   label, or message as its cause. An observed outcome is not evidence that
   every expected upstream step ran.
10. Reconstruct the effective user and system contract at the time of the
    incident. Keep historical snapshots, mutable live state, later changes, and
    the user's latest explicit instruction as separate evidence.

### 2.1 False-positive prevention and current-state checks

Before making an issue actionable, apply these precision checks. They do not
lower the bar for a real user-impacting incident; they prevent a historical,
intentional, or telemetry-only signal from being presented as a current defect.

1. **Separate the incident date from the current product state.** For a claim
   that an issue is active, recurring, or can still recur, establish the
   incident time, the relevant production deployment time, and the matching
   post-deployment evidence through audit execution. A code commit alone is not
   proof of production deployment. If the affected code path was deployed and
   the same normalized signature does not recur afterwards, report the event as
   a pre-fix historical incident, not a current regression. The affected user
   may still need recovery; keep that user-recovery status separate from the
   fix/regression status. Do not make an already verified production fix a
   `P0 Now` action.
2. **Classify delivery semantics before calling something "missing."**
   Distinguish `expected_no_send`, `pending_processing`, `valid_value_delivered`,
   `honest_zero_result_delivered`, and `misleading_or_incomplete_delivery`.
   A periodic external-only refresh with no viable role and no other lifecycle
   notice is intentionally allowed to end without an email; classify it as
   `expected_no_send`, not a missed delivery. An initial
   `conversation_completed` run that is still queued/running is
   `pending_processing`, not a zero-result failure, unless its applicable SLA
   has expired or Harper made a contradictory claim. A non-empty welcome or
   "search is starting" email is not a delivered recommendation, but it also
   must not be described as "no email sent"; report its exact delivery/value
   semantics instead.
3. **Treat guards and asynchronous work as candidates, not failures.**
   Duplicate/idempotency guards, intentional no-result skips, and an already
   completed fallback are benign unless direct evidence shows lost value. A
   promised retry is actionable only when the user-facing wording commits to an
   automatic follow-up, its due window has passed, and no durable queue/run or
   equivalent recovery exists. Polite or conditional language alone is not a
   retry contract.
4. **Confirm exposure separately from telemetry.** A log, transcript,
   cancellation, or stored-content anomaly is not by itself a user-visible
   incident. For voice problems, require evidence that the user heard/saw the
   bad output or could not complete the intended task after reasonable fallback.
   Keep provider/model attribution as `Needs verification` unless a
   deterministic provider/session record establishes it. A one-off wrong-locale
   call opener may be a limited `S2` exposure when confirmed, but must not be
   inflated into a sustained language failure without subsequent user-visible
   turns or an explicit user correction.
5. **Use recommendation evidence at the correct time.** A current live URL
   check establishes the role's current state, not automatically its state when
   Harper recommended it. Mark a recommendation `Invalid` for availability
   only with contemporaneous source/user evidence, or otherwise retain `Needs
   verification`. Likewise, a dislike or negative note is a review signal, not
   proof of a hard mismatch, unless its reason and the relevant user constraint
   establish one.
6. **Deduplicate before reporting.** Count structured entities by their primary
   ID after joins, and keep independent ledgers for incidents, affected users,
   deliveries, and evaluated recommendations. Do not infer a rate, trend, or
   recurrence from incompatible query definitions or duplicate join rows.
7. **Distinguish allowed, selected, executed, and delivered.** A setting or
   deterministic gate may allow an action without selecting it; an
   orchestration decision may select an action without executing its downstream
   tool; a tool may execute without producing or delivering value. Record each
   state independently and locate the first transition that failed.
8. **Do not use historical snapshots as execution-time truth.** For delayed or
   asynchronous work, compare captured inputs with live state and intervening
   user/system changes at the time each relevant decision and side effect ran.

## 3. Time window and evidence

### 3.1 Target window

- On Tuesday through Sunday KST, count incidents and messages created during the
  previous complete KST day, `00:00:00` through `23:59:59`.
- On Monday KST, run one combined weekend audit over the three immediately
  preceding complete KST dates: Friday `00:00:00` through Sunday `23:59:59`.
  This is one report and one Notion page, not three delayed daily reports.
- Label a one-day report `Harper Daily QA · YYYY-MM-DD`; label the Monday
  combined report `Harper Daily QA · YYYY-MM-DD~YYYY-MM-DD` using its Friday
  start and Sunday end dates. Use the same label in the Notion page and Slack
  DM.
- To determine whether a target-day failure later recovered, read subsequent
  events through the audit execution time. Do not count those later events as
  incidents in the audited date or combined window.
- For onboarding-to-recommendation SLA checks, include cohorts whose SLA
  deadline expired during the target day.
- In addition to the audit window, compute a rolling comparison over the seven
  complete KST days immediately preceding that window when the data source
  permits it. Use this comparison only to identify recurrence, concentration,
  and direction of change; do not add older incidents to the current incident
  count. The Monday comparison therefore ends on the Thursday before the
  Friday–Sunday window.
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
or blocked, label availability as `Needs verification`. The complete cohort of
explicit expired-posting reports in Section 3.5 is mandatory and does not count
against this 20-URL quality-sample limit.

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

### 3.5 Expired-posting report remediation

This is the audit's only production-data remediation. Process every target-window
recommendation whose current feedback is dislike and whose selected reason is the
stable external-feedback value `만료된 공고에요.`. Do not sample this cohort.
Keep every qualifying recommendation in the audit ledger, but deduplicate the
network check and database mutation by `role_id` when several users reported the
same role.

#### 3.5.1 Read the report cohort

Convert the KST audit boundaries to exact UTC timestamptz values and bind them as
`window_start_utc` inclusive and `window_end_utc` exclusive. Use
`talent_opportunity_recommendation.feedback_at`, not `updated_at`, as the report
time. Read only the allowlisted scalar fields below; do not select `talent_id`,
profile data, or unrelated recommendation text.

```sql
select
  recommendation.id::text as recommendation_id,
  recommendation.role_id::text as role_id,
  recommendation.feedback_at,
  role.name as role_name,
  role.source_type,
  role.source_provider,
  role.source_job_id,
  role.external_jd_url,
  role.status,
  coalesce(role.is_expired, false) as is_expired,
  role.expired_at,
  role.expires_at,
  role.updated_at as role_updated_at
from public.talent_opportunity_recommendation recommendation
join public.company_roles role on role.role_id = recommendation.role_id
where recommendation.feedback_at >= :window_start_utc::timestamptz
  and recommendation.feedback_at < :window_end_utc::timestamptz
  and lower(btrim(coalesce(recommendation.feedback, ''))) in
      ('dislike', 'negative')
  and (
    btrim(coalesce(recommendation.feedback_reason, '')) in
      ('만료된 공고에요.', '만료된 공고에요')
    or coalesce(recommendation.feedback_reason, '') ~
      '"selectedOptions"[[:space:]]*:[[:space:]]*\[[^]]*"만료된 공고에요\.?"'
  )
order by recommendation.feedback_at, recommendation.id;
```

The plain-text branch supports legacy rows and the `selectedOptions` branch
supports the current JSON-serialized feedback value. Do not match a custom
comment that merely mentions expiry unless the stable option itself was selected.
Record full IDs only in the private execution ledger needed for exact reads and
writes; expose at most eight-character prefixes in the report.

#### 3.5.2 Re-read and check every unique role

Before opening a URL, read the role again by its exact `role_id`:

```sql
select
  role_id::text,
  name,
  source_type,
  source_provider,
  source_job_id,
  external_jd_url,
  status,
  coalesce(is_expired, false) as is_expired,
  expired_at,
  expires_at,
  updated_at
from public.company_roles
where role_id = :role_id::uuid;
```

Do not keep a database transaction or row lock open during network access. Skip
the mutation when the role does not exist, is not `source_type = 'external'`, or
is already unavailable (`is_expired = true` or status is `ended`, `expired`,
`closed`, `inactive`, or `archived`), but record that disposition. A missing URL
is `Needs verification`, never proof of expiry.

Open each remaining `external_jd_url` individually, follow redirects, and read
the resulting posting. A mutation requires a high-confidence current closure:

- HTTP `404` or `410` for the exact posting;
- a provider's authoritative job endpoint says the exact job ID is missing or
  unavailable; or
- the final page explicitly says that the exact role is closed, removed, no
  longer available, or no longer accepting applications; or
- the same stored posting URL is checked with at least two independent fresh
  requests and every attempt redirects to the same generic company careers
  page instead of the exact role. Redirect hops within one request count as one
  attempt, not several. Record each attempt's final URL and require matching
  results before treating the posting as expired.

Do not expire a role because of a timeout, DNS/network failure, `401`, `403`,
`429`, bot challenge, login wall, a generic careers-page redirect observed only
once, blank JavaScript shell, temporary provider error, missing metadata, old
`posted_at`, or the user's report alone. Those cases remain `Needs
verification`. If the two fresh redirect checks disagree, do not mutate the
role. Confirm that the checked page belongs to the stored role/job ID; a live
but different role or a suspicious redirect that does not satisfy the repeated
redirect rule is a mapping issue to report, not automatic proof that this row
is expired.

#### 3.5.3 Write only after definite confirmation

For a confirmed closure, start a short new transaction, lock the exact role,
and compare its current URL and `updated_at` with the snapshot that was actually
checked. Also require that a qualifying target-window report still exists. The
authorized mutation is limited to `status`, `is_expired`, `expired_at`, and
`updated_at`; do not change `expires_at`, recommendation feedback, summaries,
or any other role data.

```sql
begin;

select
  role_id::text,
  source_type,
  external_jd_url,
  status,
  coalesce(is_expired, false) as is_expired,
  updated_at
from public.company_roles
where role_id = :role_id::uuid
for update;

update public.company_roles role
set status = 'ended',
    is_expired = true,
    expired_at = coalesce(role.expired_at, now()),
    updated_at = now()
where role.role_id = :role_id::uuid
  and role.source_type = 'external'
  and coalesce(role.is_expired, false) = false
  and lower(coalesce(role.status, '')) not in
      ('ended', 'expired', 'closed', 'inactive', 'archived')
  and role.external_jd_url is not distinct from :checked_url
  and role.updated_at is not distinct from :checked_role_updated_at::timestamptz
  and exists (
    select 1
    from public.talent_opportunity_recommendation recommendation
    where recommendation.role_id = role.role_id
      and recommendation.feedback_at >= :window_start_utc::timestamptz
      and recommendation.feedback_at < :window_end_utc::timestamptz
      and lower(btrim(coalesce(recommendation.feedback, ''))) in
          ('dislike', 'negative')
      and (
        btrim(coalesce(recommendation.feedback_reason, '')) in
          ('만료된 공고에요.', '만료된 공고에요')
        or coalesce(recommendation.feedback_reason, '') ~
          '"selectedOptions"[[:space:]]*:[[:space:]]*\[[^]]*"만료된 공고에요\.?"'
      )
  )
returning role_id::text, status, is_expired, expired_at, updated_at;

commit;
```

If the locked row no longer matches the checked URL or timestamp, roll back and
classify it as `concurrent_change`; do not blindly retry. Re-read the row and
live-check the new URL before any later attempt. If the `update ... returning`
produces no row, roll back, establish which guard failed, and report it.

After every committed mutation, perform an independent exact-ID verification:

```sql
select role_id::text, status, is_expired, expired_at, updated_at
from public.company_roles
where role_id = :role_id::uuid;
```

Count the mutation as successful only when this re-read shows `status = 'ended'`,
`is_expired = true`, and a non-null `expired_at`. A write failure must be rolled
back and listed with the next diagnostic action; never hide it or compensate by
editing another row.

#### 3.5.4 Reporting boundary

Report qualifying feedback rows, unique roles, already-unavailable roles,
newly expired roles, confirmed-still-live roles, needs-verification roles,
concurrent changes, and failed writes as separate counts. List only eight-character
ID prefixes and non-PII evidence summaries. Treat the cleanup as a current
operational remediation. Whether the original recommendation was invalid when
sent remains a separate incident-time judgment under Section 2.1; a current live
check does not retroactively prove the posting's earlier state.

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

### 5.1 Mandatory stage ledger

For every actionable S0/S1/S2 candidate, reconstruct this ledger before
assigning severity or root cause:

1. **Expected contract:** what the user and system were entitled to expect,
   based on the latest explicit instruction, product promise, and applicable
   policy at the incident time.
2. **Actual chronology:** the relevant request, decision, execution, side
   effect, exposure, retry, and recovery events in timestamp order.
3. **Effective inputs:** historical snapshots, mutable live state, intervening
   changes, and which values each component actually consumed.
4. **Decision boundaries:** applicable guards, gates, policies, prompts, model
   or tool decisions, including what was allowed, required, selected, rejected,
   or normalized.
5. **Execution boundaries:** direct evidence for which expected components and
   downstream operations actually ran, failed, were bypassed, or never started.
6. **Outputs and side effects:** counts and statuses at their exact producing
   boundary, persisted state, delivery/exposure, and any mismatch between them.
7. **Fallback and recovery:** whether the applicable fallback ran, whether the
   user ultimately received the expected value, and the user's current state.
8. **Implementation contract:** when repository and deployment evidence are
   available, the code path that permitted or prevented the observed outcome.

State the **first broken stage** from this ledger. Do not group incidents merely
because their final recommendation count or email status matches.

### 5.2 Root-cause evidence rules

- Assign a root-cause category only when direct evidence reaches the component
  and boundary being named. A downstream status, count, or missing side effect
  is a symptom until its upstream execution path is established.
- Prefer the earliest evidenced divergence from the expected contract over the
  last visible symptom. Distinguish primary cause, contributing conditions,
  recovery failure, and observability gaps instead of flattening them into one
  label.
- Treat provider/model logs as evidence of which model participated, not by
  themselves as proof that the provider/model is the root cause. If the prompt,
  gate, action catalog, normalization, or call ordering permits the observed
  decision, report that system contract as the primary cause and the model as
  execution evidence.
- When repository access is available, inspect the relevant prompt, gate,
  normalization, and delivery/fallback code. Separate incident-time production
  behavior from current repository behavior, and do not claim a current fix is
  deployed without deployment evidence.
- If raw LLM output, intent, trace, or incident-time code is unavailable, say
  exactly which explanation cannot be recovered. Do not invent a model
  rationale from the normalized decision.
- When a cohort contains different first broken stages, split it even when
  every row shares the same final status or visible symptom.

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

### 8.4 Mandatory sent-email locale audit

For every target-day email whose delivery state proves that it was actually
sent, compare the user-facing subject and main body with the effective locale at
send time. This is a full structured scan, not a risk-based sample. Include
opportunity/recommendation emails and other Harper talent emails whenever the
available canonical delivery source can identify them.

1. **Establish exposure first.** Use the canonical sent/delivered record and
   delivery timestamp. A draft, generated query-plan body, queued row, or failed
   delivery is not a confirmed wrong-language exposure. Track stored-only
   anomalies separately.
2. **Reconstruct the send-time locale.** Apply Section 8.2 using conversation
   and settings evidence available before the send timestamp. Do not let a
   later locale change rewrite incident-time truth, and do not let a queued
   run's stale settings snapshot override a newer explicit language request or
   live preference that existed before delivery.
3. **Check components separately.** Evaluate `emailSubject` and the main
   user-facing email body independently. Also distinguish LLM-authored copy from
   deterministic layout, history links, unsubscribe text, signatures, and
   footers when the source permits it. A correct-language footer does not make
   a wrong-language subject or main body valid.
4. **Generate candidates without exposing PII.** Prefer server-side or local
   script counts for Hangul, Latin letters, and substantial-language segments.
   Do not print full email bodies. Review only the minimum redacted excerpt
   needed to distinguish prose from proper nouns, quoted user text, role titles,
   or company names.
5. **Audit both directions.** Flag substantial Korean prose sent to an
   English-locale user and substantial English prose sent to a Korean-locale
   user. Any opposite-script fragment remains a candidate, but confirm that it
   is user-facing prose before classifying an incident.
6. **Trace the first broken stage.** Compare the resolved locale, prompt/input
   locale, generated subject/body, normalized delivery, transport rendering,
   and canonical sent content when available. Do not assign the cause to an
   example, prompt, model, template, or transport layer merely because the final
   language is wrong. Confirm the earliest boundary where the language first
   diverged; otherwise use `Needs verification`.
7. **Report denominators and recurrence.** Report target-day sent emails,
   emails with a reconstructable effective locale, English-locale and
   Korean-locale counts, candidates reviewed, confirmed subject mismatches,
   confirmed main-body mismatches, stored-only anomalies, and affected users.
   Compare the same normalized mismatch signature over the preceding seven
   complete KST days when reconstructable.

A substantial wrong-language subject or main body that was actually sent is at
least `S1 High` because it materially breaks the user's communication contract.
Use `S2 Medium` only for a limited fragment that does not change the main
language or meaning, and `S3/data_quality` only when the bad copy was not sent.

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

Apply the general stage-ledger and root-cause rules in Section 5 before naming
the cause of any of these outcomes.

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
  Stage ledger: expected contract, effective inputs, decision/execution
  boundaries, side effects, exposure, fallback, and recovery evidence
  Cause/recovery: first broken stage, normalized cause, and whether user value
  recovered

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
- Sent-email locale audit denominators and component-level mismatch counts
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
