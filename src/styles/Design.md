# Harper Design Tokens

이 문서는 `src/globals.css`의 `@theme` 토큰을 기준으로 한다. 새 UI는 토큰 이름만 보고 용도를 알 수 있어야 하므로, 화면 코드에서는 가능한 semantic token을 먼저 쓰고 palette token은 보조적으로만 쓴다.

## 핵심 원칙

1. 배경은 `bg-bg-*`, 텍스트는 `text-neutral-*`, 상태는 `positive/info/critical`, 브랜드 포인트는 `primary`를 먼저 쓴다.
2. `gray-*`, `paper`, `layer-*`, `fg-*`, `stroke-*`, `status-*`는 새 코드에서 쓰지 않는다.
3. 클릭 가능한 기본 표면은 배경보다 어두워지지 않는다. 버튼, input, dropdown, 카드 컨텐츠는 기본적으로 `bg-bg-floating`을 쓴다.
4. 어두운 채움은 명확한 CTA나 상태 표현에만 쓴다. 일반 카드, input, dropdown, 탭의 resting state에는 쓰지 않는다.
5. border는 별도 semantic token을 늘리지 않는다. 보통 `border-neutral-1000-a05`, 기본 control은 `border-neutral-1000-a10`, 강한 선택 상태는 `border-neutral-800`을 쓴다.

## Color Palette

Palette token은 색상 자체를 정의한다. 직접 써도 되지만, 레이아웃과 컴포넌트 표면에는 아래 semantic token을 우선한다.

| Token | Use |
| --- | --- |
| `neutral-00` | 거의 흰 표면, 밝은 텍스트 |
| `neutral-100` | 앱/페이지의 가장 낮은 바닥 |
| `neutral-200` | 약한 박스, hover, selected background |
| `neutral-300` | 기본 구분선 |
| `neutral-400` | 조금 더 보이는 control border |
| `neutral-500` | placeholder, disabled text |
| `neutral-600` | 아주 낮은 강조의 보조 텍스트 |
| `neutral-700` | caption, secondary text |
| `neutral-800` | 선택된 border, 강한 보조 텍스트 |
| `neutral-900` | dark hover, 강한 텍스트 |
| `neutral-1000` | 가장 강한 텍스트 |
| `neutral-1000-a05` | 아주 약한 stroke/fill |
| `neutral-1000-a10` | 기본 control stroke/focus ring |
| `accent-100/200/300/500` | 브랜드 warm accent. `accent-500`은 `primary` |
| `blue-100/500/700` | 링크나 정보성 UI의 원색 |
| `green-100/500/700` | 긍정/완료성 UI의 원색 |
| `positive-100/500`, `info-100/500`, `critical-100/500` | 상태 색상의 source palette |
| `black`, `white` | 고대비 특수 상황 |
| `beige*` | legacy. 기존 화면 호환용이며 새 코드에서는 우선 사용하지 않는다 |

## Semantic Tokens

### Background

| Token | When to use |
| --- | --- |
| `bg-bg-basement` | 페이지 전체, 앱 shell, 큰 화면 바닥 |
| `bg-bg-default` | 일반 section, 화면 안의 기본 레이어 |
| `bg-bg-floating` | 카드, input, textarea, dropdown trigger/menu, modal, button resting surface |
| `bg-bg-weak` | 카드 안 작은 회색 박스, hover/pressed/selected, metadata chip, icon well |

`bg-bg-floating`은 가장 자주 쓰는 밝은 표면이다. 사용자가 클릭하거나 입력하는 요소는 기본적으로 이 색에서 시작하고, hover/active에서만 `bg-bg-weak`로 내려간다.

### Text

| Token | When to use |
| --- | --- |
| `text-neutral-primary` | 제목, 본문, 주요 값 |
| `text-neutral-muted` | 보조 설명, caption, metadata |
| `text-neutral-soft` | 낮은 강조, hint, 덜 중요한 timestamp |
| `text-neutral-placeholder` | input placeholder |
| `text-neutral-disabled` | 비활성 UI |
| `text-link` | 외부 링크, 문서 링크, 이동 링크 |

`neutral-muted`과 `neutral-soft`는 정보 위계가 다르다. 읽어야 하는 보조 정보는 `caption`, 없어도 흐름이 유지되는 정보는 `third`를 쓴다.

### Accent And Status

| Token | When to use |
| --- | --- |
| `primary` | 제품의 하나뿐인 포인트 컬러. CTA, selected accent, 브랜드 강조 |
| `primary-faded` | `primary`의 연한 배경. callout, subtle selected surface |
| `positive` | 성공, 완료, active, 좋은 fit |
| `positive-faded` | 긍정 상태의 연한 배경 |
| `info` | 안내, 링크와 가까운 정보성 상태 |
| `info-faded` | 정보성 callout의 연한 배경 |
| `critical` | 삭제, 오류, 위험, 되돌릴 수 없는 액션 |
| `critical-faded` | critical 상태의 연한 배경 |

상태 토큰은 실제 상태를 말할 때만 쓴다. 단순히 예쁜 강조가 필요하면 `primary` 또는 `primary-faded`를 쓴다.

## Common Recipes

Page shell:

```tsx
<main className="min-h-screen bg-bg-basement text-neutral-primary" />
```

Card:

```tsx
<section className="rounded-lg border border-neutral-1000-a05 bg-bg-floating p-4 text-neutral-primary" />
```

Nested weak box:

```tsx
<div className="rounded-md bg-bg-weak px-3 py-2 text-neutral-muted" />
```

Input:

```tsx
<input className="border border-neutral-1000-a10 bg-bg-floating text-neutral-primary placeholder:text-neutral-placeholder focus:border-neutral-400 focus:ring-2 focus:ring-neutral-1000-a10" />
```

Primary CTA:

```tsx
<Button variant="primary">저장</Button>
```

Neutral action:

```tsx
<Button variant="default">필터</Button>
<Button variant="secondary">취소</Button>
```

Black action:

```tsx
<Button variant="black">새 기회 만들기</Button>
```

Status:

```tsx
<Badge className="bg-positive-faded text-positive">완료</Badge>
<div className="border border-critical/30 bg-critical-faded text-critical">삭제 전 확인</div>
```

## Component Rules

Use shared UI components before writing raw markup:

| Need | Component |
| --- | --- |
| Main action | `Button` |
| Icon-only action | `IconButton` |
| Compact repeated action | `ActionButton` |
| Clickable card | `CardButton` |
| Existing card action migration | `InteractiveCard`, `ChoiceCard` |
| Text | `Text` |
| Labels/status chips | `Badge` |
| Form fields | `Input`, `TextField`, `Textarea`, `Select`, `Checkbox`, `Switch`, `Radio` |
| Menu | `ActionDropdown`, `DropdownMenu` |
| Page section copy | `SectionHeader`, `SectionTitle`, `SectionDescription` |

`Button` variants are limited to:

| Variant | Use |
| --- | --- |
| `default` | Normal neutral action on `bg-bg-basement` or inside panels |
| `primary` | Brand CTA, one main action in a scope |
| `black` | Highest contrast CTA where brand color is not appropriate |
| `secondary` | Lower emphasis neutral action, cancel, secondary controls |
| `critical` | Destructive or irreversible action |
| `positive` | Confirming a clearly positive action |

Do not add a new button color variant for a page-specific case. Use `className` only when preserving an existing layout during migration, and keep the color tokens from this document.

## Migration Checklist

When touching old UI:

1. Replace `paper` and `layer-*` with `bg-bg-floating`, `bg-bg-default`, `bg-bg-basement`, or `bg-bg-weak`.
2. Replace `fg-*` with `neutral-primary`, `neutral-muted`, `neutral-soft`, `neutral-placeholder`, or `neutral-disabled`.
3. Replace `stroke-*` with `neutral-1000-a05`, `neutral-1000-a10`, `neutral-400`, or `neutral-800`.
4. Replace `status-*` with `positive/info/critical` and their `*-faded` backgrounds.
5. Replace `gray-*` design aliases with `neutral-*` or `black`.
6. Prefer `Button`, `CardButton`, `Badge`, `Input`, `Select`, `Tabs`, and `Text` over local one-off components.
