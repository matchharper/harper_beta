# Security and privacy evidence — not final attestations

Checked 2026-10-12. Production Vercel deployment `dpl_A7tjs4z4LAaf6XfgcYrQp1LayiFj` was READY at released commit `dba0125338525b1ea35f4d1275d85ce69e253bc0`. Local HEAD matched. Evidence below concerns that revision and the observed configuration; repeat if the release changes.

| Topic | Established evidence | Limit / outstanding evidence |
| --- | --- | --- |
| Transport | Slack OAuth, event and interaction URLs use HTTPS on matchharper.com. | No claim about all internal links or an infrastructure audit. |
| Slack request verification | `slackHarper.ts` verifies HMAC signature, a five-minute timestamp window and timing-safe comparison. | Code evidence; no adversarial production test performed. |
| OAuth state | Signed state binds user and Harper Workspace and expires after ten minutes. | Fresh install/cancel/replay behavior still needs functional evidence. |
| Bot tokens | AES-256-GCM encryption in `slackHarper.ts`. | Key rotation, database access controls and backup protections were not audited. |
| Slack token rotation | Disabled in observed app configuration. | Do not claim enabled rotation. |
| Event selection | Active integration and enabled selected channel are checked; mentions and relevant Harper threads drive conversations. | Not a guarantee that every authorized Slack event contains only saved thread data. |
| Conversation storage | Relevant Slack content can be mirrored into Harper company conversation records. | A 24-hour context window is not deletion. Fixed content/log/backup retention and a verified deletion procedure remain unresolved. |
| Uninstall | `app_uninstalled` marks the integration revoked. | Does not automatically delete existing company conversations. |
| Disconnect | Channel/integration removal exists. Token revocation depends on whether another Harper Workspace uses the same Slack team integration. | Verify with an isolated review installation; do not disconnect customer integrations. |
| Tenant visibility | Company-account permission checks exist for candidate details and actions. | Verify private-channel content visibility through both Slack and Harper web; do not promise identical access boundaries without evidence. |
| Certifications | No SOC 2, ISO 27001 or penetration-test report established. | Do not assert certification or a completed security audit. |

## Actual Slack AI route

Production `SLACK_ORG_AGENT_MODEL` was `gpt-5.6-terra`, overriding the repository default. The released model resolver uses the direct OpenAI route, with `gpt-6-luna` as configured fallback. This supersedes the older packet’s assumption of OpenRouter/Google based on a source-code default. It does not establish every auxiliary model call’s processor or the identity of the production API key’s project.

OpenAI’s published API policy states that API data is not used to train models unless the customer opts in. Default abuse-monitoring logs may retain content for up to 30 days, with exceptions described by the provider. Zero Data Retention and Modified Abuse Monitoring require approval. Do not equate an API request’s `store: false` with approved Zero Data Retention. Confirm the actual production key’s organization/project, opt-in status and retention controls before making a customer-specific claim.

Read-only inspection of the signed-in **Harper** OpenAI organization found all three sharing categories disabled: model feedback, evaluation/fine-tuning data, and API inputs/outputs. API call logging was **Enabled per call**. The visible Default project’s residency was **Global**. No approved Zero Data Retention setting was established. This is account-setting evidence, not proof that the production credential belongs to that exact project. Private screenshots: `openai-sharing.jpg` and `openai-retention.jpg`.

The signed-in Harper OpenRouter organization showed paid-endpoint training disabled, free-endpoint training allowed, ZDR toggles disabled, and no enforced regional endpoint. These observations are **not proof of the active direct-OpenAI Slack path’s policy**. Screenshots are private in `.local/slack-marketplace-20261012/evidence/`.

## Privacy notice completion

The live English notice is v1.1.0, effective 2026-08-03, and focuses on Career. The unpublished subscription v1.2.0 drafts must not be released by accident. A complete company Slack notice needs verified controller identity, Slack data categories, purposes, AI/storage/infrastructure processors, locations/transfers, training restrictions, tenant boundaries, content/token/log/backup retention, deletion procedure/timing and contact. Do not fill unknown terms with promises.

Confirmed description suitable for a draft: Harper receives installation/team/channel/user identifiers, relevant mention/thread content, user-supplied files and supported link events to provide recruiting conversations, previews and introduction coordination. Relevant conversations may be stored in the company’s Harper records. Disconnecting or uninstalling stops the connection but does not automatically erase those records. Authorized people can contact `chris@matchharper.com` about personal data requests; timing and exceptions need policy confirmation.

Support operations must also satisfy Slack’s required response expectations. The page offers contact without login; an actual support response commitment has not been confirmed by the owner.

## Focused source-access review following the Jill comparison

The released `agent/store.ts` Role-message reader checks Harper Workspace view permission and returns both chat and Slack rows; this path does not re-check source Slack channel membership. The conversation-history tool also reads stored threads and summaries at the Harper conversation level without a caller/source-channel visibility boundary. These are concrete code paths requiring correction and synthetic access tests before asserting preservation of Slack permissions; they are not evidence that an actual customer-data incident occurred.

`slackHarperEvents.ts` skips message subtypes other than file_share, so changed/deleted messages are not reconciled by that handler. Thread synchronization skips existing timestamps instead of updating their original body. Deletion and correction coverage must include stored excerpts, attachment extraction, summaries and pending jobs, not only the original message row.

Vercel turn-queue retention is configured to 86,400 seconds. This covers that delivery queue, not the separate database conversation or summary records. The three-turn/24-hour context retention helper is also not a deletion policy.

The user's reference app Jill displays an unapproved-app notice in Slack. Its broader permission list and general privacy notice are useful layout references, not approval evidence. See [the comparison and release gates](jill-reference-and-privacy-gates-ko.md) and [the unissued bilingual notice](privacy-notice-draft.md).

Sources: [Slack requirements](https://docs.slack.dev/slack-marketplace/slack-marketplace-app-guidelines-and-requirements/), [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data), [current Harper notice](https://matchharper.com/privacy?lang=en).
