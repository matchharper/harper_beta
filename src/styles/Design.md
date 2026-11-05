# Harper Design Tokens

팔레트와 페이지 색상은 `src/globals.css`, 공통 외관과 컴포넌트별 외관은 `src/styles/design-tokens.css`가 정본이다. 둘 다 `@theme static`으로 선언해 CSS 변수와 Tailwind에서 같은 값을 사용한다. 화면 코드에서는 용도를 나타내는 semantic token을 먼저 쓰고 palette token은 보조적으로만 쓴다.

## 핵심 원칙

1. 배경은 `bg-bg-*`, 텍스트는 `text-neutral-*`, 상태와 강조는 `positive/info/action/critical`, 브랜드 포인트는 `primary`를 먼저 쓴다. `info`는 노란색이고 `action`은 파란색이다.
2. `gray-*`, `paper`, `layer-*`, `fg-*`, `status-*`는 새 코드에서 쓰지 않는다. 경계선에는 `stroke`, `stroke-subtle`, `stroke-strong`, `stroke-focus` 또는 해당 컴포넌트의 border 토큰을 쓴다.
3. 버튼·입력·메뉴·카드는 공용 컴포넌트가 제공하는 외관을 사용한다. 기본 밝은 표면은 `surface`를 공유하며 각 컴포넌트의 배경·테두리·모서리·그림자·blur를 독립적으로 바꿀 수 있다.
4. 어두운 채움은 명확한 CTA나 상태 표현에만 쓴다. 일반 카드, input, dropdown, 탭의 resting state에는 쓰지 않는다.
5. 화면에서 기본 외관을 반복해서 덮어쓰지 않는다. 배치와 크기는 callsite가, 외관은 공용 컴포넌트와 토큰이 소유한다. 평면 패널·원형 아바타·브랜드 그림처럼 역할이 다른 요소는 그 역할에 맞는 변수나 기하를 유지한다.

## 외관을 함께 또는 따로 변경하기

`design-tokens.css`는 **기초 값 → 공통 표면 → 컴포넌트** 순서로 연결한다. `--color-surface`, `--color-surface-border`, `--surface-border-width`, `--radius-surface`, `--shadow-surface`, `--blur-surface`, `--background-image-surface-image`가 공통 출발점이다. 기존 `--color-bg-floating`도 `--color-surface`를 참조한다.

| 대상 | 독립 변수 접미사 | 기본 연결 |
| --- | --- | --- |
| 카드·패널 | `card` | 공통 surface |
| 새 기회·저장함·진행중의 기회 카드 | `opportunity` | 접힘 neutral-50 / 펼침 surface, 기존 옅은 border, 기본 shadow 없음 |
| 모달·바텀시트 | `modal`, `sheet`, `overlay` | surface, 별도 큰 모서리·elevation·배경막 |
| 드롭다운·Select 목록 | `menu` | surface, 메뉴 전용 elevation |
| 팝오버 | `popover` | menu |
| 입력·Select trigger | `control` | surface, control 모서리·border |
| 버튼 | `button` | control, 버튼 전용 상태·weight |
| 대화 입력창 | `composer`, `composer-collapsed` | 별도 반투명 표면·모서리·blur |
| 메시지·탭·배지·툴팁·토스트 | `message`, `tab`, `badge`, `tooltip`, `toast` | 해당 역할의 변수 |

카드의 예는 `--color-card`, `--color-card-foreground`, `--color-card-border`, `--card-border-width`, `--background-image-card-image`, `--radius-card`, `--shadow-card`, `--blur-card`다. modal/menu/popover/control/button/composer에도 같은 속성 이름을 제공한다. `--font-weight-body`, `--font-weight-heading`, `--font-weight-label`, `--font-weight-control`은 Typography와 컨트롤의 공통 굵기다. 글자 크기·행간·배치 수치는 기존 typography/layout 계약을 따른다.

```css
:root {
  --color-surface: rgb(255 255 255 / 70%);
  --radius-surface: 20px;
  --blur-surface: 18px;
  --shadow-surface: 0 12px 32px rgb(0 0 0 / 12%);
  /* 메뉴만 불투명하고 작게 만들 수도 있다. */
  --color-menu: #fff;
  --radius-menu: 8px;
  --blur-menu: 0px;
}
```

전역 테마는 `:root`에서 바꿔야 body에 포털로 뜨는 모달·메뉴에도 적용된다. 한 요소만 바꿀 때는 해당 요소의 **최종 컴포넌트 변수**를 override한다. CSS alias는 선언 위치에서 해석되므로 하위 요소에서 공통 `--color-surface`만 바꿔도 모든 alias가 다시 계산된다고 가정하지 않는다.

공용 컴포넌트를 우선 사용한다. 직접 표면을 작성할 때는 `bg-card bg-card-image rounded-card border-(length:--card-border-width) border-card-border text-card-foreground shadow-(--shadow-card) backdrop-blur-card`처럼 속성을 조합한다. **그림자는 `shadow-(--shadow-card)`처럼 원래 변수를 직접 참조한다.** Tailwind의 `shadow-card`는 컴파일 과정에서 alias를 풀 수 있어 런타임의 값 변경을 놓친다. `cn`은 배경색과 배경 이미지를 구분하므로 둘을 함께 유지하고, 호출자가 전달한 같은 속성의 override만 교체한다. 투명 표면은 필요하면 `bg-transparent bg-none shadow-none backdrop-blur-none`을 함께 지정한다.

`OpportunityCard`는 일반 카드의 elevation을 상속하지 않는다. 새 기회·저장함·진행중의 기본 표면은 접힘 `neutral-50`, 펼침 `surface`, 12px 모서리와 기존 옅은 테두리이며 그림자는 없다. 외관을 바꿀 때는 `--color-opportunity`, `--color-opportunity-expanded`, `--shadow-opportunity` 등 해당 역할의 변수를 사용한다. `TabBoxes variant="neutral"`은 기존 400 굵기와 black 4% 비선택 배경을 유지하며, 일반 탭의 label 굵기를 적용하지 않는다.

개발 모드의 `/dev/design-tokens`에서 기본·평면·글래스 값과 개별 변수를 조정할 수 있다. 실제 공용 컴포넌트를 사용하며 선택은 저장하지 않는다. 검사 범위와 실행 방법은 `src/app/dev/design-tokens/README.md`를 참고한다. 여기에 있는 프리셋은 QA용이며 기본 제품 테마나 첨부 디자인의 레이아웃 적용을 의미하지 않는다.

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

Career는 `career-floating-sky.css`의 `data-career-theme="sky"` 범위에서
화면 전체의 옅은 하늘 gradient와 떠 있는 글라스 표면을 쓴다. 왼쪽 sidebar는
상단 채팅·기회 탐색으로 바뀌고, 모바일은 홈·채팅·기회다. 오른쪽 패널 바탕은
투명하며 개별 카드만 떠 있다. 정확한 배경·shadow·radius 수치는
`docs/career-floating-sky-design-system.md`가 정본이다. 회사 화면의 토큰은 유지한다.

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

Career Dev Controls의 `CareerGlassDevControls`는 입력한 글 위에 glass 레이어를
겹쳐 보는 접이식 실험 영역이다. 둥글기·흰 배경·테두리·양방향 그림자·배경 흐림을
로컬 상태로 조절하고 현재 값의 Tailwind 클래스를 복사한다. 기본값은 radius 200px,
흰 배경 50%, 흰 border 1px/80%, ±1px offset·1px blur·검정 25% shadow이며
backdrop blur는 0이다. 전역 스타일과 저장된 사용자 데이터는 변경하지 않는다.

Glass 미리보기 바로 아래의 Gmail 연결 미리보기는 채팅의
`GmailIntegrationActionContent`를 그대로 렌더링한다. `[[integration:gmail]]`
마커가 표시하는 연결 전·후 상태를 `inert` 영역에서 실제 연결 요청 없이 보여준다.
Gmail은 문서 카드의 `PreviewUI`를 정적인 카드로 재사용하며, 짧은 연결 장점을
`wrapDescription`으로 두 줄 표시한다. 카드 오른쪽 `trailing`에 `MuteButton variant="dark"`의
“연결” 버튼을 두고, 연결 완료 시 같은 위치의 체크 배지로 교체한다.
`PreviewUI`의 `onClick`이 있을 때만 기존 `CardButton`으로 렌더링하고, `trailing`에는
상태 아이콘을 넣을 수 있다. Gmail 쓰기 권한까지 확인된 연결 상태에는 action 색으로 채운
`BadgeCheck`의 체크만 흰색으로 표시한다.
종료되었거나 아직 조회되지 않은 브라우저 참조는 `PreviewUI`를 사용한다. 실행 중인 브라우저는
`BrowserSessionDock`의 실제 팝업 화면을 바로 표시한다.

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

Career 입력창은 최대 560px의 떠 있는 글라스 표면이다. 주변 overlay에는 흰색
fade를 깔지 않는다. 모바일 홈과 채팅이 같은 입력창 인스턴스를 공유하고,
focus·타이핑은 홈에 머물며 제출할 때 채팅 탭을 연다. 두 표면의 radius는 16px다.

`ChatComposerSurface` owns the shared `rounded-composer` panel shape; glass surface
classes contain only color, border, shadow, and blur. `ChatComposerFrame` uses
`rounded-composer-collapsed` only below `md` while collapsed and without a context area.
Focused inputs, inputs with context/attachments, desktop inputs, and Apply with
Harper preparation panels keep `rounded-composer`. The separate one-line mobile chat
launcher (`ChatComposerCollapsedFrame`) always uses `rounded-composer-collapsed`.
Callers must not duplicate these radius conditions.
Only pass a context area when it has visible content. An active Apply with Harper
session alone must not reserve top padding or change the ordinary mobile input's
pill shape; use `shouldShowPreparationReopen` for the actual question-reopen action.

The mobile Career workspace uses the top tab bar. Conversation content scrolls
inside its column and the composer honors the bottom safe area. Drafts stay in
the mounted chat component while Home, Chat and Opportunities change visibility.

Career 브라우저 팝업은 Dev controls의 `BrowserPreviewFrame`과 동일한
`BrowserPreviewSurface` (`src/components/career/BrowserPreviewFrame.tsx`)를 재사용한다.
아이콘·제목·상태, `rounded-3xl bg-bg-weak p-3` 표면, 16:9 화면과 확대/축소,
검은색 pill action을 공유하고 실제 세션의 상태·제어권·종료 액션만 전달한다.
별도의 세션 카드 디자인을 만들지 않는다.

Career의 `BrowserSessionDock`은 실행 중인 세션을 자동으로 표시한다. 데스크톱에서는 대화의
`BrowserSessionAnchor` 위치에 실제 팝업을 표시하고, 그 자리가 화면 밖으로 나가면 composer
오른쪽 위의 320px 팝업으로 이동한다. 모바일은 대화에 화면 높이를 예약하지 않고 처음부터
상단 중앙에 접힌 상태로 표시한다. 펼쳐도 같은 너비를 유지한다.
포털은 채팅 layout에 고정되어 있고 스크롤·내용 높이·viewport 변화에 따라 위치만 갱신한다.
inline↔dock 전환에만 240ms 이동 애니메이션을 사용하며 reduced-motion을 존중한다.
접기·펼치기·X·Escape는 화면만 접고, 같은 iframe과 원격 실행을 유지한다. 실제 종료 상태가
확인될 때만 팝업을 제거한다. DOM을 다른 포털로 옮기거나 뷰어를 재연결하지 않는다.
채팅 컨테이너가 fixed 좌표와 stacking context를 소유하며, 팝업은 z-10/11, composer는 z-20이다.
shared nonmodal `DialogPanelContent`가 Escape·focus를 처리하며 바깥 클릭이나 스크롤로 닫지 않는다.
Harper의 `[[browser:session_id]]`도 같은 anchor를 사용한다. 표시와 제어권 전환은 별개이며
human 상태의 펼친 화면에서만 직접 입력한다. 뷰어 URL은 메모리에만 둔다.
Dev controls의 `지원 중 미리보기`는 같은 팝업에 빈 화면을 표시하며 실제 세션이나 지원 요청을 만들지 않는다.
메일의 `/career?browserSession=<operation ID>` 링크는 로그인·소유권 확인 후 같은 화면으로 연결한다.

`CareerFormCard`는 동시에 여러 개를 유지하며 각 폼의 입력과 응답 저장 상태가 독립적이다.
Harper의 답변이나 다른 폼 처리가 진행 중이어도 응답할 수 있다. 저장된 응답별로
기존 백그라운드 대화를 이어가며, 폼의 revision과 응답 멱등성은 보존한다.

On mobile, `ChatComposerFrame` and its token overlay use 16px input text in both
collapsed and focused states to prevent Safari focus zoom. Only the placeholder
uses the smaller 14px size; callers must not shrink the textarea itself.
`ChatMessageBubbleFrame` accepts `animateEntrance` for a newly sent optimistic
user message: a short upward fade and subtle scale, disabled for reduced motion.
Do not enable it for restored history or the persisted replacement message.

Career 메시지의 시간·복사·삭제는 `CareerMessageActions`의 같은 세로 메뉴를 사용한다.
데스크톱에서는 메시지 우클릭 위치 아래에 shared `Popover`와 virtual anchor로 메뉴를 연다.
메뉴가 열린 Harper 메시지의 모든 버블에 `neutral-400` 배경을 적용해 기존의 연한 회색
버블과 복사·삭제 범위를 구분한다. 테두리는 표시하지 않으며, 메뉴가 닫히면 강조도 해제한다.
버블을 이동하거나 확대하지 않으며, 바깥 클릭·Escape로 닫는다. 화면 가장자리에서는
메뉴가 잘리지 않게 위치를 보정하고, 스크롤·창 크기 변경 시 닫는다. hover 하단 메뉴는 쓰지 않는다.
모바일 Career의 일반 Harper 메시지는 투명 배경을 유지한다. 길게 눌러 중앙으로 올릴 때 투명한 버블에
`--color-message-lifted` 배경을 적용한다. Career Sky에서는 white 90%와 버블 뒤의 글라스 blur로 뒤 글자와 겹치지 않게 하고,
닫으면 기존 배경으로 복원한다. 이미 배경이 있는 버블은 기존 표면을 유지한다.
모바일은 하단 시간·버튼을 숨기고 450ms 길게 누르면 원래 메시지 버블을 중앙으로 이동해
약 2.5% 확대한다. `useChatMessageFocus`와 `liftMessageBubble`은 native manual Popover의
최상위 레이어를 사용한다. DOM 복제나 이동 없이 원본 article을 유지하고, 원래 자리에는
같은 크기의 placeholder를 둔다. 닫으면 원위치로 돌아오며 unmount 시에도 즉시 복원한다.
바깥 클릭·Escape·focus·배경 스크롤 잠금은 shared `TalentCareerModal`이 맡는다.
전체 배경은 검정 6%만 적용하고 blur를 쓰지 않는다. 아래 메뉴는 `ChatComposerSurface`를
재사용한다. 투명한 모달 배치 영역은 터치를 받지 않고 메뉴 표면만 터치를 받으므로,
메뉴 양옆이나 버블과 메뉴 사이를 눌러도 바깥 클릭으로 닫힌다.
긴 버블은 화면 높이에 맞춰 내부 스크롤을 제공하고, 스크롤 제스처는 길게
누르기를 취소한다. 링크·버튼 터치, visual viewport 변경, reduced motion을 보존한다.
확대된 모바일 메시지에서는 native 텍스트 선택과 기본 복사 메뉴를 허용한다.
길게 누르기·단어 선택·선택 범위 조절 중에는 메시지 확대 동작을 다시 시작하지 않는다.
삭제는 한 번 더 눌러 확정하며, 메뉴를 닫으면 삭제 확인 상태도 초기화한다.
복사 성공 시 토스트 대신 아래 `Slide Blur Swap`으로 복사 아이콘을 체크로 바꾸고 2초 뒤 복원한다.
`formatCareerMessageTime`은 브라우저 현지 시각을 기준으로 오늘·어제에는 `오늘 6:23 PM`,
`어제 6:23 PM`을 표시한다. 주가 달라도 어제 표시를 우선한다. 나머지 이번 주(월요일 시작)는
요일과 12시간제 시각, 이전에는 일·주·달 단위 경과 시간, 1년 이상이면 `yy.MM.dd`를 표시한다.

## Slide Blur Swap (슬라이드 블러 스왑)

메시지 복사 완료의 `role="status"` 문구는 `MuteButton` 바깥에 둔다. 화면 낭독용
텍스트가 버튼의 자동 텍스트 padding 판정에 포함되어 복사 후 너비가 변하지 않게 한다.

“슬라이드 블러 스왑 써줘” 또는 “Slide Blur Swap 적용해줘”는 아래 아이콘 교체 효과를 뜻한다.
기존 아이콘이 오른쪽으로 스르륵 밀려나며 흐려지고, 새 아이콘이 왼쪽에서 들어와 선명하게 자리 잡는다.

- 같은 고정 크기 wrapper 안에 두 아이콘을 absolute로 겹쳐 배치해 주변 레이아웃을 유지한다.
- 퇴장: `translateX(0 → 6px)`, `opacity(1 → 0)`, `blur(0 → 3px)`.
- 등장: `translateX(-6px → 0)`, `opacity(0 → 1)`, `blur(3px → 0)`.
- 두 전환을 동시에 `500ms ease-in-out`으로 실행한다. 원래 상태로 돌아갈 때는 역방향으로 전환한다.
- Tailwind: `transition-[translate,opacity,filter] duration-500 ease-in-out`.
  동작 줄이기 설정은 `motion-reduce:transition-none`으로 존중한다.
- 기준 구현: `src/pages/about.tsx`의 공고 제목 화살표 ↔ 이모지,
  `src/components/career/chat/CareerMessageActions.tsx`의 복사 ↔ 체크.
  hover/focus 또는 복사 성공 같은 전환 계기와 복원 시점은 각 사용처가 결정한다.

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

`font-regular`과 `font-normal`은 `font-weight: 400`에 대응한다. 내 기회의 저장 행·진행 행은 제목, 회사명, 일정, 상태 표시에 기본 굵기 400을 사용한다. 진행중은 상단 상태 필터 없이 해당 탭의 기회 목록을 바로 표시한다. 저장함과 진행중은 같은 `OpportunityCard`의 접힌 행을 사용한다. 저장함·진행중의 내부 연결 표시는 회사 로고에 `border border-primary`를 적용하고 shared `Tooltips`로 “Harper로 연결중인 기회.”를 표시한다. 로고 hover·키보드 focus로 확인하며, 왼쪽 위 배지와 메타데이터의 연결 텍스트는 표시하지 않는다. 진행중 목록은 `collapsedActions`에 상태 드롭다운을 두고, 예정된 일정이 있을 때만 `collapsedFooter`에 일정 정보를 표시한다. 목록에는 일정 추가 버튼과 빈 일정 안내를 표시하지 않는다. 모든 기회 상세 상단은 같은 `OpportunityCard`를 사용하며 `headerActions`에 상태 드롭다운을 두어 펼침 여부와 관계없이 같은 위치에 표시한다. 진행중 상세는 접힌 상태로 시작하고 상단 카드를 누르면 공고를 펼친다. `headerFooter`에는 목록과 공유하는 `OpportunityAppointmentSummary`를 사용하며 `showAppointmentCreate`로 일정 추가 버튼을 표시한다. 하단의 별도 공고 상세 정보 버튼은 두지 않는다. 상태 변경·일정 추가는 상단 카드에서 실행하고, 아래 `UpcomingAppointments`는 저장된 일정의 상세 정보와 조회 오류만 표시한다. 빈 일정은 아이콘·구분선 없이 작은 보조 텍스트로 표시한다. 진행 정보의 강조는 굵기보다 위치와 action 색으로 구분한다.

Page shell:

```tsx
<main className="min-h-screen bg-bg-basement text-neutral-primary" />
```

Card:

```tsx
<Card className="p-4" />
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

Career actual appointments use `src/components/career/UpcomingAppointments.tsx` in Role details. It reads the same owned appointment records, uses the shared section/button/RichText components and native details/summary for accessible expansion; appointment presence does not increment decision badges. `AppointmentCreateButton` shares the event form between progress rows and Role details, using `TalentCareerModal`, `Input`, `Textarea` and `MuteButton`. It saves a personal event to the existing `meeting_schedules` records and refreshes both surfaces; the next event's date is emphasized above its title and preparation notes.

- `ConversationExamples`는 `backgroundClassName`으로 표면 배경을 받으며 기본은 `bg-neutral-50`이다. 메시지는 300ms 후 시작해 기본 1.4초 간격으로 등장하고 마지막 메시지 뒤 5초 유지 후 반복한다. `messageIntervalMs`, `loopPauseMs`로 조절하며 `loopPauseMs={null}`이면 한 번만 재생한다. 대화 전체 높이를 예약해 등장·반복 중 레이아웃을 유지하고 inactive slide는 재생하지 않는다. reduced-motion에서는 전체 메시지를 바로 표시한다. `SelectBox` 행은 누르는 동안 98% 크기·70% 불투명도로 반응하며 비활성 항목에서는 이 효과를 끈다.

- Career의 근무 형태·제외할 회사는 원하는 조건에서 기존 설정 저장 경로로 관리한다. 공유 방식 편집은 내 정보 > 프로필 탭 최상단에 둔다. 홈에서는 `CareerProfileSharingSummary`로 현재 상태와 프로필 바로가기를 표시한다. 내 정보 > 내 자료(`/career/documents`)의 Gmail 카드는 개인 링크와 분리한 연결된 서비스 영역에서 기존 연결·이메일 기능을 제공한다.
- Career 프로필 공개 설정은 프로필 탭 최상단에서 현재 값을 보여주는 가로 `MuteButton` 하나로 연다. `ProfileVisibilityPanel`은 shared `TalentCareerModal`의 오른쪽 전체 높이 패널 안에 `SelectBox` → 선택한 공개 범위 설명 → `ConversationExamples` 순서로 표시한다. 옵션 선택 즉시 기존 설정 저장 경로를 호출하고 모달은 열린 상태로 유지한다. 저장 중에는 선택을 비활성화하고 제목 옆에 진행 표시를 둔다. 실패 시 기존 저장 hook이 선택을 복구하고 모달 안에 오류를 표시한다.

- `ConversationExamples` (`src/components/ui/conversation-examples.tsx`): `examples: { id, messages: { role: "user" | "assistant", text }[] }[]`로 대화 예시를 표시한다. 하나는 정적 대화, 여러 개는 swipe·방향키·페이지 점으로 탐색한다. `navigationLabel`, `getPageLabel(page)`에 현지화된 접근성 문구를 전달한다. `assistantName`, `assistantAvatar`로 발화자를 바꿀 수 있다. Gmail은 기존 번역 wrapper를 통해 이 공용 컴포넌트를 사용한다.
- `SelectBox` (`src/components/ui/select-box.tsx`): 둥근 약한 배경 안에 제목·설명·구분선·오른쪽 원형 체크를 표시하는 단일 선택 목록. `options: { value, title, description?, disabled? }[]`, `value`, `onValueChange`를 전달한다. 미선택은 `null`. `aria-label` 또는 `aria-labelledby`로 그룹을 명명하고, form 제출에는 `name`, 필수 선택에는 `required`를 전달한다. native Radio의 키보드와 form 동작을 유지한다.

Mobile settings detail headers use equal-width left/right grid columns around
the centered title, shared by Profile, Resume/Links, Referral, and Account.
Keep back/close controls at the outer edges and allow long titles to wrap within
the center column; unequal action widths must not shift the title off-center.

Career settings uses `TalentCareerModal mobileBottomSheet` on mobile, with a
content-height menu and a tall detail panel. The shared modal owns the only close
button, backdrop, focus, and dismissal; settings owns its navigation header and
content. Mobile sheets apply below 768px, with 28px top corners and no drag handle
or snap points. Keep the desktop modal styling independent. Mobile account save
actions portal into `FloatingPortalContainer`, inside the modal's focus boundary.

| Need | Component |
| --- | --- |
| Main action | `MuteButton` |
| Login persona switch | `AuthPersonaGate` from `src/components/common/AuthPersonaGate.tsx`: existing sessions without a login type adopt the first Career/Company area they visit and enter directly. Ops-enabled login accounts, including email-allowlisted UTM viewers, can move between both areas without logout; reuse `canSwitchAuthPersonaWithoutLogout`, and keep workspace/API permissions unchanged. For other accounts, show confirmation only when a recorded login type differs from the destination, inside the existing `CareerAppBar` and `CareerLandingFooter`, with the current login type and email, a local logout/re-login action, and a return action. Label the talent login as 커리어 / Career. The main `MuteButton` combines a white `/svgs/face.svg` without a background, an arrow, and a compass for Career or a building for Company to the left of its label. Mount it before workspace effects; reuse `MuteButton` and `Loading`. |
| Quiet compact action | `MuteButton` |
| Tab explanations | `Tabs` items support `tooltipVariant="light"`, sharing the existing light tooltip appearance through `Tooltips`. Org Inbox's pending and suggested tabs show plain labels without info icons and reveal their existing descriptions on hover/focus. |
| Icon-only action | `MuteButton` |
| Panel anchored to a trigger (column settings, To-do list) | `Popover`, `PopoverTrigger`, `PopoverAnchor`, `PopoverContent` from `src/components/ui/popover.tsx`. `PopoverContent` renders in a portal with the shared floating surface; pass `surface={false}` when the content draws its own box. Feature code does not import `@radix-ui/react-popover` directly. |
| Toggle chips (reasons, templates, who writes) | `MuteButton` with `variant="selected"` for the chosen chip and `variant="default"` for the rest; `variant="draft"` (dashed) for a new item not saved yet; `variant="neutral"` with `aria-disabled` for a chip that always stays on. Do not pass color or border classes from the call site. |
| Inline text action inside a form (미리보기) | `MuteButton variant="link"` |
| White chip on a tinted surface (To-do above the chat) | `MuteButton variant="raised"` |
| Count beside a tab or heading | `Badge size="xs" variant="count"` |
| Animated acceptance icon | `AnimatedHandshake` from `src/components/ui/animated-handshake.tsx`: shared by Org Accept Intro and Career connection acceptance buttons. Plays on entrance, button hover, and keyboard focus; respects disabled buttons and reduced motion. |
| Intro ticket icon | `Ticket` from `src/components/ui/ticket.tsx`: filled `currentColor`, `text-positive`, rotated 45 degrees; only accepts a numeric `size` (default 16px). Use after the shared-Intro heading and send-intro modal button label, and instead of the visible Intro unit in remaining balances. Preserve the full localized balance in screen-reader text. |
| GitHub, LinkedIn, Slack logos | `GithubLogo`, `LinkedinLogo`, `SlackLogo` from `src/components/common/BrandLogos.tsx`: existing public SVG assets; GitHub follows the surrounding text color for light and dark surfaces. |
| Compact repeated action | `MuteButton` |
| Clickable card | `CardButton` |
| Existing card action migration | `InteractiveCard`, `ChoiceCard` |
| Org Team access management | `OrgTeamsSection` and `OrgMemberTeamSelect` from `src/components/org/workspace/OrgTeamsSection.tsx`: shared `OrgTable` team rows, multi-team assignment, an Owner-only subtle info notice, a single page action beside the heading, counted team member/team `Tabs`, shared `TalentCareerModal` as a compact centered desktop dialog/mobile sheet, collapsible team member/Role selectors with shared inputs/checkboxes and one save footer. Keep billing and Slots out of Team controls. |
| Workspace deletion | `OrgWorkspaceDangerZone` at the bottom of `/org/team`, visible only to an actual Owner membership. Use a flat section, `MuteButton variant="warn"`, and `TalentCareerModal` with the deletion scope and workspace-name confirmation. Keep errors inline; an active paid subscription links to subscription management and blocks deletion until it ends. |
| Text | `Text` |
| Increasing numeric counters | `RollingNumber` from `src/components/ui/rolling-number.tsx`: changed digits roll upward; separators and units stay still. Use tabular digits, a single screen-reader value without live announcements, and reduced-motion support. Callers own the data and update cadence; the component never invents growth. |
| Public landing statistics | `LandingStats` from `src/components/landing/LandingStats.tsx` shares the three daily snapshot values, cached data query and bilingual labels between company and talent landing pages. Render the stored values directly; the component does not project growth or poll. Pass `locale` and optional outer `className`; use `align="center"` for centered values and labels on the home page. Keep surrounding logos and experiment assignment in the page. |
| Chat work progress | `ChatThinkingLogPanel` is shared by chat tool work and application-browser progress. Pass public progress text only, never command arguments or reasoning. Optional `statusLabel` names an input-waiting state without changing the shared layout; `active=false` stops animation. |
| Role Brief questions | `BriefQuestion` in `src/components/org/role-start/RoleStartOnboarding.tsx` shares the vertically centered question, textarea, choices and navigation for compensation, Brief questions and answer history. Keep question text left-aligned without a numbered eyebrow; the single right action switches from neutral Skip to primary Next with an arrow when text is entered. |
| Role Setup preparation | `RoleStartPreparation` replaces both onboarding panes with an opaque full-area surface during the initial role-writing turn. Center the preparation heading and list live tool-status logs underneath without an accordion; show the saved Setup only after creation and its refresh complete. |
| Sidebar role actions | Use `OrgRoleActionsMenu` as a sibling of the role link, positioned absolutely at its right edge. Reveal on hover, keyboard focus, or an open menu; keep visible on touch layouts. Open the portaled menu below for lifecycle actions and confirmed deletion. |
| Career Markdown | `RichText variant="career"`: H1 uses 20px/medium; tables keep only horizontal separators with no outer border or edge padding. External HTTP(S) links use `ReferenceLink` (favicon + `text-action`, a user-requested Career link style). Shared chat content forwards the variant; other surfaces keep default Markdown styling. Copy/export always uses the unchanged Markdown. |
| Message and inline source links | `src/components/ui/reference-link.tsx` owns all link markup, styles, labels, favicons, and source-paragraph layout. Career user text uses `renderUserTextWithLinks` with the `user` design; Career Markdown uses `ReferenceLink` with the `assistant` design. Edit both designs in this file's `LINK_STYLES`; callers do not pass link style overrides. `default` preserves ordinary RichText links, and `RichText referenceLinks` opts into the assistant source style elsewhere. Internal navigation uses the supplied callback; external sources retain their exact destinations and hostname-only favicon requests with a globe fallback. Inline `[posting](roleId)` references stay visible through `ReferenceLink`: Career uses the existing posting preview company/title (or the localized Position label while loading) and opens the role detail. Standalone posting lines continue to produce preview cards. |
| Career message width | `CareerChatPanel` constrains the timeline to 600px including its 20px horizontal padding, giving user and assistant content a 560px maximum. Keep the shared `ChatMessageBubbleFrame` defaults unchanged for other products. |
| Career inline matching, opportunities and Search Brief | `chat/inline/CareerInlineUi.tsx` renders reference-backed content directly in `CareerMessageBubble`, in text order. Reuse the document preview's `career-glass` surface without a click-to-open gate. Matching rows use collapsed `OpportunityCard`; collections reuse `SavedOpportunityList` and `ProgressOpportunityRow`; Brief reuses `CareerTalentContextSection`. Data/actions come from existing authenticated readers and workspace contexts. The local `/career/preview/chat-ui` page runs the same renderer with synthetic data. |
| Career recommendation search | `RecommendationSearchStatusPanel` + `RecommendationSearchProgress` use a 420px card, a CSS-only abstract wire ring and four compact 32px steps. A single gray highlight slides between steps; numbers/checkmarks have no badge background and counts animate upward without React updates per frame. Read progress from the existing status stream/run coverage; never advance steps on a timer in the real search. Dev controls lazily open `CareerRecommendationSearchPreview` for local stage selection and playback without a search request. Respect reduced motion. |
| Labels/status chips | `Badge` |
| Badge-style tabs | `TabBoxes variant="neutral"` from `src/components/ui/tab-boxes.tsx` reuses Badge sizing, typography, spacing, and radius. Resting tabs use `bg-black/4`; selected tabs use `bg-neutral-primary` with light text. For independent choices, `selectionMode="multiple"` accepts `activeValues` and returns the selected array through `onValueChange`; it exposes a named group of toggle buttons with `aria-pressed` instead of navigation tabs. Pass numbers through `count` to keep them inline with the label and in the same text style. Career desktop and mobile history share `history/CareerOpportunityTabs.tsx`, using `size="lg"`: In progress precedes Saved, with count-free Ended / Archived and icon-only Hidden positions at the right edge. The desktop search control is passed through its actions slot. |
| Role 검색 진행 | `OrgRoleSearchActivity` from `src/components/org/role-overview/OrgRoleSearchActivity.tsx`: 등록된 Role 화면의 공통 상단에 진행 중일 때만 한 줄로 표시한다. 공통 `Loading`과 12px 상태 문구를 쓰고 별도 카드·탭·퍼센트를 만들지 않는다. 기존 검색 원장과 회사 후속 작업의 실제 상태를 읽으며, 완료되면 행을 제거한다. 채팅 전체 화면·모바일에서도 같은 한 행을 유지하고 reduced motion, 조회 실패와 접근 권한 변경을 처리한다. |
| Org chat candidate references | `OrgTalentReferenceBadge` in `src/components/org/agent/` uses shared badge variants for named mentions, candidate links, and bare talent IDs. Keep the current chat and tab when opening a candidate. Existing company-visible pairs open their detail; an eligible unintroduced candidate opens `OrgCandidateProfilePreview`, which shares `OrgTalentProfileContent` and has no recommendation or contact actions. |
| Org candidate presentation | `OrgTalentProfile` shows TL;DR and Harper Note; use its existing Markdown renderer for Note bullets, preserving older plain-text notes. The writer prompt asks for at most three one-sentence bullets, including role relevance and material uncertainty in one bullet. Do not render a separate recommendation-reason section or validate bullet/sentence counts in code. |
| Org candidate criteria | `OrgCriteriaEvaluation` from `src/components/org/OrgCriteriaEvaluation.tsx`: shared fitness icon and criterion title. Candidate profiles use `showContent` to display the full evidence below each title from the start, without a tooltip or inert button; titles and evidence are not clamped. Compact cards retain `Tooltips` evidence on hover or keyboard focus. Numeric scores are omitted from the indicator, tooltip, and accessible name. Keep the indicator unstyled: no padding or hover background. Use it in candidate profiles and existing pipeline cards. Inbox list rows and Saved cards use `OrgCriteriaBars`: six 9×30px fitness bars with 4px gaps and `ResponsiveLightTooltip` evidence and stored score on hover/focus/touch. Never derive a missing legacy score from its fitness label. Keep criteria independent from the presence of a full company introduction. |
| Org inbox candidate review | `TalentDetailSimpleView` owns detail queries, permissions and mutations; its inline mode composes `OrgCandidateReview` for Home and Role Inbox. `OrgCandidateReviewHeader` owns navigation, decision buttons, shortcuts and action errors. `OrgCandidateReviewContent` is the independently reusable information body: pass profile data and `onResumeClick`, with optional error/retry and a `footer` slot. It requires no workspace/action provider and installs no decision shortcuts. Role-start Align renders this body directly in the right pane through `RoleStartCandidateProfile`, which adapts the existing contact-free profile and verdict; keep evaluation controls in the left pane and do not create inbox records or fetch contact/resume data for this view. The full review injects `OrgTalentNotes` through `footer`; standalone information does not include notes or mutations. Both review and modal reuse `OrgTalentProfileContent` (exported props contract in `OrgTalentProfile.tsx`); only its identity/resources header uses the review variant. Do not add a section navigation menu. Reuse `TalentDetailPager` from the existing modal. The enclosing pane owns scrolling: the Inbox toolbar scrolls away and the candidate action header sticks at the pane top. Do not add a border or rounded frame around the detail. List/Grid selection opens the same surface and Back restores the collection position. Grid reuses `OrgRoleTalentBoard` and `OrgRoleTalentBoardCard`. Append `OrgTalentNotes` for company notes only. Pending connections retain `StopCandidateDialog` for Reject and `OrgAcceptIntroButton` for the existing green Accept Intro action and handshake animation. Suggested candidates use `OrgPassPopover` with the existing rejection reasons and saved custom reasons. Keep the sticky action wrapper transparent, without a divider or top padding; outer Inbox padding must scroll with the toolbar. On desktop Home, the candidate pane starts near the viewport top alongside the Home title and tabs; search history remains in Role only. Domain containers own permissions, queries and mutations. |
| Candidate experience, education, and other history | `TalentExperienceSection`, `TalentEducationSection`, and `TalentExtraSection` from `src/components/profile/TalentExperienceSection.tsx` share the local `ProfileEntry` layout: experience-based 15px medium title, 15px metadata, muted 14px dates/location, and shared Markdown description/memo. Adjust typography and spacing in `ProfileEntry`; company and school logos use the same `ProfileEntryIcon` frame. Education reuses `getSchoolLogo(url, school)` from `src/utils/school_logo.ts`: LinkedIn school ID first, then an exact known school name using the existing Korean/English aliases. Keep `GraduationCap` for an unknown school or a failed image. |
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
| Organization slots and billing | While public billing is paused, only the verified Harper Workspace shows Slots (`/org/slots`) and Owner-only Billing (`/org/billing`) as separate left sidebar entries. Other workspaces redirect direct visits to the company page. There are no internal page tabs. `BillingSlots` uses one/two/three outlined card columns at mobile/sm/lg widths, with the add action in the section header. Each card ends with its Intro meter. `BillingSlotMenu` shares the ellipsis menu between cards and the compact `BillingSlotSubscriptions` table beneath the current plan; subscription information appears first, followed by permitted payment/cancel/resume actions. Countdown dates use `N일 뒤` / `in N days`, with exact dates in time-element titles and absolute subscription start dates in the table. Complimentary slots have no payment or cancellation actions and do not appear in the paid-subscription table. A separate shared-Intro panel precedes the grid: all Free/standard workspaces retain 3 monthly shared Intros, with no Role assignment. Only actual paid/complimentary Slots appear as assignment cards. Drafts are unlimited; one Free Role can remain active alongside the Roles assigned to paid slots. `BillingUsageHistory` uses `Table` and 20-row `useQuery` pagination. `BillingPlanSummary` and `BillingInvoiceHistory` form the Billing page. These user-requested outlined surfaces keep `bg-bg-default` and no shadow. |
| Company Slack channel invitation and purchased-slot assignment | `OrgActionPicker` shares the search, refresh, compact scrolling list, icon/name row and small plus action. `OrgSlackChannelPicker` supplies channel labels and creation; `SlotRoleAssignmentDialog` supplies active unassigned Roles after a confirmed slot purchase when at least two eligible Roles remain. A single eligible Role is assigned automatically, without a picker. Both use the same `TalentCareerModal max-w-md` / `mobileBottomSheet` composition in settings and billing. Domain callers own mutations and errors; the slot dialog can be dismissed with “나중에”. |
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
| Date picker | `Calendar` from `src/components/ui/calendar.tsx`; dates use 12px normal text, 32px default row height, and subtle corners. Month navigation has 40×40px targets and 20px chevrons, independently of the date cell size. |
| Chat internal-role and mock interview call proposals | `CareerCallProposalCard` from `src/components/career/chat/CareerCallProposalCard.tsx`; use shared `src/components/career/MockInterviewStart.tsx` for mock interview confirmation and start behavior |
| Career saved document preview: Markdown copy/export or generated resume paginated A4 HTML preview/on-demand PDF download | `CareerDocumentDetail` from `src/components/career/documents/CareerDocumentDetail.tsx`, opened at `/career/documents?documentId=...` like call notes; chat links use `DocumentPreviewCards` with `CardButton`. Do not open saved documents in a modal. Generated resumes share `src/lib/resumes/template.ts` between the paginated preview and PDF: centered name/contact header, organization and dates on opposite sides, italic role/location row, ruled sections, and semantic bullet lists. Preserve text and allow multi-page flow rather than shrinking or clipping content to one page. |
| Career position actions | `HistoryOpportunityRoleActions`: use `variant="tags"` above the desktop composer for small white text-only actions without entrance animation; use the default list in mobile and detail content |
| Career new positions | `NewOpportunityList` from `src/components/career/history/NewOpportunityList.tsx`: shared by desktop and mobile, with separate internal/external sections, glass cards with connection guidance, external recommendation-date groups, spaced collapsible cards, bounded role descriptions, and card-scoped feedback. Internal cards use a small Handshake `Badge` at `absolute left-1 top-[-2px]` with `bg-primary-faded text-faded`; Intro requests keep the direct-connection label. Collapsed positive actions reuse the opportunity type's icon when present; Request intro is text-only in collapsed/expanded cards, detail actions, swipes and shortcuts. Use `OpportunityPreferenceFit variant="icons"` for colored fit icons with `Tooltips`. |
| Career opportunity detail | `OpportunityCard` shares the new-position card's header, company facts, recommendation, description, fit icons and JD link with `HistoryOpportunityInlinePage`. Detail cards use `onToggle` for inline expansion, with `headerActions` and `headerFooter` visible in either state. In-progress details start collapsed; other details retain their initially expanded state. Put status changes in the shared header rather than the breadcrumb row; callers provide action slots. `HistoryOpportunityDetailActions` uses existing external saved-stage mutations/application choices and internal consent/reversal/stop flows. Already applied, connected, closed or expired positions omit the new-application action; internal Roles never use external status mutations. Detail action buttons fill the card width in equal columns. Keep the activity timeline below the card; the separate Apply with Harper button is omitted here, with Harper application still available through the application choices modal. |
| Career opportunity swipe | `OpportunitySwipeRow` in `src/components/career/history/`: mobile touch/pen shortcut on collapsed new-opportunity cards. Left invokes the existing negative action; right invokes the existing positive action, including connection consent. A distance threshold changes the revealed pill’s text/icon color; release commits, retreat/cancel restores. Preserve vertical scrolling, normal taps, nested buttons, and keyboard alternatives. Disable while expanded or pending. |
| Career estimated salary | `EstimatedSalaryNotice` from `src/components/career/history/EstimatedSalaryNotice.tsx` displays a separately labeled annual estimate and an accuracy disclaimer below the JD link. Collapsed history cards append the range with `(추정)` after employment type; omit the display when no estimate is available. |
| Career external application choices | `ExternalOpportunityApplyModal` from `src/components/career/history/ExternalOpportunityApplyModal.tsx`: shared by desktop and mobile new-position lists. Compose `TalentCareerModal mobileBottomSheet` with two stacked full-width actions: direct application saves positive feedback at `applied` and opens the posting; applying with Harper saves positive feedback at `saved` and reuses `ApplyWithHarperButton` to start the role-attached chat. |
| Career welcome | `CareerWelcomeHeader` from `src/components/career/CareerWelcomeHeader.tsx`: centered greeting and current network scan count at the top of Tasks. Reuse `useCareerWelcomeContent` in the existing Home layout so both surfaces use the same profile name, scan count, and translated description. |
| Apply with Harper preparation inputs | `ApplicationPreparationComposer` and `CareerSuggestionItemView` reuse `PreparationComposerView`, `PreparationChangeEdit`, `PreparationDecisionActions`, `PreparationOptionList`, and `PreparationDocumentPicker`. Keep item bodies scrollable and decision controls outside the scroll region. Saved `suggest_form` items submit independently with stable request IDs; their response and work wakeup commit together on the server. The client refreshes forms/history without a second chat request. `CareerSuggestionComposer` shows one selected item above the ordinary chat input, preserving drafts across next/close/reopen and refreshing stale revisions. Review downloads use the authenticated immutable attachment snapshot. The legacy application composer retains its existing batch contract. |
| Apply with Harper saved application | `ApplicationReviewPanel` uses shared inputs and `PreparationDocumentPicker.tsx` on a `career-glass` surface. The assistant reply persists an application reference and renders `ApplicationReviewEntry inline` directly below its content. Role detail may reopen that same form in `TalentCareerModal`. Keep labels beside single checkboxes/radios, choices aligned at their first text line, and final transmission actions after the fields. Preserve editable answers across polling and keep completed fields readable. |
| Apply with Harper answered history | `ApplicationQuestionHistoryRow` uses a transparent `MuteButton`, rotating `ChevronRight`, and a 200 ms grid/opacity disclosure. Keep collapsed content inert and ARIA-linked to the trigger, honor reduced motion, and preserve the user's accepted inline edits in the expanded record. Desktop hierarchy: quiet trigger, readable question, muted answer, subtle left rule. |
| Career question input | `QuestionComposer` in `src/components/career/chat/` shares the Apply with Harper and internal Role written-answer input: `ChatComposerSurface`, question navigation, auto-resizing answer field, skip and close actions. `InternalCallAnswersSlot` collects individual answers locally, then submits them together after review; closing preserves the draft. |
| Career tasks | `CareerTasksPanel` with `CareerActionItemsPanel` / `CareerActionItemList`: persistent LLM-curated actions on desktop’s right home panel and mobile home/tasks. The entire shared `CardButton` is clickable and retains native keyboard/disabled behavior. No eyebrow or urgency badge. Title uses 22px/1.3 light text; description uses 14px/1.5. The action caption is a plain `div` with 14px/500 text and a trailing muted `ArrowRight`, without a separate button surface. Urgent cards retain a subtle critical outline inside the glass edge. Priority alone controls display order (higher first; stable ID ties), with no client truncation. The followup heading counts this list. Reply selection attaches title/description above the composer; send-message selection uses saved action text. Loading/error/empty states belong to this reader. Before onboarding completes, reuse `CareerHomePanel variant="onboarding"`. |
| Career opportunity summary | `CareerOpportunitySummary` at the bottom of the completed-onboarding task list, shared by desktop and mobile. A shared `Card` matches the shared 420px desktop followup/opportunity width and available mobile width and contains a subdued heading plus three number/label columns: Saved, Applied, In progress. Read the full `historyOpportunityCounts.savedStages.saved/applied/connected` aggregates from the existing history context; do not count loaded pages or combine these stages. Keep zero counts visible and show skeletons during initial history loading. |
| Mobile push navigation | `PushNavigationFrame` and `PushNavigationContent` in `src/components/ui/push-navigation.tsx` are shared by Career and Org. They reveal a full-height `bg-neutral-50` sidebar by shifting the whole visible screen right, including its header and composer. `--push-navigation-width` controls both the sidebar width and screen offset (`min(75vw,360px)`). The screen keeps its width, remains partially visible, and casts a subtle left-edge shadow over the sidebar; do not dim or blur it. Career now uses top tabs with an editable home composer; Org uses the frame through `OrgMobileNavigationProvider` with `md:contents` to preserve desktop layout. Shared `DialogContent` accepts `portalContainer` so the sidebar and transparent dismissal area stay inside the frame, outside the shifted surface. Preserve each domain's navigation items and selected styling. Selecting an item, tapping the exposed screen, or pressing Escape closes the menu. Shared Dialog owns focus and dismissal; both transitions honor reduced motion. |
| Career top navigation | `CareerWorkspaceNav` composes neutral `TabBoxes` with desktop Chat/Opportunities and mobile Home/Chat/Opportunities, keyboard arrow/Home/End navigation, settings and the existing avatar menu. Desktop Home sits at the left. `CareerWorkspaceScreen` keeps one chat instance mounted while the right panel changes. Profile, resources, Brief and company watchlist remain available from the profile menu and existing URLs. `/career/chat` is a real route; do not redirect it to Home. |
| Mobile message focus | `useChatMessageFocus` and `liftMessageBubble` in `src/components/chat/` animate the original bubble through the browser top layer. Compose with `TalentCareerModal` for focus/dismissal and `ChatComposerSurface` for actions; preserve the source layout and respect reduced motion. |
| Career opportunity result rows | `OpportunityResultRow` in `src/components/career/history/` shares the compact company logo, company name, title, and optional status/location between My Opportunities search and matching results. Matching results hydrate these fields through the existing posting-card reader and alone pass `postedAt` to show posting age, with the exact date on hover. Do not substitute evaluation or recommendation dates for missing posting dates. Callers own selection and list semantics; only actionable rows show the open arrow. Matching results omit scores, score-order copy, and position counts. |
| Career Opportunities | The top bar has one Opportunities entry. `CareerOpportunityTabs` always starts with New opportunities, then In progress and Saved, using the existing neutral `TabBoxes`. New and In progress counts use `Badge variant="count" size="xs" radius="full"` (`bg-action`, white text). Keep tabs mounted for empty and loading lists. Saved contains `saved`; In progress combines `applied` and `connected`; Ended / Archived combines `closed` and `hidden`. Place Ended / Archived beside the icon-only Hidden positions tab on a second row within the narrow panel; neither tab displays a count. Keep New/In progress/Saved together on the first row. Saved uses `SavedOpportunityList`, composing the same collapsed `OpportunityCard` as New Opportunities. Clicking the row opens the existing detail directly, with no expansion, feedback actions, unread dot, or chevron. At the right edge, show Apply above the deadline; keep both visible without hovering. Remove the view picker and its persisted preference on desktop and mobile. Deadlines use a countdown through 10 days inclusive and an absolute date above 10 days; closed postings show Closed and disable Apply. Keep internal consent and external application choices unchanged. `ProgressOpportunityRow`, composed by `OpportunityListCard`, shows status and the next actual appointment and opens the detail on click. In-progress details use a collapsed, expandable `OpportunityCard` at the top, with status and `AppointmentCreateButton` available in either expansion state. Appointments and preparation/history follow the card; no separate JD disclosure appears at the bottom. No pipeline columns. |
| Career saved opportunity search | `OpportunitySearch` in `src/components/career/history/` composes `TalentCareerModal`, `Input`, `MuteButton`, and `OpportunityResultRow`. Mount only in My Opportunities; ⌘F/Ctrl+F focuses its combobox, arrows select results, Enter opens the existing role detail, and the shared modal handles Escape/focus restoration. Search the complete owned saved/archived collection, including notes; keep loading and retry visible when collection loading is incomplete. |
| Career job previews in chat and company details | `CareerOpportunityPreviewCard` shares the logo, metadata, posting status, and optional Recommended/Fit badges; `CareerOpportunityPreviewModal` opens the detail with a Save action |
| Career company details and jobs | `CareerCompanyDetailDrawer` composes `CompanyDetailView` and `CompanyJobsList` inside `TalentCareerModal`; jobs use 20-item infinite pagination |
| Career My info | The profile menu exposes My info, My resources and Preferences. `CareerProfileWorkspace` uses `TabBoxes variant="neutral"` above the two My info views, including loading and document details; omit these tabs from Preferences. Preserve `/career/profile`, `/career/documents`, `/career/brief`, document IDs and legacy redirects. |
| Career profile sources and documents | `CareerProfileSourceCard` from `src/components/career/settings/CareerProfileSourceCard.tsx`; use the 136×148 card for profile links, connected sources, resumes, documents, and add/upload actions |
| Career integration introduction | `IntegrationOverview` in `src/components/career/integrations/` composes `TalentCareerModal` with a compact logo/name header, 13–14px body copy, `IntegrationConversationCarousel` with a soft gradient and one user/Harper exchange per slide (native swipe, keyboard arrows, and pagination dots), a vertical feature list, and a visible connection button. Keep normal font weight for body copy, modest spacing, and no section/footer dividers or authorization-process filler. Each integration provides localized content and callbacks; `GmailIntegrationOverview` supplies Gmail content. Open via the `integration` URL query before starting authorization. |
| Career source icons | `CareerProfileSourceIcon` from `src/components/career/settings/CareerProfileSourceIcon.tsx`; reuse the profile source-card logos. Source slots come from `src/lib/career/profileSources.ts`. |
| Company logo previews | `CompanyLogo` from `src/components/career/watchlist/CompanyLogo.tsx`; use its existing size variants for company identities; the visible action list does not synthesize a company-logo grid. |
| Career blocked companies | `CareerPreferencesSettingsSection` from `src/components/career/CareerProfileSettingsSection.tsx` reuses the existing blocked-company field and immediate add/remove save actions below the Preferences list (`/career/brief`). `CareerEngagementTypeSettings` renders neutral multi-select `TabBoxes` inside that list, immediately after Next role, via `CareerTalentContextSection`’s `engagementTypesControl` slot. Keep engagement types in the original settings record and save each toggle through the existing callback; do not copy them into Brief text. Preserve stored Brief labels and free-form rows. Pinned rows place Must-haves before Deal-breakers. Chat-only Brief views do not gain a settings editor unless the caller supplies that slot. |
| Career settings | `CareerSettingsModal` groups Opportunity settings, Account, and the existing eligible Invite tab. `CareerOpportunitySettingsSection` contains the existing two delivery toggles, using the same context and mutation APIs. Profile sharing is edited at the top of My info > Profile. Receive new opportunities is on when either Harper introductions or direct recommendations are enabled; turning it off keeps the existing pause-both contract. `CareerSettingRow` supplies the existing responsive row layout. Account contains name, email, `CareerLanguageSetting` with the shared `Select`, logout and deletion. Language selection uses the existing locale provider and settings endpoint with rollback on failure; omit it from the profile dropdown. |
| Career profile visibility | `CareerProfileSettingsSection` reuses `CareerProfileSharingSettingsSection` at the top of My info > Profile, before the profile content, with engagement types, blocked companies and last-updated hidden. This selector replaces the former profile summary; it is absent from Settings. Home uses `CareerProfileSharingSummary` with the current state and a shortcut to Profile. Selecting a `ProfileVisibilityPanel` option saves immediately through the existing settings hook; the panel stays open to show its description and conversation example. |
| `/career` and ordinary `/org` modals, confirmations, or bottom sheets | `TalentCareerModal` from `src/components/common/TalentCareerModal.tsx`; use `mobileBottomSheet` for ordinary Org modals. |
| Ops company side panels | `CompanySidePanelContent` in `src/components/ops/company/`: shared Dialog content layout for activity, conversation, and company editing; use the existing `Dialog` for state and keyboard/focus behavior. |
| In-flow non-modal panel | `Dialog modal={false}` + `DialogPanelContent` from `src/components/ui/dialog.tsx`; no portal, overlay, or positioning. The caller owns layout; Radix handles focus, outside interaction, and Escape. Include `DialogTitle`. |
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

### Free 연결 대기

Free와 슬롯 배정 Role은 같은 연결 대기 목록·카드·상세와 빈 상태를 사용한다. 슬롯 여부로 후보를 숨기거나 잠금·구매 gate를 표시하지 않는다. 읽기 화면은 결제 조회 성공을 기다리지 않는다. Intro 잔액은 실제 요청·연결 수락 경계에서 확인한다.

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

### Role 시작의 슬롯 배정 안내

실제 Role 활성화 뒤 슬롯 배정을 확인한 안내는 공통 `ToastProvider`의 `dark` variant를 사용한다. 배경과 테두리는 검은색(`bg-black border-black`), 글자는 흰색(`text-white`)이며 기존 토스트의 위치·접근성 처리를 재사용한다. 역할 작성이나 채용 시작 온보딩 진입에는 표시하지 않는다.

후보자 검토의 모바일 헤더는 후보 이동(`1 / N`)과 Save·Pass·주요 액션을 같은 줄에 두고, Role 이동은 다음 줄에 둔다. 긴 프로필 URL은 원문과 링크를 유지하면서 `overflow-wrap: anywhere`로 줄바꿈해 본문에 가로 스크롤이 생기지 않게 한다.

Career `suggest_form`은 저장 즉시 원본과 `career_form_presentation`으로 조회할 수 있다.
미해결 확인은 최신 대화 turn과 무관하게 읽는다. `CareerSuggestionComposer`는 입력창 위에
`답변 대기 N개`를 기존 대화 시작 버튼들의 왼쪽에 둔다. 선택한 항목은 이 버튼 줄 위에
펼치며, 버튼은 입력창 바로 위의 원래 위치를 유지한다. 열린 버튼은 검정 배경·흰 글자로
표시하고 옆에 다음·닫기를 둔다. 좁은 화면에서는 보조 대화 버튼들만 가로로 스크롤한다.
닫았다 다시 열면 마지막 항목과 작성 중인 답으로 돌아오며, 평소 채팅 입력은 유지한다.
항목별 응답 저장과 연결 작업의 재개 등록은 서버에서 한 transaction으로 처리한다.
편집 중인 답은 사용자·대화·폼 revision별로 보존하며 제출 성공 후 다음 확인으로 이동한다.
채팅 위임으로 해결한 폼도 같은 원본에서 닫힌다. 별도 작업 보드나 할 일 탭 배지를 추가하지 않는다.
서버에서 계속 실행되는 요청도 타임라인의 기존 Thinking·Working 표시를 사용한다.
진행 표시는 입력 잠금과 분리하며, 각 invocation의 공개 도구 로그를 같은 `ChatThinkingLogPanel`로 보여준다.
답변 대기 폼만 남으면 실행 표시를 끄고, 입력창 위에 별도 진행 문구를 중복 표시하지 않는다.

매칭 히스토리와 새 기회 목록은 `history/NewOpportunityCard`를 공유한다. 이 컴포넌트가
기존 `OpportunityCard`의 펼치기·피드백·지원하기·스와이프 액션을 조합하며, 매칭 히스토리의
추천 배지는 `titleAdornment`로 전달한다. 단순 조회·펼치기는 저장하지 않고, 피드백·지원
액션 전에 기존 posting interaction으로 추천을 저장한 뒤 공유 history에 실제 ID를 불러온다.


### Career conversation version preview

Career Dev Controls의 기존 “Harper 메시지 스타일” 자리는 “Career 버전” 두 선택지로 바뀐다.
1은 기존 텍스트 UI에 친근한 해요체를 사용하고, 2는 친근하고 간결한 텍스트 대화와 버블 UI를 함께 선택한다.
버전 1에는 분량 축소나 버블 분할 지침을 추가하지 않는다. 데스크톱 버전 1의 복사·삭제·시간은
메시지의 본문·브라우저·공고·문서 등 모든 콘텐츠 다음에 일반 흐름의 footer로 둔다.
hover/focus 전에도 높이를 차지하고 opacity만 전환하여 콘텐츠와 겹치거나 다음 메시지를 덮지 않는다.
서버 저장 전의 임시 메시지에도 같은 footer 높이를 확보한다. 접수 대기와 실행 시작은 같은
진행 패널·화자 간격을 사용하여 Thinking의 위치가 바뀌지 않게 한다.
사용자 메시지는 오른쪽, Harper 메시지는 왼쪽에 정렬한다. 버전 2는 우클릭 메뉴를 유지한다.
일반 텍스트 대화의 버전 1은 중간 발화와 공개 도구 로그를 발생 순서대로 Working 안에 표시한다.
중간 발화는 기존 본문 디자인을 유지하며 완료 후에도 접힌 Worked 안에 남는다.
`career_turn_activity`는 화면 기록이고 모델 이력·요약에서 제외한다. 최종 답변은 새 chat 행으로
저장하되 화면에서는 같은 실행 식별자로 한 자리에 묶는다. 독립 실행은 별도 영역이다.
로그 DOM은 접힌 동안에도 유지한다. invocation 상태와 완료 답변으로 중단/완료를 판정하여
늦은 활동 조회가 Working을 다시 켜지 않게 한다.
Working/Worked 시간은 저장된 실제 실행 시작·종료 시각을 사용하고 진행 중에는 초 단위로 갱신한다.
공개 작업 기록이 없으면 Thinking/Thought로 시간을 표시하고 빈 펼치기 버튼은 만들지 않는다.
빈 이벤트 배열은 기존 공개 로그를 가리지 않는다.
선택은 `useCareerWorkspaceUiStore`에 브라우저별로 저장하며, 서버가 dev 권한을 확인한 값만
해당 사용자 메시지 payload에 기록해 같은 turn의 재개에서도 유지한다. 별도 개발용 prompt
파일 override 선택 시 버전 1로 전환하며, 버전 선택 시 파일 override는 해제한다.

Floating Sky의 채팅 본문은 버전과 무관하게 최대 560px이며, 타임라인 컨테이너의 좌우 20px를 더한 너비는 토큰에서 계산한다. 버블 안쪽 padding은 유지한다.
Harper 버블은 `--color-message-assistant`, 폼은 `career-glass career-work-surface`를 사용한다. 폼의 별도 세로 margin을
두지 않아 텍스트 메시지와 폼 사이에도 타임라인의 작성자별 간격을 그대로 적용한다.

버전 2의 `CareerMessageBubble`은 `[[bubble]]` 경계를 화면에서만 나눈다. 완성되지 않은
streaming 구간은 대기하고, 완성된 버블에 짧은 fade/slide 진입을 적용한다. `suggest_form`의
질문·제안 카드는 텍스트 버블 밖에 독립적으로 표시하며, 폼만 있는 메시지에는 빈 버블을 만들지 않는다. reduced-motion은
애니메이션을 끈다. 사용자 메시지의 원문은 유지하며, Harper 메시지 복사에서는 구분자를
문단 나눔으로 바꾼다. 두 버전 모두 연속한 같은 작성자의 메시지는 8px, 작성자가 바뀌면
20px 간격으로 표시한다. 타임라인이 간격을 소유하며 사용자 버블에는 추가 세로 margin을 두지 않는다. 온보딩·음성·예약
이메일의 LLM 지침은 이 일반 텍스트 대화 실험에 포함하지 않는다.


### Floating Sky 세부 상태 · 2026-11-05

- 표면·색·radius·blur·너비·전환 시간 정본은 `career-floating-sky.css`의 `--career-*`이다. 기존 공통 컴포넌트 토큰은 이 기초 값을 참조한다. 작은 예전 neutral utility도 Career 범위에서 cool gray로 연결한다.
- 입력을 기다리는 팔로업은 `CareerPendingActionContextCard`를 composer **위**의 `career-reply-slot`에 표시한다. `ChatComposerFrame.context`는 실제 첨부에 사용한다. 요청을 닫아도 초안을 지우지 않는다. 질문/지원 준비도 기존 폼을 위쪽에 두며, 입력 상태·제출 계약은 바꾸지 않는다.
- `CareerAnimatedRegion`은 기회 펼침과 위쪽 답변 카드의 높이 전환을 공유한다. 닫히는 DOM은 inert/aria-hidden 처리하고 Motion reduced-motion을 따른다. 일반 hover/focus/press는 CSS 시간 토큰을 쓴다. 새 modal infrastructure는 만들지 않는다.
- 기회 카드의 빠른 행동은 우측 하단에 배치하고 desktop hover/focus 때 표시한다. 터치에서는 바로 사용할 수 있다. 회사명 옆 20px 로고, 우측 지원 방식, 역할명, 근무 조건을 공통 `OpportunityCard`로 구성한다. 접힘은 투명하고 펼침에만 원본 글라스 표면을 적용한다. 자료·문서·통화 기록·브라우저 작업·관심 회사·지원 준비 표면은 같은 글라스 계열을 쓴다.
- 업로드 label은 내부 native file input을 sr-only로 두어 키보드 접근을 유지한다. `CareerProfileSourceCard`와 업로드 카드의 focus-within ring은 바깥 표면에 표시한다.
- 팔로업·기회 패널은 `--career-panel-width: 420px` 하나를 공유한다(768–1023px는 360px). 원본의 Apple/system font와 ink/secondary/soft 세 색을 유지한다. 새 기회는 지원 방식이나 추천 날짜 제목 없이 최신 추천 순서로 나열한다.
- 모바일 상단 탐색은 흰색→투명 gradient overlay다. 홈·채팅·기회 스크롤 영역은 화면 위에서 시작하고 첫 내용에만 top padding을 둔다. 제목·서브 탭·본문이 상단 뒤로 지나가며 safe area와 키보드 focus scroll-padding을 보존한다.
