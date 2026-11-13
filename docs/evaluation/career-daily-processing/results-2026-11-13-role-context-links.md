# Role facts and email links — 2026-11-13

Local implementation and isolated verification. No deployment, production migration or candidate email was performed.

## Source-path findings

- #60: `read_career_internal_role_v1` replaced Role title, description and company facts with the latest published `official_jobs` variant. `get_role_context`, internal application receipts and company-introduction context consumed that projection. The new migration reads the company's public Role and company record for named employers. Anonymous employers expose reviewed public advertisements individually, with their own identity and description, rather than choosing one advertisement as the common Role description. Raw anonymous Role text and its cached summary are not fallback sources.
- The source data also connected two multi-company acquisition postings to individual employers. A separate, unapplied repair migration clears those two mappings and replaces the misleading ML advertisement with its linked Role's public JD. Existing public URLs are preserved; changed reviewed rows abort the repair. The public-posting authoring contract now describes `role_id` as the actual single hiring destination.
- #21: the scheduled prompt and delivery-body schema requested `[company / role](roleId)`, while outbound/proactive email guidance called for usable URLs. Saved-opportunity reads and matching receipts lacked a concrete Career URL. No instruction or template for the observed `/career/opportunities/{id}`, `/career/roles/{id}`, or `/career?roleId=...` formats was found in the inspected runtime path. Generated delivery bodies already contained those addresses, and the Markdown renderer preserved them. The missing route facts and mixed conventions explain the opportunity for generation to invent a path; the model's internal reason is not observable.
- The actual scheduled prompt path uses `career_main` and `scheduled_work`; it excludes the web `career_chat_display` block. Recent prior messages inspected for the three affected conversations did not contain the same invalid paths. This is a reconstruction from source, stored messages/tool results and delivery payloads, not a complete retained historical provider request.

## Changes and checks

The common `careerOpportunityUrl` builder supplies `/career/history?historyTab=new&id={roleId}` through saved-opportunity reads, Role context with an existing recommendation, matching/list receipts, internal-application receipts and company-introduction context. Unsaved search evaluations receive no saved-opportunity URL. The email instruction now uses supplied URLs; the old UUID renderer remains compatible with historical content. No new route-guessing rewrite, semantic filter or judging model was added.

39 focused Node/PGlite tests pass. They execute the actual SQL projection, public-data repair, search and pending-proposal queries, verify anonymous sharing scope and concurrent-edit rejection, and check the supplied URL through HTML/plain-text email rendering. The proposal reader resolves all published ad IDs/slugs to their actual selected Role and labels anonymous advertisement titles separately. TypeScript `tsc --noEmit --incremental false` passes.

## Model probes

Canonical runner: `scripts/evalCareerDailyProcessing.ts`. Production scheduled model: `claude-haiku-5-5`; current production prompt/capability/provider loop, synthetic tool receipts, provider-only networking and no real email.

| Case | Frozen data / run | Observed result |
| --- | --- | --- |
| External recommendation | role-context-links-v1 / `2026-11-13T06-24-15-303Z` | One supplied saved-Role link; external application path distinguished. |
| Mixed recommendation | Same | Two links select the respective saved internal/external Roles. |
| Earlier ML requirement | Same | Corrected the earlier production-ML/PyTorch claim using the engineering JD; described the candidate as a reasonable core-requirement match. |
| Earlier multi-company attribution | role-context-links-v2 / `2026-11-13T06-25-28-567Z` | Identified the actual single hiring employer and corrected the earlier pooled-company description. |

All five opportunity links in these four outputs were supplied in model tool results, selected the expected Role ID, and survived rendering in both email parts. Each turn ended with one fixture email call. Full provider requests, responses and tool inputs were reviewed in ignored, owner-only `runs/` files.

v1's single-employer fixture inherited `workMode: Hybrid` while its JD said on-site. The model used Hybrid. v2 corrects that fixture field, preserves v1 and reruns only the changed case; the corrected output says on-site. This was an input-data defect, not evidence of a product fix.

The probes establish the intended source and link behavior for these examples, not general writing quality or delivery reliability. One ML-correction output also called LLM application experience the candidate's “main gap,” although the synthetic candidate only said she had not trained models. That broader inference is not established by the fixture, and this run is not a full factual-quality pass. The existing prompt already requires personal claims to retain evidence and uncertainty; no example-specific rule was added. Anonymous advertisement separation is covered by database and provider-facing projection tests, not these named-employer model probes.

## Remaining operational work

Apply the reviewed migrations and web release only with explicit deployment authorization. The public-data repair intentionally aborts if a reviewed posting has since changed. After application, verify current public detail/apply destinations, and separately prepare authorized corrections to affected candidates; existing sent emails and candidate decisions were not changed by this local work. LinkedIn copies were not edited.
