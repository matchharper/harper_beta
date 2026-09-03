# Harper Repository Instructions

## Production deployment

- Pushing the intended release commit to `origin/main` automatically triggers the production Vercel deployment. For the ordinary production path, do not run a separate manual Vercel deploy; verify the Git-triggered deployment and released commit after the push.

## Domain terminology

- The LLM that responds to companies in `/org` and Slack is called the
  **company-side LLM**. Use this term consistently in code comments,
  documentation, and implementation discussions.

## Company role fit recovery audit

- Before planning, changing, or running a Wonderful Role non-fit review,
  missing-fit review, or Company Role Fit Recovery Audit, read and follow all
  three canonical documents:
  - `docs/company/company-role-fit-recovery-audit-overview-ko.md`
  - `docs/company/company-role-fit-recovery-audit-codex-runbook-ko.md`
  - `docs/company/company-role-fit-recovery-audit-calibration-ko.md`
- Treat the overview as the product and data contract, the Codex runbook as the
  execution contract, and the calibration document as the source of current
  evaluator and retrieval changes. Do not substitute the Company Context Run
  documents for this audit's existing-non-fit workflow.

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

## Prompt and context design

- Treat a prompt as a general decision and writing contract, not a collection of answers for the current fixture, entity, role, interview type, or E2E scenario. Define the agent's role, goal, observable success criteria, evidence hierarchy, tool policy, output responsibility, and stop conditions. Examples illustrate judgment only; never make their names, values, length, paragraph count, or wording the rule.
- Prefer positive outcome criteria over accumulating prohibitions or exact phrases. Describe what the user must understand after the answer: how their latest message was interpreted and applied, what actually changed, what Harper will do next, what has not happened yet, and whether the user has a concrete next action. Let the LLM choose natural wording and proportional length for the current conversation.
- Apply context minimization before prompt instructions. If the final-writing LLM must not expose an internal value, do not provide that raw value and then tell it not to mention it. Omit unnecessary implementation data entirely; when a fact is needed, transform internal IDs, enums, booleans, queue states, tool names, and provider diagnostics into the smallest user-safe semantic fact before it enters the final-generation context.
- Keep code and prompt responsibilities separate. Code owns authorization, state transitions, verified facts, exact user-authored content, and required links. The LLM owns the surrounding explanation and conversational judgment. On successful actions, do not replace the whole LLM response with a deterministic success narrative. Deterministic text may be appended only for exact content or verified links that must not be changed. Server-authoritative failure and uncertainty boundaries may still override unsupported success claims.
- Tool descriptions define when a tool is appropriate, required inputs, effects, and continuation rules. They must not carry final-answer templates, hidden implementation vocabulary, or wording instructions that belong to the final-writing contract. Tool results for final generation should contain user-safe facts that are sufficient to write an accurate answer, including timing and incomplete states when they materially affect the experience.

## Conversational E2E quality

- A Slack, web-chat, demo, or E2E run is not successful merely because tools completed, data changed, or no exception occurred. Read the exact user-visible response in its full conversation and evaluate whether a capable first-time user can understand how their latest message was applied, what happened, what Harper will do next, what has not happened yet, and what they can do now.
- Reject an E2E result before handoff when the response is a mechanical receipt, loses the latest user context, exposes implementation vocabulary, overfits a fixture, repeats confirmation without a real decision, makes an unsupported delivery or Calendar claim, omits an important next step, or has an obviously poor tone. Fix the underlying prompt, context, data, or control-flow cause and rerun the scenario; do not report the run as satisfactory first and wait for the user to identify the UX defect.
- When a task explicitly asks for direct Slack or browser testing, inspect the rendered message and interaction experience as product output. Record the exact fixture scope and state transitions for safety, but judge completion primarily from the user's experience rather than logs alone.

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
- Before creating UI markup or a local component, search in this order: `src/components/ui/`, `src/components/common/`, then the relevant domain directory under `src/components/`. Reuse a suitable component or established composition before creating a new primitive.
- Never reimplement modal infrastructure such as portals, overlays, focus management, Escape handling, outside-click handling, or ARIA dialog wiring in a feature component. For `/career`, use `src/components/common/TalentCareerModal.tsx`; for generic Radix dialogs, use `src/components/ui/dialog.tsx`. A local wrapper may own domain content and actions, but not modal infrastructure.
- Keep the shared-component catalog and discovery rules in `src/styles/Design.md` current whenever a new reusable UI primitive or preferred composition is introduced.
