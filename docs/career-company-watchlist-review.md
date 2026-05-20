# Career Company Watchlist Review

Date: 2026-05-19

## Current Scope

The watchlist feature now has these product surfaces:

- `GET /api/talent/company-watchlist`: paginated company list and company detail.
- `POST /api/talent/company-watchlist/recommendations`: DB-first company recommendation generation.
- `POST /api/talent/company-watchlist/follow`: follow/unfollow plus activity event and follow-up trigger metadata.
- `POST /api/talent/company-watchlist/follow-followup`: delayed assistant follow-up for a still-followed company.
- `/career/watchlist`: recommended and following company views backed by the company-watchlist API. The signals tab is intentionally empty until a real signal-event feed exists.

The recommendation process is intentionally company-level. It uses active `company_roles` as hiring signal, joins to `company_workspace` and `company_db`, scores candidates deterministically, then asks the LLM to rank a small shortlist and produce Korean reasons/signals.

## Changes Made In This Pass

- Added a fresh-recommendation reuse path. If the user already has enough non-dismissed company recommendations from the last 18 hours and the request is not a custom search, the server returns the saved page without rebuilding the candidate pool or calling the LLM.
- Reduced LLM ranking input size from 50 company cards to 32, trimmed profile context to 3,600 chars, capped company descriptions, and sent only the top 3 role previews per company card.
- Removed O(n) deterministic-score lookups during persistence by keeping score/candidate maps.
- Treated `is_expired is not true` as active-role eligible, matching the rest of the Career code path and avoiding accidental exclusion of null legacy rows.
- Left the `signals` tab empty for now. It should not show company cards until real signal events are available.
- Changed company follow behavior to match the position feedback trigger pattern. Follow no longer inserts user/assistant chat rows synchronously; the client schedules a delayed follow-up route and cancels it if the user sends a message first.
- Enriched company detail responses with `company_db` fields such as Crunchbase information, last Crunchbase update time, related links, employee range, investors, and specialties.
- Reworked the watchlist UI to use the same in-page/mobile tab components as the position views, removed explanatory card sections, removed active-position previews from company detail, and moved company detail sections to divider-based layouts.
- Added DB indexes for fresh recommendation reads, active role scans, workspace role previews, and best-workspace selection.

## Cost And Performance Notes

The expensive step is the LLM ranker. It should remain a second-stage reranker, not the primary retrieval engine. The current flow is:

1. Pull recent active hiring signals from `company_roles`.
2. Join only the needed workspaces and companies.
3. Score candidates in TypeScript using token overlap, role count, workspace quality, and role recency.
4. Send only the top deterministic shortlist to the LLM.
5. Upsert selected company recommendations and reuse saved rows when fresh.

This keeps the common repeat-open path cheap and makes the first generation bounded. If recommendation traffic grows, the next cost cut should be moving candidate retrieval into a SQL/RPC query or materialized view so the API does not fetch recent role rows that are later discarded in application code.

## Recommended Next Work

1. Add a real `company_signal_event` table and worker. Store funding/news/founder/team/hiring events separately, then let the signals tab render event history instead of company cards or summary text copied from recommendation/follow rows.
2. Move generation to an async run model. `POST /recommendations` should enqueue a `company_watchlist_recommendation_run` and the UI should poll/stream status; synchronous LLM ranking is acceptable for MVP but will feel fragile under latency spikes.
3. Add request/profile hash columns to `talent_company_recommendation`. That would allow safe cache reuse for repeated custom requests, not only generic watchlist generation.
4. Build a company-level retrieval table or materialized view with `company_db_id`, active role counts, latest role timestamp, keyword TSV, workspace quality, and source coverage.
5. Add negative feedback and dismiss flows in the UI. The table already has `dismissed_at`; the product should let users remove a company and use that signal in future ranking.
6. Add tests around cache behavior, the empty signals tab contract, follow idempotency, delayed follow-up cancellation, and recommendation persistence. The current code typechecks, but there is no dedicated regression coverage for this new surface yet.
7. Add observability for `career/company_recommendations:rank`: LLM call count, cache-hit rate, candidate count, saved count, and p95 route duration.

## Open Risks

- The candidate pool still depends on recent active `company_roles`. Good companies without current roles will not appear until a broader company-discovery source is added.
- The LLM reason text is generated from condensed cards, so detailed claims should stay conservative unless backed by structured company intelligence.
- The signals tab is intentionally blank. It should not be positioned as a monitoring feed until event ingestion exists.
