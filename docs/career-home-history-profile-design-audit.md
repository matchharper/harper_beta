# Career Home / History / Profile Design Audit

작성일: 2026-05-18

## 참고 기준

로컬 기준은 `docs/beige-design-guidelines.md`, `FRONTEND.md`, `src/globals.css`를 우선했다. 외부 기준은 아래 문서를 참고했다.

- [google-labs-code/design.md](https://github.com/google-labs-code/design.md): 디자인 토큰은 값, 문서는 적용 맥락을 제공한다는 구조가 현재 Harper 문서화 방식과 잘 맞는다.
- [design.md spec](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md): colors, typography, rounded, spacing, components를 구조화하고 컴포넌트별 상태 variant까지 문서화하는 방식이 필요하다.
- [shadcn/ui skill guide](https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/SKILL.md): 기존 컴포넌트 우선, compose first, built-in variant 우선, semantic color 사용 원칙을 참고했다.
- [Primer color usage](https://primer-docs-preview.github.com/product/getting-started/foundations/color-usage/): raw color 대신 theme-aware token을 통해 유지보수성과 일관성을 확보하는 원칙을 참고했다.
- [Primer design contribution guide](https://primer-docs-preview.github.com/product/contribute/design/): 새 패턴을 만들기 전에 유사 패턴을 audit하고 재사용 가능한 문제인지 확인하는 접근을 참고했다.
- [FluentUI Apple design tokens](https://github.com/microsoft/fluentui-apple/wiki/Design-Tokens): global, alias, control token 계층을 참고했다. 현재 career UI에는 control token 층이 부족하다.

## 점검 방법

- 코드: `src/components/career/**`, `src/pages/career/**`, `src/globals.css`
- 렌더링: `pnpm dev` 후 `http://localhost:3000/career/preview`를 Playwright로 확인
- 확인한 화면: home, profile. history는 preview에서 탭 진입 시 `/career/history`로 URL이 교체되어 로그인 게이트로 빠지는 현상이 있어 코드 중심으로 확인했다.

## 결론

디자인 자체가 완전히 무너진 상태는 아니다. beige 기반 톤, 낮은 채도, restrained border 중심의 방향은 살아 있다. 다만 `home`, `history`, `profile`이 같은 workspace 안에 있는데, 표면, 버튼, 탭, 상태 badge, empty/error notice가 각 화면에서 따로 만들어져 있다. 결과적으로 "같은 동작인데 다른 디자인"과 "rounded + border + bg + shadow 조합이 반복되는 AI스러운 카드감"이 동시에 보인다.

가장 먼저 할 일은 화면별 미세 조정보다 `career` 전용 primitive를 실제 SSOT로 만드는 것이다. 현재 `CareerPrimitives.tsx`에는 `careerSurfaceClassName`, `careerInlinePanelClassName`이 비어 있고, 버튼도 `CareerActionButton`과 `CareerPrimaryButton`/`CareerSecondaryButton` 두 계열로 갈라져 있다. 이 상태에서는 색과 radius를 조금 고쳐도 다음 기능에서 다시 흩어진다.

## 주요 수정 필요 지점

### 1. Career primitive가 SSOT 역할을 못 한다

근거:

- `src/components/career/ui/CareerPrimitives.tsx:14-17`의 surface class가 비어 있다.
- `src/components/career/ui/CareerPrimitives.tsx:152-180`와 `src/components/career/ui/CareerActionButton.tsx:16-34`가 서로 다른 버튼 체계를 가진다.
- `CareerWorkspaceNav`, `CareerResumeLinksSettingsSection`, `CareerMobileJobsView`, `CareerTalentProfilePanel`에 직접 만든 button/input/card 클래스가 계속 추가된다.

영향:

- primary, secondary, icon, destructive, ghost의 시각 기준이 한 곳에 없다.
- 같은 "저장", "수정", "탭 전환", "상태 변경" 액션이 화면마다 다른 높이, radius, 색, hover를 가진다.
- shadcn/Primer류 문서가 권장하는 semantic token과 component variant 흐름에서 벗어난다.

권장 수정:

- `CareerPrimitives.tsx`에 실제 primitive를 둔다: `CareerSurface`, `CareerNotice`, `CareerIconButton`, `CareerButton`, `CareerTabs`, `CareerBadge`, `CareerFormField`.
- `CareerActionButton`과 `CareerPrimaryButton`/`CareerSecondaryButton`은 하나의 `cva` variant로 합친다.
- 호출부는 `className`으로 layout만 넘기고 `bg-*`, `text-*`, `border-*`, `rounded-*`, `shadow-*`는 variant가 소유하게 한다.

### 2. Radius와 surface density가 화면마다 다르다

근거:

- Home: `rounded-3xl`, `rounded-2xl`, shadow, custom pastel panel이 많다. 예: `CareerHomePanel.tsx:333`, `370`, `422`, `525`.
- History: `rounded-[8px] border bg-white/70` 중심이다. 예: `CareerHistoryPanel.tsx:368`, `OpportunityListCard.tsx:153-157`.
- Profile: `rounded-[14px]`, `rounded-[12px]`, `rounded-[10px]`, `rounded-full`, `bg-linear-to-br`가 섞인다. 예: `CareerTalentProfilePanel.tsx:523-527`, `590`, `913`, `1385`.
- 기존 `docs/beige-design-guidelines.md`는 "rounded는 과하게 쓰지 않는다"와 "단정하고 밀도 있게"를 명시한다.

영향:

- Home은 onboarding/marketing card처럼 보이고, History/Profile은 admin/workspace처럼 보인다.
- profile의 recruiter notice, home의 call card, history의 empty panel이 사실상 같은 안내 surface인데 서로 다른 물성이다.
- border + translucent white + large radius + soft shadow 조합이 반복되어 생성형 UI 느낌이 난다.

권장 수정:

- content surface: `rounded-md` 또는 8px 고정.
- icon tile: 8px 또는 circle 중 하나만 사용. 현재처럼 `rounded-xl`, `rounded-2xl`, `rounded-[12px]`를 섞지 않는다.
- top nav icon button shadow는 제거하거나 focus/active state로만 쓴다.
- card 안에 card를 겹치는 대신 full-width section과 row divider를 우선한다.

### 3. Raw hex와 임의 accent가 계속 새고 있다

근거:

- Home: `#e8f1ff`, `#123d73`, `#b77a4e`, `#f3ede8`, `#4f8062`, `#e8f0eb`가 직접 들어간다. `CareerHomePanel.tsx:333`, `495-514`.
- History: error tone `#7c2d12`가 직접 들어간다. `CareerHistoryPanel.tsx:1628-1629`.
- Profile: focus/success `#22c55e`, notification `#ef4444`가 직접 들어간다. `CareerTalentProfilePanel.tsx:590-593`, `947`; `CareerProfileMenu.tsx:126`.
- Links: `#2563eb`가 직접 들어간다. `CareerResumeLinksSettingsSection.tsx:69`.

영향:

- beige theme 안에서 갑자기 blue/green/red가 튀고, 화면별 tone이 달라진다.
- dark mode, high contrast, future theme 대응이 어려워진다.
- 외부 디자인 가이드들이 말하는 semantic token 계층과 맞지 않는다.

권장 수정:

- `globals.css` 또는 career token 파일에 `career-info`, `career-success`, `career-warning`, `career-danger`, `career-surface`, `career-surface-muted`, `career-border`, `career-fg-muted`를 추가한다.
- raw hex는 primitive 내부 token으로만 허용한다.
- Home summary icon tone도 데이터별 custom hex가 아니라 `tone="new" | "saved" | "connected"` variant로 관리한다.

### 4. 탭과 네비게이션이 같은 역할인데 패턴이 다르다

근거:

- Workspace nav는 pill button 3개다. `CareerWorkspaceScreen.tsx:265-288`.
- In-page tabs는 full pill segmented control이다. `CareerInPageTabs.tsx:19-53`.
- Mobile top bar는 dropdown nav다. `CareerMobileTopBar.tsx:53-116`.
- Mobile history sub-tabs는 bar형 segmented control이다. `CareerMobileSegmentedTabs.tsx:26-65`.
- Profile guideline은 얇은 underline 기반 horizontal nav를 우선한다고 되어 있지만 현재 profile section tab은 pill이다.

영향:

- 사용자는 "workspace 이동", "profile section 이동", "history filter 이동"이 모두 다른 컴포넌트처럼 느낀다.
- 같은 count badge도 pill, rounded-md, full circle 등 형태가 달라진다.
- 코드도 재사용되지 않아 상태와 접근성 개선을 네 군데에서 해야 한다.

권장 수정:

- `CareerTabs` 하나를 만들고 variant만 나눈다: `workspace`, `section`, `filter`, `mobile-dropdown`.
- 데스크톱 profile section tab은 guideline대로 underline 또는 low-height segmented로 낮춘다.
- tablist/tabpanel ARIA를 적용한다. 현재 `CareerInPageTabs`는 시각적으로 탭이지만 semantic tablist가 없다.

### 5. Home은 실제 workspace보다 onboarding card 느낌이 강하다

근거:

- 중앙 정렬 welcome headline과 큰 rounded panel이 첫 화면을 장식한다. `CareerHomePanel.tsx:329-370`.
- preview에서 Home 오른쪽은 카드 덩어리로 시작하고, 하단에는 profile sharing settings까지 바로 이어져 정보 위계가 흐려진다.
- dev controls가 일반 화면과 같은 계층으로 노출된다. `CareerHomePanel.tsx:524-590`.

영향:

- career home이 "작업 현황 대시보드"라기보다 "AI onboarding landing"처럼 보인다.
- 사용자가 다음 행동을 빠르게 고르기보다 call card와 checklist를 먼저 읽게 된다.

권장 수정:

- H2는 left-aligned, compact title row로 바꾼다.
- 상태 요약은 2-3개의 dense metric row/card로 구성한다: `새 포지션`, `저장/연결`, `프로필 완성도`.
- call/interview panel은 full rounded card보다 narrow status row + primary action으로 줄인다.
- dev controls는 개발자 전용 floating/debug drawer 또는 preview 전용 panel로 분리한다.

### 6. History는 검증성이 떨어지고 action surface가 분산되어 있다

근거:

- `CareerHistoryPanel`은 `/career/preview`에서 active tab이 history가 되면 `useEffect`로 `/career/history`로 replace한다. `CareerHistoryPanel.tsx:576-595`의 URL sync 로직이 preview 검증을 방해한다.
- new tab은 detail 중심, saved/archived는 list card 중심, 하단 shortcut은 sticky bottom panel이다. `CareerHistoryPanel.tsx:1634-1757`.
- status dropdown trigger는 list card 안에서 자체 버튼으로 만든다. `OpportunityListCard.tsx:52-96`.
- feedback button은 별도 `HistoryFeedbackButton`으로 존재한다. `CareerHistoryPanel.tsx:201-230`.

영향:

- 같은 opportunity를 다루는 card/detail/action이 한 primitive에서 나온다는 느낌이 약하다.
- preview route가 history 화면 디자인 회귀 검사를 못 한다.
- bottom sticky action bar는 유용하지만 `-bottom-8`, `-mx-4` 같은 보정값이 많아 layout primitive 부재가 드러난다.

권장 수정:

- `CareerHistoryPanel`에 `syncUrl?: boolean` 또는 preview-safe router guard를 둔다.
- `CareerOpportunityCard`를 만들어 desktop list, mobile card, detail header가 같은 header/tone/status primitive를 공유하게 한다.
- `HistoryShortcutPanel`, `JobActionBar`, status dropdown trigger를 `CareerOpportunityActions`로 묶는다.

### 7. Profile은 좋은 방향이지만 edit mode와 links 화면이 따로 논다

근거:

- Profile main은 dense resume/timeline 느낌이 좋아졌지만, edit input class가 별도 상수로 많다. `CareerTalentProfilePanel.tsx:511-527`.
- inline edit input은 `rounded-[4px] border-white/50 bg-white/80`이고, links input은 `border-hblack300 bg-hblack000`이다. `CareerTalentProfilePanel.tsx:517-521`, `CareerResumeLinksSettingsSection.tsx:213`.
- profile save bar는 fixed translucent surface + heavy shadow다. `CareerTalentProfilePanel.tsx:1385`.
- 프로필 화면에 `Active`, `View CV`, `Work`, `Background` 등 영어 label이 섞인다. `CareerTalentProfilePanel.tsx:703-705`, `763-780`, `886-894`.

영향:

- view mode는 정돈되어 있지만 edit mode로 들어가면 다른 제품처럼 보일 수 있다.
- links 화면은 beige form primitive보다 이전 hblack 계열 input에 가까워 profile main과 분리된다.
- 영어 label은 한국어 중심 career flow에서 제품 완성도를 떨어뜨린다.

권장 수정:

- `CareerProfileField`, `CareerInlineEditField`, `CareerTimelineItem` primitive를 도입한다.
- links input도 profile edit input과 같은 tone/height/focus를 사용한다.
- fixed save bar는 header action 또는 bottom action bar primitive로 통일한다.
- label은 한국어로 통일한다: `활성`, `CV 보기` 또는 `이력서 보기`, `경력`, `배경`.

### 8. Desktop과 mobile이 별도 제품처럼 갈라질 위험이 있다

근거:

- Desktop은 split workspace + pill nav, mobile은 dropdown top bar + segmented history tabs다. `CareerWorkspaceScreen.tsx:220-296`, `575-665`.
- Mobile opportunity summary card는 `border bg-white p-5`로 radius가 없다. `CareerMobileJobsView.tsx:233`.
- Mobile action buttons는 직접 만든 raw button이다. `CareerMobileJobsView.tsx:500-519`.

영향:

- responsive adaptation이 아니라 별도 UI를 유지하는 비용이 커진다.
- 수정 시 desktop만 고치고 mobile tone이 남는 문제가 반복될 수 있다.

권장 수정:

- mobile과 desktop이 같은 primitive를 쓰되 layout만 분기한다.
- mobile card도 `CareerSurface` variant를 사용한다.
- `JobActionBar`는 `CareerButtonGroup` 또는 `CareerOpportunityActions`로 합친다.

## 우선순위 제안

### P0. Design foundation 정리

1. `CareerPrimitives.tsx`를 실제 token/variant 계층으로 바꾼다.
2. `CareerButton`, `CareerIconButton`, `CareerSurface`, `CareerTabs`, `CareerNotice`, `CareerBadge`를 먼저 만든다.
3. raw hex를 career semantic token으로 치환한다.
4. `docs/beige-design-guidelines.md`에 radius, shadow, surface, tab 정책을 더 구체적으로 추가한다.

### P1. 화면별 교체

1. Workspace nav와 profile/history tabs를 `CareerTabs`로 교체한다.
2. Home call/checklist/summary card를 `CareerSurface` 기반으로 낮춘다.
3. Profile links/edit inputs를 `CareerFormField`로 통일한다.
4. History list/detail/action을 `CareerOpportunityCard`/`CareerOpportunityActions`로 묶는다.

### P2. 제품감 보정

1. Home은 left-aligned dense dashboard로 바꾼다.
2. Profile의 영어 label을 한국어로 정리한다.
3. top nav icon buttons의 shadow와 radius를 줄인다.
4. mobile card/action도 desktop token을 공유한다.

### P3. 검증 루프

1. `/career/preview`에서 home/history/profile을 URL 이동 없이 모두 확인 가능하게 만든다.
2. Playwright screenshot 세트를 만든다: desktop home, desktop history, desktop profile, mobile home, mobile history, mobile profile.
3. screenshot에서 color/radius/shadow drift를 사람이 빠르게 볼 수 있게 `output/playwright/career-design/`에 저장한다.

## 바로 고치면 효과가 큰 체크리스트

- `rounded-3xl`, `rounded-2xl`, `shadow-[...]`를 career 화면에서 검색해 primitive variant로 이동한다.
- `#[0-9A-Fa-f]` 검색 결과를 semantic token으로 치환한다.
- `CareerPrimaryButton`, `CareerSecondaryButton`, `CareerActionButton`을 하나의 `CareerButton`으로 합친다.
- `CareerInPageTabs`를 `role="tablist"` 기반 컴포넌트로 바꾸고 profile에서는 underline variant를 쓴다.
- `CareerHistoryPanel`의 preview redirect 문제를 해결한다.
- "Active", "View CV", "Work", "Background" 등 영어 label을 제품 언어 기준에 맞춘다.
