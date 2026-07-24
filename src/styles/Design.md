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

> Organization workspace 예외: `/org/*`의 shell과 일반 정보 section은
> `bg-bg-default` 하나를 공유하고 카드 표면을 만들지 않는다.
> `bg-bg-floating`은 dialog, dropdown, popover처럼 실제로 떠 있는 UI에만 쓴다.
> 구체적인 규칙은 `docs/org-workspace-v2.md`의 “화면 디자인 원칙”을 따른다.

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

Quiet compact action:

```tsx
<MuteButton aria-label="설정">
  <Settings className="h-4 w-4" />
</MuteButton>
<MuteButton variant="transparent">
  <Pencil className="h-4 w-4" />
  수정하기
</MuteButton>
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
| Quiet compact action | `MuteButton` |
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

### `MuteButton`

`MuteButton`은 toolbar, modal footer, 작은 inline action처럼 공간이 좁고
강조가 낮은 control에 쓴다. 아이콘 버튼과 짧은 텍스트 버튼이 같은 시각
밀도로 반복될 때 특히 적합하다.

표준 `Button` hierarchy의 정사각형 아이콘 control은 `IconButton`을 쓰고,
`MuteButton`의 조용한 표면을 텍스트 action과 함께 운용해야 할 때는
아이콘 전용이어도 `MuteButton`을 쓴다.

다음 상황에서는 `MuteButton`을 우선한다.

- 상단 문의, 설정처럼 작지만 resting surface가 필요한 아이콘 control
- `View CV`, 수정, 뒤로, 닫기처럼 본문 흐름을 보조하는 짧은 action
- 복사, 공유, 재시도, 더 보기처럼 반복되는 modal/panel action
- 링크 추가/삭제, 필터 초기화처럼 main CTA보다 한 단계 낮은 control
- 취소와 저장이 함께 있는 compact toolbar의 보조 버튼

다음 상황에서는 사용하지 않는다.

- 페이지나 form의 하나뿐인 main CTA: `Button`의 `primary` 또는 `black`
- 실제 삭제, 탈퇴 확정처럼 되돌릴 수 없는 최종 action: `Button`의
  `critical`
- 선택 가능한 카드 전체: `CardButton`
- 동일한 action이 긴 목록에서 반복되고 별도의 active 상태가 필요한 경우:
  `ActionButton`

Variants:

| Variant | Use |
| --- | --- |
| `default` | 흰 floating surface, 기본 border와 shadow가 필요한 일반 보조 action |
| `transparent` | resting surface 없이 hover/active에서만 반응하는 수정, 뒤로, 닫기, inline action |
| `neutral` | 약한 fill이 필요한 filter, toggle, grouped control |
| `dark` | compact toolbar 안의 저장/확인처럼 높은 대비가 필요하지만 페이지 main CTA는 아닌 action |
| `primary` | 복사, 초대처럼 브랜드 강조가 필요한 compact action. 한 scope에 남발하지 않는다 |
| `warn` | 삭제/탈퇴 modal을 여는 진입 action. 최종 파괴 확인에는 `Button critical`을 쓴다 |

Sizes:

| Size | Use |
| --- | --- |
| `sm` | 아주 작은 toolbar, filter clear, 밀도가 높은 icon control |
| `md` | 기본값. 상단 icon, 수정, 추가, 복사 등 대부분의 compact action |
| `lg` | modal footer, 모바일 touch target, 조금 더 중요한 compact action |

`MuteButton`은 children을 보고 padding을 자동 조정한다.

- 아이콘만 있으면 size의 기본 horizontal/vertical padding을 유지한다.
- 텍스트가 있으면 horizontal padding을 늘린다.
- 텍스트만 있으면 vertical padding을 줄여 과하게 높아지지 않게 한다.
- 아이콘과 텍스트가 함께 있으면 size의 기본 vertical padding을 유지한다.
- 기본 높이는 intrinsic height다. 부모 flex의 stretch 때문에 높이가
  달라지지 않는다.

호출부에서 이 규칙을 다시 구현하지 않는다. 일반 사용에서는 padding,
height, background, border를 `className`으로 덮지 말고 `variant`와 `size`를
선택한다. `w-full`, `flex-1`, 위치, 반응형 정렬처럼 레이아웃에만 관련된
class는 허용한다.

```tsx
// 기본 아이콘 control
<MuteButton aria-label="설정">
  <Settings className="h-4 w-4" />
</MuteButton>

// 표면이 없는 inline action
<MuteButton variant="transparent">
  <Pencil className="h-4 w-4" />
  수정하기
</MuteButton>

// modal footer의 텍스트 전용 action
<MuteButton size="lg">닫기</MuteButton>

// 최종 삭제 확인이 아니라 삭제 흐름으로 들어가는 action
<MuteButton variant="warn">
  <Trash2 className="h-4 w-4" />
  회원 탈퇴
</MuteButton>
```

Do not add a new button color variant for a page-specific case. Use `className` only when preserving an existing layout during migration, and keep the color tokens from this document.

## Migration Checklist

When touching old UI:

1. Replace `paper` and `layer-*` with `bg-bg-floating`, `bg-bg-default`, `bg-bg-basement`, or `bg-bg-weak`.
2. Replace `fg-*` with `neutral-primary`, `neutral-muted`, `neutral-soft`, `neutral-placeholder`, or `neutral-disabled`.
3. Replace `stroke-*` with `neutral-1000-a05`, `neutral-1000-a10`, `neutral-400`, or `neutral-800`.
4. Replace `status-*` with `positive/info/critical` and their `*-faded` backgrounds.
5. Replace `gray-*` design aliases with `neutral-*` or `black`.
6. Prefer `Button`, `CardButton`, `Badge`, `Input`, `Select`, `Tabs`, and `Text` over local one-off components.
