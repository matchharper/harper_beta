# UI Component Guide

`src/components/ui` is the single source of truth for shared product UI. Do not add domain-specific forks such as `beige/*`, `career/*`, or duplicate `Tag`/`Pill` components. Extend the existing component when a shared UI state is missing.

Color usage must follow `src/styles/Design.md`.

## Rules

1. Use semantic tokens first: `bg-bg-*`, `text-neutral-*`, `primary`, `positive`, `info`, `critical`.
2. Do not use old aliases in new code: `gray-*`, `paper`, `layer-*`, `fg-*`, `stroke-*`, `status-*`.
3. Interactive resting surfaces should usually be `bg-bg-floating`; hover, active, selected, and nested weak surfaces should use `bg-bg-weak`.
4. Use `beige*` only for legacy compatibility. Do not create new beige components.
5. Prefer shared components over repeated class strings. Page layout can stay local; repeated controls belong here.
6. Use `BareButton` only as a migration bridge when replacing raw button markup would otherwise change current layout too much.

## Components

### `Text`

Use `Text` for repeated typography decisions.

```tsx
<Text as="h2" variant="head2" tone="primary">Title</Text>
<Text variant="body" tone="caption">Supporting copy</Text>
```

Use `tone="primary"` for important copy, `caption` for secondary copy, `third` for faint helper text, `disabled` for disabled UI, `link` for links, and `inverted` on dark fills.

### `Button`

Use `Button` for standard actions.

```tsx
<Button variant="default">Filter</Button>
<Button variant="primary">Save</Button>
<Button variant="black">Create</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="critical">Delete</Button>
<Button variant="positive">Confirm</Button>
```

Allowed variants are `default`, `primary`, `black`, `secondary`, `critical`, and `positive`.

Use `IconButton` for icon-only controls, `ActionButton` for compact repeated workspace actions, and `AnimatedButton` only when the text animation is intentionally part of the interaction.

Use `MuteButton` for compact, low-emphasis actions that need a quieter surface
than the standard `Button`.

```tsx
<MuteButton>Default</MuteButton>
<MuteButton variant="dark">Dark</MuteButton>
<MuteButton variant="primary">Primary</MuteButton>
<MuteButton variant="transparent">Transparent</MuteButton>
<MuteButton variant="warn">Warn</MuteButton>
<MuteButton variant="neutral">Neutral</MuteButton>
```

Its variants are `dark`, `primary`, `default`, `transparent`, `warn`, and
`neutral`; its sizes are `sm`, `md`, and `lg`. Icon-only buttons keep the
size's base horizontal padding. When the children contain text, `MuteButton`
automatically adds `2px` of horizontal padding on each side. Text-only buttons
also subtract `2px` from the size's vertical padding.

### `CardButton`

Use `CardButton` when a whole card is the button.

```tsx
<CardButton selected={isSelected} onClick={select}>
  <div>Opportunity</div>
</CardButton>
```

Use `InteractiveCard` and `ChoiceCard` only for existing callsites. New clickable cards should use `CardButton` directly.

### `Badge`

`Badge` replaces tag, pill, and domain-specific label components.

```tsx
<Badge variant="faded">Draft</Badge>
<Badge tone="positive" variant="faded">Active</Badge>
```

Use badges for compact labels, statuses, metadata chips, and keyboard hints.

### Forms

Use `Input`, `TextField`, `Textarea`, `Select`, `Checkbox`, `Switch`, and `Radio` instead of raw controls when the visual treatment is shared.

```tsx
<TextField label="Website" helperText="Include https:// if available" />
<Textarea rows={5} />
<Switch checked={enabled} onCheckedChange={setEnabled} />
```

Controls should rest on `bg-bg-floating` with neutral borders and use `text-neutral-placeholder` for placeholders.

Use `FilterChipGroup` when multiple temporary list filters can be active at the
same time. Keep `Switch` for persistent settings.

```tsx
<FilterChipGroup
  aria-label="Candidate filters"
  label="Filters"
  options={[
    { label: "Unread", value: "unread" },
    { label: "Waiting", value: "waiting" },
  ]}
  value={filters}
  onValueChange={setFilters}
/>
```

### Navigation And Menus

Use `Tabs` for tab lists, `ActionDropdown` for simple command menus, and `DropdownMenu` primitives for grouped menus, radio items, check items, or submenus.

Dropdown triggers and menu content should use `bg-bg-floating`; menu item hover and selected states should use `bg-bg-weak`.

### Cards And Panels

Use `Card` for repeated content blocks, `InlinePanel` for lightweight grouped content inside a page, `ClickablePanel` for a panel area that opens a detail view, and `ProgressBar` for progress.

Cards and panels should default to `bg-bg-floating`; nested metadata boxes and icon wells should use `bg-bg-weak`.

## Adding Or Changing Components

1. Check whether an existing component can represent the need with a prop or variant.
2. Add the smallest semantic prop needed.
3. Use tokens from `src/styles/Design.md`.
4. Update this file when component usage changes.
5. Update callsites to use the shared component instead of local copies.
