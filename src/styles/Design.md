# Harper Design Tokens

이 문서는 `src/globals.css`의 `@theme static` 토큰을 기준으로 한다. 전체 토큰을 CSS 변수로 유지해 직접 참조와 미리보기에서도 같은 값을 사용한다. 새 UI는 토큰 이름만 보고 용도를 알 수 있어야 하므로, 화면 코드에서는 가능한 semantic token을 먼저 쓰고 palette token은 보조적으로만 쓴다.

## 핵심 원칙

1. 배경은 `bg-bg-*`, 텍스트는 `text-neutral-*`, 상태와 강조는 `positive/info/action/critical`, 브랜드 포인트는 `primary`를 먼저 쓴다. `info`는 노란색이고 `action`은 파란색이다.
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
| `blue-100/500/700` | 링크 등에 쓰는 파란색 원색 |
| `green-100/500/700` | 긍정/완료성 UI의 원색 |
| `positive-100/500` | 긍정 상태의 초록색 source palette |
| `info-100/500` | 안내·주의 상태의 노란색 source palette |
| `action-100/500` | 행동·진행 강조의 파란색 source palette |
| `critical-100/500` | 위험·오류 상태의 빨간색 source palette |
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

기본 팔레트는 Dev Controls의 `2. 누런끼 조금 제거`를 전역 토큰에 반영한 색상이다.
흰색 `bg-default`·`bg-floating` (`#ffffff`), 아주 옅은
`bg-basement` (`neutral-100` 40% + 흰색 60%, 기본값은 약 `#fdfdfc`),
약한 fill인 `bg-weak` (`#f5f4f3`)로 표면을 구분한다.
본문은 `#1b1b1a`로 대비를 유지하고, 연한 강조·상태 배경의 채도만 낮춘다.
`primary`의 원색은 유지한다.

Career의 대화 영역과 composer 주변은 `bg-bg-basement`, 오른쪽 정보 패널은
`bg-bg-default`를 쓴다. 데스크톱 왼쪽 메뉴는 대화 영역과 같은
`bg-bg-basement`를 쓰고, `/org`의 메뉴 너비·행 간격·선택 상태를 따른다.
모바일도 정보 화면은 `bg-bg-default`, 펼친 대화 영역은
`bg-bg-basement`로 같은 구분을 유지한다.

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
| `text-faded` | `text-neutral-soft`와 같은 색의 옅은 label 텍스트 |
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
| `info` | 노란색. 안내, 주의, 대기, 추가 확인이 필요한 상태 |
| `info-faded` | 노란색 정보·주의 callout의 연한 배경 |
| `action` | 파란색. 다음 행동, 진행 중 상태, 일정처럼 눈에 띄어야 하는 실행 정보 |
| `action-faded` | 파란색 action 강조의 연한 배경 |
| `critical` | 삭제, 오류, 위험, 되돌릴 수 없는 액션 |
| `critical-faded` | critical 상태의 연한 배경 |

`positive-strong` (`#009b35`), `info-strong` (`#d98b00`),
`action-strong` (`#0066e6`)은 채도를 살린 어두운 색상값을 직접 지정한다.
흑백 미리보기에서는 이 세 토큰도 회색으로 전환한다.
`critical-strong`은 기본 상태색에 검정 15%를 섞는다. hover나 강한 강조가 필요할 때
`bg-positive-strong`, `text-action-strong`, `border-info-strong`처럼 사용한다.
CSS에서는 `var(--color-positive-strong)`처럼 참조한다.

`info`를 파란색 정보 강조로 사용하지 않는다. 파란색이 필요하면 의미에 따라 `action`, `action-faded`, 또는 링크 전용 `text-link`를 쓴다. 상태 토큰은 실제 상태를 말할 때만 쓰고, 단순히 예쁜 강조가 필요하면 `primary` 또는 `primary-faded`를 쓴다.

## Dev color previews

`DevColorPaletteControls` (`src/components/common/DevColorPaletteControls.tsx`)는
Career·Org의 기존 dev controls에서 공통으로 사용하는 브라우저 전용 색상 비교 도구다.
현재 / 누런끼 조금 / 누런끼 거의 없음 / White·Black·Gray의 네 옵션을 제공한다.
`현재`와 `누런끼 조금`은 `src/globals.css`의 기본 토큰을 그대로 사용한다.
`src/styles/dev-color-palettes.css`에는 나머지 미리보기 값을 모으고, 앱의
`DevColorPalettePreview`가 해당 화면과 기존 dev 권한에 한해 루트 속성을 적용한다.
선택은 localStorage에만 저장하며 다른 화면이나 일반 사용자의 기본 팔레트를 바꾸지 않는다.
`현재`는 모든 미리보기 override를 해제한다. 모든 옵션에서 `--color-primary`,
`--primary`, 원본 `--color-accent-500`은 유지한다. 연한 강조 배경은 조정하며,
흑백 옵션은 상태색도 회색으로 바꾼다. 사진·로고와 컴포넌트에 직접 지정한 색은 대상이 아니다.
모든 미리보기는 기본 팔레트와 같은 밝은 표면 위계를 공유하며, 오른쪽 정보 패널은
흰색으로 유지하고 대화 영역과 약한 fill의 온도만 단계적으로 줄인다.

## Org 가입 및 검토 화면

가입 화면과 가입 검토 화면은 `src/components/org/OrgEntryAppBar.tsx`를 공유한다.
Harper 로고, 로그인된 사용자의 로그아웃, Company 링크를 같은 높이와 간격으로 표시한다.
`OrgReviewPage`는 최대 440px 너비의 안내 카드와 20px 제목, 13px 본문을 사용한다.
문의 버튼은 `openCustomCrispWidget`으로 앱에 이미 마운트된 문의창을 연다.

## Dev billing previews

회사 제품 UI는 데스크톱을 먼저 설계한다. 실제 작업 공간의 목록·카드·상세 pane에서
정보 밀도, 나란한 비교와 hover/focus 동작을 먼저 확인하고 좁은 화면에 맞춰 줄인다.
모바일 카드 배치를 넓게 늘린 화면을 데스크톱의 기본으로 삼지 않는다.

Free 후보자도 원래 카드·목록·상세의 회사 공개 가능 정보를 그대로 보여준다. 프로필 열람 버튼·별도 차감·합성 신원·블러를 사용하지 않는다.

Harper Workspace의 `OrgBillingDevControls`는 브라우저 전용 결제 미리보기다.
Free·슬롯 수 외에 예시 카드, 구독 상태, Intro 잔액, 내역, 결제 결과를 선택한다.
Slots·Billing의 `OrgBillingPreviewNotice`에서도 같은 control을 펼칠 수 있다.
`OrgBillingPortalPreview`는 shared `TalentCareerModal` 안에서 예시 카드 교체·삭제와
결제 성공·실패·추가 인증 흐름을 보여준다. 실제 Stripe UI와 구분해 표시하며
서버 결제 요청으로 연결하지 않는다. 예시 청구·사용 내역도 실제 query cache와 분리한다.
Slots의 배정 선택은 작은 Role 행의 `MuteButton size="sm"`과 `DropdownMenu`에 둔다. 슬롯 카드에서는 Role 선택을 표시하지 않고 Intro 막대로 끝낸다.
배정된 Role 행은 `bg-primary-faded` 배경과 왼쪽 포인트 선, 슬롯 버튼의 체크로 구분한다.
기존 배정이 바뀔 때만 shared `TalentCareerModal`로 이전·이후 배정을 확인한다. 미리보기 배정은 유료 슬롯에 한해 작성 중·중단된
Role도 지원하며, 실제 Role 상태와 슬롯 배정을 변경하지 않는다.

## Shared Input And Textarea

`/career`와 `/org`의 일반 form은 실제로 널리 사용 중인 아래 shared component를
그대로 사용한다.

- `Input`: `src/components/ui/input.tsx`의 `Input`
- `Textarea`: `src/components/ui/textarea.tsx`의 `Textarea`

두 component에는 `bg-bg-floating`, neutral border, placeholder, focus, disabled
스타일이 이미 들어 있다. 새 wrapper나 domain별 input component를 만들지 말고
기본 style을 유지한다. 호출부에서는 `className`으로 너비, grid 위치,
textarea의 `min-height` 같은 layout만 보완한다. `unstyled`는 chat composer처럼
부모가 border와 background를 모두 소유하는 composite field에서만 사용한다.

주요 입력 영역은 `<Textarea isMain />`을 사용한다. 기본 Typography와 상태 스타일은
유지하고 `rounded-xl`, `px-4 py-3`, `shadow-md`를 적용한다. 기본값은 `false`이며,
`unstyled`가 `true`이면 `isMain`의 표면 스타일도 적용하지 않는다.

label, helper, error는 control 바깥에서 조합하고 `htmlFor`,
`aria-describedby`, `aria-invalid`로 연결한다. 같은 파일에 있는 `TextField`는
새로 사용하지 않으며, 기존 사용처를 수정할 때 `Input`과 외부 label/message로
교체한다.

### `/career`

profile, onboarding, settings의 기존 패턴처럼 기본 `Input`과 `Textarea`를
사용한다. 긴 profile 입력은 `Textarea`에 `rows` 또는 `min-h-*`만 추가하고,
chat composer처럼 부모가 하나의 field surface를 만드는 경우에만 `unstyled`를
사용한다.

### `/org`

role, pipeline, workspace 편집과 후보자 dialog의 기존 패턴처럼 기본 `Input`과
`Textarea`를 사용한다. `/org` 전용 variant나 `TextField`를 추가하지 않으며,
label과 오류 문구는 기존 row/dialog의 정보 구조 안에서 control 밖에 둔다.

## Chat composer surface

`ChatComposerSurface` owns the shared `rounded-xl` panel shape; glass surface
classes contain only color, border, shadow, and blur. `ChatComposerFrame` uses
`rounded-full` only below `md` while collapsed and without a context area.
Focused inputs, inputs with context/attachments, desktop inputs, and Apply with
Harper preparation panels keep `rounded-xl`. The separate one-line mobile chat
launcher (`ChatComposerCollapsedFrame`) always uses `rounded-full`.
Callers must not duplicate these radius conditions.
Only pass a context area when it has visible content. An active Apply with Harper
session alone must not reserve top padding or change the ordinary mobile input's
pill shape; use `shouldShowPreparationReopen` for the actual question-reopen action.

## Typography

일반 텍스트는 `src/components/ui/typography.tsx`의 `Typography`를 사용한다.
기존 `Text`의 태그·ref·`asChild` 처리를 재사용하며 기존 Text 사용처는 변경하지 않는다.
`children`에 텍스트나 JSX를 넣고 `as`로 의미에 맞는 태그를 선택한다(기본 `p`).

```tsx
import { Typography } from "@/components/ui/typography";
import RichText from "@/components/ui/rich-text";

<Typography as="h2" variant="title">제목</Typography>
<Typography variant="description">보조 설명</Typography>
<Typography as="span" variant="caption" className="text-action font-medium">
  업데이트됨
</Typography>
<RichText variant="career" typography="description">{markdown}</RichText>
```

자주 쓰는 옵션: `page-title`, `section-title`, `title`, `item-title`, `body`
(기본), `reading`, `description`, `label`, `helper`, `caption`.
상세 옵션은 같은 파일의 24개 scale (`heading-sm`, `body-xs`, `label-md` 등)을 쓴다.
일반 Typography의 `tone`은 `ink`, `secondary`, `subtle`이며 생략하면 preset을 따른다.
`className`은 마지막에 병합하므로 같은 조건의 크기·행간·색·굵기를 덮어쓸 수 있다.
반응형 스타일을 덮어쓸 때는 해당 breakpoint 클래스도 함께 지정한다.

`RichText`는 같은 옵션을 `typography`로 받는다. Markdown 문자열은 `children` 또는
기존 `content` 중 하나로 전달한다. `typography`를 생략한 기존 렌더링은 유지한다.
`Typography`는 JSX용이고 `RichText`는 Markdown 문자열용이다.

## Common Recipes

Font weight:

```tsx
<span className="font-regular">400 weight text</span>
```

`font-regular`은 `font-weight: 400`에 대응한다.

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

Input and textarea:

```tsx
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

<label className="grid gap-1.5 text-[13px] font-medium text-neutral-primary">
  <span>이름</span>
  <Input id="name" aria-describedby="name-help" />
  <span id="name-help" className="text-[12px] font-normal text-neutral-muted">
    팀에서 사용하는 이름을 입력하세요.
  </span>
</label>

<Textarea rows={4} className="min-h-[120px]" />
```

Primary CTA:

```tsx
<MuteButton variant="primary" size="lg">저장</MuteButton>
```

Neutral action:

```tsx
<MuteButton variant="neutral">필터</MuteButton>
<MuteButton>취소</MuteButton>
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

High-contrast action:

```tsx
<MuteButton variant="dark" size="lg">새 기회 만들기</MuteButton>
```

Status:

```tsx
<Badge className="bg-positive-faded text-positive">완료</Badge>
<div className="border border-critical/30 bg-critical-faded text-critical">삭제 전 확인</div>
```

## Component Rules

### Loading behavior

Open panels, dialogs, and tabs immediately on interaction. Keep the actual layout,
navigation, and already loaded content mounted; show shared `Skeleton` elements
only where data or a code-loaded section is still missing. Do not replace an
existing screen with a separate generic loading screen before opening its detail
panel. Same-page query navigation must preserve the mounted page. Apply this
pattern throughout the product, not only to candidate details.
Responsive alternatives that own portal dialogs must mount only the active
variant. CSS `hidden` on an ancestor does not hide a portal; mounting desktop
and mobile variants together creates duplicate dialogs, backdrops, and animations.

Before writing raw UI markup or a local component, search in this order:

1. `src/components/ui/` for generic controls and primitives.
2. `src/components/common/` for product-wide compositions.
3. The relevant domain folder such as `src/components/career/` or
   `src/components/org/` for an established domain composition.

Use `rg` to search by interaction and component names, not only by the exact
feature name. A local wrapper may contain domain-specific content, state, and
actions, but it must not rebuild shared infrastructure such as a modal portal,
overlay, focus trapping, Escape handling, outside-click handling, or ARIA dialog
wiring. If no suitable component exists, create the primitive at the narrowest
shared level that has multiple realistic consumers and add it to this catalog.

Shared component catalog:

| Need | Component |
| --- | --- |
| Main action | `MuteButton` |
| Login persona switch | `AuthPersonaGate` from `src/components/common/AuthPersonaGate.tsx`: existing sessions without a login type adopt the first Career/Company area they visit and enter directly. Ops-enabled login accounts, including email-allowlisted UTM viewers, can move between both areas without logout; reuse `canSwitchAuthPersonaWithoutLogout`, and keep workspace/API permissions unchanged. For other accounts, show confirmation only when a recorded login type differs from the destination, inside the existing `CareerAppBar` and `CareerLandingFooter`, with the current login type and email, a local logout/re-login action, and a return action. Label the talent login as 커리어 / Career. The main `MuteButton` combines a white `/svgs/face.svg` without a background, an arrow, and a compass for Career or a building for Company to the left of its label. Mount it before workspace effects; reuse `MuteButton` and `Loading`. |
| Quiet compact action | `MuteButton` |
| Tab explanations | `Tabs` items support `tooltipVariant="light"`, sharing the existing light tooltip appearance through `Tooltips`. Org Inbox's pending and suggested tabs show plain labels without info icons and reveal their existing descriptions on hover/focus. |
| Icon-only action | `MuteButton` |
| Animated acceptance icon | `AnimatedHandshake` from `src/components/ui/animated-handshake.tsx`: shared by Org Accept Intro and Career connection acceptance buttons. Plays on entrance, button hover, and keyboard focus; respects disabled buttons and reduced motion. |
| GitHub, LinkedIn, Slack logos | `GithubLogo`, `LinkedinLogo`, `SlackLogo` from `src/components/common/BrandLogos.tsx`: existing public SVG assets; GitHub follows the surrounding text color for light and dark surfaces. |
| Compact repeated action | `MuteButton` |
| Clickable card | `CardButton` |
| Existing card action migration | `InteractiveCard`, `ChoiceCard` |
| Org Team access management | `OrgTeamsSection` and `OrgMemberTeamSelect` from `src/components/org/workspace/OrgTeamsSection.tsx`: shared `OrgTable` team rows, multi-team assignment, an Owner-only subtle info notice, a single page action beside the heading, counted team member/team `Tabs`, shared `TalentCareerModal` as a compact centered desktop dialog/mobile sheet, collapsible team member/Role selectors with shared inputs/checkboxes and one save footer. Keep billing and Slots out of Team controls. |
| Text | `Text` |
| Increasing numeric counters | `RollingNumber` from `src/components/ui/rolling-number.tsx`: changed digits roll upward; separators and units stay still. Use tabular digits, a single screen-reader value without live announcements, and reduced-motion support. Callers own the data and update cadence; the component never invents growth. |
| Public landing statistics | `LandingStats` from `src/components/landing/LandingStats.tsx` shares the three metrics, cached data query, bilingual labels, and rolling matching count between company and talent landing pages. Pass `locale` and optional outer `className`; use `align="center"` for centered values and labels on the home page. Keep surrounding logos and experiment assignment in the page. |
| Chat work progress | `ChatThinkingLogPanel` is shared by chat tool work and application-browser progress. Pass public progress text only, never command arguments or reasoning. Optional `statusLabel` names an input-waiting state without changing the shared layout; `active=false` stops animation. |
| Role Brief questions | `BriefQuestion` in `src/components/org/role-start/RoleStartOnboarding.tsx` shares the vertically centered question, textarea, choices and navigation for compensation, Brief questions and answer history. Keep question text left-aligned without a numbered eyebrow; the single right action switches from neutral Skip to primary Next with an arrow when text is entered. |
| Role Setup preparation | `RoleStartPreparation` replaces both onboarding panes with an opaque full-area surface during the initial role-writing turn. Center the preparation heading and list live tool-status logs underneath without an accordion; show the saved Setup only after creation and its refresh complete. |
| Sidebar role actions | Use `OrgRoleActionsMenu` as a sibling of the role link, positioned absolutely at its right edge. Reveal on hover, keyboard focus, or an open menu; keep visible on touch layouts. Open the portaled menu below for lifecycle actions and confirmed deletion. |
| Career Markdown | `RichText variant="career"`: H1 uses 20px/medium; tables keep only horizontal separators with no outer border or edge padding. External HTTP(S) links use `ReferenceLink` (favicon + `text-action`, a user-requested Career link style). Shared chat content forwards the variant; other surfaces keep default Markdown styling. Copy/export always uses the unchanged Markdown. |
| Inline source links | `ReferenceLink` from `src/components/ui/reference-link.tsx`; `RichText referenceLinks` opts in outside Career. Uses a hostname-only favicon request with a globe fallback, destination tooltip, and keyboard focus. |
| Career message width | `CareerMessageBubble` limits both user and assistant bubbles to 740px (and the available mobile width). Keep the shared `ChatMessageBubbleFrame` defaults unchanged for other products. |
| Career recommendation search | `RecommendationSearchStatusPanel` + `RecommendationSearchProgress` use a 420px card, a CSS-only abstract wire ring and four compact 32px steps. A single gray highlight slides between steps; numbers/checkmarks have no badge background and counts animate upward without React updates per frame. Read progress from the existing status stream/run coverage; never advance steps on a timer in the real search. Dev controls lazily open `CareerRecommendationSearchPreview` for local stage selection and playback without a search request. Respect reduced motion. |
| Labels/status chips | `Badge` |
| Role 검색 진행 | `OrgRoleSearchActivity` from `src/components/org/role-overview/OrgRoleSearchActivity.tsx`: 등록된 Role 화면의 공통 상단에 진행 중일 때만 한 줄로 표시한다. 공통 `Loading`과 12px 상태 문구를 쓰고 별도 카드·탭·퍼센트를 만들지 않는다. 기존 검색 원장과 회사 후속 작업의 실제 상태를 읽으며, 완료되면 행을 제거한다. 채팅 전체 화면·모바일에서도 같은 한 행을 유지하고 reduced motion, 조회 실패와 접근 권한 변경을 처리한다. |
| Org chat candidate references | `OrgTalentReferenceBadge` in `src/components/org/agent/` uses shared badge variants for named mentions, candidate links, and bare talent IDs. Keep the current chat and tab when opening a candidate. Existing company-visible pairs open their detail; an eligible unintroduced candidate opens `OrgCandidateProfilePreview`, which shares `OrgTalentProfileContent` and has no recommendation or contact actions. |
| Org candidate recommendation explanation | `OrgTalentProfile` renders a stored public `recommendationReason` in the existing `ProfileSection` after TL;DR, titled “추천 이유와 고려할 점” / “Why this candidate and what to consider”. Preserve the authored paragraph and the existing criteria, Harper Note, and earlier-Brief indicator. Omit this section for legacy reports without the field; never use an internal selection rationale as its fallback. |
| Org candidate criteria | `OrgCriteriaEvaluation` from `src/components/org/OrgCriteriaEvaluation.tsx`: shared fitness icon, compact criterion title, and stored score out of 100 when present, with `Tooltips` evidence and the shared score explanation on hover or keyboard focus. Never derive a missing legacy score from its fitness label. Keep the indicator unstyled: no padding or hover background. Use it in candidate profiles and existing pipeline cards. Inbox list rows and Saved cards use `OrgCriteriaBars`: six 9×30px fitness bars with 4px gaps and `ResponsiveLightTooltip` evidence, stored score, and the same score explanation on hover/focus/touch. Keep criteria independent from the presence of a full company introduction. |
| Org inbox candidate review | `TalentDetailSimpleView` owns detail queries, permissions and mutations; its inline mode composes `OrgCandidateReview` for Home and Role Inbox. `OrgCandidateReviewHeader` owns navigation, decision buttons, shortcuts and action errors. `OrgCandidateReviewContent` is the independently reusable information body: pass profile data and `onResumeClick`, with optional error/retry and a `footer` slot. It requires no workspace/action provider and installs no decision shortcuts. Role-start Align renders this body directly in the right pane through `RoleStartCandidateProfile`, which adapts the existing contact-free profile and verdict; keep evaluation controls in the left pane and do not create inbox records or fetch contact/resume data for this view. The full review injects `OrgTalentNotes` through `footer`; standalone information does not include notes or mutations. Both review and modal reuse `OrgTalentProfileContent` (exported props contract in `OrgTalentProfile.tsx`); only its identity/resources header uses the review variant. Do not add a section navigation menu. Reuse `TalentDetailPager` from the existing modal. The enclosing pane owns scrolling: the Inbox toolbar scrolls away and the candidate action header sticks at the pane top. Do not add a border or rounded frame around the detail. List/Grid selection opens the same surface and Back restores the collection position. Grid reuses `OrgRoleTalentBoard` and `OrgRoleTalentBoardCard`. Append `OrgTalentNotes` for company notes only. Pending connections retain `StopCandidateDialog` for Reject and `OrgAcceptIntroButton` for the existing green Accept Intro action and handshake animation. Suggested candidates use `OrgPassPopover` with the existing rejection reasons and saved custom reasons. Keep the sticky action wrapper transparent, without a divider or top padding; outer Inbox padding must scroll with the toolbar. On desktop Home, the candidate pane starts near the viewport top alongside the Home title and tabs; search history remains in Role only. Domain containers own permissions, queries and mutations. |
| Candidate experience, education, and other history | `TalentExperienceSection`, `TalentEducationSection`, and `TalentExtraSection` from `src/components/profile/TalentExperienceSection.tsx` share the local `ProfileEntry` layout: experience-based 15px medium title, 15px metadata, muted 14px dates/location, and shared Markdown description/memo. Adjust typography and spacing in `ProfileEntry`; company logos and education's `GraduationCap` use the same `ProfileEntryIcon` frame. |
| Persistent announcements | `AnnouncementQueue` + `AnnouncementCard` from `src/components/common/`: register notices with stable IDs, publication dates, localized titles/descriptions and optional image/text/icon media. An optional `action` accepts `label` plus either `href` or `onClick`, rendered as a full-width `MuteButton` below the description with a 20px gap. Omit it for the original button-free layout. The Welcome action opens the current workspace’s new-position page through `buildOrgHref`. Display unread, published notices oldest first, one at a time; X advances to the next, up to three per browser-document visit (including client-side navigation). Reloading starts the next visit. Each displayed item is atomically recorded in `user_announcement_receipts` for the account; unopened items remain unread. Use a 320px maximum width, `rounded-lg`, no shadow, a medium-weight title, shared title/body text color and inherited line height; leave 24px above the description and 32px below it. No focus capture or auto-dismiss; safe areas, short viewports and reduced motion are supported. `AnnouncementCard` always gives its media area a `bg-primary-faded` background and `rounded-md` corners. `HarperAnnouncementVisual` shows only a centered 96px Harper face in a 112px-high area, without extra icons or rings. The Welcome preview button in `/org/home` Dev controls opens the same card repeatedly without reading or writing announcement receipts. Company-side notices live in `src/components/org/announcements.tsx`, using Org translation keys and `org-` notice IDs. Automatic display mounts only on the authenticated, fully loaded `/org/home` workspace after onboarding. Other Org pages, `/career` (including its preview), and public/login pages do not mount this queue. Leaving home dismisses the displayed card; its receipt remains recorded. |
| Matching criteria 변경 이력 | `OrgRoleMatchingHistory` from `src/components/org/role-overview/OrgRoleMatchingHistory.tsx`: Matching criteria 탭 본문 안 오른쪽 위 History 아이콘으로 연다. `OrgSearchHistory`와 같은 Radix Popover 구성으로 기존 채팅과 편집 draft를 유지하며, 높이가 제한된 드롭다운 안에서 목록→전후 Hiring Brief·Criteria 원문과 중요도를 표시한다. 선택한 기록의 변경 후 버전을 먼저 열고, 상단 변경 전·후 버튼으로 긴 원문을 전환한다. 목록에는 상대 시각, 상세에는 분 단위의 정확한 시각을 표시한다. 요약 갱신 실패 때 이미 읽은 원문을 유지하되 접근 권한이 사라지면 가린다. 닫기 버튼과 Escape로 닫을 수 있으며 목록으로 돌아오면 스크롤 위치와 선택 행의 포커스를 복원한다. 수정자·시각은 즉시, 작성 중 요약은 공통 `Skeleton`, 재시도·실패는 짧은 상태 안내로 표시한다. 요약 완료 전에도 상세를 열 수 있고 목록은 페이지별로 이어 읽는다. 웹 저장의 후속 채팅은 서버가 한 번 기록하며 UI는 저장 결과로 기존 채팅과 이력 query만 갱신한다. |
| Calibration 평가 상태 (목록·상세) | `OrgCalibrationReviewBadge` from `src/components/org/role-overview/OrgCalibrationReviewBadge.tsx` |
| Org internal-only surfaces | `InternalOnlySurface` / `InternalOnlyHatch` from `src/components/org/internal/InternalOnlySurface.tsx`: reuse the same decorative, pointer-transparent hatch for Harper-only sections and controls. Table/mobile rows use `INTERNAL_ONLY_HATCH_BACKGROUND` through `OrgTalentTableRow.internalOnly`; mark individual internal rows even in mixed lists. These indicators do not grant access; preserve the existing account gates. |
| Internal role search | `RoleSearchControls` from `src/components/org/internal/RoleSearchControls.tsx`: Ops Pipeline and Org home dev controls share a manual Talent-first action, blue queued/running state, and a paginated role history table. Org exposes it only to matchharper.com accounts. |
| Org tables | `OrgTable`, `OrgTableHeader`, `OrgTableRow`, `OrgTableHead`, `OrgTableCell`, `OrgTableBody` from `src/components/org/workspace/OrgTable.tsx`: shared UI Table primitives with the same outlined surface, muted header and spacing for Members, Teams, Slots usage and Billing invoices. |
| Home list selection | `OrgHomeListItem` from `src/components/org/OrgHomeListItem.tsx` composes `CardButton` for both Inbox queue rows and Feed role filters, including All. It owns the shared padding, typography, transparent resting background, `black/6` hover, and `black/4` selected background with a `black/8` ring, plus `aria-current`. Callers own labels, counts, selection and navigation; use caller classes only for responsive layout. Keep space around scroll boundaries for selection and keyboard focus rings. |
| Empty workspace Home | `OrgWorkspaceApp` reuses `OrgRoleCreationPage` when the existing bootstrap finishes with no roles, without filtering by status or making another request. Keep the Home URL and selected navigation, use the new-role entry's full-width composer and suggestions, and retain the page's own mobile menu button. Wait through initial loading and stale empty-cache revalidation; background refreshes keep the mounted input. Role onboarding starts only after navigating to `/org/role`. |
| Form fields | `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `Radio` |
| Role hiring onboarding | `role-start/RoleStartLayout.tsx`: `RoleStartStepHeader` owns the shared title and optional description typography and spacing; children hold step-specific notices. `RoleStartCentered`, `RoleStartSplit`, and `RoleStartPane` own content width and responsive scrolling. Step callers own copy, forms, actions, and state. |
| Career / company onboarding | `src/components/common/onboarding/Onboarding.tsx`: shared frame, progress, transition, header, footer, face ready state and conversation preview. Keep domain steps, copy, persistence and submissions in each domain. Career retains its original geometry by default; company may use flexible title height and place the mobile research preview after the title. `OnboardingStepHeader` accepts an optional `titleLeading` slot; only Org's profile step supplies a decorative 28px `/svgs/face.svg`, aligned to the left of the first title line, “Welcome to”. Org’s guide step uses `OrgOnboardingGuideHeader` and `OrgOnboardingGuideBody` in `src/components/org/onboarding/OrgOnboardingGuide.tsx`; edit its icon and Tailwind classes directly for the centered header and list design. |
| Company plan selection | `WorkspacePlans` from `src/components/org/billing/WorkspacePlans.tsx`: shared Free / Slot / Enterprise panels for pricing, onboarding and billing; `BillingIntervalTabs` controls monthly/yearly prices. Flat pale panels, a separate price header, aligned pill actions and a single-column mobile layout. Onboarding uses `OnboardingFrame wide` for this step only; the default frame remains narrow. |
| Slot purchase | `SlotPurchaseDialog` from `src/components/org/billing/SlotPurchaseDialog.tsx` is shared by onboarding, Slots and Billing. Reuse `TalentCareerModal` with `mobileBottomSheet`, `BillingIntervalTabs`, `Input` and `MuteButton`: select 1–100 slots, show `N Slot` / `N Slots` at the left and the monthly or annual total at the right with `currencyDisplay: narrowSymbol` (`$` for USD), and preserve per-slot Intro/cancellation wording. Wrap only the price, benefits and quantity area in a rounded `border-action` / `bg-action-faded` card. Use blue circle-check bullets with no horizontal dividers and a single white quantity control containing minus, editable count and plus. Keep the title, right-aligned billing-period tabs (`headerActions`) and checkout actions outside the scrolling form body; show `20% OFF` beside the annual option in this purchase dialog, use visible bullet points for explanations, and place the quantity selector last in the body. Link the submit action to the form's unique ID. |
| Organization slots and billing | While public billing is paused, only the verified Harper Workspace shows Slots (`/org/slots`) and Owner-only Billing (`/org/billing`) as separate left sidebar entries. Other workspaces redirect direct visits to the company page. There are no internal page tabs. `BillingSlots` uses one/two/three outlined card columns at mobile/sm/lg widths, with the add action in the section header. Each card ends with its Intro meter. `BillingSlotMenu` shares the ellipsis menu between cards and the compact `BillingSlotSubscriptions` table beneath the current plan; subscription information appears first, followed by permitted payment/cancel/resume actions. Countdown dates use `N일 뒤` / `in N days`, with exact dates in time-element titles and absolute subscription start dates in the table. Complimentary slots have no payment or cancellation actions and do not appear in the paid-subscription table. A separate shared-Intro panel precedes the grid: all Free/standard workspaces retain 10 monthly shared Intros, with no Role assignment. Only actual paid/complimentary Slots appear as assignment cards. Drafts are unlimited; one Free Role can remain active alongside the Roles assigned to paid slots. `BillingUsageHistory` uses `Table` and 20-row `useQuery` pagination. `BillingPlanSummary` and `BillingInvoiceHistory` form the Billing page. These user-requested outlined surfaces keep `bg-bg-default` and no shadow. |
| Company Slack channel invitation | `OrgSlackChannelPicker` from `src/components/org/OrgSlackChannelPicker.tsx`: shared search, compact divider-free scrolling channel list, per-row `MuteButton dark / sm` invitation and primary create action. Use inline in onboarding and inside `TalentCareerModal` with `mobileBottomSheet` in settings; domain callers own mutations and errors. |
| Company Slack channel creation | `OrgSlackCreateChannelDialog` from `src/components/org/OrgSlackCreateChannelDialog.tsx`: shared name and privacy form for Workspace settings and Role notification settings; it creates and connects the channel, while the caller refreshes any Role-specific channel list. |
| Menu | `ActionDropdown`, `DropdownMenu`; `DropdownMenuItem` and `DropdownMenuSubTrigger` share `variant="sm"` for compact rows and `variant="md"` (default) for standard rows, including spacing, text, and icon sizing. `DropdownMenuItem` uses `text-neutral-800/80` for SVG icons. |
| Tooltip with an arrow | `Tooltip`, `TooltipTrigger`, and `TooltipContent` from `src/components/ui/tooltip.tsx`; use `showArrow` for the current shadcn bubble style and `arrowClassName` to match the bubble background. Keep clipping and expansion animations inside the content so the arrow stays visible. |
| Page section copy | `SectionHeader`, `SectionTitle`, `SectionDescription` |
| Public landing navigation and footer | `CareerAppBar` from `src/components/landing/career/CareerAppBarNew.tsx` and `CareerLandingFooter`. Reuse the existing logo, navigation, language switcher and footer on public pages including `/pricing`; do not build a page-specific header. While self-serve signup is paused, company pages pass the existing meeting-request form destination to the AppBar and retain the original Meet label. The Footer's `careerStartHref` remains a talent destination. Use `audience="company"` for the light company footer: company/talent/Harper link groups, a large existing wordmark, a flat neutral background without gradients, the original English tagline, and separate legal/language/status row. Language selection and actual service-status state remain shared; the default talent footer keeps its existing composition. |
| Public mobile navigation | Extend the existing `CareerAppBar`; do not create a second company header. Below `md`, keep the current entry action, move the audience switch into the menu, and put a menu icon at the far right. Reuse shared `Dialog` for a full-screen menu with a top-right close action, tightly stacked large links, Team Harper's `/about` link, and entry/contact actions at the bottom. Pricing links open `/pricing`; the company navigation links to its demo video and omits the top-bar trial CTA. Menu links fade in from top to bottom at short intervals; respect reduced motion. Use `MuteButton` for controls and keep Tailwind classes on the elements they style. |
| Public company pricing | `CompanyPricingSection` from `src/components/landing/CompanyWaitlistLanding.tsx` shares the annual/monthly toggle, three plan cards, and cost calculator between `/company` and `/pricing`. Callers supply the existing waitlist/contact action; the public page does not initiate checkout. |
| Company landing additions | `CompanyLandingSections.tsx` provides the talent statement, an ordered three-step hiring process, and FAQ for `/company` and its language routes. Preserve the requested statement copy. Steps use only outline icons, titles and short descriptions in three flat panels, stacked on mobile. Compose the FAQ with shared `QuestionAnswer` (`cream`, `compact`); introduction copy distinguishes a candidate’s existing interest from company-first outreach. The previous three development concepts remain separate. |
| Public pricing FAQ | `QuestionAnswer` from `src/components/landing/Questions.tsx`, also used by the existing company and billing pages. Use `theme="cream"` for light surfaces and `variant="compact"` on pricing: 16px vertical padding inside the clickable question row, readable question text and right-aligned chevrons. Pass each item's index and the list length, and compose the section heading outside. Answers accept React content so a relevant link can live inside the answer. Keep disclosure animation, keyboard focus and expanded state in the shared component. |
| Public pricing cost comparison | `PricingCostComparison` from `src/components/landing/PricingCostComparison.tsx`: a full-width comparison section after the plans, fixed to Light with no theme selector. Light uses the same `bg-bg-basement` as the pricing page, neutral gray chart bars and higher-contrast `orange-700` Harper labels. Use a centered 1160px `PageContainer` for content and a salary range and one `rounded-xl` rate panel on the left and a taller, faintly dotted cost chart on the right. Match the salary label/value font sizes; use one 14px font size throughout the rate panel. The native range has a wide, short pill thumb with a subtle translucent pressed state. Reserve the orange accent for Harper, with thin neutral rules and square bars. Keep both themes' Tailwind colors alongside the elements for easy editing. Use generic competitor labels and no footer/disclosure. The rate panel has small shared Select controls: headhunter 15/20/25/30% (default 20%); the platform hiring fee is fixed at 7%. Animate rate-dependent costs and re-sort bars when their displayed costs cross; preserve the chosen headhunter rate across headcount changes. Leave generous space between the chart caption and plot. Keep editable comparison inputs together at the top of the component: period, Harper monthly KRW price, monthly ad budget, commission rates, salary range and headcount options. Use a 50만원 salary step and the shared Select below the slider for 1/2/3/5/10/15/20/30 hires. Multiply every channel’s comparison cost by the selected headcount; show × N beside the base monthly ad and Harper rates only above one hire. Use 헤드헌터 수수료, 잡플랫폼 채용 광고비, 플랫폼 채용 수수료, and Harper 구독 as labels; show 성공보수 없음 for Harper without added bold styling. Put the currency unit on each bar value instead of a separate unit caption. The salary value renders directly from the selected salary without AnimatedNumber. Korean salary values use 만원 below ₩100 million and 억원 at or above it, truncating to one decimal place (e.g. ₩235 million → 2.3억원). Korean chart values round to the nearest ₩100,000; 억원 labels retain up to three decimal places to preserve that precision. Keep the original amounts for calculation and bar heights. The comparison uses Harper at ₩260,000/month by default; actual plan cards continue to use the billing catalog. Derive all figures and explanatory labels from these inputs. Motion values synchronize numbers and bar proportions; sort bars by displayed cost descending and animate stable keyed bars, numbers and labels together when their ranks cross. Only rank changes trigger React updates during animation; reduced motion updates immediately. Stack the two panels on mobile and keep the native slider keyboard-accessible. |
| Company social proof | `CompanySocialProof.tsx` shares the company landing's talent logos, `CompanyTalentLogoTile`, anonymous team descriptions and localized testimonial. `/company` retains its grid; `PricingSocialProof` shows Wonderful and Sierra, a single slow talent logo row and a large testimonial between plans and FAQ. Only display a confirmed undisclosed-company count; do not derive it from all workspaces. The Sierra wordmark comes from [Sierra's official brand assets](https://sierra.ai/using-our-brand) and links to its homepage. The repeated talent logo group is hidden from assistive technology; provide a pause control and a static, scrollable row for reduced motion. |
| Public landing demo video | `DemoVideo` from `src/components/landing/DemoVideo.tsx`; shared by `/demo` and `/company`, fills its container and preserves internal-view tracking exclusions |
| Public landing closing section | `CareerLandingClosingSection` shares the home page's centered closing copy and layout, including on Jobs. Pass the page's existing action and retain the home landing CTA styling. The preserved, currently commented self-serve company closing uses `variant="company"`: a light horizontal closing row aligned to the footer's 1244px container, a thin top divider, left-aligned heading and note, and right-aligned shared `MuteButton` actions (`default` for contact, `dark` for signup). Stack copy and actions on mobile. The active company page restores the original `ContactSalesSection` meeting-request form at the company-contact anchor. |
| Jobs explanation and FAQ | `OfficialJobsExperience` shares How Harper Works, a native disclosure FAQ with a rotating plus icon, and the landing closing section between Jobs list/detail. `showAbout` adds the existing `DemoVideo` only on the list. About, How Harper Works, and FAQ use desktop 40:60 flex columns without title subtitles and stack on mobile; the closing section stays centered. |
| Public 404 page | `NotFoundPage` from `src/components/landing/NotFoundPage.tsx`; shared by Pages Router and App Router, with the landing AppBar, centered message and home link, and landing Footer. Router entry points own authentication and metadata. |
| Editable document preview and right-side editor | `DocumentEditor` from `src/components/ui/document-editor.tsx`. Put horizontal writing padding inside the scrollable textarea or `MarkdownRichTextEditor.contentClassName`, not its outer wrapper, so the scrollbar stays at the panel edge. |
| Interview availability calendar, split panel, and time option | `MeetingAvailabilityCalendar`, `MeetingAvailabilitySplitLayout`, `MeetingAvailabilityTimeButton` from `src/components/meetings/MeetingAvailabilityLayout.tsx` |
| Chat internal-role and mock interview call proposals | `CareerCallProposalCard` from `src/components/career/chat/CareerCallProposalCard.tsx`; use shared `src/components/career/MockInterviewStart.tsx` for mock interview confirmation and start behavior |
| Career saved document preview: Markdown copy/export or generated resume paginated A4 HTML preview/on-demand PDF download | `CareerDocumentDetail` from `src/components/career/documents/CareerDocumentDetail.tsx`, opened at `/career/documents?documentId=...` like call notes; chat links use `DocumentPreviewCards` with `CardButton`. Do not open saved documents in a modal. Generated resumes share `src/lib/resumes/template.ts` between the paginated preview and PDF: centered name/contact header, organization and dates on opposite sides, italic role/location row, ruled sections, and semantic bullet lists. Preserve text and allow multi-page flow rather than shrinking or clipping content to one page. |
| Career position actions | `HistoryOpportunityRoleActions`: use `variant="tags"` above the desktop composer for small white text-only actions without entrance animation; use the default list in mobile and detail content |
| Career new positions | `NewOpportunityList` from `src/components/career/history/NewOpportunityList.tsx`: shared by desktop and mobile, with separate internal/external sections, a flat internal list with connection guidance, external recommendation-date groups, spaced collapsible cards, bounded role descriptions, and card-scoped feedback. Internal cards use a small Handshake `Badge` at `absolute left-1 top-[-2px]` with `bg-primary-faded text-faded`; Intro requests keep the direct-connection label. Collapsed positive actions reuse the opportunity type's icon. Use `OpportunityPreferenceFit variant="icons"` for colored fit icons with `Tooltips`. |
| Career opportunity swipe | `OpportunitySwipeRow` in `src/components/career/history/`: mobile touch/pen shortcut on collapsed new-opportunity cards. Left invokes the existing negative action; right invokes the existing positive action, including connection consent. A distance threshold changes the revealed pill’s text/icon color; release commits, retreat/cancel restores. Preserve vertical scrolling, normal taps, nested buttons, and keyboard alternatives. Disable while expanded or pending. |
| Career estimated salary | `EstimatedSalaryNotice` from `src/components/career/history/EstimatedSalaryNotice.tsx` displays a separately labeled annual estimate and an accuracy disclaimer below the JD link. Collapsed history cards append the range with `(추정)` after employment type; omit the display when no estimate is available. |
| Career external application choices | `ExternalOpportunityApplyModal` from `src/components/career/history/ExternalOpportunityApplyModal.tsx`: shared by desktop and mobile new-position lists. Compose `TalentCareerModal mobileBottomSheet` with two stacked full-width actions: direct application saves positive feedback at `applied` and opens the posting; applying with Harper saves positive feedback at `saved` and reuses `ApplyWithHarperButton` to start the role-attached chat. |
| Career welcome | `CareerWelcomeHeader` from `src/components/career/CareerWelcomeHeader.tsx`: centered greeting and current network scan count at the top of Tasks. Reuse `useCareerWelcomeContent` in the existing Home layout so both surfaces use the same profile name, scan count, and translated description. |
| Apply with Harper preparation inputs | `ApplicationPreparationComposer` in `src/components/career/chat/`, replaces the ordinary input inside the same Career composer wrapper after completed analysis produces items. Both variants reuse `ChatComposerSurface` from `ChatComposer.tsx` (the surface used by `ChatComposerFrame`). Reuse `PreparationDocumentPicker` for existing Docs selection/upload and `ApplicationDraftReview` for full-draft review. Keep item bodies internally scrollable and collect choice/freeform responses without per-item chat turns; restore the ordinary composer during generation and show generation progress in the chat timeline; do not recreate per-item chat cards for this flow. |
| Apply with Harper answered history | `ApplicationQuestionHistoryRow` uses a transparent `MuteButton`, rotating `ChevronRight`, and a 200 ms grid/opacity disclosure. Keep collapsed content inert and ARIA-linked to the trigger, honor reduced motion, and preserve the user's accepted inline edits in the expanded record. Desktop hierarchy: quiet trigger, readable question, muted answer, subtle left rule. |
| Career tasks | `CareerTasksPanel` from `src/components/career/CareerTasksPanel.tsx`: shared by desktop and mobile, places `CareerWelcomeHeader` above the title and groups current decisions, Harper suggestions, and ongoing introductions. While onboarding, place `CareerHomePanel variant="onboarding"` above the task sections to reuse the existing interview progress, call/completion actions, and checklist. Hide it once onboarding is complete. Compose sections with `SectionHeader` and row actions with `MuteButton`; use the existing composer, position detail, and meeting invitation for actions. Navigation counts only current decisions. |
| Career mobile navigation | `CareerMobileNavigationMenu` composes shared `Dialog` as a left sliding, full-height panel with the same navigation items and selected styling as the desktop sidebar. Reuse it from the top bar and expanded chat; selecting an item closes it. Shared Dialog owns focus, Escape and outside-click dismissal. |
| Career desktop navigation | `CareerWorkspaceNav` from `src/components/career/CareerWorkspaceNav.tsx`: left sidebar with tasks, new opportunities, saved opportunities, profile, resume/links (`/career/documents`), and Search Brief (`/career/brief`). Reuses `MuteButton` and `CareerProfileMenu variant="sidebar"`; keep its background aligned with chat and its row geometry aligned with the Org sidebar. The header toggle switches between 244px and a 64px icon rail with shared tooltips and a 28px avatar; persist the collapsed state in `useCareerWorkspaceUiStore`. Reuse its exported `CareerNewOpportunityIcon` for the same new-opportunity icon in mobile navigation. |
| Career job previews in chat and company details | `CareerOpportunityPreviewCard` shares the logo, metadata, posting status, and optional Recommended/Fit badges; `CareerOpportunityPreviewModal` opens the detail with a Save action |
| Career company details and jobs | `CareerCompanyDetailDrawer` composes `CompanyDetailView` and `CompanyJobsList` inside `TalentCareerModal`; jobs use 20-item infinite pagination |
| Career profile sources and documents | `CareerProfileSourceCard` from `src/components/career/settings/CareerProfileSourceCard.tsx`; use the 136×148 card for profile links, connected sources, resumes, documents, and add/upload actions |
| Career integration introduction | `IntegrationOverview` in `src/components/career/integrations/` composes `TalentCareerModal` with a compact logo/name header, 13–14px body copy, `IntegrationConversationCarousel` with a soft gradient and one user/Harper exchange per slide (native swipe, keyboard arrows, and pagination dots), a vertical feature list, and a visible connection button. Keep normal font weight for body copy, modest spacing, and no section/footer dividers or authorization-process filler. Each integration provides localized content and callbacks; `GmailIntegrationOverview` supplies Gmail content. Open via the `integration` URL query before starting authorization. |
| Career source icons | `CareerProfileSourceIcon` from `src/components/career/settings/CareerProfileSourceIcon.tsx`; reuse the profile source-card logos. Source slots come from `src/lib/career/profileSources.ts`. The Tasks source reminder uses the Lucide `Link2` icon. |
| Company logo previews | `CompanyLogo` from `src/components/career/watchlist/CompanyLogo.tsx`; use `size="xs"` for 16px logos in the Tasks 2×2 recommendation preview. Existing `sm/md/lg` sizes keep their original styles. |
| Career blocked companies | `CareerBlockedCompaniesSettingsSection` from `src/components/career/CareerProfileSettingsSection.tsx`; reuses the existing blocked-company field and immediate add/remove save actions. Place it below the Search Brief at `/career/brief`, using `CareerProfileWorkspace view="brief"` without profile in-page tabs. |
| Career profile visibility | `CareerProfileSharingSettingsSection` from `src/components/career/CareerProfileSettingsSection.tsx`; show it only at `/career/profile`, above the profile content, with `showBlockedCompanies`, `showEngagementTypes`, and `showLastUpdated` set to `false`. Reuse the existing confirmation and save flow. Compose option hints with shadcn `Tooltip` and `showArrow` as rounded black bubbles above the buttons; an unselected Open to matches option keeps a compact `65%` hint visible only while its scroll container is at the top. Hover or focus opens the full explanation at any scroll position. |
| `/career` and ordinary `/org` modals, confirmations, or bottom sheets | `TalentCareerModal` from `src/components/common/TalentCareerModal.tsx`; use `mobileBottomSheet` for ordinary Org modals. |
| Ops company side panels | `CompanySidePanelContent` in `src/components/ops/company/`: shared Dialog content layout for activity, conversation, and company editing; use the existing `Dialog` for state and keyboard/focus behavior. |
| Dedicated Radix panel composition | `Dialog`, `DialogContent`, `DialogTitle`, and `DialogDescription` from `src/components/ui/dialog.tsx` for UI that requires a dedicated layout, such as the Career/Org mobile navigation drawers and full-screen interview-availability editor. |

For a `/career` or `/org` confirmation, compose the title, description, body feedback,
and `MuteButton` actions through `TalentCareerModal` props. Use
`closeOnBackdrop`, `showCloseButton`, and a guarded `onClose` for pending states;
do not attach a separate `keydown` listener or render a custom full-screen
backdrop. Use `mobileBottomSheet` when the confirmation should follow the Career
mobile modal pattern. Use `modal={false}` for desktop side panels whose adjacent
workspace (including the chat composer) must remain interactive.

Ordinary Org forms and confirmation dialogs share this modal's focus management,
backdrop, Escape handling, close button, and mobile bottom sheet. Keep titles and
actions in the shared header/footer, use a unique form ID for submit buttons in
the footer, and preserve pending-state and mandatory-input close restrictions.
The body scrolls within the viewport while the header and footer remain visible.
Closing the modal restores focus to the control that opened it, including nested
confirmations.
Candidate details retain their full-height right panel through the shared modal's
layout props. The mobile navigation drawer and full-screen interview-availability
editor retain `Dialog` for their navigation/calendar-specific layout and portal
container requirements; their ordinary confirmations use `TalentCareerModal`.

새 UI의 button-shaped control에는 `MuteButton`만 쓴다. `Button`,
`IconButton`, `ActionButton`은 기존 화면 호환을 위한 legacy component로
취급하고 새 코드에서는 사용하지 않는다. 시각적 위계와 용도 차이는 별도
button component가 아니라 `MuteButton`의 `variant`와 `size`로 표현한다.

### `MuteButton`

`MuteButton`은 페이지의 main CTA부터 toolbar, modal footer, inline action,
아이콘 전용 control, 목록에서 반복되는 action까지 모든 일반 버튼에 쓰는
기본 component다.

다음 상황에서는 `MuteButton`을 우선한다.

- 페이지나 form의 main CTA
- 상단 문의, 설정처럼 작지만 resting surface가 필요한 아이콘 control
- `View CV`, 수정, 뒤로, 닫기처럼 본문 흐름을 보조하는 짧은 action
- 복사, 공유, 재시도, 더 보기처럼 반복되는 modal/panel action
- 긴 목록에서 반복되거나 active 상태가 필요한 action
- 링크 추가/삭제, 필터 초기화, 취소처럼 main CTA보다 한 단계 낮은 control
- 저장, 확인, 삭제처럼 명확한 결과를 만드는 action

다음 상황에서는 사용하지 않는다.

- 선택 가능한 카드 전체: `CardButton`
- button이 아닌 form field, menu, tab, switch: 각 용도에 맞는 shared UI
  component

Variants:

| Variant | Use |
| --- | --- |
| `default` | 흰 floating surface, 기본 border와 shadow가 필요한 일반 neutral action |
| `transparent` | resting surface 없이 hover/active에서만 반응하는 수정, 뒤로, 닫기, inline action |
| `neutral` | 약한 fill이 필요한 filter, toggle, grouped 또는 repeated action |
| `dark` | 가장 높은 대비가 필요한 main CTA나 저장/확인 action |
| `primary` | 브랜드 강조가 필요한 main CTA, 복사, 초대 action. 한 scope에 남발하지 않는다 |
| `positive` | 수락, 연결, 완료처럼 명확한 긍정 action |
| `critical` | 거절처럼 명확한 부정 action. 삭제처럼 destructive한 flow에는 `warn`을 우선한다 |
| `warn` | 삭제, 탈퇴처럼 destructive flow에 진입하거나 이를 확정하는 action |

Sizes:

| Size | Use |
| --- | --- |
| `sm` | 아주 작은 toolbar, filter clear, 밀도가 높은 icon control |
| `md` | 기본값. 상단 icon, 수정, 추가, 복사 등 대부분의 compact action |
| `lg` | main CTA, modal footer, 모바일 touch target, 중요한 action |

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
// 페이지의 main CTA
<MuteButton variant="primary" size="lg">저장</MuteButton>

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

// 반복되는 선택 action
<MuteButton variant={selected ? "neutral" : "transparent"} aria-pressed={selected}>
  후보자 보기
</MuteButton>

// destructive action
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
4. Replace `status-*` with `positive/info/action/critical` and their `*-faded` backgrounds. Remember that `info` is yellow and `action` is blue.
5. Replace `gray-*` design aliases with `neutral-*` or `black`.
6. Prefer `MuteButton`, `CardButton`, `Badge`, `Input`, `Select`, `Tabs`, and `Text` over local one-off components. Replace touched `Button`, `IconButton`, and `ActionButton` usages with `MuteButton` when practical.
7. Replace touched `TextField` usages with an external label/message and `Input` or `Textarea`.

## GTM spreadsheet workspace

`/ops/gtm`은 사용자 요청에 따라 흰 배경, 확실한 셀 경계선, 밀도 높은 시트 형태를
사용한다. 기존 Ops의 카드·배경·최대 너비를 적용하지 않는다. Ops 인증과 상단
탭은 `OpsShell spreadsheet`를 통해 재사용한다.

- 표 조작은 `src/components/ui/data-grid/DataGrid.tsx`와 CSS module을 재사용한다.
  헤더 드래그/너비, 행 높이, 키보드 편집, 한글 조합, 셀 색상은 이 컴포넌트가 소유한다.
- 컬럼 구성은 props로 전달하며 화면별 컬럼 배열을 컴포넌트에 하드코딩하지 않는다.
- GTM의 원본 선택·연결 컬럼·저장·권한은 `src/lib/gtm/`와 workspace에서 연결한다.
- dialog 인프라는 기존 `Dialog`를 사용한다. 시트 전용 흰 배경과 선명한 border는
  이 workspace의 명시적인 디자인 예외다.

GTM의 행 상세는 `RecordWorkspace`의 탭 구성과 `RecordField`, `CollectionEditor`를
재사용한다. 반복 연락처/할 일/지급/파일 계약은 API 메타데이터가 제공하고, 연결 기록은
실제 FK를 따른다. 외부 발송의 정확한 원문 검토는 `OutreachReviewDialog`가 소유한다.

기록 상세와 발송본 검토는 오른쪽에서 열리는 흰색 패널로 표시한다. 기존 Dialog의
focus trap/ESC/overlay를 재사용하되 가운데 정렬 translate를 해제한다. reduced-motion이면
진입 애니메이션을 끈다. 크리에이터는 대화·메일과 콘텐츠 탭을 먼저 보여준다.

메일 편집은 `EmailBody`가 기존 Tiptap `MarkdownRichTextEditor`의 `contentFormat="html"`
모드를 사용한다. 상단 고정 서식 바에 제목·굵게·밑줄·목록·링크를 제공한다. 기존 문서의
기본 Markdown 직렬화는 바꾸지 않는다. 보낸 HTML 미리보기는 sandbox iframe으로 격리한다.

### Free 연결 대기 소개

`OrgPendingConnectionGate`는 Role Inbox와 보드의 잠긴 빈 연결 대기 화면에서 공유한다.
Gmail integration 소개의 은은한 배경과 말풍선 구성을 참고한 `PendingConnectionPreview`로
후보자 관심 확인 → 회사 수락 → 일정 조율 후 Google Meet 초대의 가상 대화를 보여준다.
마지막 초대는 화면 전체나 캘린더 상세 카드가 아니라 휴대폰 알림 배너 형태다. 공식 Meet 앱 아이콘, 앱 이름, 상대 시각, 미팅 제목과 시간만 담고 반투명 배경·둥근 모서리·약한 그림자를 사용한다. 입장 화면, 카메라 미리보기, 가짜 참여 버튼은 추가하지 않는다. 로고 원본은 `https://www.gstatic.com/images/branding/productlogos/meet_2026/v2/web/192px.svg`이며 `public/images/logos/google-meet.svg`로 보관한다.
실제 후보 데이터와 분리된 가상 대화이며 두 대화 사이를 가로 슬라이드로 전환한다.
자동 재생은 마지막 장면에서 멈춘다. 단계 표시, 예시 안내 문구, 영문 슬로건과 재생·이동 버튼은 두지 않는다.
키보드로 대화에 진입하거나 reduced motion을 사용하면 자동 전환하지 않는다.
대화 위의 브랜드·참여자 라벨과 장식용 마무리 문구도 생략한다. 대화 아래에는 Gmail integration 소개와 같은 기능별 아이콘 + 13px 제목 + 13px 설명의 세로 목록을 두고, 마지막에 전체 너비 `Slot 구매하기` 버튼을 둔다. 버튼 아래 이용 조건 꼬리말은 넣지 않는다. 구매 버튼은 기존 Slots 구매 흐름으로 이동하며, 예시 화면은 실제 연락이나 미팅을 만들지 않는다.

### Checkbox and modal select

Shared `Checkbox` sizes are 16/20/24px (small/medium/large), with `rounded-xs` and a centered 14px check/indeterminate graphic. Keep the native input's keyboard and label behavior.
`TalentCareerModal` supplies `FloatingPortalContainer` to shared Base UI `SelectContent` so dropdown focus stays inside the Radix modal. Use `Select`'s `items` for dynamically loaded value labels.

Org candidate progress uses `ProgressFeed` with `icon="harper"` for Harper-authored introduction and follow-up events. It renders the decorative `/svgs/face.svg`; localized event copy is selected by `kind` in `harperProgressPresentation.ts`, including other-role history.

Home의 `OrgHomeFeed`는 후보자와의 진행에서 달라진 일을 날짜별 행으로 보여준다.
Home 왼쪽 영역은 제목·탭·Role 목록·남은 높이를 모두 `bg-bg-weak`로 채운다.
선택한 행은 밝은 표면으로 구분하고 오른쪽 후보자 정보와 소식은 기본 배경을 유지한다.
Role 필터는 항상 `All`로 시작하고 최초 선택도 `All`이다. 모바일 피드는 `All` 소식을 바로 열고,
`목록`을 눌렀을 때만 세로 Role 목록을 보여준다. Role을 선택하면 해당 소식 화면으로 들어간다.
모바일 Home 제목·인박스/피드 탭은 각 목록 또는 소식과 같은 영역에서 함께 스크롤된다.
Home의 모바일 메뉴 버튼도 각 화면의 스크롤 영역 맨 위에 두고 함께 스크롤한다. 별도 fixed 메뉴와 상단 예약 여백은 두지 않는다.
모바일 후보자 검토는 별도 바깥 헤더 없이 기존 `OrgCandidateReview` 안의 compact sticky 헤더를 쓴다.
목록 버튼·Role 이름·오른쪽 끝 후보 이동을 한 줄에 두며, 후보자 정보 내부 레이아웃은 유지한다.
목록·Role 이름·버튼을 감싸는 sticky 헤더는 위쪽의 완전한 흰색(100%)에서 아래쪽의 완전 투명으로 자연스럽게 이어지는 세로 gradient를 쓴다. Backdrop blur는 적용하지 않으며 개별 버튼의 기존 표면은 유지한다.
제목에는 Role 이름을 먼저 붙이고 후보자와 발생한 일을 이어서 표시한다.
상대 시각은 제목 줄 오른쪽 끝에 두고, 본문에는 실제 전달된 메시지 미리보기 또는 확정된 인터뷰 일정을 둔다.
얇은 구분선과 hover를 사용하고 전체 목록을 별도 카드로 감싸지 않는다. 검색은 후보자·Role·내용,
유형 필터는 Intro·메시지·인터뷰를 대상으로 한다. 행을 누르면 기존 후보자 상세와 피드를 열고,
닫으면 Role·검색·유형 선택을 유지한다. 읽음 상태나 필요한 액션을 기록 없이 추정하지 않는다.
소식은 `useInfiniteQuery`와 서버 커서로 30개씩 불러오고 목록 끝에서 이전 소식을 자동으로 이어 붙인다.
검색과 유형 필터는 로드된 행에만 적용하지 않고 접근 가능한 전체 기록에 서버에서 적용한다.
Role·검색·유형이 바뀌면 첫 페이지부터 다시 조회하며, 추가 로딩 실패 시 기존 행을 유지하고 재시도할 수 있다.

Org Intro follow-up guidance is derived once per Intro request from `company_talent_followups` through `automaticFollowupFeed.ts`. Automatic initial schedule/date-anchor progress is omitted from the user feed; explicit scheduling changes and delivery receipts remain separate events.

Ops 회사 화면은 `CompanyAnalytics`를 전체·회사별 통계에 재사용한다. 회사 목록은
카드 없이 가로 행과 얇은 구분선으로 구성하고, 팀원·역할·지표를 같은 상세 화면에
배치한다. `CompanyConversationsTab`은 공통 `Dialog`의 오른쪽 패널 구성을 재사용한다.
데스크톱에서는 대화를 유지한 채 옆에 스레드를 열고, 좁은 화면에서는 스레드만 표시한다.
`CompanyConversationHistory`는 원문 순서의 대화 목록, 선택한 스레드, 이전 메시지 로딩과
스크롤 위치를 관리한다. `CompanyConversationMessage`는 `MarkdownView`, 작은 Harper 얼굴,
연속 작성자 묶음과 날짜 구분을 공유한다. 저장된 정보만 표시하며 발송 UI는 두지 않는다.

### 후보자 Role 이동

`OrgCandidateRoleMoveDialog`는 후보자 상세의 `TalentDetailPager` 오른쪽 아이콘에서 연다.
`TalentCareerModal` 안에서 공통 `Select`로 목적지 Role·단계를 고른다.
Accept Intro와 같은 헤더·본문·하단 여백 및 공통 `Radio` 두 행을 사용한다.
“Harper가 물어보기”는 수락 후 자동 이동을 요청하고, “직접 대화했어요”를 선택하면
이동 버튼으로 바로 처리한다. 별도 동의 체크나 추가 확인 화면은 두지 않는다.
제안 전 후보에는 방법 선택이 없으며, 답변 대기 중에는 이동 불가 사유만 표시한다.
연결 대기는 이동 후에도 연결 대기이며, 파이프라인 후보만 목적지 단계를 선택한다.
