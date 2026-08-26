# Company employee Google Calendar connection

## Current scope

`/org/settings` → **Personal integrations** connects the signed-in employee's
Google Calendar through Composio. It does not read calendars, create events,
send invitations, generate Meet links, or add company-side LLM tools.
The worker and shared Slack integration are unchanged.

Connections belong to `company_users.user_id`, not a workspace. Owner, Admin,
and Viewer can each manage only their own connection. The same personal
connection is used across that employee's workspaces; workspace access is
checked independently on every request.

## Manual configuration

1. In the existing Composio project, create a Google Calendar (`googlecalendar`)
   Auth Config using **OAuth2 / Composio managed auth**.
2. Set the agreed scopes for future calendar features:
   `https://www.googleapis.com/auth/calendar.readonly` and
   `https://www.googleapis.com/auth/calendar.events`. This MVP never executes
   calendar tools, even though the user grants these scopes.
3. Set these **server-only** variables in `harper_beta/.env.local` and the
   deployment environment:

   ```env
   COMPOSIO_API_KEY="your-existing-project-api-key"
   COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID="ac_your_calendar_config"
   ```

   The API key must have **Connected accounts: Read and write**. It must be
   in the same project as the Auth Config. Do not reuse the Gmail Auth Config
   ID, add `NEXT_PUBLIC_`, or paste keys into chat/source control.
4. `public.company_user_integrations` must already exist with the previously
   supplied schema: `(company_user_id, provider)` primary key, unique Composio
   account ID, status, timestamps and the `company_users(user_id)` foreign key.
   Keep RLS enabled and revoke browser-role grants; only the backend service
   role accesses this table. This feature does not run DDL or add tables.
5. Restart the development server (stop it, then `npm run dev`); redeploy for
   production environment changes. Connect from the Harper UI, not from a
   dashboard connection owned by a Composio dashboard user.

No Google client secret, access/refresh token, calendar ID, or toolkit version
needs to be entered for this connection-only MVP. Composio manages OAuth.
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
  Composio errors do not turn transient outages or key-permission failures into
  a false "expired" state. API diagnostics redact secrets and never dump rows
  or raw vendor connection objects.
- This feature does not change Composio's **project-wide callback identity
  verifier** setting. If enabled, Composio ignores normal `callback_url` and
  uses its separate `session_uri` verification flow; that project-wide
  migration must be configured separately, including existing integrations.
  The normal Connect Link callback is the prerequisite here.

  The Harper cookie/ownership checks are not a substitute for Composio's
  pre-activation identity verifier against a deliberately forwarded OAuth
  link (session fixation). Before adding inbox/calendar execution tools for
  untrusted end users, plan that project-wide verification rollout. It is not
  silently enabled by this connection-only MVP.

## Verification

```sh
node --import tsx --test src/lib/integrations/*.test.ts
npx next typegen
npx tsc --noEmit --incremental false
```

With real config values, log in as a company member, open Integrations, connect,
approve Google consent, and verify that the row has your Harper user ID and
`provider=google_calendar`. Refresh, disconnect, and test a second employee.
Do not create an event as a smoke test: scheduling is outside this MVP.

Safe diagnostics are labeled `[GoogleCalendarIntegration] failed` with the
stage and error type/status/code/slug/request ID, never provider message bodies. A scoped
API key's permissions cannot be edited; create and rotate a new key if needed.

References: [Auth configs](https://docs.composio.dev/reference/api-reference/auth-configs),
[Google Calendar managed auth](https://docs.composio.dev/toolkits/googlecalendar),
[Scopes](https://docs.composio.dev/docs/authentication/controlling-scopes),
[Key permissions](https://docs.composio.dev/reference/authenticating-to-composio/project-api-key-permissions),
[Callback identity verification](https://docs.composio.dev/reference/api-reference/connected-accounts),
[Revocation](https://docs.composio.dev/reference/api-reference/connected-accounts/postConnectedAccountsByNanoidRevoke).
