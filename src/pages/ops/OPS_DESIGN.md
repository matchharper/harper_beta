# Ops Design Guide

Reference source: `src/pages/index.tsx`

## Intent

`/ops` pages are internal tools, but they should still feel like Harper.
Use the same warm beige language as the landing page instead of default gray admin UI.

## Core Rules

- Base the palette on `beige100`, `beige200`, `beige500`, `beige900`.
- Use `font-halant` for major headings and `font-geist` for controls, labels, and body copy.
- Default rounding is `rounded-md` and `rounded-lg`.
- Do not use `rounded-2xl`, `rounded-3xl`, or pill-heavy styling unless there is a very strong reason.
- Avoid stacking borders everywhere. Large surfaces should usually be separated by background contrast and shadow, not outlines.
- Inputs can keep a single subtle border because they need a clear interactive affordance.
- Prefer one strong panel shadow plus soft inset highlights over repeated card borders.
- Do not force uppercase labels with Tailwind `uppercase`.
- When using slash opacity utilities, stick to 5-step values like `/35`, `/40`, `/55`, `/70`, `/80`.

## Surface Hierarchy

- Page background: `bg-beige200`
- Primary panel: `bg-beige100/90` with soft outer shadow
- Secondary inset surface: `bg-white/60` or `bg-beige500/55`
- Active state: `bg-beige900` with `text-beige100`
- Muted copy: `text-beige900/65`

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

- Primary actions should be dark beige buttons, not black/gray default admin buttons.
- Secondary actions should sit on beige or white softened surfaces.
- Selected rows can invert to `beige900` to create a clear focus state.
- Use dividers only where scanning dense data benefits from them, such as detail rows or long lists.

## Do

- Keep layout breathable with generous padding.
- Let one large surface define each section.
- Use subtle motion and hover changes only when they help orientation.
- Reuse the same button and panel vocabulary across all `/ops` screens.

## Avoid

- Neutral gray dashboards unless the page is embedding a third-party view.
- Border around every nested box.
- Huge rounded corners.
- Multiple visual systems inside a single page.
