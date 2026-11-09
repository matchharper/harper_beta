# Live Google Calendar test, 2026-11-09

The user completed OAuth for the designated shared Google account and requested an actual test. This exploratory run used the existing local Next app and isolated local Supabase fixture, with the named company/candidate test identities in an internal Harper workspace. The Role is paused, `information.testOnly=true`, has a stable fixture name, and permits only the dedicated local candidate. No production DB mutation, migration or deployment occurred. Google Calendar invitations were real; ordinary company/Career email used the local capture mailbox.

The browser entered the original request, “김호진님 인터뷰 잡아줘”, in the company Role chat. Subsequent test-driver messages supplied November 10, 14:00–17:00 Asia/Seoul, delegated confirmation, and selected 14:00–15:00 through Career. These are authorized simulated replies, not evidence that the real humans agreed to an interview. Company model: `google/gemini-3.8-flash`; Career model: `gpt-6.1-terra`. No prompt or model changes were made in this run.

## Observed results

- The original company-side LLM prepared one meeting and used `contact_talent`; the Career agent asked for availability. Its reply used `contact_company`, and the company-side LLM confirmed the delegated time without requiring personal Calendar authentication or another company approval.
- Google account status was ACTIVE and the primary Calendar owner matched the designated shared account. Direct provider reads verified one event, the correct two attendee emails, November 10 at 14:00–15:00 Asia/Seoul, and successful Meet conference creation. The rendered company and Career messages displayed the same Meet URL and appointment.
- Calling the production delivery executor again retained the same event ID and Meet URL, with exactly one event in the Google lookup. This retry check exercised the executor directly; the other lifecycle requests used browser conversation turns.
- A candidate message requested 15:00–16:00. The company agent used the existing delegated 14:00–17:00 window to update the appointment. The initial Calendar update failed as detailed below, and the company and Career messages distinguished the changed appointment from the incomplete Calendar update.
- After the transport fix, a company chat retry updated the same Google event to 15:00–16:00, sequence 1, meeting version 3, preserving the Meet URL. Both agents reported the successful update.
- A deliberately stale ETag sent through the real proxy returned Google HTTP 412, confirming that the conditional header reached Google and prevented the write.
- A company browser request cancelled the test interview. Google subsequently returned the same event with `status=cancelled`; no active test appointment remains. Both rendered conversations showed cancellation, and all fixture receiver jobs completed.

## Failures and corrections

The live update exposed a provider contract error missed by the mock test: the Calendar proxy serialized the `If-Match` parameter using `in: "header"`. Composio requires `type: "header"`. The provider returned HTTP 400 with `Error in payload.parameters.0.type: Required`, before Google received the update. Corrected the transport and its regression assertion. Creation had worked because it sends no conditional header. The successful real update, stale-ETag rejection and cancellation validate the corrected transport. Contract: [Composio proxy request](https://docs.composio.dev/reference/api-reference/tools/postToolsExecuteProxy).

The private manual worker initially invoked a Career processor directly outside a Next request scope. Its follow-up scheduling called `after` and failed after durable contact persistence. The private launcher now dispatches through the existing authenticated local HTTP endpoints, preserving the normal Next request context. The earlier failed attempt and duplicate availability relay remain in the private trace; this harness problem was not hidden by resetting conversation history. It did not create a second appointment or Google event.

## Evidence and limitations

Private artifacts are in ignored `runs/live-google-20261109/`, with owner-only files: chronological DB snapshots, Google response receipts before/after mutations, duplicate-delivery and stale-ETag results, browser text snapshots, local runtime logs, runner snapshots and source hashes. Exact personal identities and raw outputs are not committed. This exploratory run does not replace the frozen v1 cases, and it does not capture every initial Career provider request.

The focused Composio transport and Calendar delivery tests passed (19 tests), and TypeScript passed. Personal Calendar precedence was previously tested with injected providers; this live run authenticated only the shared account. Google accepted event creation/update/cancellation with attendee notifications requested via `sendUpdates=all`; recipient inbox arrival, RSVP, and actual Meet admission were not observed. Ordinary email was captured, not externally delivered. Deployed queue transport and production configuration were not tested. The local test UI and isolated fixture remain available for the user's own testing; the external test event was cancelled.
