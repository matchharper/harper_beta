# Company onboarding UI preview

Run `pnpm dev`, then open `/org/onboarding-preview` on the local server.

- The toolbar jumps directly between all five steps, the Slack channel selector,
  and the alternate-email invitation dialog. The role selector previews draft,
  active, paused, and ended states.
- `?screen=company` opens a specific screen. Other values: `profile`, `slack`,
  `slack-channel`, `slack-invite`, `roles`, `done`.
- `?screen=roles&roleStatus=active` selects a role status.
- Add `&clean=1` to hide the preview toolbar for screenshots.

The preview renders the actual onboarding components with in-memory example
data. It needs no login or database migration and never saves a profile or
completion, sends invitations, connects Slack, opens the Slack app, or calls the
company-side LLM. It does not reset the real user's onboarding state.

The route returns 404 in production. This is a UI inspection tool, not a test
of authentication, OAuth, email delivery, database writes, or LLM behavior.
