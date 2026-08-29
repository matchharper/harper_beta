# Company employee Google Calendar connection

## Current scope

`/org/settings` → **Personal integrations** connects the signed-in employee's
Google Calendar through Composio. The interview availability modal can import
blocking events from every visible calendar for the next 14 days. Repeated syncs
add only new provider event IDs and update a stored range when the same event
moves; they do not store event titles, descriptions, or attendee lists.
Calendar and event identifiers are domain-separated SHA-256 values in storage,
so a calendar ID that is also an email address is not retained verbatim.

When a candidate submits times and Harper confirms one, the organizer's primary
calendar creates one event, invites the candidate and all company attendees,
requests a Google Meet room, and sends Google Calendar updates to everyone.
Delivery is idempotent and retryable from the company schedule dialog. The worker,
shared Slack integration, and company-side LLM tools are unchanged.

Connections belong to `company_users.user_id`, not a workspace. Owner, Admin,
and Viewer can each manage only their own connection. The same personal
connection is used across that employee's workspaces; workspace access is
checked independently on every request.

## Manual configuration

1. In the existing Composio project, create a Google Calendar (`googlecalendar`)
   Auth Config using **OAuth2 / Composio managed auth**.
2. Set the agreed scopes for future calendar features:
   `https://www.googleapis.com/auth/calendar.readonly` and
   `https://www.googleapis.com/auth/calendar.events`. The first scope lets
   `Calendar Sync` read the user's visible calendars; the second lets Harper
   create the confirmed event and send attendee updates. The broader
   `https://www.googleapis.com/auth/calendar` scope is also compatible, but is
   not required when both narrower scopes are granted.
3. Set these **server-only** variables in `harper_beta/.env.local` and the
   deployment environment:

   ```env
   COMPOSIO_API_KEY="your-existing-project-api-key"
   COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID="ac_your_calendar_config"
   ```

   The API key must have **Connected accounts: Read and write** and permission
   to execute Google Calendar tools. It must be
   in the same project as the Auth Config. Do not reuse the Gmail Auth Config
   ID, add `NEXT_PUBLIC_`, or paste keys into chat/source control.
4. Apply `20260827110000_google_calendar_scheduling.sql` before releasing this
   code. The migration creates `public.company_user_integrations` when it is
   absent and safely extends an existing table, then adds privacy-minimal busy
   ranges, sync timestamps, durable Calendar/Meet delivery state, and the
   transaction checks used during confirmation. RLS stays enabled and browser
   roles have no table access; only the backend service role uses these rows.
5. Restart the development server (stop it, then `npm run dev`); redeploy for
   production environment changes. Connect from the Harper UI, not from a
   dashboard connection owned by a Composio dashboard user.

No Google client secret, access/refresh token, or calendar ID needs to be entered.
Composio manages OAuth. Tool execution is pinned in code to the verified schema
version so an upstream latest-version change cannot silently change arguments.
`ac_...` identifies the shared configuration; `ca_...` identifies an employee's
connection and is saved automatically after validation.

## Flow and security

- GET/DELETE `/api/org/integrations/google-calendar`, POST its `/connect` and
  `/complete` endpoints. All take the current `workspaceId`; no owner selector
  is accepted. GET returns only provider/status, never credentials/account IDs.
- Sensitive routes use the existing `getFreshRequestUser` verifier, not the
  development-only decoded JWT fallback. Workspace membership/access is then
  checked with the existing company-side policy; viewer access is sufficient.
- Connect sets a signed, HttpOnly, SameSite=Lax, 10-minute cookie tied to the
  authenticated user, workspace, expected `ca_...` and random callback nonce.
  HTTPS cookies are Secure; localhost HTTP works with the normal Connect Link
  callback. The project key signs a domain-separated payload; no extra key is
  needed. Rotating it invalidates in-progress connection attempts.
- Composio returns to `/org/settings?orgId=...`. The page sends the result to
  `/complete` with the current Harper session. The server checks the cookie and
  re-fetches the exact account, verifying user ID, account ID, toolkit,
  Auth Config ID and ACTIVE status before saving. Another browser/user cannot
  substitute a connection. Callback fields are removed after success/cancel;
  transient save failures retain the flow for retry until the cookie expires.
- A persisted active account may be reused, but arbitrary vendor accounts are
  never discovered and adopted. Expired connections are cleaned up before
  replacement. Conditional updates/deletes avoid overwriting a newer row.
- Disconnect first marks the row disabled. Only verified own-account revoke
  and delete success remove the row. Failure retains the disabled pointer for
  retry. If revocation already succeeded, retry skips revoke and finishes delete.
  Starting disconnect immediately removes imported busy ranges, even while an
  external revoke must be retried. An expired token does not erase already
  imported future ranges: those remain blocking until they end or the user
  disconnects, while a fresh sync requires reconnecting.
  Composio errors do not turn transient outages or key-permission failures into
  a false "expired" state. API diagnostics redact secrets and never dump rows
  or raw vendor connection objects.
- This feature does not change Composio's **project-wide callback identity
  verifier** setting. If enabled, Composio ignores normal `callback_url` and
  uses its separate `session_uri` verification flow; that project-wide
  migration must be configured separately, including existing integrations.
  The normal Connect Link callback is the prerequisite here.

  The Harper callback still requires the initiating browser's signed cookie and
  exact account ID, and execution only uses that persisted account. Composio's
  project-wide pre-activation identity verifier remains recommended before this
  connection mechanism is reused by broader untrusted surfaces.

## Scheduling behavior

- `Calendar Sync` calls `GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS` for now through
  14 days later, expands recurring instances, and rejects partial-calendar
  failures instead of saving an incomplete success. Cancelled, transparent,
  birthday, working-location, and self-declined events do not block slots.
- Busy rows share the same per-attendee database lock as meeting confirmation.
  A sync and candidate submission racing for the same time cannot both commit.
- Meeting confirmation writes a `pending` delivery row in the same database
  transaction. If the request stops before Composio is called, the confirmed
  meeting remains visible as retryable work rather than disappearing between
  the two steps.
- Confirmed event delivery first searches the organizer's primary calendar for
  the private `harperScheduleId` marker. A retry after an external success and
  local timeout therefore reuses the existing event instead of inviting twice.
- Invitation preview and send both verify that the organizer still has an
  active Calendar connection. This prevents promising automatic Calendar/Meet
  delivery when the prerequisite is already missing. A later expiry can still
  happen, so confirmed meetings retain a safe company-side retry path.
- `send_updates=all` sends Calendar notifications. The organizer owns the event;
  the candidate and other company attendees are guests. If Google creates the
  event but the account cannot create Meet, the UI reports
  `created_without_meet` and links to the Calendar event for manual repair.
  If Google reports conference creation as pending, Harper keeps the delivery
  non-terminal and lets a later retry observe the completed Meet link.

## Verification

```sh
node --import tsx --test src/lib/integrations/*.test.ts
npx next typegen
npx tsc --noEmit --incremental false
```

With real config values, log in as a company member, open Integrations, connect,
approve Google consent, and verify that the row has your Harper user ID and
`provider=google_calendar`. Run `Calendar Sync` twice and confirm the second run
adds no duplicate rows. In a non-production calendar, complete one candidate
selection and verify one event, one Meet URL, and invitations for both sides.

Safe diagnostics are labeled `[GoogleCalendarIntegration] failed` with the
stage and error type/status/code/slug/request ID, never provider message bodies. A scoped
API key's permissions cannot be edited; create and rotate a new key if needed.

References: [Auth configs](https://docs.composio.dev/reference/api-reference/auth-configs),
[Google Calendar managed auth](https://docs.composio.dev/toolkits/googlecalendar),
[Scopes](https://docs.composio.dev/docs/authentication/controlling-scopes),
[Key permissions](https://docs.composio.dev/reference/authenticating-to-composio/project-api-key-permissions),
[Callback identity verification](https://docs.composio.dev/reference/api-reference/connected-accounts),
[Revocation](https://docs.composio.dev/reference/api-reference/connected-accounts/postConnectedAccountsByNanoidRevoke).
