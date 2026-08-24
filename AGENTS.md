# Harper Repository Instructions

## Domain terminology

- The LLM that responds to companies in `/org` and Slack is called the
  **company-side LLM**. Use this term consistently in code comments,
  documentation, and implementation discussions.

## Company-side UX writing

- Before creating, changing, or reviewing any user-facing wording for the
  company-side LLM, `/org`, or company-facing Slack, read and follow
  `docs/company-side-ux-writing-guide-ko.md`.
- This includes generated replies, prompts that shape those replies,
  deterministic messages, notifications, buttons, modal copy, status labels,
  empty states, and errors.
- Verify the actual product behavior before changing copy. Keep equivalent web
  and Slack flows aligned, and update the guide when introducing a new recurring
  term or writing pattern.

## Interpreting examples

- Treat examples in user requests as illustrations of the underlying requirement,
  not as an exhaustive specification or a boundary on scope.
- Generalize the intended behavior across analogous entities, data sources,
  tables, fields, and output shapes. Do not hardcode or narrowly fit an
  implementation to the sample names, values, schema, wording, or format unless
  the user explicitly requires those exact details.
- Validate the generalized behavior with cases beyond the example when tests or
  verification are part of the task.
- Agent-system data must accommodate diverse inputs an LLM may generate; avoid overly restrictive database constraints that reject otherwise valid variations.

## Career translations

- Before planning, changing, reviewing, or synchronizing `/career` translations,
  read and follow `scripts/translation.md`.
- Codex must author every new or changed English translation directly after
  reading its code and product context. Never use Gemini, another LLM, or an
  automatic translation API for this work, including drafts and fallbacks.
- Only keys created or changed from code in the current translation plan may be
  written to the translation DB. Pull-only DB differences must update local
  dictionaries without being written back.

## UI and design

- Before implementing or reviewing UI and design changes, read and follow `src/styles/Design.md`.
- Reuse components from `src/components/ui/` wherever possible. Check for a suitable shared component there before creating raw controls, local one-off UI components, or duplicated interaction and styling logic.
