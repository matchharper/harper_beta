# Company onboarding UI preview

## Completion handoff (local implementation)

The completion request saves onboarding first. If the teammate's email resolves
to a Slack account, it checks membership in enabled, linked channels in name
order. The first channel they actually belong to receives a mention followed by
a welcome in its thread. The existing company-side LLM receives a compact
channel-safe role index, the teammate's saved Calendar connection status and
settings link. Only after both messages are delivered does the response provide
the Slack message link for the page to open. No joined channel means no Slack
generation, send or navigation. Slack failures leave onboarding completed and
keep the teammate on the web. The existing completion update and Slack message
identity provide ordinary retry protection; no extra welcome queue or table is
introduced. This section does not claim production deployment.

## Preview

Run `pnpm dev`, then open `/org/onboarding-preview` on the local server.
You can also open it in a new tab from `/org/home` → Dev controls →
`온보딩 조건별 미리보기 열기` (`Open onboarding previews`).

- Select a signup flow: `flow=first` (first teammate in an existing workspace),
  `flow=joining` (a later teammate), `flow=new` (no workspace, then signup), or
  `flow=additional` (add an Organization from an existing account).
  Changing the flow starts at its entry screen. Only applicable step buttons are
  shown, using the real onboarding step and first-teammate permission helpers.
- `authority=owner|admin|viewer` changes existing-workspace permissions. New and
  additional workspace creators are Owners. `profile=empty|ready` selects whether
  the name and title are already filled; an additional Organization skips the
  profile step only when both are filled, and never adds the signup plan step.
- The toolbar jumps between applicable steps, the Slack channel selector, and the
  alternate-email invitation dialog. The role selector previews no role, draft,
  active, paused, and ended states.
- `?screen=company` opens a specific screen. Other values: `entry`,
  `organization-create`, `profile`, `company-details`, `slack`, `slack-channel`,
  `slack-invite`, `roles`, `plan`, `guide`, `done`. An unavailable screen falls back to the
  first applicable one.
- `guide` always appears immediately before completion, outside the progress
  count and with no progress bar. It explains three things users can ask Harper to do in a lightweight
  icon/title/description list. Plan selection also continues through this step.
  Edit `OrgOnboardingGuide.tsx` for guide-step design: `OrgOnboardingGuideHeader`
  owns the centered icon above the title, and `OrgOnboardingGuideBody` owns the
  list spacing and typography. The translated title and `guideItems` copy remain
  in `OrgOnboardingPage.tsx`.
- `?flow=new` starts with the real signup-entry component; its preview-only button
  simulates workspace creation. **Ordinary no-workspace entry currently pauses
  self-serve signup** in `OrgWorkspaceApp`; this option does not enable it.
- `?flow=additional` starts with the real Organization creation form. Its preview
  submits only to a local callback, then opens company confirmation.
- `?screen=roles&roleStatus=active` selects a role status.
- `?screen=done&roleStatus=none` shows completion when no role is set. The role
  step is skipped, as it is in the actual onboarding flow.
- Use the Slack selector (or add `&slack=off`) to preview completion without a
  connected Slack channel.
  `slack=on` connects the workspace without a channel; `slack=channel` also
  connects the example channel. The default follows the selected screen.
- Add `&clean=1` to hide the preview toolbar for screenshots.

The preview renders the actual onboarding components with in-memory example
data. It needs no database migration and never saves a profile or
completion, creates a workspace, sends invitations, connects Slack, opens the
Slack app, launches checkout, or calls the company-side LLM. Signup, company
confirmation and billing reads are disabled. Free/paid plan actions are local
callbacks; the slot dialog uses the existing example price catalog.
It does not reset the real user's onboarding state.

In production, the page renders only for signed-in accounts allowed to use Org
dev controls; other accounts see a 404 screen. Local development needs no login.
This is a UI inspection tool, not a test
of authentication, OAuth, email delivery, database writes, or LLM behavior.
