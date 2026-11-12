# Career concept previews

Design rationale, reference sources, alternatives and acceptance flows:
[Career agent experience design](../../../../../docs/design/career-agent-experience-concepts-ko.md).

Local route: `/career/preview/concepts?concept=map`.
Development only (404 otherwise). No product data, agent, email or application APIs are called.
All companies, jobs, compensation, scores, dates, documents and conversations are synthetic.

The preview keeps the existing Career Floating Sky design and shared components.
Conversation and composer remain on the left; recommendations, tables and opportunity documents
use the right pane. Tables expand within the right pane, without resizing or covering the chat.

| concept | Default and interaction |
| --- | --- |
| map | Short recommendation list → open the prepared 16-job comparison → select → contextual chat draft |
| workspace | Current interview on overview, submitted files and preparation materials, document reader, notes and activity |
| interview | Same opportunity, research, sourced question examples, chat practice, repeatable records, quick briefing |
| apply | Checklist and review action in chat, resume diff and email draft on the right, final review of selected items |
| categories | Visible overlapping recommendation lenses, with shared saved state |
| explore | Quiet entry → 48-job dense table, search, filters, sorting, selection and saved state; no repeated direct-application label |
| metrics | Reason labels by default; a list-level switch compares numeric scores; disclosed/estimated/unknown compensation |

State is browser memory only. Scenes remain mounted so changing review tabs preserves the right pane,
filters, selections, drafts and documents. Reload resets the preview. Opening job details preserves
the underlying table and its scroll. Returning restores focus. Material edits survive interview
navigation inside the same opportunity. Each review scene is an independent scenario, not a separate
production feature route. Saved jobs and example practice records are shared for comparison.

New practice answers are recorded without pretending that an AI evaluated them. Previous rounds
contain authored example feedback. Freeform chat explicitly identifies the absence of an AI connection.
The final application action shows a simulated post-submission screen; it sends nothing.

Recommendation lists and posting details reuse the product OpportunityCard. The preview also reuses the product document card, tabs, buttons, checkbox, table and chat composer. The submitted resume opens as an example HTML document. The CSS module styles only this local preview.
Production UI and unrelated working changes are untouched.

## Review record — 2026-11-11

- Targeted TypeScript diagnostics for the seven concept source files: no errors.
- Browser: deferred comparison entry, two-row selection and contextual draft; visible category lenses;
  48-row catalogue, ML search (9 results), remote filter (1 result), detail and return retaining query/filter,
  selection and save; original resume and optional email review; all changes excluded still proceeds;
  material creation retained across interview navigation; chat answer saved as a new practice round;
  quick briefing; reason/score comparison and compensation filtering.
- Desktop layout checked at 1440px and 1200px. Tables keep columns through internal horizontal scrolling;
  mobile product UX is outside this desktop prototype's scope.
- No deployment or real submissions. No broad repository tests were added for these visual fixtures.
