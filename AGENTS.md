# Harper Repository Instructions

## UI and design

- Before implementing or reviewing UI and design changes, read and follow `src/styles/Design.md`.
- Reuse components from `src/components/ui/` wherever possible. Check for a suitable shared component there before creating raw controls, local one-off UI components, or duplicated interaction and styling logic.

## Talent-side deployment update notes

- Whenever the user asks to deploy, review the changes included in that deployment and decide whether they contain information that Talent-side users may safely see. Do not edit or publish the update notes yet.
- Before modifying the update-note document or starting the deployment, ask the user for explicit confirmation. Start with `알겠습니다. Update notes는 아래와 같이 올릴까요?` and show every proposed row, including its date, tag, Korean content, and English content.
- Wait for the user's approval. Do not modify the update-note document, commit or push an update-note change, or deploy until the user explicitly confirms the proposed wording. If the user requests revisions without clearly approving deployment, present the revised proposal and ask again.
- If there is no qualifying Talent-side update, say so and ask whether to deploy without an update note rather than proceeding silently.
- After approval, add the confirmed rows to `public/docs/career-updates/index.json` and include that change in the deployment. Add new rows at the top of the array.
- Read any existing update notes first and follow their product voice, terminology, date format, and tag vocabulary. Historical notes may be removed or migrated, so follow the current update-note source and schema rather than assuming an old file structure.
- Keep the update-note data model minimal. Each user-visible change must be one independent row containing only:
  - date
  - content in Korean
  - content in English
  - tag
- Add an `id` only when the implementation requires a stable key or identifier. Do not add titles, summaries, nested item arrays, or other metadata unless the user explicitly requests them.
- Every row must include both Korean and English content. The two versions must communicate the same user-visible meaning naturally; do not omit either language or use a raw machine-like literal translation.
- Write from the Talent user's perspective in plain, lightweight language. Keep each row to one short sentence when possible and describe the visible outcome, not the implementation.
- Do not disclose internal implementation details, infrastructure, security-sensitive information, internal identifiers or metrics, unreleased work, or Company/Admin-only changes.
- Do not invent or force an update note when a deployment has no qualifying Talent-side change.
