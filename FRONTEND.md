# FRONTEND.md

Harper 프론트엔드의 디자인 시스템, 상태 관리, 성능 원칙, 그리고 **"useEffect 남용 금지"** 규칙을 정리한 문서. 새 기능을 추가하거나 모바일을 지원하는 모든 변경은 이 문서를 따른다.

> **두 가지 절대 원칙**
> 1. **`useEffect`는 마지막 수단이다.** React 공식 가이드 *[You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)* 를 그대로 따른다.
> 2. **상태 책임을 깨지 않는다.** 서버 상태 → TanStack Query, 공유 UI 상태 → Zustand, 일시적 로컬 상태 → `useState`. 그 외는 금지.

---

## 0. 절대 규칙 (PR 리뷰 차단 사유)

다음 규칙은 협상 불가. PR에서 발견되면 머지 보류.

### 0.1 `any` 타입 금지

TypeScript의 타입 안전성을 무력화하는 `any`는 어떤 상황에서도 쓰지 않는다.

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

### 0.2 `useEffect`는 외부 시스템 동기화 전용

상세 규칙은 §3. 컴포넌트 본문에서 `useEffect`를 직접 호출하지 않는다 — 정당한 경우라도 `src/hooks/`에 캡슐화한다.

### 0.3 인라인 `style={{}}`는 동적 값 전용

정적 색·여백·폰트는 절대 인라인으로 박지 않는다. Tailwind 클래스 사용.

```tsx
// ❌ 금지
<div style={{ backgroundColor: "#111", padding: "16px" }} />

// ✅ Tailwind
<div className="bg-hblack900 p-4" />

// ✅ 정당한 인라인 (계산값/픽셀/퍼센트)
<div style={{ gridTemplateColumns, width: `${percent}%` }} />
```

### 0.4 viewport 유닛은 `svh` 표준

모바일 지원으로 전환 중이므로 `vh`를 사용하지 않는다. 자세한 규칙은 §2.3.

```tsx
// ❌ 금지 — iOS Safari URL bar에서 100vh가 viewport를 넘침
<div className="h-screen min-h-screen" />

// ✅ Tailwind 3.4+ svh 유틸리티
<div className="h-svh min-h-svh" />
```

### 0.5 신규 styled-jsx 금지

기존 4건(`landing/VCLogosWidth.tsx`, `landing/Background.tsx`, `pages/network.tsx`, `pages/blog/[slug].tsx`)은 점진 제거. 신규 파일에는 도입 금지.

---

## 1. 디자인 시스템

### 1.1 스택
- **CSS**: Tailwind CSS 3.4 + `tailwind-merge` + `tailwindcss-animate` + `tailwind-scrollbar`
- **컴포넌트**: shadcn/ui (`new-york` preset) + Radix UI primitives
  - `src/components/ui/` — shadcn 기본
  - `src/components/ui/beige/` — beige 테마 오버라이드
- **아이콘**: `lucide-react` (신규 코드는 lucide만)
- **애니메이션**: `framer-motion` (페이지 단위) + Tailwind keyframes (`upDown`, `shake`, `textGlow`)
- **폰트**: `PretendardVariable` (sans 기본), `Instrument Serif` (serif) — `tailwind.config.js` `fontFamily`에 등록

### 1.2 SSOT 원칙
Tailwind는 **컬러·spacing·typography의 단일 소스**다. 다음 누수는 PR에서 잡는다.

- 신규 컴포넌트의 인라인 정적 스타일 → §0.3
- 신규 styled-jsx → §0.5
- 컬러 hex 리터럴 직접 사용 → `tailwind.config.js`의 토큰 사용

`globals.css`는 다음만 둔다:
- `@tailwind` 디렉티브, `@font-face`
- shadcn HSL CSS 변수 (`--background`, `--primary`, …)
- 키프레임/글로벌 리셋 (`@layer base`, `@keyframes`)
- 토큰화 어려운 유틸리티 (`@layer utilities`)

새 유틸리티 클래스가 필요하면 `globals.css`의 `@layer utilities`나 `tailwind.config.js`의 `theme.extend`에 추가한다 — 컴포넌트 내부에 박지 않는다.

### 1.3 컬러 토큰
모든 컬러는 `tailwind.config.js`의 `colors`를 사용. **hex 리터럴을 className/style에 직접 쓰지 않는다.**

- 그레이스케일: `hgray100..hgray1000`, `hblack000..hblack1000` (앱 UI 기본)
- 베이지: `beige50..beige900` (마케팅/온보딩)
- 어두운 배경: `bgDark300..bgDark900`
- 액센트: `brightnavy(#0624A8)`, `accenta1(#EFFF3F)`, `accentBronze`
- shadcn 토큰: `background`, `foreground`, `primary`, `muted`, `border` (다크모드는 `.dark` 클래스로 오버라이드)

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

> 데스크탑 강제 게이트(현재 켜져 있음)를 라우트 단위로 단계적 해제. 모바일 디자인이 끝난 라우트부터 게이트를 푼다.

### 2.1 현재 게이트 위치
- `src/hooks/useMediaQuery.ts` — `useSyncExternalStore` 기반 미디어 쿼리 훅. `useIsMobile`, `useIsTabletUp`, `useIsDesktop` 등 편의 훅 포함. 차단이 아닌 **레이아웃 분기**용.
- `src/hooks/useIsMobile.ts` — `useMediaQuery.useIsMobile`의 re-export. 기존 30+ 호출처 호환.
- `/career/*`/`/career_login` 모바일 차단은 제거됨(이전 `mobileBlocker.ts`). 신규 라우트를 모바일 차단해야 하면 동일 패턴으로 재도입.
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

스크롤 방향에 따라 헤더를 숨기는 hide-on-scroll 패턴은 `src/hooks/useHideOnScroll.ts`로 통합 — 4곳 중복 코드(`network.tsx`, `landing-ko-vf.tsx`, `CareerAppBar.tsx`, `DemoSection.tsx`) 점진 이전.

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
| `Page` | `minHeight` | `svh` (기본), `fillScreen`, `none` |
| | `background` | `beige`, `beigeAlt`, `paper`, `dark`, `none` |
| | `safeArea` | `none` (기본), `top`, `bottom`, `y`, `x`, `all` |
| `PageContainer` | `size` | `narrow`(720) · `default`(1260) · `wide`(1440) · `full` |
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

- 데스크탑 = `Dialog` 중앙 모달, 모바일 = `Drawer` bottom sheet (drag-to-dismiss, snap)
- 강제 분기: `forceVariant="dialog"` 또는 `"drawer"`
- 기존 `BaseModal.tsx` 위에 만들어진 19개 모달은 점진 마이그레이션 (페이지 단위)

### 2.7 라우트 모바일 활성화 표

모바일 디자인이 끝난 라우트부터 게이트를 푼다. PR에서 신규 라우트를 추가하거나 모바일 디자인을 완료할 때 이 표를 업데이트한다.

| 라우트 | 카테고리 | 모바일 상태 | 비고 |
|---|---|---|---|
| `/` | landing | partial | `CareerAppBar` 사용, hide-on-scroll 동작. 모바일 분기 검증 필요 |
| `/landing-ko-vf` | landing | partial | inline AppBar, 모바일 hide-on-scroll 동작. 통합 헤더로 마이그레이션 대상 |
| `/network` | landing | partial | inline AppBar + preloader. 통합 헤더로 마이그레이션 대상 |
| `/company` | landing | desktop_only | inline nav, 모바일 분기 없음 |
| `/find` | landing | partial | `LandingHeader` 햄버거 있음. 본문 모바일 미검증 |
| `/pricing` | landing | partial | `LandingHeader` 햄버거 있음 |
| `/search` | landing/app | partial | `SearchHeader` 햄버거 있음 |
| `/radar` | app | desktop_only | inline header, 모바일 분기 없음 |
| `/talent` | landing | desktop_only | `AppHeader` 사용, 모바일 미디자인 |
| `/talents` | landing | partial | 카피 일부 모바일 분기, 본문 미디자인 |
| `/join` | auth | desktop_only | 헤더 없음, 모바일 미디자인 |
| `/invitation` | auth | desktop_only | 모바일 미디자인 |
| `/onboard`, `/onboarding2` | auth | desktop_only | 모바일 미디자인 |
| `/career_login` | career | designed | 모바일 로그인 카드 + 풋터 로고 wrap. svh + iOS 줌 방지(BeigeInput text-base). |
| `/career`, `/career/onboarding`, `/career/preview` | career | designed | `CareerWorkspaceScreen` 모바일 분기(`CareerMobile*` 6종). onboarding은 단계별 모바일-퍼스트 그리드 + svh. preview는 workspace를 그대로 사용. |
| `/auths/*` | auth | designed | 단순 콜백 페이지, 시각 요소 거의 없음 |
| `/my`, `/my/*` (13개) | app | partial | `AppLayout`이 모바일에서 햄버거 + 하단 시트 drawer로 분기됨. 콘텐츠 영역 페이지별 모바일 디자인 필요 |
| `/ops/*` | ops | partial | `OpsShell` overflow-x-auto pill nav. 본문 미검증 |
| `/adminpage` | ops | desktop_only | 자체 admin shell |
| `/blog`, `/blog/[slug]` | public | partial | `LandingHeader`/`SearchHeader` 햄버거 |
| `/share/*` | public | desktop_only | 셸 없음, 페이지 inline |
| `/privacy`, `/terms` | public | designed | `LegalDocumentPage` |

상태 정의:
- `designed` — 모바일 디자인 완료, QA 통과
- `partial` — 일부 컴포넌트만 모바일 분기 (헤더 등)
- `desktop_only` — 모바일 분기 0건, 데스크탑 전용
- `blocked` — `mobileBlocker.ts` 등으로 명시 차단

---

## 3. ⛔ `useEffect` 남용 금지

> **원칙**: `useEffect`는 "React 바깥의 외부 시스템과 동기화"할 때만. 그 외 모든 경우는 useEffect 없이 해결.
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

### 3.2 ✅ `useEffect`가 정당한 경우 (whitelist)
1. **외부 구독** — `window.addEventListener`, `matchMedia`, `IntersectionObserver`, `ResizeObserver`, Supabase realtime, `BroadcastChannel`. 가능하면 `useSyncExternalStore`로 대체 검토.
2. **수동 DOM 측정/포커스** — `element.focus()`, `scrollIntoView`, `getBoundingClientRect`.
3. **타이머** — `setTimeout`/`setInterval` 등록·cleanup.
4. **3rd-party imperative API** — chart 인스턴스 생성/파괴, 지도 라이브러리.
5. **document.title / analytics ping** — 렌더와 무관한 외부 시스템 푸시. 단 **analytics는 가능하면 이벤트 핸들러에서**.

### 3.3 규칙 — `useEffect`는 hook 안에 가둔다
컴포넌트에서 `useEffect`를 직접 호출하지 않는다. 정당한 케이스도 **`src/hooks/`에 의도가 드러나는 이름의 훅을 만들고 그 훅 안에서만 사용**.

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
- [ ] effect가 컴포넌트 본문에 노출되어 있다면 `useXxx` 훅으로 캡슐화했는가?

### 3.5 ESLint (권장 도입)
- `eslint-plugin-react-hooks` (기본)
- `eslint-plugin-react-you-might-not-need-an-effect` — 안티패턴 자동 검출

---

## 4. TanStack Query — 베스트 프랙티스

서버에서 오는 모든 데이터는 TanStack Query를 통과한다. `fetch` + `useState` 조합 금지.

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
// src/hooks/useCandidateDetail.ts
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
| ops opportunity 라벨링 | — | opsOpportunity.companies | — |
| 로그아웃 | — | — | `queryClient.clear()` |

공용 헬퍼는 `src/lib/queryInvalidation.ts`(또는 도메인 모듈)에 모은다. 예: 기존 `invalidateBookmarkRelatedQueries(qc, userId)`. mutation 신설 시 도메인 헬퍼가 있으면 헬퍼를 부르고, 없으면 헬퍼부터 만든다.

### 4.5 ⭐ staleTime Policy

스칼라 마법숫자를 흩뿌리지 않는다. 도메인별 staleTime 결정을 표로 유지한다.

| 쿼리 도메인 | staleTime | gcTime | 근거 |
|---|---|---|---|
| candidate.detail | 60s | 10min | 상세 페이지 진입 시 fresh, mutation이 invalidate |
| candidate.bookmark | 30s | 10min | 토글 빈도 높음 |
| bookmarkFolders.byUser | 5min | 30min | 변경 적음, mutation이 invalidate |
| run.detail / run.results | 30s | 10min | 폴링/롱폴링 결과 반영 필요 |
| match.workspace / match.candidates | 60s | 10min | 워크스페이스 전환 시 fresh |
| opsOpportunity.* | 60s | 10min | 어드민 화면, 자주 갱신 |
| searchHistory.byUser | 5min | 30min | 변경 적음 |
| connections.count | 5min | 30min | 거의 안 변함 |
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
    if (ctx?.prev) qc.setQueryData(queryKeys.candidate.detail(vars.candidId), ctx.prev);
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
- `prefetchQuery`는 staleTime 이내면 네트워크 요청을 건너뛴다 — 비용 거의 없음.

### 4.8 모바일 추가 고려
- 모바일에서 `refetchOnReconnect: true` 활성화 검토 (네트워크 자주 끊김).
- 무한 스크롤은 `useInfiniteQuery` + cursor (`src/lib/server/cursor.ts`).

### 4.9 절대 하지 말 것
- 컴포넌트 안에서 `fetch` 직접 호출 → API route + Query 훅으로
- `useEffect`로 `data` → `useState` 복사 (3.1-A 안티패턴)
- queryKey에 객체를 통째로 넣기 → 직렬화 비결정성, 원시값 위주로 구성
- 같은 리소스에 factory 없이 다른 queryKey 사용 → §4.3

문서: [Query Invalidation](https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation), [Invalidations from Mutations](https://tanstack.com/query/v5/docs/react/guides/invalidations-from-mutations)

---

## 5. Zustand — 베스트 프랙티스

Zustand는 **순수 클라이언트 UI 상태**만 담당. 서버에서 온 데이터를 Zustand에 복제하지 않는다.

### 5.1 무엇을 Zustand에 넣고, 무엇을 넣지 않는가
| 넣어야 함 | 넣으면 안 됨 |
|---|---|
| 사용자 설정 (뷰 타입, 필터 정렬 순서) | 후보 목록, 폴더 목록 (서버 데이터) |
| 모달 open/close | 모달 안의 폼 값 (`useState`로 충분) |
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

적용 후보: `CareerVoiceInputLevelFill.tsx`, `CareerCallScreen.tsx`, STT 표시 컴포넌트, 진행률 바.

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
- `filter().map()` 체이닝 → 단일 `reduce`/`for` 루프로 결합 (큰 배열일 때).
- 배열 비교 전 `length` 먼저 체크.
- RegExp 생성은 루프 밖에서.
- 불변 정렬은 `toSorted()` (Node 20+, 우리 빌드 환경 OK).
- 함수에서 빠르게 early return.

적용 후보: `searchEvidence.ts`, `searchParallelLimit.ts`, 후보 매칭/필터링 코드.

### 6.7 정적 JSX 추출
매 렌더마다 같은 JSX를 만들지 않는다.

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
- 컴포넌트 본문에서 `useQuery`/`useMutation`/`useEffect`를 직접 호출하면 리뷰에서 훅 분리 요청.
- 훅 시그니처는 **명시적 입력 → 명시적 출력**. 인자가 5개 넘으면 옵션 객체.
- 훅이 query factory를 export하면 (§4.3) prefetch에 재사용 가능.

---

## 8. 신규 화면 작성 체크리스트

1. **반응형부터 설계** — mobile-first Tailwind, `svh` 사용 (§2.3).
2. **타입** — `any` 금지 (§0.1). Supabase는 `Database` 제네릭.
3. **데이터** — `src/app/api/...`에 route + `src/hooks/use<Entity>.ts` 훅 + `queryOptions` factory (§4.3).
4. **무효화** — 신규 mutation은 invalidation contract 표(§4.4)에 한 줄 추가.
5. **staleTime** — staleTime policy 표(§4.5)에 한 줄 추가.
6. **클라이언트 상태** — 페이지 내부면 `useState`, 페이지 간 공유면 Zustand. 서버 데이터 복제 금지.
7. **부수효과** — `useEffect` 작성 전 §3.1 안티패턴 7개 재확인, 정당하면 `src/hooks/`에 캡슐화.
8. **컬러/spacing** — 토큰만. 새 색은 `tailwind.config.js`에 추가.
9. **인라인 style 없음** (§0.3), **styled-jsx 없음** (§0.5).
10. **prefetch** — hover/focus에서 route + query prefetch (§4.7) 필요 여부 검토.
11. **a11y** — focus ring 유지, 탭 타깃 44px+, `aria-*` 누락 없음.
12. **모바일 게이트** — `useIsMobile`/`mobileBlocker` 영향 범위 확인 후 라우트 단계적 해제.

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
| 컴포넌트 본문의 `useEffect` | 의도 흐려짐, 재사용 불가 | `src/hooks/`에 캡슐화 (§3.3) |
| `fetch` + `useState`로 서버 데이터 | 캐시·중복제거·에러 없음 | TanStack Query (§4) |
| 수동 낙관적 업데이트 | 롤백 누락 | `useMutation` `onMutate`/`onError` (§4.6) |
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
| 컬러 hex 리터럴 직접 사용 | 토큰 우회 | `tailwind.config.js` 토큰 (§1.3) |
| Radix primitive 직접 import | wrapper 우회 | `src/components/ui/` (§1.5) |

---

## 10. 참고 문서

### 공식
- [react.dev — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [react.dev — Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects)
- [react.dev — Escape Hatches](https://react.dev/learn/escape-hatches)
- [TanStack Query — Query Invalidation](https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation)
- [TanStack Query — Invalidations from Mutations](https://tanstack.com/query/v5/docs/react/guides/invalidations-from-mutations)
- [TanStack Query — `queryOptions` API](https://tanstack.com/query/v5/docs/framework/react/reference/queryOptions)
- [TanStack Query — QueryClient API](https://tanstack.com/query/v5/docs/reference/QueryClient)
- [Zustand — Slices Pattern](https://zustand.docs.pmnd.rs/learn/guides/slices-pattern)
- [Zustand GitHub](https://github.com/pmndrs/zustand)
- [Tailwind CSS — Dynamic Viewport Units](https://tailwindcss.com/docs/height) (`h-svh`, `h-lvh`, `h-dvh`)
- [web.dev — The large, small, and dynamic viewport units](https://web.dev/blog/viewport-units)

### 도구
- [eslint-plugin-react-you-might-not-need-an-effect](https://www.npmjs.com/package/eslint-plugin-react-you-might-not-need-an-effect)
