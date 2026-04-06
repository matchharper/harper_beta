# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm 10** (see `packageManager` field). Use pnpm, not npm/yarn.

- `pnpm dev` — Next.js dev server
- `pnpm build` — production build (`next build`)
- `pnpm start` — run built app
- `pnpm lint` — `next lint` (ESLint with `eslint-config-next`)

There is no test runner configured in `package.json`.

## Architecture

### Next.js hybrid router layout
This is Next.js **13.5** with **both routers active simultaneously**:

- **`src/pages/`** — Pages Router hosts the entire UI (every user-facing route: `index.tsx`, `search.tsx`, `talent.tsx`, `adminpage.tsx`, `my/`, `ops/`, `blog/`, `share/`, etc.). `_app.tsx` and `_document.tsx` are the global shell.
- **`src/app/api/`** — App Router is used **only for API route handlers** (plus `src/app/layout.tsx` and `src/app/auth/`). When adding a new backend endpoint, create it under `src/app/api/<name>/route.ts`, not `pages/api/`.

Path alias `@/*` → `src/*` (see `tsconfig.json`).

### Edge middleware
`src/middleware.ts` rewrites the root path of the `app.*` subdomain to `/radar`. The marketing site and the logged-in app are served from the same Next deployment but distinguished by host.

### Supabase data layer
- **`src/lib/supabase.ts`** — browser client, uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Import this in client components / pages.
- **`src/lib/supabaseServer.ts`** — server client, prefers `SUPABASE_SERVICE_ROLE_KEY` and falls back to the anon key. Also exports `getRequestUser(req)` which validates a `Authorization: Bearer <token>` header and returns the Supabase user. API routes that need per-user authorization should call `getRequestUser` rather than trusting request bodies.
- **Never** expose the service-role client or `SUPABASE_SERVICE_ROLE_KEY` to the browser bundle.
- **`supabase/migrations/`** holds dated SQL migrations (e.g. `20260403_candidate_outreach_message_sending.sql`). Generated DB types live in `src/types/database.types.ts` and are imported as `Database` generic into both clients.

### Domain-organized libraries
`src/lib/` is split by product domain, not by technical layer. The main domains (each has its own subdirectory or file cluster):

- **ats / talent network** — candidate outreach, sequencing, workspace bookmarks (`lib/ats/`, `talentNetwork*.ts`, `candidateMark.ts`, `profileReveal.ts`)
- **llm + search** — model calls, parsing, cursor/evidence for candidate search (`lib/llm/`, `lib/server/search.ts`, `lib/server/cursor.ts`, `searchEvidence.ts`, `searchSource.ts`, `searchParallelLimit.ts`)
- **billing** — Toss Payments integration (`lib/billing/`, `lib/toss/`, `@tosspayments/tosspayments-sdk`)
- **voice** — STT via Deepgram, TTS via ElevenLabs (`lib/stt/`, `lib/tts/`)
- **ops / admin / internal** — operator tooling, admin metrics, internal API auth (`lib/admin.ts`, `lib/adminMetrics/`, `lib/internalAccess.ts`, `lib/internalApi*.ts`, `lib/opsNetwork*.ts`, `lib/networkOps.ts`)
- **integrations** — Slack webhooks (`lib/slack.ts`), Notion (`lib/notion/`), GitHub & Scholar previews (`lib/githubPreview.ts`, `lib/scholarPreview.ts`)
- **blog** — `lib/blog.ts` (client-safe) vs `lib/blog.server.ts` (server-only). Follow this `.server.ts` suffix convention when a module must not leak into the client bundle.

When extending a feature, prefer adding to the existing domain module over creating new top-level ones.

### State / data-fetching
- **TanStack Query v5** is the primary client-data layer. Hooks in `src/hooks/` (e.g. `useCandidateDetail`, `useBookmarkFolders`, `useAtsWorkspace`) wrap `useQuery`/`useMutation` around the API routes.
- **Zustand** (`src/store/`) for cross-page UI state.
- `src/components/Provider.tsx` wires the QueryClient and context providers into `_app.tsx`.

### Scheduled jobs
Vercel Cron runs two endpoints (`vercel.json`):
- `/api/internal/ats/sweep` — every minute
- `/api/internal/billing/sweep` — every 15 min

Endpoints under `src/app/api/internal/**` are privileged. They should authenticate via the helpers in `lib/internalAccess.ts` / `lib/internalApi.ts` rather than user sessions.

### Security headers
`next.config.mjs` sets strict headers globally (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` allowing only `microphone=(self)`). If you add a feature that needs camera / geolocation / iframe embedding, update this header block — do not work around it ad-hoc.

`apify-client` and `proxy-agent` are declared in `serverComponentsExternalPackages` and must not be imported from client code. SVGs are handled via `@svgr/webpack` (import `.svg` as a React component).

## Repo conventions

- Internal planning and runbooks live in `agents/*.md` (Korean). Notable: `RLS_REENABLE_RUNBOOK_KO.md`, `SECURITY_IMPROVEMENT_REPORT_KO.md`, `TALENT_CONVERSATIONAL_ONBOARDING_BLUEPRINT_KO.md`. Consult these before making security- or onboarding-related changes — they capture historical decisions and in-progress migrations.
- Product/design reference: `docs/career-design-guidelines.md`.
- `tsconfig.json` has `reactStrictMode: false` disabled in `next.config.mjs`; don't rely on double-invocation behavior in effects.
