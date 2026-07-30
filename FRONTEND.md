# FRONTEND.md

Harper 프론트엔드의 디자인 시스템, 상태 관리, 성능 원칙, 그리고
**`useEffect`를 의도에 맞게 사용하는 기준**을 정리한 문서. 새 기능을 추가하거나
모바일을 지원하는 모든 변경은 이 문서를 따른다.

> 마지막 저장소 대조: **2026-07-30**
>
> 이 문서의 MUST 규칙은 **신규 코드와 PR에서 수정한 코드**에 적용한다. 기존
> 레거시는 관련 영역을 수정할 때 함께 줄이되, PR 범위 밖의 전면 정리를 요구하지
> 않는다. 현재 상태를 설명하는 표와 파일 목록은 코드가 바뀌면 함께 갱신한다.

> **두 가지 절대 원칙**
> 1. **`useEffect`는 외부 시스템 동기화에 사용한다.** 파생값 계산, 이벤트 처리,
>    서버 데이터 패칭을 effect로 우회하지 않는다.
> 2. **상태 책임을 깨지 않는다.** 브라우저에서 조회·갱신하는 서버 상태 →
>    TanStack Query, 앱/라우트 간 공유 UI 상태 → Zustand, 한 페이지의 형제들이
>    공유하는 상태 → page-scoped context/domain hook, 한 컴포넌트의 일시적 상태
>    → `useState`.

---

## 0. 절대 규칙 (신규·수정 코드의 PR 리뷰 차단 사유)

다음 규칙을 신규 코드나 PR에서 새로 위반하면 머지 보류. 기존 위반은
grandfathered 상태로 보되, 수정한 코드 주변에서 합리적으로 제거할 수 있으면 함께
정리한다. MUST 규칙은 가능한 한 ESLint/CI로 자동화하고, 자동화되지 않은 규칙만
리뷰 체크리스트로 확인한다.

### 0.1 `any` 타입 금지

제품 소스의 신규·수정 코드에서는 TypeScript의 타입 안전성을 무력화하는 명시적
`any`를 쓰지 않는다. 자동 생성 파일이나 타입이 없는 외부 모듈을 연결하는 선언
파일은 예외로 둘 수 있지만, 범위를 최소화하고 예외 이유를 주석으로 남긴다.

```ts
// ❌ 금지
function parseData(data: any) {}
const result = response as any;
const map = new Map<string, any>();

// ✅ 대안
function parseData(data: unknown) {}                     // unknown + 타입 가드
function parseData<T extends Record<string, string>>(data: T) {}  // 제네릭
const result = response as ApiResponse;                  // 구체적 단언
const map = new Map<string, CandidateRecord>();          // 구체적 타입 파라미터
```

| 상황 | 대안 |
|---|---|
| 타입을 모를 때 | `unknown` + `typeof`/`in`/`instanceof` 가드 |
| 여러 타입을 받을 때 | 유니온 `A \| B` 또는 제네릭 `<T>` |
| 외부 라이브러리 타입 부재 | `@types/*` 설치 또는 `declare module` |
| Supabase 쿼리 결과 | `src/types/database.types.ts`의 `Database` 제네릭 적용 |
| 이벤트 핸들러 | `React.MouseEvent<HTMLButtonElement>` 등 구체적 이벤트 타입 |

### 0.2 `useEffect`로 상태 책임을 우회하지 않는다

상세 규칙은 §3. 외부 구독, 브라우저 API, imperative DOM, route/URL 정규화처럼
렌더링만으로 처리할 수 없는 동기화에는 컴포넌트에서도 `useEffect`를 사용할 수
있다. 다만 재사용되거나 복잡한 effect는 의도가 드러나는 custom hook으로 분리한다.

### 0.3 인라인 `style={{}}`는 동적 값 전용

정적 색·여백·폰트는 절대 인라인으로 박지 않는다. Tailwind 클래스 사용.

```tsx
// ❌ 금지
<div style={{ backgroundColor: "#111", padding: "16px" }} />

// ✅ Tailwind
<div className="bg-neutral-1000 p-4" />

// ✅ 정당한 인라인 (계산값/픽셀/퍼센트)
<div style={{ gridTemplateColumns, width: `${percent}%` }} />
```

### 0.4 viewport 유닛은 `svh` 표준

모바일 지원으로 전환 중이므로 `vh`를 사용하지 않는다. 자세한 규칙은 §2.3.

```tsx
// ❌ 금지 — iOS Safari URL bar에서 100vh가 viewport를 넘침
<div className="h-screen min-h-screen" />

// ✅ Tailwind v4 svh 유틸리티
<div className="h-svh min-h-svh" />
```

### 0.5 신규 styled-jsx 금지

2026-07-30 기준 기존 6개 파일
(`landing/career/TalentSocialProof.tsx`, `pages/index.tsx`,
`pages/company.tsx`, `pages/network.tsx`, `pages/ko/contact-sales.tsx`,
`pages/blog/[slug].tsx`)은 점진 제거한다. 신규 파일에는 도입 금지.

---

## 1. 디자인 시스템

### 1.1 스택
- **CSS**: Tailwind CSS 4 (`tailwindcss@^4.3`) + `@tailwindcss/postcss` + `tailwind-merge` + `tw-animate-css` + `tailwind-scrollbar`
- **컴포넌트**: shadcn/ui (`new-york` preset) + Radix UI primitives
  - `src/components/ui/` — shadcn 기본
- **아이콘**: `lucide-react` (신규 코드는 lucide만)
- **애니메이션**: Motion (`motion/react`) + Tailwind keyframes (`upDown`, `shake`, `textGlow`)
- **폰트**: `PretendardVariable` (sans 기본), `Instrument Serif` (serif) — `src/globals.css`의 `@theme`에 `--font-*` 변수로 등록

설정 파일은 **`src/globals.css` 한 곳**이다 (`tailwind.config.js` 없음). 토큰을 추가하려면 `@theme` 블록에 변수 한 줄, 유틸리티가 필요하면 `@utility` 블록을 추가한다.

### 1.2 SSOT 원칙
Tailwind는 **컬러·spacing·typography의 단일 소스**다. 다음 누수는 PR에서 잡는다.

- 신규 컴포넌트의 인라인 정적 스타일 → §0.3
- 신규 styled-jsx → §0.5
- 컬러 hex 리터럴 직접 사용 → `globals.css` `@theme`의 `--color-*` 토큰 사용

`src/globals.css`는 다음만 둔다 (v4 구성):
- `@import 'tailwindcss';` (진입), `@import 'tw-animate-css';`, `@plugin '...';`
- `@custom-variant` (dark 등 커스텀 variant)
- `@theme { --color-*, --font-*, --background-image-*, ... }` — 디자인 토큰
- shadcn HSL CSS 변수 (`--background`, `--primary`, …) — `:root` / `.dark`
- 키프레임/글로벌 리셋 (`@layer base`, `@keyframes`)
- 커스텀 유틸리티 (`@utility name { ... }`)
- `@font-face`

새 디자인 토큰이 필요하면 `@theme`에 변수를 추가한다. 새 유틸리티가 필요하면 `@utility`를 추가한다. 컴포넌트 내부에는 박지 않는다.

### 1.3 컬러 토큰
모든 컬러는 `src/globals.css`의 `@theme` 안 `--color-*` 변수를 사용. v4는 변수에서 자동으로 유틸리티를 생성한다 (예: `--color-beige50` → `bg-beige50` / `text-beige50` / `border-beige50`). **hex 리터럴을 className/style에 직접 쓰지 않는다.**

- 기본 팔레트: `neutral-00..neutral-1000`, `accent-00..accent-1000`
- 상태 팔레트: `red-*`, `yellow-*`, `blue-*`, `green-*`
- 베이지: `beige50`, `beige100`, `beige200`, `beige500`, `beige700`,
  `beige900` (마케팅/온보딩의 기존 토큰)
- 의미 기반 토큰: `bg-default`, `bg-basement`, `bg-floating`, `bg-weak`,
  `neutral-primary`, `neutral-muted`, `primary`, `action`, `positive`,
  `info`, `critical`, `link`
- shadcn 토큰: `background`, `foreground`, `primary`, `muted`, `border` — `:root` HSL 변수로 정의, 다크는 `@custom-variant dark (&:is(.dark *))` 변형으로 오버라이드

신규 앱 UI는 가능한 한 의미 기반 토큰을 먼저 사용한다. 팔레트 토큰을 직접
사용해야 한다면 의미 기반 토큰으로 표현할 수 없는 이유가 분명해야 한다.

### 1.4 타이포그래피 / spacing
- `font-sans` (Pretendard) 기본. 헤드라인은 `font-instrument` / `font-hedvig`.
- 페이지 콘텐츠 최대폭: `max-w-[1260px]`.
- 패딩: `px-4 md:px-6 lg:px-8` 형태로 breakpoint별 키움.

### 1.5 컴포넌트 작성 규칙
- **`className` 병합은 항상 `cn()`** (`src/lib/utils.ts`) — `clsx + tailwind-merge`. 충돌 유틸리티가 안전하게 머지된다.
- **variants는 `cva` (class-variance-authority)** — `Button`/`buttonVariants()`의 색·배경·border·hover/focus는 반드시 variant가 소유한다. 호출부에서 `text-*`, `bg-*`, `border-*` 같은 시각 클래스로 덮어쓰지 않는다 (레이아웃 클래스만 허용).
- **Radix primitive를 직접 import하지 않고 `src/components/ui/`의 wrapper 사용.**

---

## 2. 모바일 지원 전략

> 현재 앱 전역의 데스크탑 강제 게이트는 없다. 라우트별 모바일 완성도를 표로
> 관리하며, `desktop_only`는 “차단됨”이 아니라 모바일 QA와 디자인이 완료되지
> 않았다는 뜻이다.

### 2.1 현재 모바일 인프라
- `src/hooks/useMediaQuery.ts` — `useSyncExternalStore` 기반 미디어 쿼리 훅. `useIsMobile`, `useIsTabletUp`, `useIsDesktop` 등 편의 훅 포함. 차단이 아닌 **레이아웃 분기**용.
- `src/hooks/useIsMobile.ts` — `useMediaQuery.useIsMobile`의 re-export. 기존 30+ 호출처 호환.
- `/career/*`/`/career_login`의 이전 모바일 차단은 제거되었고
  `mobileBlocker.ts`도 현재 존재하지 않는다. 새 차단은 제품 요구가 명시된 경우에만
  도입하고 §2.7 상태를 `blocked`로 기록한다.
- `src/components/landing/Orbit.tsx`, `FallingTagsSmall.tsx` 등 `useIsMobile()` 조건부 렌더는 모바일 전용 컴포넌트로 분기.

### 2.2 Breakpoint 컨벤션 (Mobile-first)

| prefix | min-width | 용도 |
|---|---|---|
| (no prefix) | 0 | 모바일 (default) |
| `sm:` | 640px | 큰 모바일 |
| `md:` | 768px | 태블릿 |
| `lg:` | 1024px | 데스크탑 |
| `xl:` / `2xl:` | 1280/1536px | 와이드 |

작은 화면 스타일을 prefix 없이 먼저, `md:`/`lg:`로 데스크탑 보강. `lg:hidden`으로 데스크탑 숨김 방식은 컨테이너 쿼리가 아닌 한 피한다.

### 2.3 ⭐ viewport 유닛은 `svh` 표준

| 유닛 | 의미 | 언제 쓰나 |
|---|---|---|
| `svh` (small) | 모바일 브라우저 UI가 *전부 보일 때*의 viewport | **기본값** — 어떤 상태에서도 overflow 없음 |
| `lvh` (large) | UI가 *모두 숨겨졌을 때*의 viewport | 히어로 풀블리드처럼 의도적으로 크게 차고 싶을 때만 |
| `dvh` (dynamic) | UI 상태에 따라 *실시간 변동* | URL bar 토글에 맞춰 늘었다 줄었다 해야 하는 경우 (드물게) — layout shift 주의 |
| `vh` | 레거시 | **신규 코드 금지**. iOS Safari에서 100vh > visible area 문제 |

**Tailwind v4 유틸리티 (현재 빌드)**:
- `h-svh`, `min-h-svh`, `max-h-svh`
- `h-lvh`, `min-h-lvh`
- `h-dvh`, `min-h-dvh`
- `w-svw` 등 가로 변형도 존재 (가로는 거의 필요 없음)

**규칙**:
- 풀스크린/모달/sticky 컨테이너 → `h-svh` 또는 `min-h-svh`
- 페이지 컨테이너 → `min-h-svh` (콘텐츠가 더 길면 자연 확장)
- 안전 영역과 결합: `min-h-svh pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]`
- 기존 `h-screen` / `min-h-screen` / `100vh` 는 보일 때마다 `svh`로 교체

```tsx
// ❌
<main className="h-screen" />
<div style={{ height: "100vh" }} />

// ✅
<main className="h-svh" />
<div className="min-h-svh pb-[env(safe-area-inset-bottom)]" />
```

### 2.4 미디어 쿼리는 React에서 어떻게 다루나
CSS로 풀 수 있으면 CSS로. JS가 필요할 때만 `src/hooks/useMediaQuery.ts`의 훅을 쓴다. `useSyncExternalStore` 기반이라 SSR 안전.

```ts
import {
  useMediaQuery,
  useIsMobile,
  useIsTabletUp,
  useIsDesktop,
  useBreakpointUp,
  useBreakpointDown,
  usePrefersReducedMotion,
  breakpoints,
} from "@/hooks/useMediaQuery";

// 편의 훅 (Tailwind md=768 기준)
const isMobile = useIsMobile();         // < 768px
const isTabletUp = useIsTabletUp();     // >= 768px
const isDesktop = useIsDesktop();       // >= 1024px

// 임의 브레이크포인트
const isLargeUp = useBreakpointUp("xl"); // >= 1280px

// 임의 쿼리
const isLandscape = useMediaQuery("(orientation: landscape)");
```

스크롤 방향에 따라 헤더를 숨기는 hide-on-scroll 패턴은
`src/hooks/useHideOnScroll.ts`로 통합한다. 신규 구현에서 스크롤 listener와 방향
판정 로직을 다시 작성하지 않는다.

### 2.5 터치 대응 체크리스트
- 탭 타깃 최소 44×44px (`min-h-11 min-w-11` 또는 padding)
- hover-only 상호작용 금지 — 모든 hover 액션은 탭/롱프레스 동치 필요
- `:focus-visible` 유지 (키보드 접근성)
- Safe area: `env(safe-area-inset-*)` 사용. 고정 헤더/푸터에 적용
- 입력 폼: `<input>` `font-size: 16px` 이상 (iOS 줌 방지) — `text-base` 이상

### 2.6 레이아웃 프리미티브 (Page · PageContainer · AppLayout · Dialog/Drawer)

페이지 단위로 `max-width` · padding · safe-area를 매번 다시 결정하지 말 것. 다음 컴포넌트만 컴포즈한다.

```tsx
import { Page } from "@/components/layout/Page";
import { PageContainer } from "@/components/layout/PageContainer";

<Page background="beige" minHeight="svh" safeArea="bottom">
  <Header />
  <PageContainer as="main" size="default" padding="default">
    {/* 콘텐츠 */}
  </PageContainer>
</Page>
```

| 컴포넌트 | prop | 값 |
|---|---|---|
| `Page` | `minHeight` | `svh` (기본), `svhFill`(호환 alias), `fillScreen`, `none` |
| | `background` | `beige`, `beigeAlt`, `paper`, `neutral`, `dark`, `none` |
| | `safeArea` | `none` (기본), `top`, `bottom`, `y`, `x`, `all` |
| `PageContainer` | `size` | `narrow`(960) · `default`(1260) · `wide`(1440) · `full` |
| | `padding` | `default` (`px-4 md:px-6 lg:px-8`), `tight`, `loose`, `none` |
| | `safeArea` | `none` (기본), `top`, `bottom`, `y`, `x`, `all` |
| | `as` | `div` (기본), `main`, `section`, `article` 등 |

**규칙**:
- 페이지 최상위는 항상 `<Page>` — `h-screen`/`min-h-screen` 직접 작성 금지 (§2.3)
- 콘텐츠 너비 제한은 `<PageContainer>` — `max-w-[Npx]` 직접 작성 금지
- 고정 헤더/하단 CTA가 있는 페이지는 `<Page safeArea="bottom">` 또는 컨테이너에 `safeArea="bottom"`
- 두 컴포넌트의 `className` prop은 **레이아웃 보강만** (margin/padding/flex). 컬러·max-width 덮어쓰기 금지

**`AppLayout` (로그인 후 `/my/*` 셸, `src/components/layout/app.tsx`)**:
- 데스크탑 = 사이드바, 모바일 (`< md`) = 상단 `sticky` AppBar + 햄버거 → 하단 `Drawer` 메뉴 (vaul)
- `min-h-svh` + `env(safe-area-inset-top/bottom)` 적용
- 모바일에서 nav 아이템 클릭 시 자동으로 drawer 닫힘 (`handleMobileNavigate`)

**`Dialog` / `Drawer` / `ResponsiveDialog` (`src/components/ui/{dialog,drawer,responsive-dialog}.tsx`)**:
- `Dialog` = Radix 기반 중앙 모달 (데스크탑)
- `Drawer` = vaul 기반 bottom sheet (모바일)
- `ResponsiveDialog` = `useIsMobile`로 두 변형을 자동 분기. 단일 API:

```tsx
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";

<ResponsiveDialog
  open={open}
  onOpenChange={setOpen}
  title="후보 공유"
  description="이 후보의 공개 링크를 생성합니다."
  footer={<Button onClick={handleShare}>공유</Button>}
>
  {/* 본문 */}
</ResponsiveDialog>
```

- 데스크탑 = `Dialog` 중앙 모달, 모바일 = `Drawer` bottom sheet (drag-to-dismiss)
- 강제 분기: `forceVariant="dialog"` 또는 `"drawer"`
- 기존 `BaseModal.tsx` 위에 만들어진 19개 모달은 점진 마이그레이션 (페이지 단위)

### 2.7 주요 라우트 모바일 상태 표

사용자에게 직접 노출되는 주요 화면의 상태를 관리한다. 새 화면을 공개하거나
모바일 디자인·QA를 완료한 PR은 이 표를 업데이트한다. 내부 redirect와 세부
하위 라우트를 모두 나열하는 전체 route manifest는 아니다.

| 라우트 | 카테고리 | 모바일 상태 | 비고 |
|---|---|---|---|
| `/` | landing | partial | `CareerAppBar` 사용, hide-on-scroll 동작. 모바일 분기 검증 필요 |
| `/ko`, `/en` | landing | partial | `/`과 같은 landing page를 locale별로 제공 |
| `/network` | landing | partial | inline AppBar + preloader. 통합 헤더로 마이그레이션 대상 |
| `/company` | landing | desktop_only | inline nav, 모바일 분기 없음 |
| `/find` | landing | partial | `LandingHeader` 햄버거 있음. 본문 모바일 미검증 |
| `/pricing` | landing | partial | `LandingHeader` 햄버거 있음 |
| `/search` | landing/app | partial | `SearchHeader` 햄버거 있음 |
| `/radar` | app | desktop_only | inline header, 모바일 분기 없음 |
| `/talent` | landing | desktop_only | `AppHeader` 사용, 모바일 미디자인 |
| `/join` | auth | desktop_only | 헤더 없음, 모바일 미디자인 |
| `/invitation/*` | redirect | not_applicable | `next.config.mjs`에서 `/`로 임시 redirect |
| `/onboard` | auth | desktop_only | 모바일 미디자인 |
| `/career_login` | career | partial | 모바일 카드와 풋터 wrap 적용. 입력 글꼴 16px 이상으로 보정 후 iOS 줌 QA 필요 |
| `/career`, `/career/onboarding`, `/career/preview` | career | designed | `CareerWorkspaceScreen` 모바일 분기(`CareerMobile*` 6종). onboarding은 단계별 모바일-퍼스트 그리드 + svh. preview는 workspace를 그대로 사용. |
| `/auths/*` | auth | designed | 단순 콜백 페이지, 시각 요소 거의 없음 |
| `/my`, `/my/*` | app | partial | `AppLayout`이 모바일에서 햄버거 + 하단 시트 drawer로 분기됨. 콘텐츠 영역 페이지별 모바일 디자인 필요 |
| `/ops/*` | ops | partial | `OpsShell` overflow-x-auto pill nav. 본문 미검증 |
| `/admin`, `/admin/career/*` | ops | desktop_only | 자체 admin 화면 |
| `/blog`, `/blog/[slug]` | public | partial | `LandingHeader`/`SearchHeader` 햄버거 |
| `/share/*` | public | desktop_only | 셸 없음, 페이지 inline |
| `/privacy`, `/terms` | public | designed | `LegalDocumentPage` |

상태 정의:
- `designed` — 모바일 디자인 완료, QA 통과
- `partial` — 일부 컴포넌트만 모바일 분기 (헤더 등)
- `desktop_only` — 모바일 분기 0건, 데스크탑 전용
- `blocked` — `mobileBlocker.ts` 등으로 명시 차단
- `not_applicable` — redirect나 callback처럼 별도 반응형 화면이 없음

---

## 3. `useEffect` 사용 기준

> **원칙**: `useEffect`는 React 상태를 외부 시스템과 동기화하는 도구다. effect
> 자체를 금지하지 않으며, 렌더 중 계산·이벤트 핸들러·TanStack Query가 더 정확한
> 문제에는 그 도구를 사용한다.
> 참고: [react.dev — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)

### 3.1 금지되는 안티패턴

#### ❌ A. props/state로부터 파생되는 값을 `useState` + `useEffect`로 동기화
```tsx
// ❌
const [fullName, setFullName] = useState("");
useEffect(() => { setFullName(`${firstName} ${lastName}`); }, [firstName, lastName]);

// ✅ 렌더 중 직접 계산 (비싸면 useMemo)
const fullName = `${firstName} ${lastName}`;
const filtered = useMemo(() => list.filter(predicate), [list, predicate]);
```

#### ❌ B. props가 바뀔 때 state를 리셋
```tsx
// ❌
useEffect(() => { setDraft(initialValue); }, [initialValue]);

// ✅ key prop으로 컴포넌트 재마운트
<Editor key={candidateId} initialValue={initialValue} />
```

#### ❌ C. 이벤트 결과를 `useEffect`에 떠넘기기
```tsx
// ❌
const [submitted, setSubmitted] = useState(false);
useEffect(() => { if (submitted) postOrder(data); }, [submitted]);

// ✅ 이벤트 핸들러에서 직접
const handleClick = () => postOrder(data);
```

#### ❌ D. 서버 데이터를 `useEffect + fetch`로 패칭
```tsx
// ❌
useEffect(() => { fetch("/api/x").then(setData); }, []);

// ✅ TanStack Query 훅
const { data } = useCandidateDetail(candidId);
```

#### ❌ E. mount 시 zustand store에 1회 dispatch
```tsx
// ❌
useEffect(() => { store.init(); }, []);

// ✅ Provider.tsx에서 1회 호출하거나, store 내부에서 lazy 초기화
```

#### ❌ F. `useEffect` 안에서 다시 setState (체이닝)
```tsx
// ❌
useEffect(() => { setB(a * 2); }, [a]);
useEffect(() => { setC(b + 1); }, [b]);

// ✅ 렌더 중 계산
const b = a * 2;
const c = b + 1;
```

#### ❌ G. 자식 → 부모로 데이터 역류
```tsx
// ❌
function Child({ onFetched }: { onFetched: (d: Data) => void }) {
  const data = useSomeAPI();
  useEffect(() => { if (data) onFetched(data); }, [data, onFetched]);
}

// ✅ 부모에서 직접 패칭 후 자식에 props로
function Parent() {
  const data = useSomeAPI();
  return <Child data={data} />;
}
```

### 3.2 ✅ `useEffect`가 적절한 대표 사례
1. **외부 구독** — `window.addEventListener`, `matchMedia`, `IntersectionObserver`, `ResizeObserver`, Supabase realtime, `BroadcastChannel`. 가능하면 `useSyncExternalStore`로 대체 검토.
2. **수동 DOM 측정/포커스** — `element.focus()`, `scrollIntoView`, `getBoundingClientRect`.
3. **타이머** — `setTimeout`/`setInterval` 등록·cleanup.
4. **3rd-party imperative API** — chart 인스턴스 생성/파괴, 지도 라이브러리.
5. **URL/라우터 정규화** — 인증 또는 서버 응답 이후 canonical URL로 이동.
6. **document.title / analytics ping** — 렌더와 무관한 외부 시스템 푸시. 단 **analytics는 가능하면 이벤트 핸들러에서**.

### 3.3 배치 기준 — 로컬 effect와 custom hook

- 한 컴포넌트에만 필요한 짧고 명확한 외부 동기화는 컴포넌트에 둬도 된다.
- 여러 컴포넌트가 재사용하거나 구독/cleanup/상태 전이가 복잡하면
  **`src/hooks/`에 의도가 드러나는 이름의 hook으로 분리**한다.
- effect를 hook으로 옮기는 것만으로 잘못된 상태 책임이 해결되지는 않는다.
  파생값·이벤트·서버 패칭인지 먼저 확인한다.

```tsx
// 권장: src/hooks/useFocusOnMount.ts
export function useFocusOnMount<T extends HTMLElement>(ref: RefObject<T>) {
  useEffect(() => {
    const id = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [ref]);
}

useFocusOnMount(inputRef);
```

### 3.4 자가 점검 체크리스트 (PR 전)
- [ ] effect 없이 렌더 중 계산으로 못 푸나?
- [ ] effect 없이 이벤트 핸들러로 못 푸나?
- [ ] 데이터 패칭이면 TanStack Query 훅으로 옮길 수 있나?
- [ ] state 리셋이면 `key` prop으로 풀 수 있나?
- [ ] 외부 시스템 동기화면 `useSyncExternalStore`로 대체 가능한가?
- [ ] effect가 복잡하거나 재사용된다면 `useXxx` hook으로 분리했는가?

### 3.5 ESLint 집행 상태
- `eslint-plugin-react-hooks`는 `eslint-config-next`를 통해 적용되어 있다.
- `react-hooks/set-state-in-effect` 등 신규 규칙은 현재 `warn`이며 기존 코드
  정리 후 신규·수정 코드부터 error 전환을 검토한다.
- `eslint-plugin-react-you-might-not-need-an-effect`는 현재 설치되어 있지 않다.
  도입 전 기존 경고량과 오탐을 측정한다.

---

## 4. TanStack Query — 베스트 프랙티스

**Client Component에서 수명주기 동안 조회·갱신·캐시하는 remote state**는
TanStack Query를 통과한다. `fetch` 결과를 로컬 `useState`에 저장해 별도 캐시를
만드는 패턴은 금지한다.

Route Handler나 서버 전용 모듈의 데이터 접근은 TanStack Query 대상이 아니다.
API route는 인증·권한·secret·CORS·응답 정규화 등 서버 경계가 필요할 때 만든다.
서버 내부 코드가 같은 앱의 API route를 다시 HTTP로 호출하지 않고 원본 service를
직접 재사용한다.

### 4.1 QueryClient 기본값 (이미 적용 — `src/components/Provider.tsx`)
```ts
defaultOptions: {
  queries: {
    staleTime: 30_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  },
}
```

### 4.2 QueryKey factory 사용 (이미 존재 — `src/lib/queryKeys.ts`)
모든 신규 쿼리는 `queryKeys.*`를 통해 키를 만든다. 문자열 리터럴 배열을 직접 짜지 않는다.

```ts
// good
useQuery({ queryKey: queryKeys.candidate.detail(id), queryFn });
// bad
useQuery({ queryKey: ["candidate", id], queryFn });
```

### 4.3 ⭐ Query Options Factory (`queryOptions()`)

queryKey 단위가 아닌 **canonical query definition** 단위로 export한다. `useQuery`, `prefetchQuery`, `fetchQuery`가 모두 같은 factory를 재사용해야 키·queryFn·staleTime 불일치가 사라진다.

```ts
// 신규 query module 또는 기존 hook 마이그레이션 후 형태
import { queryOptions, useQuery } from "@tanstack/react-query";

export function candidateDetailQueryOptions(candidId: string) {
  return queryOptions({
    queryKey: queryKeys.candidate.detail(candidId),
    queryFn: () => fetchCandidateDetail(candidId),
    staleTime: 60_000,
    enabled: Boolean(candidId),
  });
}

export function useCandidateDetail(candidId: string) {
  return useQuery(candidateDetailQueryOptions(candidId));
}
```

**규칙**:
- client hook은 factory를 소비만 한다.
- derived hook도 기존 factory를 재사용한다.
- 서버 prefetch / `useQuery` / imperative `fetchQuery`가 모두 같은 factory를 공유.
- 같은 리소스에 대해 factory 없이 별도 `queryKey`/`queryFn`을 다시 만들지 않는다.

### 4.4 ⭐ Mutation → Cache Invalidation Contract

모든 mutation은 자신이 영향을 미치는 query key를 명시한다. 도메인별로 표를 유지하고, mutation 신설/수정 시 업데이트한다.

| 액션 | `setQueryData` | `invalidateQueries` | `removeQueries` |
|---|---|---|---|
| 북마크 추가/제거 | candidate.detail (optimistic) | candidate.bookmark, bookmarkFolders.byUser | — |
| 폴더 생성/수정/삭제 | — | bookmarkFolders.byUser | bookmarkFolders.detail (삭제 시) |
| candidate 마킹 변경 | candidate.detail (optimistic) | candidate.detail, match.candidates | — |
| match workspace 변경 | — | match.workspace, match.candidates | — |
| run 생성 | — | run.all | — |
| run 결과 도착 | — | run.results | — |
| ATS outreach 발송 | — | candidate.detail, match.candidates | — |
| ops opportunity role 저장 | — | opsOpportunity.all | — |
| org 후보자 단계 변경 | — | org.board, org.detail | — |
| org role 수정 | — | org.bootstrap, org.board, org.detail | — |
| org 멤버/초대/회사 수정 | — | org.bootstrap | — |
| org Slack 설정 변경 | org.slack (알림 optimistic) | org.slack | — |
| 로그아웃 | — | — | `queryClient.clear()` |

공용 헬퍼는 `src/lib/queryInvalidation.ts`(또는 도메인 모듈)에 모은다. 예: 기존 `invalidateBookmarkRelatedQueries(qc, userId)`. mutation 신설 시 도메인 헬퍼가 있으면 헬퍼를 부르고, 없으면 헬퍼부터 만든다.

### 4.5 ⭐ staleTime Policy

스칼라 마법숫자를 흩뿌리지 않는다. 도메인별 staleTime 결정을 표로 유지한다.

| 쿼리 도메인 | staleTime | gcTime | 근거 |
|---|---|---|---|
| candidate.detail | 60s | 10min | 상세 페이지 진입 시 fresh, mutation이 invalidate |
| candidate.bookmark | 30s | 10min | 토글 빈도 높음 |
| bookmarkFolders.byUser | 5min | 30min | 변경 적음, mutation이 invalidate |
| run.detail | 60s | 10min | run 메타데이터 |
| run.results | 30s | 5min | 폴링/롱폴링 결과 반영 필요 |
| match.workspace | 15s | 10min | 워크스페이스 전환 상태 |
| match.candidates | 10s | 10min | 후보 변경을 빠르게 반영 |
| org.bootstrap | 30s | 10min | shell 공통 데이터, mutation이 invalidate |
| org.invitePreview | 5min | 10min | 초대 진입 정보는 변경 빈도가 낮음 |
| org.board / org.detail / org.agent* | 20s | 10min | Jobs 작업 결과를 빠르게 반영 |
| org.slack | 15s | 10min | 외부 연동 상태 확인 |
| org.internalTalent | 30s | 10min | 내부 운영 상세 데이터 |
| opsOpportunity.* | 15s | 10min | 어드민 편집 결과를 빠르게 반영 |
| searchHistory.byUser | 30s | 10min | 최근 검색 변경 반영 |
| connections.count | 30s | 10min | mutation invalidation과 함께 사용 |
| auth session | — | — | Zustand가 관리 (서버 캐시 아님) |

신규 도메인 추가 시 이 표에 한 줄을 더한다. 표에 없는 staleTime은 PR에서 잡는다.

### 4.6 Mutation 컨벤션
```ts
const mutation = useMutation({
  mutationFn: createBookmark,
  onMutate: async (vars) => {
    // optimistic update — 즉시 피드백 필요한 토글/즐겨찾기에 적용
    await qc.cancelQueries({ queryKey: queryKeys.candidate.detail(vars.candidId) });
    const prev = qc.getQueryData(queryKeys.candidate.detail(vars.candidId));
    qc.setQueryData(queryKeys.candidate.detail(vars.candidId), (old) => /* … */);
    return { prev };
  },
  onError: (_e, vars, ctx) => {
    if (ctx?.prev !== undefined) {
      qc.setQueryData(queryKeys.candidate.detail(vars.candidId), ctx.prev);
    }
  },
  onSettled: (_d, _e, vars) => {
    invalidateBookmarkRelatedQueries(qc, vars.userId);
  },
});
```
- **optimistic update가 필요한 시점**: 사용자가 즉시 피드백을 봐야 하는 토글(북마크, 마크, 업보트).
- invalidate는 `onSettled`(성공/실패 무관 일관성 보장) 또는 `onSuccess`(성공시만).

### 4.7 ⭐ Route + Query Prefetch (hover intent)

후보 카드/북마크 드롭다운/아바타 hover 시 route + query를 함께 prefetch.

```tsx
function handleCardHover(candidId: string) {
  router.prefetch(`/candidate/${candidId}`);
  void queryClient.prefetchQuery(candidateDetailQueryOptions(candidId));
}

<CandidateCard
  onMouseEnter={() => handleCardHover(candidId)}
  onFocus={() => handleCardHover(candidId)}
/>
```

- 보이는 `<Link>`는 Next.js 기본 prefetch 유지.
- button/dropdown/programmatic navigation은 intent signal(hover/focus)에서 수동 prefetch.
- `prefetchQuery`는 staleTime 이내의 fresh cache가 있으면 네트워크 요청을
  건너뛴다. 최초 prefetch는 정상 요청 비용이 발생하므로 큰 목록에서는 의도 지연,
  데이터 크기, 중복 호출을 함께 점검한다.

### 4.8 모바일 추가 고려
- `refetchOnReconnect`는 기본값이 `true`다. 도메인 특성상 재연결 refetch를
  막아야 하는 쿼리만 명시적으로 `false`로 설정한다.
- 무한 스크롤은 `useInfiniteQuery`와 API가 정의한 cursor 또는 offset 기반
  `pageParam`을 사용한다.

### 4.9 절대 하지 말 것
- Client Component에서 imperative `fetch` 결과를 로컬 state에 캐시
  → Query 훅과 공용 service로
- `useEffect`로 `data` → `useState` 복사 (3.1-A 안티패턴)
- queryKey에 함수·class instance·순환 참조 등 JSON 비직렬화 값을 넣기
  → JSON 직렬화 가능한 원시값/정규화된 객체 사용
- queryFn이 의존하는 변수를 queryKey에서 누락하기
  → 캐시를 구분하는 모든 입력을 factory가 소유
- 같은 리소스에 factory 없이 다른 queryKey 사용 → §4.3

문서: [Query Invalidation](https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation), [Invalidations from Mutations](https://tanstack.com/query/v5/docs/react/guides/invalidations-from-mutations)

---

## 5. 클라이언트 상태와 Zustand — 베스트 프랙티스

Zustand는 페이지 경계를 넘어 유지하거나 여러 기능 영역에서 접근하는
**순수 클라이언트 UI 상태**를 담당한다. 한 페이지의 형제 컴포넌트만 공유하는
상태와 orchestration은 page-scoped context/domain hook으로 제한할 수 있다.
브라우저에서 캐시하는 remote state는 어느 쪽에도 복제하지 않고 TanStack Query를
SSOT로 둔다.

### 5.1 무엇을 Zustand에 넣고, 무엇을 넣지 않는가
| 넣어야 함 | 넣으면 안 됨 |
|---|---|
| 사용자 설정 (뷰 타입, 필터 정렬 순서) | 후보 목록, 폴더 목록 (서버 데이터) |
| 여러 화면에서 여는 전역 모달 open/close | 페이지 내부 모달과 폼 값 (`useState`로 충분) |
| 현재 워크스페이스 id | 워크스페이스 내용 |
| Auth session 스냅샷 (Supabase 구독 결과) | 사용자 프로필 디테일 (Query로) |

### 5.2 store 작성 규칙
- TypeScript 미들웨어 호환을 위해 **`create<T>()(...)` (이중 괄호)** 패턴.
- 보존이 필요한 설정은 **`persist` 미들웨어 + `partialize`**.
- localStorage 키는 **앱 전역에서 유일** — `harper:settings`, `harper:auth` 등 prefix.

```ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type SettingsState = {
  viewType: "card" | "list";
  setViewType: (v: SettingsState["viewType"]) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      viewType: "card",
      setViewType: (viewType) => set({ viewType }),
    }),
    {
      name: "harper:settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ viewType: s.viewType }),
    },
  ),
);
```

### 5.3 ⭐ 구독은 selector로 (전체 스토어 구독 금지)

```ts
// ❌ 스토어 전체 구독 — 어떤 필드가 바뀌어도 리렌더
const settings = useSettingsStore();

// ✅ 필요한 필드만 selector로
const viewType = useSettingsStore((s) => s.viewType);
```

다중 필드를 한 번에 구독해야 하면 **`useShallow`로 얕은 비교 강제**.

```ts
import { useShallow } from "zustand/react/shallow";

const { viewType, sortKey } = useSettingsStore(
  useShallow((s) => ({ viewType: s.viewType, sortKey: s.sortKey })),
);
```

`useShallow` 없이 객체 selector를 쓰면 매 렌더마다 새 객체 참조가 만들어져 무한 리렌더 위험이 있다.

액션을 구독할 때도 selector:
```ts
const setViewType = useSettingsStore((s) => s.setViewType);
```

### 5.4 slice 패턴 (스토어가 커질 때)
단일 store에 여러 slice를 합성. **미들웨어는 합쳐진 store에 적용**, slice 내부에 적용하지 않는다.

```ts
import type { StateCreator } from "zustand";

type AuthSlice = { session: Session | null; setSession: (s: Session | null) => void };
type ModalSlice = { open: boolean; setOpen: (b: boolean) => void };

const createAuthSlice: StateCreator<AuthSlice & ModalSlice, [], [], AuthSlice> = (set) => ({
  session: null,
  setSession: (session) => set({ session }),
});

const createModalSlice: StateCreator<AuthSlice & ModalSlice, [], [], ModalSlice> = (set) => ({
  open: false,
  setOpen: (open) => set({ open }),
});

export const useAppStore = create<AuthSlice & ModalSlice>()((...a) => ({
  ...createAuthSlice(...a),
  ...createModalSlice(...a),
}));
```
크로스-slice 호출은 `get()`으로.

### 5.5 store 초기화 위치
- **store 안에서 lazy 초기화**가 가장 깔끔. 첫 selector 호출 시 자동.
- 외부 구독(예: Supabase `onAuthStateChange`)이 필요하면 store에 `init()` 메서드를 두고, **`Provider.tsx`에서 단 1회 호출**한다. 컴포넌트 본문의 `useEffect`로 init을 부르지 않는다.

### 5.6 절대 하지 말 것
- Zustand에 서버 응답 캐시 → TanStack Query가 할 일
- `useEffect`로 store → state 복사 (selector를 직접 쓰면 됨)
- 컴포넌트에서 `set`을 직접 호출 → 액션을 스토어에 정의하고 호출

문서: [Slices Pattern](https://zustand.docs.pmnd.rs/learn/guides/slices-pattern), [pmndrs/zustand](https://github.com/pmndrs/zustand)

---

## 6. 렌더링 / 성능 원칙

### 6.1 ⭐ 워터폴 제거 (`Promise.all`)

순차 await는 라운드트립 시간의 합산을 유발한다.

```ts
// ❌ 순차 — 3번의 RTT
const user = await fetchUser();
const profile = await fetchProfile(user.id);
const candidates = await fetchCandidates();

// ✅ 독립 작업은 병렬
const [user, candidates] = await Promise.all([fetchUser(), fetchCandidates()]);
const profile = await fetchProfile(user.id); // user에 의존 → 이후
```

**API route(`src/app/api/**/route.ts`) 작성 규칙**:
- 독립 작업(`getRequestUser` + 설정 조회 + 보조 데이터)은 promise를 즉시 생성하고 필요한 시점에 await.
- `await`는 실제로 값이 필요한 분기에서만 — early return을 먼저.

```ts
export async function GET(req: Request) {
  const userPromise = getRequestUser(req);
  const configPromise = getConfig();

  const user = await userPromise;
  if (!user) return new Response("unauthorized", { status: 401 });

  const [config, data] = await Promise.all([configPromise, fetchData(user.id)]);
  return Response.json({ data, config });
}
```

### 6.2 ⭐ Hot Render Prevention (빈번한 값은 ref로)

빈번하게 변하는 값(STT 레벨, 음성 진행률, 비디오 currentTime, 마우스 위치)을 state로 두면 트리 전체가 매번 리렌더된다. **값은 `ref`에 두고, 실제 UI가 바뀌는 시점에만 `setState`**.

```tsx
// ❌ 50ms마다 setState → 트리 전체 리렌더
const [level, setLevel] = useState(0);
onLevelUpdate(setLevel);

// ✅ ref에 누적, 실제 UI 단계가 바뀔 때만 setState
const levelRef = useRef(0);
const [bucket, setBucket] = useState<"low" | "mid" | "high">("low");

const handleLevel = useCallback((v: number) => {
  levelRef.current = v;
  const next = v < 0.33 ? "low" : v < 0.66 ? "mid" : "high";
  setBucket((prev) => (prev === next ? prev : next));
}, []);
```

음성 레벨, STT 진행률, 비디오 `currentTime`처럼 고빈도 값이 있는 화면은 React
Profiler로 리렌더 빈도를 확인한 뒤 이 패턴을 적용한다.

### 6.3 lazy 초기 state

비싼 초기값은 **함수 형태**로 전달해 매 렌더 재계산 방지.

```tsx
// ❌ 매 렌더마다 computeExpensive() 호출
const [x, setX] = useState(computeExpensive());

// ✅ 최초 1회만
const [x, setX] = useState(() => computeExpensive());
```

이미 `Provider.tsx`의 `QueryClient` 초기화에서 사용 중 — 같은 패턴을 다른 곳에도 적용.

### 6.4 리렌더 최적화 도구
먼저 React Profiler로 병목을 확인한다. 아래 도구를 기본 습관처럼 모든 값에
적용하지 않는다.

- 콜백에서만 쓰는 값은 `useRef`로 읽기 지연 → 컴포넌트가 그 값을 구독하지 않게 만든다.
- 무거운 자식은 `React.memo`로 분리.
- 파생 boolean을 구독 (`items.length > 0` vs `items` 전체).
- 긴급하지 않은 업데이트(필터/검색 결과 갱신)는 `startTransition`.
- 메모이즈 selector — 리스트 가공은 `useMemo`로.

### 6.5 조건부 렌더는 삼항 또는 명시적 boolean

`&&` 좌측이 `0`/`""`/`NaN`이면 그 값이 그대로 렌더된다.

```tsx
// ❌ count === 0이면 "0"이 화면에 박힘
{count && <Badge value={count} />}

// ✅
{count > 0 ? <Badge value={count} /> : null}
{Boolean(count) && <Badge value={count} />}
```

### 6.6 JS 마이크로 성능
- 반복 조회는 `Map`/`Set` (O(1)).
- 큰 배열의 측정된 hot path에서 중간 배열 할당이 병목이면
  `filter().map()`을 단일 `reduce`/`for` 루프로 결합한다.
- 배열 비교 전 `length` 먼저 체크.
- RegExp 생성은 루프 밖에서.
- 불변 정렬은 `toSorted()` (Node 20+, 우리 빌드 환경 OK).
- 함수에서 빠르게 early return.

가독성을 해치면서까지 마이크로 최적화하지 않는다. 데이터 크기와 profiler 결과를
PR 설명에 남길 수 있는 경우에만 복잡도를 추가한다.

### 6.7 정적 객체의 참조 안정성
memoized child나 외부 라이브러리 API가 참조 동일성을 활용하는 경우, 변하지 않는
객체·배열은 모듈 스코프로 올린다.

```tsx
// ❌ 매 렌더마다 새 객체/배열
function Page() {
  return <Chart options={{ legend: true, animation: false }} />;
}

// ✅ 모듈 스코프 상수
const CHART_OPTIONS = { legend: true, animation: false };
function Page() {
  return <Chart options={CHART_OPTIONS} />;
}
```

### 6.8 SVG / 콘텐츠 가시성
- SVG 좌표 정밀도 소수점 1자리 이하 (DOM 크기 축소).
- 긴 리스트는 `content-visibility: auto` 적용 검토.

---

## 7. 커스텀 훅 컨벤션

`src/hooks/`에 위치. 다음 네이밍을 따른다.

| 패턴 | 역할 | 반환 |
|---|---|---|
| `use<Entity>` | 서버 데이터 1개 조회 (Query 래핑) | `useQuery` 결과 그대로 |
| `use<Entity>List` | 서버 데이터 N개 조회 | `useQuery` 결과 |
| `useCreate<Entity>` / `useUpdate<Entity>` | 변경 (Mutation 래핑) | `useMutation` 결과 |
| `use<Behavior>` | 클라이언트 행위 (UI/DOM) | 함수 또는 값/튜플 |

원칙:
- **한 훅 = 한 책임**. 두 쿼리를 묶어야 하면 그 묶음 자체를 새로운 도메인 훅으로 만든다.
- `useQuery`/`useMutation`은 페이지 또는 도메인 hook에서 호출한다. 여러 컴포넌트가
  같은 orchestration을 공유할 때 도메인 hook/context로 분리한다.
- `useEffect`는 §3의 배치 기준을 따른다.
- 훅 시그니처는 **명시적 입력 → 명시적 출력**. 인자가 5개 넘으면 옵션 객체.
- 훅이 query factory를 export하면 (§4.3) prefetch에 재사용 가능.

---

## 8. 신규 화면 작성 체크리스트

1. **반응형부터 설계** — mobile-first Tailwind, `svh` 사용 (§2.3).
2. **타입** — `any` 금지 (§0.1). Supabase는 `Database` 제네릭.
3. **데이터** — client remote state는 공용 service + `src/hooks/use<Entity>.ts`
   Query 훅 + `queryOptions` factory로 구성한다. 서버 경계가 필요할 때만
   `src/app/api/...` route를 추가한다 (§4.3).
4. **무효화** — 신규 mutation은 invalidation contract 표(§4.4)에 한 줄 추가.
5. **staleTime** — staleTime policy 표(§4.5)에 한 줄 추가.
6. **클라이언트 상태** — 한 컴포넌트면 `useState`, 한 페이지의 형제 간 공유면
   page-scoped context/domain hook, 페이지 간 공유면 Zustand. 서버 데이터 복제 금지.
7. **부수효과** — `useEffect` 작성 전 §3.1 안티패턴을 확인하고, 복잡하거나
   재사용되는 동기화는 `src/hooks/`에 캡슐화.
8. **컬러/spacing** — 토큰만. 새 토큰은 `src/globals.css`의 `@theme`에 추가.
9. **인라인 style 없음** (§0.3), **styled-jsx 없음** (§0.5).
10. **prefetch** — hover/focus에서 route + query prefetch (§4.7) 필요 여부 검토.
11. **a11y** — focus ring 유지, 탭 타깃 44px+, `aria-*` 누락 없음.
12. **모바일 상태** — `useIsMobile` 분기와 명시적 blocker 유무를 확인하고
    §2.7의 라우트 상태를 업데이트.
13. **상태 UI** — loading, empty, error, retry 상태를 정의하고 정상 상태와 같은
    반응형·접근성 기준으로 검증.
14. **검증** — `pnpm lint`와 관련 테스트를 통과시키고, 최소 375px·768px·1024px
    viewport에서 overflow, 키보드 포커스, 주요 상호작용을 확인.

---

## 9. 금지 패턴 요약 (PR 리뷰 한눈에 보기)

| 패턴 | 이유 | 대안 |
|---|---|---|
| `any` 타입 | 타입 안전성 무력화 | `unknown`, 제네릭, 구체적 타입 (§0.1) |
| `useEffect`로 데이터 패칭 | 워터폴, 레이스 컨디션 | TanStack Query 훅 (§3.1-D, §4) |
| `useEffect`로 파생 state 계산 | 불필요한 리렌더 | 렌더 중 계산, `useMemo` (§3.1-A) |
| `useEffect`로 이벤트 처리 | 의도치 않은 실행 | 이벤트 핸들러 (§3.1-C) |
| `useEffect`로 부모 알림 | 복잡한 데이터 흐름 | 흐름 역전 (§3.1-G) |
| `useEffect`로 state 리셋 | 추가 렌더 패스 | `key` 패턴 (§3.1-B) |
| `useEffect` 체이닝 | N번의 불필요한 리렌더 | 렌더 중 계산 (§3.1-F) |
| 복잡한 구독/동기화 effect를 여러 컴포넌트에 중복 | cleanup 누락, 동작 불일치 | 의도가 드러나는 custom hook (§3.3) |
| `fetch` + `useState`로 서버 데이터 | 캐시·중복제거·에러 없음 | TanStack Query (§4) |
| 롤백 없는 낙관적 업데이트 | 실패 시 캐시 불일치 | `useMutation` `onMutate`/`onError` (§4.6) |
| 같은 리소스에 factory 없이 다른 queryKey | 캐시 분기 | `queryOptions` factory (§4.3) |
| 표에 없는 staleTime/invalidation | 일관성 깨짐 | §4.4 / §4.5 표 업데이트 |
| Zustand에 서버 데이터 | 캐시 불일치 | TanStack Query (§5.1) |
| Zustand 전체 스토어 구독 | 불필요한 리렌더 | selector + `useShallow` (§5.3) |
| `set`을 컴포넌트에서 직접 호출 | 액션 응집 깨짐 | 액션을 스토어에 정의 |
| 순차 `await` | 워터폴 | `Promise.all()` (§6.1) |
| 빈번한 값을 state로 | 트리 전체 리렌더 | `ref` + 단계 변화 시만 setState (§6.2) |
| 비싼 `useState(value)` 초기값 | 매 렌더 재계산 | `useState(() => compute())` (§6.3) |
| 조건부 렌더 `{count && <X/>}` | `0` 렌더 버그 | 삼항 또는 `Boolean()` (§6.5) |
| 인라인 정적 `style={{}}` | 일관성 부재 | Tailwind 클래스 (§0.3) |
| 신규 styled-jsx | 일관성 부재 | Tailwind / globals.css `@layer` (§0.5) |
| `h-screen` / `100vh` | iOS Safari overflow | `h-svh` (§2.3) |
| 컬러 hex 리터럴 직접 사용 | 토큰 우회 | `globals.css` `@theme` 토큰 (§1.3) |
| Radix primitive 직접 import | wrapper 우회 | `src/components/ui/` (§1.5) |

---

## 10. 참고 문서

### 공식
- [react.dev — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [react.dev — Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects)
- [react.dev — Escape Hatches](https://react.dev/learn/escape-hatches)
- [TanStack Query — Query Invalidation](https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation)
- [TanStack Query — Invalidations from Mutations](https://tanstack.com/query/v5/docs/react/guides/invalidations-from-mutations)
- [TanStack Query — Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys)
- [TanStack Query — Important Defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)
- [TanStack Query — `queryOptions` API](https://tanstack.com/query/v5/docs/framework/react/reference/queryOptions)
- [TanStack Query — QueryClient API](https://tanstack.com/query/v5/docs/reference/QueryClient)
- [Zustand — Slices Pattern](https://zustand.docs.pmnd.rs/learn/guides/slices-pattern)
- [Zustand GitHub](https://github.com/pmndrs/zustand)
- [Tailwind CSS — Dynamic Viewport Units](https://tailwindcss.com/docs/height) (`h-svh`, `h-lvh`, `h-dvh`)
- [web.dev — The large, small, and dynamic viewport units](https://web.dev/blog/viewport-units)

### 도구
- [eslint-plugin-react-you-might-not-need-an-effect](https://www.npmjs.com/package/eslint-plugin-react-you-might-not-need-an-effect)
