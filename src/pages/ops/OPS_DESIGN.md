# Ops Design Guide

Reference source: `src/styles/Design.md` and `src/components/ui`.

## Intent

`/ops` pages are dense internal tools. They should use Harper's shared neutral/accent/status system, not the old landing beige palette or ad hoc admin gray UI.

## Core Rules

- Base the palette on `bg-bg-*`, `neutral-*`, `primary`, `positive`, `info`, and `critical`.
- Default rounding is `rounded-md` and `rounded-lg`.
- Do not use `rounded-2xl`, `rounded-3xl`, or pill-heavy styling unless there is a very strong reason.
- Avoid stacking borders everywhere. Large surfaces should usually be separated by background contrast and shadow, not outlines.
- Inputs can keep a single subtle border because they need a clear interactive affordance.
- Prefer one strong panel shadow plus soft inset highlights over repeated card borders.
- Do not force uppercase labels with Tailwind `uppercase`.
- When using slash opacity utilities, stick to 5-step values like `/35`, `/40`, `/55`, `/70`, `/80`.

## Surface Hierarchy

- Page background: `bg-bg-basement`
- Primary panel: `bg-bg-default/90` with soft outer shadow
- Secondary inset surface: `bg-bg-default/70`, `bg-bg-weak`, or `bg-bg-floating`
- Active state: `bg-black` with `text-neutral-00`
- Muted copy: `text-neutral-muted` or `text-neutral-muted`

## Reusable Tokens

Use `src/components/ops/theme.ts` first before inventing page-local classes.

- `opsTheme.page`
- `opsTheme.panel`
- `opsTheme.panelSoft`
- `opsTheme.panelMuted`
- `opsTheme.buttonPrimary`
- `opsTheme.buttonSecondary`
- `opsTheme.buttonSoft`
- `opsTheme.input`
- `opsTheme.textarea`
- `opsTheme.eyebrow`
- `opsTheme.title`
- `opsTheme.titleSm`

## Interaction Rules

- Primary actions should use `bg-black text-neutral-00`.
- Secondary actions should sit on `bg-bg-weak`, `bg-bg-floating`, or `bg-bg-default`.
- Selected rows can invert to `bg-black text-neutral-00` to create a clear focus state.
- Use dividers only where scanning dense data benefits from them, such as detail rows or long lists.

## Do

- Keep layout breathable with generous padding.
- Let one large surface define each section.
- Use subtle motion and hover changes only when they help orientation.
- Reuse the same button and panel vocabulary across all `/ops` screens.

## Avoid

- Legacy warm palette tokens, old gray aliases, old accent aliases, and raw red/green/blue UI colors.
- Border around every nested box.
- Huge rounded corners.
- Multiple visual systems inside a single page.
