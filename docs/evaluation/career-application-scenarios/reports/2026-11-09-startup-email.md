# Startup email preparation — 2026-11-09

Scope: `startup-email-v1`, authorized account, six-opportunity checkpoint. Ordinary Apply messages only; no recipient/source hints, no employer email or application submission. The ATS can request applicant email verification during preparation; this occurred in LinqAlpha testing. GPT-6.1 Terra high with product tools and persistence. Server-run evaluation, not rendered UI interaction.

## Input changes

- Selected-posting context now includes the existing stored company employee-count range through the shared role-context formatter. Missing size stays explicitly unknown. No new stored facts or company-specific branches.
- Application handbook discusses public founder/team hiring posts and recruiting email for startups with at most 100 team members. Recipient suitability still depends on source, date, role and stated hiring channel.
- Provider inputs confirmed Search OS `2–10 team members`, the real JD/link and the new application handbook. Input/provider unit tests: 31 passed; final TypeScript check and changed-file ESLint passed.

## Initial v11 observation

Private run: `runs/2026-11-08T16-57-35-732Z-startup-email-v1/`.
Search OS searched three times using the exact FDE role, found the official site, inspected GroupBy (login-gated), then prepared the official form and a resume. The saved form asked for legal English name and total experience; no recruiting recipient or email body was prepared. One invalid source-reference UUID was rejected and corrected by the model. Resume revision changes triggered additional attachment preparation.

This run was stopped through the normal conversation-stop RPC after the email-preparation gap was established, before the final attachment update completed. It is an interrupted diagnostic, not a completed failure/pass rate. The after-state and calls were preserved. Cleanup initially rejected a provider-created `human` login state even though no user took control. The QA cleanup now closes only its owned, completed, unclaimed login session; explicit user control/handoff and active runs remain blocked. Both QA sessions were closed before reset.

The v12 handbook revises the same research paragraph: research the company and its founders/team, including personally authored hiring posts whose wording may differ from the selected posting. No known company names, email addresses or URLs are injected. Repeat the unchanged frozen cases to assess whether this improves the outcome.

## Final v12 review

Private evidence: `runs/2026-11-08T17-12-51-120Z-startup-email-v12/` (ignored, owner-only). Each case resets the same checkpoint. Request/response captures include the actual provider inputs, tool calls, saved after-state and individual manual review. No known recipient or source was inserted into the requests.

| Case | Round | Observed preparation | Remaining boundary |
| --- | --- | --- | --- |
| Search OS FDE | 1 | Independently found `evan@searchos.io` in official careers/founder evidence; saved recipient, subject, body and intended resume in a private email draft. Also uploaded resume to official web form. | Final reply chose web application as primary and email as alternative. Personal facts need confirmation; no final email approval. |
| Search OS FDE | 2 | Independently found the same email; selected email as primary. Visible review form contains recipient, subject, complete body and exact resume revision; final reply offers Gmail connection. | Career-date/experience questions, Gmail connection and final send authorization remain. |
| LinqAlpha FDE | 1 | Independently found founder's public FDE recruiting post and `jacobchoi@linqalpha.com`; saved recipient, subject, body and intended tailored resume. Prepared the matching official Greeting form. | Final reply prioritizes ATS and applicant verification. Personal facts and final authorization remain. |
| LinqAlpha FDE | 2 | Independently found the same founder email; saved recipient, subject, body and intended resume in a private email document. Prepared ATS form and resume. | Final reply prioritizes ATS verification/personal questions and **does not mention or link the saved email draft**. Saved preparation succeeds; visible email setup and final authorization remain incomplete. |
| PhyxUp Founding AI Engineer | 1 | Searched company/founder hiring sources, opened founder post and current role. Saved tailored resume and personal-fact form. | No verified recruiting email or mail draft. Wanted login gate remains. The opened founder post has no email; generic support address was not treated as a hiring recipient. |
| PhyxUp Founding AI Engineer | 2 | Independently found `sangwon.lim@phyxup.com` in an older closed mobile developer posting. Saved recipient, subject, body and proposed resume; exposed draft document in the visible form. | Explicitly labels the older/different-role source and uncertain applicability. Current AI-role email acceptance unconfirmed; Wanted login and personal questions remain. |

“Prepared email” here means a saved Harper draft/review containing the recipient, subject and body with a proposed resume. It does not mean a Gmail draft, a completed final-approval step, a sent message or a submitted application. The choice of primary channel varies even when email preparation succeeds. All six cases finished without a terminal runtime failure. Draft persistence: Search OS 2/2, LinqAlpha 2/2, PhyxUp 1/2 (only an unverified alternative route). Thus 5/6 saved a draft, but only 4/6 found a recruiting email explicitly supported for the selected role. Four of the five saved drafts were surfaced in the final response/form; LinqAlpha round 2 was not. No case reached immediate final-send readiness. These are six observations, not a statistically reliable success estimate.

The initial narrow role-only search was addressed in the original handbook research paragraph, rather than by injecting company contacts, adding a company-specific branch or forcing an unverified address. PhyxUp is not a consistently successful email-application case: the first run saved no mail, and the second saved an alternative draft with an unverified current route. Finding a generic contact or an older, different-role hiring post is not sufficient evidence of a current recruiting route. No blinded causal comparison is claimed against the interrupted v11 diagnostic.

No employer email or application submission was executed. The LinqAlpha ATS requested verification by emailing the applicant's own address during preparation; the assistant disclosed that step. Browser sessions created by each evaluation were closed through the normal tool after after-state capture. This server test verifies the model/tool/persistence path, not rendered UI interaction or actual email delivery. Product edits remain local; no deployment was performed.


## Operational observations

- Per-case wall time, including reset/preparation/cleanup: Search OS 9.08 and 4.75 minutes; LinqAlpha 11.02 and 10.55 minutes; PhyxUp 3.81 and 4.91 minutes. Browser preparation remains slow; this change does not resolve that latency.
- Four URL text-extraction calls failed and the model continued from other sources. PhyxUp round 2 also recovered from one resume source-entry UUID validation error and two markdown writes carrying resume-only metadata. Only the successful saves are counted. Zero terminal failures does not mean zero rejected tool calls.
- All nine QA browser-session cleanup receipts report `closed`. The account retains the last PhyxUp run; each preceding case's state is preserved in private evidence, not simultaneously in the live account. The six-opportunity reset fixture remains available.
- Remaining product behavior is explicit: a saved mail draft can be omitted from the final reply (LinqAlpha round 2), and public contact discovery/current-role applicability varies (PhyxUp). Neither was disguised as complete send readiness or patched with company-specific routing.
