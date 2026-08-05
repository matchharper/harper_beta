# Harper Repository Instructions

## Domain terminology

- The LLM that responds to companies in `/org` and Slack is called the
  **company-side LLM**. Use this term consistently in code comments,
  documentation, and implementation discussions.

## Interpreting examples

- Treat examples in user requests as illustrations of the underlying requirement,
  not as an exhaustive specification or a boundary on scope.
- Generalize the intended behavior across analogous entities, data sources,
  tables, fields, and output shapes. Do not hardcode or narrowly fit an
  implementation to the sample names, values, schema, wording, or format unless
  the user explicitly requires those exact details.
- Validate the generalized behavior with cases beyond the example when tests or
  verification are part of the task.

## UI and design

- Before implementing or reviewing UI and design changes, read and follow `src/styles/Design.md`.
- Reuse components from `src/components/ui/` wherever possible. Check for a suitable shared component there before creating raw controls, local one-off UI components, or duplicated interaction and styling logic.
