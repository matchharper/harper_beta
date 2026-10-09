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

## Dev billing previews

Harper Workspace의 `OrgBillingDevControls`는 브라우저 전용 결제 미리보기다.
Free·슬롯 수 외에 예시 카드, 구독 상태, 크레딧 잔액, 내역, 결제 결과를 선택한다.
Slots·Billing의 `OrgBillingPreviewNotice`에서도 같은 control을 펼칠 수 있다.
`OrgBillingPortalPreview`는 shared `TalentCareerModal` 안에서 예시 카드 교체·삭제와
결제 성공·실패·추가 인증 흐름을 보여준다. 실제 Stripe UI와 구분해 표시하며
서버 결제 요청으로 연결하지 않는다. 예시 청구·사용 내역도 실제 query cache와 분리한다.
Slots의 배정 선택은 `MuteButton size="sm"`을 trigger로 쓰는 `DropdownMenu`를
슬롯 카드와 작은 `bg-bg-weak` Role 행에 함께 둔다.
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
| Quiet compact action | `MuteButton` |
| Icon-only action | `MuteButton` |
| Compact repeated action | `MuteButton` |
| Clickable card | `CardButton` |
| Existing card action migration | `InteractiveCard`, `ChoiceCard` |
| Text | `Text` |
| Career Markdown | `RichText variant="career"`: H1 uses 20px/medium; tables keep only horizontal separators with no outer border or edge padding. External HTTP(S) links use `ReferenceLink` (favicon + `text-action`, a user-requested Career link style). Shared chat content forwards the variant; other surfaces keep default Markdown styling. Copy/export always uses the unchanged Markdown. |
| Inline source links | `ReferenceLink` from `src/components/ui/reference-link.tsx`; `RichText referenceLinks` opts in outside Career. Uses a hostname-only favicon request with a globe fallback, destination tooltip, and keyboard focus. |
| Career message width | `CareerMessageBubble` limits both user and assistant bubbles to 740px (and the available mobile width). Keep the shared `ChatMessageBubbleFrame` defaults unchanged for other products. |
| Career recommendation search | `RecommendationSearchStatusPanel` + `RecommendationSearchProgress` use a 420px card, a CSS-only abstract wire ring and four compact 32px steps. A single gray highlight slides between steps; numbers/checkmarks have no badge background and counts animate upward without React updates per frame. Read progress from the existing status stream/run coverage; never advance steps on a timer in the real search. Dev controls lazily open `CareerRecommendationSearchPreview` for local stage selection and playback without a search request. Respect reduced motion. |
| Labels/status chips | `Badge` |
| Persistent announcements | `AnnouncementQueue` + `AnnouncementCard` from `src/components/common/`: register notices with stable IDs, publication dates, localized titles/descriptions and optional image/text/icon media. An optional `action` accepts `label` plus either `href` or `onClick`, rendered as a full-width `MuteButton` below the description with a 20px gap. Omit it for the original button-free layout. The Welcome action opens the current workspace’s new-position page through `buildOrgHref`. Display unread, published notices oldest first, one at a time; X advances to the next, up to three per browser-document visit (including client-side navigation). Reloading starts the next visit. Each displayed item is atomically recorded in `user_announcement_receipts` for the account; unopened items remain unread. Use a 320px maximum width, `rounded-lg`, no shadow, a medium-weight title, shared title/body text color and inherited line height; leave 24px above the description and 32px below it. No focus capture or auto-dismiss; safe areas, short viewports and reduced motion are supported. `AnnouncementCard` always gives its media area a `bg-primary-faded` background and `rounded-md` corners. `HarperAnnouncementVisual` shows only a centered 96px Harper face in a 112px-high area, without extra icons or rings. The Welcome preview button in `/org/home` Dev controls opens the same card repeatedly without reading or writing announcement receipts. Company-side notices live in `src/components/org/announcements.tsx`, using Org translation keys and `org-` notice IDs. Automatic display mounts only on the authenticated, fully loaded `/org/home` workspace after onboarding. Other Org pages, `/career` (including its preview), and public/login pages do not mount this queue. Leaving home dismisses the displayed card; its receipt remains recorded. |
| Calibration 평가 상태 (목록·상세) | `OrgCalibrationReviewBadge` from `src/components/org/role-overview/OrgCalibrationReviewBadge.tsx` |
| Form fields | `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `Radio` |
| Career / company onboarding | `src/components/common/onboarding/Onboarding.tsx`: shared frame, progress, transition, header, footer, face ready state and conversation preview. Keep domain steps, copy, persistence and submissions in each domain. Career retains its original geometry by default; company may use flexible title height and place the mobile research preview after the title. |
| Company plan selection | `WorkspacePlans` from `src/components/org/billing/WorkspacePlans.tsx`: shared Free / Slot / Enterprise panels for pricing, onboarding and billing; `BillingIntervalTabs` controls monthly/yearly prices. Flat pale panels, a separate price header, aligned pill actions and a single-column mobile layout. Onboarding uses `OnboardingFrame wide` for this step only; the default frame remains narrow. |
| Slot purchase | `SlotPurchaseDialog` from `src/components/org/billing/SlotPurchaseDialog.tsx` is shared by onboarding, Slots and Billing. Reuse `TalentCareerModal` with `mobileBottomSheet`, `BillingIntervalTabs`, `Input` and `MuteButton`: select 1–100 slots, show `N Slot` / `N Slots` at the left and the monthly or annual total at the right with `currencyDisplay: narrowSymbol` (`$` for USD), and preserve per-slot credit/cancellation wording. Wrap only the price, benefits and quantity area in a rounded `border-action` / `bg-action-faded` card. Use blue circle-check bullets with no horizontal dividers and a single white quantity control containing minus, editable count and plus. Keep the title, right-aligned billing-period tabs (`headerActions`) and checkout actions outside the scrolling form body; show `20% OFF` beside the annual option in this purchase dialog, use visible bullet points for explanations, and place the quantity selector last in the body. Link the submit action to the form's unique ID. |
| Organization slots and billing | While public billing is paused, only the verified Harper Workspace shows Slots (`/org/slots`) and Owner-only Billing (`/org/billing`) as separate left sidebar entries. Other workspaces redirect direct visits to the company page. There are no internal page tabs. `BillingSlots` uses a responsive grid of at most three outlined cards, with the dashed add action last. A separate shared-credit panel precedes the grid: all Free/standard workspaces retain 10 monthly shared credits, with no Role assignment. Only actual paid/complimentary Slots appear as assignment cards; Roles are unlimited. `BillingUsageHistory` uses `Table` and 20-row `useQuery` pagination. `BillingPlanSummary` and `BillingInvoiceHistory` form the Billing page. These user-requested outlined surfaces keep `bg-bg-default` and no shadow. |
| Company Slack channel invitation | `OrgSlackChannelPicker` from `src/components/org/OrgSlackChannelPicker.tsx`: shared search, compact divider-free scrolling channel list, per-row `MuteButton dark / sm` invitation and primary create action. Use inline in onboarding and inside `TalentCareerModal` with `mobileBottomSheet` in settings; domain callers own mutations and errors. |
| Company Slack channel creation | `OrgSlackCreateChannelDialog` from `src/components/org/OrgSlackCreateChannelDialog.tsx`: shared name and privacy form for Workspace settings and Role notification settings; it creates and connects the channel, while the caller refreshes any Role-specific channel list. |
| Menu | `ActionDropdown`, `DropdownMenu`; `DropdownMenuItem` and `DropdownMenuSubTrigger` share `variant="sm"` for compact rows and `variant="md"` (default) for standard rows, including spacing, text, and icon sizing. `DropdownMenuItem` uses `text-neutral-800/80` for SVG icons. |
| Tooltip with an arrow | `Tooltip`, `TooltipTrigger`, and `TooltipContent` from `src/components/ui/tooltip.tsx`; use `showArrow` for the current shadcn bubble style and `arrowClassName` to match the bubble background. Keep clipping and expansion animations inside the content so the arrow stays visible. |
| Page section copy | `SectionHeader`, `SectionTitle`, `SectionDescription` |
| Public landing navigation and footer | `CareerAppBar` from `src/components/landing/career/CareerAppBarNew.tsx` and `CareerLandingFooter`. Reuse the existing logo, navigation, language switcher and footer on public pages including `/pricing`; do not build a page-specific header. While self-serve signup is paused, company pages pass the existing meeting-request form destination to the AppBar and retain the original Meet label. The Footer's `careerStartHref` remains a talent destination. Use `audience="company"` for the light company footer: company/talent/Harper link groups, a large existing wordmark, a flat neutral background without gradients, the original English tagline, and separate legal/language/status row. Language selection and actual service-status state remain shared; the default talent footer keeps its existing composition. |
| Company landing additions | `CompanyLandingSections.tsx` provides the talent statement, an ordered three-step hiring process, and FAQ for `/company` and its language routes. Preserve the requested statement copy. Steps use only outline icons, titles and short descriptions in three flat panels, stacked on mobile. Compose the FAQ with shared `QuestionAnswer` (`cream`, `compact`); introduction copy distinguishes a candidate’s existing interest from company-first outreach. The previous three development concepts remain separate. |
| Public pricing FAQ | `QuestionAnswer` from `src/components/landing/Questions.tsx`, also used by the existing company and billing pages. Use `theme="cream"` for light surfaces and `variant="compact"` on pricing: 16px vertical padding inside the clickable question row, readable question text and right-aligned chevrons. Pass each item's index and the list length, and compose the section heading outside. Answers accept React content so a relevant link can live inside the answer. Keep disclosure animation, keyboard focus and expanded state in the shared component. |
| Company social proof | `CompanySocialProof.tsx` shares the company landing's talent logos, `CompanyTalentLogoTile`, anonymous team descriptions and localized testimonial. `/company` retains its grid; `PricingSocialProof` shows Wonderful and Sierra, a single slow talent logo row and a large testimonial between plans and FAQ. Only display a confirmed undisclosed-company count; do not derive it from all workspaces. The Sierra wordmark comes from [Sierra's official brand assets](https://sierra.ai/using-our-brand) and links to its homepage. The repeated talent logo group is hidden from assistive technology; provide a pause control and a static, scrollable row for reduced motion. |
| Public landing demo video | `DemoVideo` from `src/components/landing/DemoVideo.tsx`; shared by `/demo` and `/company`, fills its container and preserves internal-view tracking exclusions |
| Public landing closing section | `CareerLandingClosingSection` shares the home page's centered closing copy and layout, including on Jobs. Pass the page's existing action and retain the home landing CTA styling. The preserved, currently commented self-serve company closing uses `variant="company"`: a light horizontal closing row aligned to the footer's 1244px container, a thin top divider, left-aligned heading and note, and right-aligned shared `MuteButton` actions (`default` for contact, `dark` for signup). Stack copy and actions on mobile. The active company page restores the original `ContactSalesSection` meeting-request form at the company-contact anchor. |
| Jobs explanation and FAQ | `OfficialJobsExperience` shares How Harper Works, a native disclosure FAQ with a rotating plus icon, and the landing closing section between Jobs list/detail. `showAbout` adds the existing `DemoVideo` only on the list. About, How Harper Works, and FAQ use desktop 40:60 flex columns without title subtitles and stack on mobile; the closing section stays centered. |
| Public 404 page | `NotFoundPage` from `src/components/landing/NotFoundPage.tsx`; shared by Pages Router and App Router, with the landing AppBar, centered message and home link, and landing Footer. Router entry points own authentication and metadata. |
| Editable document preview and right-side editor | `DocumentEditor` from `src/components/ui/document-editor.tsx` |
| Interview availability calendar, split panel, and time option | `MeetingAvailabilityCalendar`, `MeetingAvailabilitySplitLayout`, `MeetingAvailabilityTimeButton` from `src/components/meetings/MeetingAvailabilityLayout.tsx` |
| Chat internal-role and mock interview call proposals | `CareerCallProposalCard` from `src/components/career/chat/CareerCallProposalCard.tsx`; use shared `src/components/career/MockInterviewStart.tsx` for mock interview confirmation and start behavior |
| Career saved document preview: Markdown copy/export or generated resume paginated A4 HTML preview/on-demand PDF download | `CareerDocumentDetail` from `src/components/career/documents/CareerDocumentDetail.tsx`, opened at `/career/profile?profileSection=links&documentId=...` like call notes; chat links use `DocumentPreviewCards` with `CardButton`. Do not open saved documents in a modal. |
| Career position actions | `HistoryOpportunityRoleActions`: use `variant="tags"` above the desktop composer for small white text-only actions without entrance animation; use the default list in mobile and detail content |
| Career new positions | `NewOpportunityList` from `src/components/career/history/NewOpportunityList.tsx`: shared by desktop and mobile, with separate internal/external sections, a flat internal list with connection guidance, external recommendation-date groups, spaced collapsible cards, bounded role descriptions, and card-scoped feedback. Internal cards use a small Handshake `Badge` at `absolute left-1 top-[-2px]` with `bg-primary-faded text-faded`; Intro requests keep the direct-connection label. Collapsed positive actions reuse the opportunity type's icon. Use `OpportunityPreferenceFit variant="icons"` for colored fit icons with `Tooltips`. |
| Career welcome | `CareerWelcomeHeader` from `src/components/career/CareerWelcomeHeader.tsx`: centered greeting and current network scan count at the top of Tasks. Reuse `useCareerWelcomeContent` in the existing Home layout so both surfaces use the same profile name, scan count, and translated description. |
| Career tasks | `CareerTasksPanel` from `src/components/career/CareerTasksPanel.tsx`: shared by desktop and mobile, places `CareerWelcomeHeader` above the title and groups current decisions, Harper suggestions, and ongoing introductions. While onboarding, place `CareerHomePanel variant="onboarding"` above the task sections to reuse the existing interview progress, call/completion actions, and checklist. Hide it once onboarding is complete. Compose sections with `SectionHeader` and row actions with `MuteButton`; use the existing composer, position detail, and meeting invitation for actions. Navigation counts only current decisions. |
| Career desktop navigation | `CareerWorkspaceNav` from `src/components/career/CareerWorkspaceNav.tsx`: left sidebar with tasks, new opportunities, saved opportunities, profile, and Search Brief (`/career/brief`). Reuses `MuteButton` and `CareerProfileMenu variant="sidebar"`; keep its background aligned with chat and its row geometry aligned with the Org sidebar. The header toggle switches between 244px and a 64px icon rail with shared tooltips and a 28px avatar; persist the collapsed state in `useCareerWorkspaceUiStore`. Reuse its exported `CareerNewOpportunityIcon` for the same new-opportunity icon in mobile navigation. |
| Career job previews in chat and company details | `CareerOpportunityPreviewCard` shares the logo, metadata, posting status, and optional Recommended/Fit badges; `CareerOpportunityPreviewModal` opens the detail with a Save action |
| Career company details and jobs | `CareerCompanyDetailDrawer` composes `CompanyDetailView` and `CompanyJobsList` inside `TalentCareerModal`; jobs use 20-item infinite pagination |
| Career profile sources and documents | `CareerProfileSourceCard` from `src/components/career/settings/CareerProfileSourceCard.tsx`; use the 136×148 card for profile links, connected sources, resumes, documents, and add/upload actions |
| Career source icons | `CareerProfileSourceIcon` from `src/components/career/settings/CareerProfileSourceIcon.tsx`; reuse the profile source-card logos. Source slots come from `src/lib/career/profileSources.ts`. The Tasks source reminder uses the Lucide `Link2` icon. |
| Company logo previews | `CompanyLogo` from `src/components/career/watchlist/CompanyLogo.tsx`; use `size="xs"` for 16px logos in the Tasks 2×2 recommendation preview. Existing `sm/md/lg` sizes keep their original styles. |
| Career blocked companies | `CareerBlockedCompaniesSettingsSection` from `src/components/career/CareerProfileSettingsSection.tsx`; reuses the existing blocked-company field and immediate add/remove save actions. Place it below the Search Brief at `/career/brief`, using `CareerProfileWorkspace view="brief"` without profile in-page tabs. |
| Career profile visibility | `CareerProfileSharingSettingsSection` from `src/components/career/CareerProfileSettingsSection.tsx`; show it only in the profile subtab (`profileSection=profile`), below the in-page tabs and above the profile content, with `showBlockedCompanies`, `showEngagementTypes`, and `showLastUpdated` set to `false`. Reuse the existing confirmation and save flow. Compose option hints with shadcn `Tooltip` and `showArrow` as rounded black bubbles above the buttons; an unselected Open to matches option keeps a compact `65%` hint visible only while its scroll container is at the top. Hover or focus opens the full explanation at any scroll position. |
| `/career` and ordinary `/org` modals, confirmations, or bottom sheets | `TalentCareerModal` from `src/components/common/TalentCareerModal.tsx`; use `mobileBottomSheet` for ordinary Org modals. |
| Dedicated Radix panel composition | `Dialog`, `DialogContent`, `DialogTitle`, and `DialogDescription` from `src/components/ui/dialog.tsx` for UI that requires a dedicated layout, such as the Org mobile navigation drawer and full-screen interview-availability editor. |

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
