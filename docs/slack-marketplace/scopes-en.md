# Slack bot scopes and purposes

Observed 2026-10-12: production app settings contain nine bot scopes. Released OAuth code and `slack/harper-manifest.yaml` request fourteen. The five missing scopes are listed separately; this document does not grant them. The nine existing scope explanations below were saved in Slack settings. Slack requires at least 75 characters per explanation.

## Present in the app console

| Scope | Purpose |
| --- | --- |
| app_mentions:read | Receive @Harper mentions in configured channels to start recruiting conversations. |
| channels:history | Retrieve the relevant public-channel thread for a mention or reply in a Harper conversation. |
| channels:read | List available public channels during setup and identify the channel selected for the integration. |
| channels:join | Join the public channel explicitly selected by an authorized team member during Harper integration setup, so Harper can reply in that channel. |
| chat:write | Send Harper replies, candidate review cards, recruiting notifications and connection updates. |
| groups:history | Retrieve relevant threads in configured private channels where Harper has been invited. |
| groups:read | List and identify private channels available to the installed bot during authorized setup. |
| links:read | Receive supported matchharper.com link events and resolve whether an authorized preview is available. |
| links:write | Display supported Harper candidate previews and work objects with permission checks. |

## Required by released code but absent from the observed console

| Scope | Purpose and boundary |
| --- | --- |
| channels:manage | Create a public hiring channel when an authorized user explicitly requests that action. |
| groups:write | Create/manage a private hiring channel and invite selected team members for an authorized request. |
| files:read | Read documents or images a user supplies in the relevant Slack conversation to discuss a Role. The implemented turn limits are 3 files, 10 MB per file and 25 MB in total. |
| users:read | Resolve Slack user identity and profile details for company account authorization and team coordination. |
| users:read.email | Match the Slack user’s email with an existing Harper company account and resolve a selected team member by email for authorized channel invitations. |

## Verification after configuration

Perform a fresh installation into a dedicated review workspace. Test mention/thread replies, selected public/private channel setup, a synthetic document attachment, existing-account access checks, and an authorized fixture link preview. Keep reviewer data isolated. Verify unauthorized accounts cannot obtain candidate details or invoke decisions. Record the installed app name and actual granted scopes. The app being publicly distributed does not prove these functions work.

Relevant released source: `src/lib/org/slackHarper.ts`, `src/lib/org/slackHarperEvents.ts`, `src/app/api/org/slack/route.ts`, `src/lib/org/slackFiles.ts`, and the candidate work-object handlers. No scope changes were made during this preparation.
