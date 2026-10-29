# FRONTEND.md

Harper 프론트엔드의 디자인 시스템, 상태 관리, 성능 원칙, 그리고
**`useEffect`를 의도에 맞게 사용하는 기준**을 정리한 문서. 새 기능을 추가하거나
모바일을 지원하는 모든 변경은 이 문서를 따른다.

> 마지막 전체 저장소 대조: **2026-07-30**
> 부분 개정: **2026-10-21** — 반응형·상태 관리·로딩 기준. 전체 구현 재검증을 뜻하지 않는다.
>
> 이 문서의 MUST 규칙은 **신규 코드와 PR에서 수정한 코드**에 적용한다. 기존
> 레거시는 관련 영역을 수정할 때 함께 줄이되, PR 범위 밖의 전면 정리를 요구하지
> 않는다. 현재 상태를 설명하는 표와 파일 목록은 코드가 바뀌면 함께 갱신한다.

> **두 가지 절대 원칙**
> 1. **`useEffect`는 외부 시스템 동기화에 사용한다.** 파생값 계산, 이벤트 처리,
>    서버 데이터 패칭을 effect로 우회하지 않는다.
> 2. **상태 책임을 깨지 않는다.** 브라우저에서 조회·갱신하는 서버 상태 →
>    TanStack Query, 편집 초안·일시적 UI 상태 → 로컬 state를 기본으로 한다.
>    공유 UI 상태는 수명·변경 빈도·구독 범위에 따라 props, Context, Zustand를
>    선택한다. 링크·뒤로 가기에 보존할 탭·필터·선택은 URL을 우선한다.

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

### 0.4 viewport 높이는 실제 화면 동작에 맞춘다

페이지 최소 높이는 `svh`를 기본으로 검토하고, 현재 보이는 높이에 맞춰 채워야 하면
`dvh`를 선택한다. `100vh`를 기본값으로 사용하지 않는다. 자세한 기준은 §2.3.

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

반응형 레이아웃은 Tailwind breakpoint를 우선한다. 모바일 접근 차단은 명시적인
제품 요구가 있을 때만 둔다. 라우트별 완성도는 고정 표 대신 변경한 화면에서 확인한다.

### 2.1 현재 모바일 인프라
- 기본 도구는 Tailwind의 `sm:`·`md:`·`lg:` 등이다. 너비·배치·여백·표시 여부에 사용한다.
- `src/hooks/useMediaQuery.ts`는 `useSyncExternalStore` 기반이다. 실제 동작이나
  마운트 수명을 JS에서 바꿔야 할 때 사용한다 (§2.4).
- `src/hooks/useIsMobile.ts`는 기존 호출처를 위한 re-export다. 단순 레이아웃에
  이 훅을 추가하는 것을 기본 패턴으로 삼지 않는다.

### 2.2 Breakpoint 컨벤션 (Mobile-first)

| prefix | min-width | 용도 |
|---|---|---|
| (no prefix) | 0 | 모바일 (default) |
| `sm:` | 640px | 큰 모바일 |
| `md:` | 768px | 태블릿 |
| `lg:` | 1024px | 데스크탑 |
| `xl:` / `2xl:` | 1280/1536px | 와이드 |

작은 화면 스타일을 prefix 없이 먼저, `md:`/`lg:`로 넓은 화면을 보강한다.
`hidden md:block`, `md:hidden`은 일반적인 반응형 표현이다. `md:`는 기기 종류가 아니라
너비 조건이다. 부모 너비에 반응하는 재사용 UI는 container query도 검토한다.

### 2.3 viewport 유닛 선택

| 유닛 | 의미 | 언제 쓰나 |
|---|---|---|
| `svh` (small) | 모바일 브라우저 UI가 *전부 보일 때*의 viewport | **기본값** — 브라우저 UI가 보일 때의 높이를 기준으로 안정적인 최소 높이 |
| `lvh` (large) | UI가 *모두 숨겨졌을 때*의 viewport | 히어로 풀블리드처럼 의도적으로 크게 차고 싶을 때만 |
| `dvh` (dynamic) | UI 상태에 따라 *실시간 변동* | 현재 화면 높이를 채워야 하는 앱 shell 등 — 높이 변화와 스크롤 확인 |
| `vh` | 레거시 | 기본 선택으로 사용하지 않음. 모바일에서 보이는 높이보다 클 수 있음 |

**Tailwind v4 유틸리티 (현재 빌드)**:
- `h-svh`, `min-h-svh`, `max-h-svh`
- `h-lvh`, `min-h-lvh`
- `h-dvh`, `min-h-dvh`
- `w-svw` 등 가로 변형도 존재 (가로는 거의 필요 없음)

**규칙**:
- 풀스크린/모달/sticky 컨테이너 → 공통 컴포넌트의 높이·스크롤 계약을 따라 `svh`/`dvh` 선택
- 페이지 컨테이너 → `min-h-svh` (콘텐츠가 더 길면 자연 확장)
- 안전 영역과 결합: `min-h-svh pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]`
- 기존 `h-screen` / `min-h-screen` / `100vh`는 해당 화면을 수정할 때 실제 동작을 확인해 선택
- `svh`도 콘텐츠·패딩·키보드에 의한 overflow를 막아주지는 않는다. 스크롤 영역과 safe area를 확인

```tsx
// ❌
<main className="h-screen" />
<div style={{ height: "100vh" }} />

// ✅
<main className="h-svh" />
<div className="min-h-svh pb-[env(safe-area-inset-bottom)]" />
```

### 2.4 레이아웃은 Tailwind, 동작 분기만 JavaScript

배치·너비·간격·표시 여부는 Tailwind로 표현한다. 같은 UI를 `isMobile` 조건으로
두 번 구현하기보다 같은 DOM의 레이아웃을 바꾼다.

```tsx
<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-6">
  <main className="min-w-0">...</main>
  <aside className="hidden md:block">...</aside>
</div>
```

CSS로 해결되지 않는 위젯 동작이나 dialog/drawer 마운트 선택에만 기존
`src/hooks/useMediaQuery.ts`를 사용한다. 공통 컴포넌트가 이미 제공하는 분기는 재사용한다.

- CSS로 숨겨도 컴포넌트의 요청·구독은 실행될 수 있다. 무거운 기능을 중복 마운트하지 않는다.
- portal은 부모의 `hidden`으로 숨겨지지 않는다. dialog를 소유한 반응형 대안은 활성 변형만 마운트한다.
- 현재 훅의 서버 snapshot은 `false`다. hydration 이후 분기가 바뀔 수 있으므로
  훅을 사용했다는 이유만으로 초기 레이아웃이 안정적이라고 가정하지 않는다.
- viewport listener·breakpoint 목록을 기능마다 별도로 만들지 않는다.

스크롤 방향에 따른 헤더 동작은 기존 `src/hooks/useHideOnScroll.ts`를 재사용한다.

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

### 2.7 변경한 화면의 반응형 검증

라우트별 모바일 상태 표는 관리하지 않는다. 변경한 화면을 좁은 화면·넓은 화면과
관련 breakpoint 전후에서 확인한다. overflow, 주요 조작, 키보드 포커스를 보고,
입력·고정 영역을 변경했다면 모바일 키보드와 safe area도 확인한다.
미검증 범위나 실제 제약은 해당 작업에 기록한다.

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

#### B. 초기화는 편집 대상과 초안의 수명에 맞춘다
```tsx
// 피할 것: 같은 대상의 재조회가 미저장 입력까지 덮어씀
useEffect(() => { setDraft(initialValue); }, [initialValue]);

// 편집 대상이 바뀌고 전체 초기화가 맞을 때만 key 사용
<Editor key={candidateId} initialValue={initialValue} />
```

서버 값으로 편집 초안을 초기화하는 것은 정상이다. 초안은 별도 수명을 가지며
background refetch나 늦은 저장 응답이 새 입력을 덮어쓰지 않게 한다. 같은 대상의
일부 값만 동기화해야 하면 갱신 조건을 정하고, 무조건 재마운트하지 않는다.

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

#### E. 외부 구독은 소유한 수명에서 등록·정리

store 초기화와 외부 구독을 구분한다. 외부 구독은 해당 Provider나 hook의 effect에서
등록하고 cleanup할 수 있다. 재마운트·Strict Mode에서도 중복 구독이 남지 않아야 한다.
일반적인 `create()` store는 생성 호출 시 초기화되며 첫 selector가 자동 초기화하는 것이 아니다 (§5.5).

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

### 3.4 ESLint 집행 상태
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

mutation은 영향을 미치는 query key와 갱신 방식을 코드에서 명확히 한다. 아래는 주요
도메인의 참고 표이며 실제 정책은 해당 mutation이 소유한다. 정책이 달라진 항목은
갱신하되, 모든 신규 mutation을 이 중앙 표에 등록할 필요는 없다.

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

공용 헬퍼는 `src/lib/queryInvalidation.ts`(또는 도메인 모듈)에 모은다. 예: 기존 `invalidateBookmarkRelatedQueries(qc, userId)`. 기존 도메인 헬퍼를 우선 재사용하고, 반복되거나 복잡한 정책일 때 새 헬퍼로 분리한다.

### 4.5 ⭐ staleTime Policy

공통 기본값은 `Provider.tsx`, 도메인별 예외는 query options가 소유한다. 아래 표는
정책을 이해하기 위한 참고다. `staleTime`은 fresh로 취급하는 시간이며 polling 주기가
아니다. `gcTime`은 비활성 캐시의 보존 시간이다. 외부 변경을 반영하려면 focus/reconnect,
polling, realtime 등 실제 갱신 계기를 함께 선택한다.

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

새 설정은 데이터의 변경 주체와 허용 가능한 지연에 맞춰 정한다. 모든 값을 중앙 표에
중복 등록하기보다 query 정의에서 정책과 필요한 이유를 확인할 수 있게 한다.

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
- invalidate는 `onSettled` 또는 `onSuccess`에서 필요한 조회에 적용한다.
  재조회 자체도 실패할 수 있으므로 호출만으로 일관성이 보장되는 것은 아니다.
- 서버가 확정한 변경값을 반환하면 `setQueryData`/`setQueriesData`로 바로 반영할 수 있다.
  복잡한 목록 소속·정렬·집계는 서버 판단을 복제하기보다 필요한 범위를 재조회한다.
- optimistic UI는 mutation `variables`로 표시할 수도 있다. 캐시를 수정했다면 실패 복구와
  진행 중인 조회의 덮어쓰기를 처리하고, 동시 변경을 과거 전체 snapshot으로 지우지 않는다.
- **저장 확정과 재조회 완료를 구분한다.** lifecycle callback이 반환한 Promise를 Query가
  기다리므로 `return invalidateQueries(...)`/`await`는 mutation의 pending을 연장한다.
  다음 행동에 최신 결과가 필요하면 해당 조회만 기다리고, 확정 결과를 이미 반영했다면
  나머지는 background 재검증으로 분리할 수 있다. 단순히 `await`만 없애지 않는다.
- 저장 성공 뒤 재조회 실패를 저장 자체의 실패로 취급해 중복 실행을 유도하지 않는다.
  자동 저장에서는 늦은 응답이 최신 입력·저장값을 덮어쓰지 않도록 순서와 충돌을 처리한다.
- 권한·비용·상태 전이·중복 실행 방지는 서버가 확정한다. 버튼 비활성화나 optimistic UI로
  대신하지 않는다. 후속 작업을 분리할 때는 안정적인 서버 인계·복구와 결과 반영 계약이 필요하다.

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
- 같은 서버 데이터를 별도 캐시로 복사해 effect로 계속 맞추기. 편집 초안처럼 독립된 수명은 §3.1-B
- queryKey에 함수·class instance·순환 참조 등 JSON 비직렬화 값을 넣기
  → JSON 직렬화 가능한 원시값/정규화된 객체 사용
- queryFn이 의존하는 변수를 queryKey에서 누락하기
  → 캐시를 구분하는 모든 입력을 factory가 소유
- 같은 리소스에 factory 없이 다른 queryKey 사용 → §4.3

### 4.10 로딩과 오류의 범위

- 패널·모달·탭은 즉시 열고, 아직 없는 데이터 영역에만 공통 Skeleton을 표시한다.
  기존 화면·입력·스크롤을 재조회 때문에 통째로 교체하지 않는다.
- `isPending`은 비활성 query에서도 참일 수 있다. `isLoading`은 첫 fetching,
  `isFetching`은 background refetch도 포함하므로 각 화면의 데이터 유무와 함께 판단한다.
- 최초 조회 실패, 기존 데이터가 있는 갱신 실패, 빈 결과를 구분한다. 계정·workspace가
  바뀔 때는 이전 범위의 민감한 데이터를 placeholder로 재사용하지 않는다.
- mutation 진행 표시는 관련 버튼·행·폼에 둔다. 같은 대상의 충돌 작업은 막되,
  독립적인 다른 작업까지 전역 pending으로 막지 않는다. 실패 시 입력과 재시도 수단을 유지한다.
- 성능은 클릭 반응, 서버 변경 확정, 화면 반영 시간을 구분해 본다. Query나 훅을
  사용한다는 사실만으로 빨라졌다고 판단하지 않는다.

문서: [Query Invalidation](https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation), [Invalidations from Mutations](https://tanstack.com/query/v5/docs/react/guides/invalidations-from-mutations)

---

## 5. 클라이언트 상태와 Zustand — 베스트 프랙티스

Zustand는 페이지 경계를 넘어 유지하거나 여러 기능 영역에서 접근하는
**순수 클라이언트 UI 상태**를 담당한다. 한 페이지의 형제 컴포넌트만 공유하는
상태와 orchestration은 page-scoped context/domain hook으로 제한할 수 있다.
페이지 안/밖만으로 도구를 강제하지 않고 수명·변경 빈도·구독 범위로 선택한다.
브라우저에서 공유·재조회하는 서버 값은 TanStack Query를 원본으로 두고, 독립적인 편집
초안이나 진행 중 스트림 등은 소유권과 서버 확정값에 합쳐지는 시점을 구분한다.

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

다중 필드를 새 객체·배열로 묶는 selector에는 **`useShallow` 또는 안정적인 반환값**을 사용한다.

```ts
import { useShallow } from "zustand/react/shallow";

const { viewType, sortKey } = useSettingsStore(
  useShallow((s) => ({ viewType: s.viewType, sortKey: s.sortKey })),
);
```

매번 새 객체를 반환하는 selector는 불필요한 갱신이나 무한 리렌더를 일으킬 수 있다.
이미 store의 안정적인 객체를 반환하는 selector에 무조건 `useShallow`를 추가하지 않는다.

액션도 필요한 항목만 selector로 구독한다.

### 5.4 slice 패턴 (스토어가 커질 때)
단일 store에 여러 slice를 합성. **미들웨어는 합쳐진 store에 적용**, slice 내부에 적용하지 않는다.

크로스-slice 호출은 `get()`으로.

### 5.5 store 초기화 위치
- 일반적인 `create()` store는 생성 호출 시 초기화된다. 영역별 store는 해당 Provider 수명 동안
  인스턴스를 안정적으로 유지한다. render 중 외부 구독을 시작하지 않는다.
- 외부 구독은 수명을 소유한 Provider나 hook의 effect에서 등록·cleanup한다. `init()`을
  사용한다면 중복 호출과 정리 계약을 명확히 한다. Provider에 둔다고 정확히 한 번이 보장되지는 않는다.
- 서버 렌더링에서 사용자별 가변 store·QueryClient를 요청 간 전역 공유하지 않는다.

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

### 6.2 ⭐ Hot Render Prevention (구독 범위와 표시 주기)

빈번한 값은 상태의 위치와 구독 범위에 따라 렌더 비용이 달라진다. 표시할 값은 state나
구독으로 반응성을 유지하고, 렌더에 필요 없는 중간값만 ref에 둔다. 단계만
표시하는 UI라면 단계가 바뀔 때만 state를 갱신할 수 있다. 연속 시각 효과는 CSS·Motion도 검토한다.

음성 레벨, STT 진행률, 비디오 `currentTime`처럼 고빈도 값이 있는 화면은 React
Profiler로 리렌더 빈도를 확인한 뒤 이 패턴을 적용한다.

### 6.3 lazy 초기 state

비싼 초기 계산은 `useState(() => computeExpensive())`로 전달해 일반 리렌더마다
재계산하지 않게 한다. initializer는 반복 호출돼도 안전한 순수 함수로 작성한다.
기존 `Provider.tsx`의 `QueryClient` 초기화도 이 패턴을 사용한다.

### 6.4 리렌더 최적화 도구
먼저 React Profiler로 병목을 확인한다. 아래 도구를 기본 습관처럼 모든 값에
적용하지 않는다.

- 콜백에서만 쓰는 값은 `useRef`로 읽기 지연 → 컴포넌트가 그 값을 구독하지 않게 만든다.
- 무거운 자식은 `React.memo`로 분리.
- 파생 boolean을 구독 (`items.length > 0` vs `items` 전체).
- 긴급하지 않은 업데이트(필터/검색 결과 갱신)는 `startTransition`.
- 메모이즈 selector — 리스트 가공은 `useMemo`로.

### 6.5 조건부 렌더는 삼항 또는 명시적 boolean

`{count && <Badge />}`는 count가 0일 때 숫자 0을 렌더한다.
`{count > 0 ? <Badge /> : null}` 또는 `{Boolean(count) && <Badge />}`를 사용한다.

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

### 6.8 SVG / 콘텐츠 가시성
- SVG 정밀도는 좌표계·표시 크기·시각 품질을 확인해 조절한다. 소수점 자릿수를 일괄 강제하지 않는다.
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
- **한 훅 = 의미 있는 책임**. 한 기능을 위해 여러 query를 조합할 수 있다. 단순 wrapper를 의무화하지 않는다.
- `useQuery`/`useMutation`은 필요한 컴포넌트나 도메인 hook 가까이에서 호출할 수 있다.
  반복되거나 복잡한 orchestration을 공유할 때 도메인 hook/context로 분리한다.
- custom hook은 로직을 재사용하며 내부 로컬 state를 호출 간 공유하지는 않는다.
- `useEffect`는 §3의 배치 기준을 따른다.
- 훅 시그니처는 **명시적 입력 → 명시적 출력**. 인자가 5개 넘으면 옵션 객체.
- 훅이 query factory를 export하면 (§4.3) prefetch에 재사용 가능.

---

## 8. 신규 화면 작성 체크리스트

1. **반응형부터 설계** — mobile-first Tailwind, 화면 동작에 맞는 `svh`/`dvh` 선택 (§2.3).
2. **타입** — `any` 금지 (§0.1). Supabase는 `Database` 제네릭.
3. **데이터** — client remote state는 Query로 관리하고 재사용되는 정의는
   `queryOptions`로 공유한다. 단순 wrapper hook·service 계층을 의무화하지 않는다.
   API route는 실제 서버 경계가 필요할 때 해당 라우터 구조에 맞춰 추가한다 (§4.3).
4. **무효화** — 해당 mutation의 캐시 반영·재조회 범위와 대기 여부 확인 (§4.4–4.6).
5. **staleTime** — 변경 주체·허용 지연·실제 갱신 계기에 맞는 정책 확인 (§4.5).
6. **클라이언트 상태** — 로컬 state를 기본으로, 공유가 필요하면 수명·구독 범위에 따라
   Context/Zustand를 선택한다. URL 상태와 편집 초안을 서버 캐시와 구분한다.
7. **부수효과** — `useEffect` 작성 전 §3.1 안티패턴을 확인하고, 복잡하거나
   재사용되는 동기화는 `src/hooks/`에 캡슐화.
8. **컬러/spacing** — 토큰만. 새 토큰은 `src/globals.css`의 `@theme`에 추가.
9. **인라인 style은 동적 값에 사용** (§0.3), **신규 styled-jsx 없음** (§0.5).
10. **prefetch** — hover/focus에서 route + query prefetch (§4.7) 필요 여부 검토.
11. **a11y** — focus ring 유지, 탭 타깃 44px+, `aria-*` 누락 없음.
12. **반응형** — Tailwind breakpoint를 우선하고, JS 분기는 실제 동작·마운트 변경이
    필요한 경우인지 확인한다. 변경한 화면을 §2.7 기준으로 확인한다.
13. **상태 UI** — loading, empty, error, retry 상태를 정의하고 정상 상태와 같은
    반응형·접근성 기준으로 검증.
14. **검증** — 변경한 경로에 맞는 짧은 타입·lint·테스트·화면 확인을 수행한다.
    전체 저장소 lint·전체 테스트를 기본 절차로 요구하지 않는다. 문서만 바꾸면 링크·참조·예제를 확인한다.

---

## 9. 참고 문서

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


## 2026-10-23 변경 응답 지연 기준

- 버튼 pending은 승인된 상태 변경과 필요한 후속 작업의 **영구 저장**까지다. Slack 전송, 대화 기록 생성, 후속 LLM 실행, 큐 발행, 관련 화면의 전체 재조회 완료를 무조건 연결하지 않는다. 메일 전달 자체가 동작의 완료 조건인 수락·인터뷰 요청은 별도로 유지한다.
- 브라우저 custom hook은 요청·캐시 갱신·오류 표시를 공유한다. 훅에 저장된 권한 결과는 서버 권한 검증을 대체하지 않는다.
- 서버의 반복 조회는 `withOrgRequestScope` / `memoOrgRequest`로 같은 요청 안에서 재사용한다. 사용자·Workspace·Role·permission을 구분한다. 현재 적용 대상은 후보 단계 변경과 회사 Intro 처리이며, 이 경로는 팀원 권한·Role 설정·사용자 프로필을 변경하지 않는다. 이 데이터를 수정하는 경로에 무효화 설계 없이 적용하지 않는다.
- 후보 단계 변경(`/api/org/stage`)과 회사 Intro(`/api/org/company-intro`)는 `{ cachePermissions: true }`로 서버 권한 캐시를 사용한다. 서버에서 인증된 사용자·Workspace·내부 접근 여부별로 DB에서 확인한 권한·팀 접근 범위·Workspace 사용 가능 여부를 **최대 30분** 재사용한다. Next Data Cache를 사용하며 새 Redis·DB 테이블을 만들지 않는다. `:00`/`:30` 경계 이후 첫 요청은 새 키로 DB 확인을 기다린다. 단순 TTL의 stale-while-revalidate로 만료 권한을 한 번 더 허용하지 않는다. 실패한 조회는 캐시하지 않는다. 로그인 시 미리 저장하거나 타이머로 계속 조회하는 방식은 아니다.
- `/api/org/membership`의 탈퇴·팀원 제거·권한 변경, `/api/org/teams`의 팀/팀원 접근 범위 변경 성공 후 해당 Workspace 태그를 `{ expire: 0 }`으로 즉시 무효화한다. 다음 요청은 최신 권한을 읽는다. 직접 DB·별도 운영 경로에서 변경하면 최대 30분 반영 지연을 허용한다. 새로운 권한 변경 API도 이 무효화를 연결해야 한다.
- 팀원·Workspace·연동 관리 권한은 캐시 사용 중인 요청에서도 최신 DB로 확인한다. 결제 API, 백그라운드 실행, 온보딩 예외, 수신 팀 범위가 제한된 Slack reader에는 이 캐시를 적용하지 않는다. 인증 자체와 현재 Role 정보·후보자 공유 자격·상태·잔액 및 차감·멱등성 검증도 유지한다. 클라이언트의 `alreadyAuthorized` 값은 신뢰하지 않는다.
- 회사의 후보 수락·종료 소식은 기존 `enqueueCompanyUpdate`에 사실을 저장한다. 회사 메시지 작성·Slack 전달은 기존 company-side LLM과 durable delivery가 담당한다. 같은 결정으로 별도 web-action을 중복 등록하지 않는다. 이전 고정 Slack 알림과 내부 운영 채널 직접 전송은 이 결정 경로에서 제거했다.
- `after`는 이미 저장된 작업의 큐 발행에만 사용한다. 저장 전에 성공을 반환하거나 bare `void promise`로 필수 작업을 버리지 않는다. 프로세스 종료·발행 실패는 기존 pending/retry dispatcher가 복구한다.
- 수정 API 성공 후 캐시에 확정된 결과를 먼저 반영하고 관련 범위만 재조회한다. `onSuccess: () => invalidateQueries(...)`도 Promise를 반환하므로 mutation pending을 연장한다. 단, 최신 조회 결과가 다음 행동에 필수인 편집기·권한 변경·결제 화면은 이유를 확인한 뒤 유지한다.
- 계측은 서버 처리, 응답 전 후속 작업, 브라우저 캐시 반영을 분리한다. 중첩 span을 합산하지 않는다. 토큰·개인정보·메일 본문은 로그에 남기지 않는다. 성능 추정과 실제 재측정 결과를 구분한다.

Role 온보딩의 질문·시작 탭·채팅은 `useRoleStart.ts`의 query options와 캐시 갱신 계약을 공유한다. 답변 응답에는 저장된 session·Role 화면 필드·충돌 안내·보상 질문 여부를 함께 담고, 다음 질문을 보여 주기 위해 GET 완료를 기다리지 않는다. 응답 전에 시작한 GET은 취소하고 더 오래된 revision으로 되돌리지 않는다. 서버는 질문 처리와 polling에서 회사·Slack·전체 Role 생성 정보를 로드하지 않고 현재 권한과 해당 Role만 읽는다. 이 권한 확인은 요청 간 캐시하지 않으며, 같은 POST 안의 읽기만 재사용한다. 보상 변경은 DB가 반환한 저장값으로 응답을 갱신한다.

질문 답변·다음 질문 상태·채팅 메시지는 한 SQL 작업으로 저장한다. LLM 입력용 전체 context 조회와 답변 정제는 저장된 답변 이력을 바탕으로 응답 뒤에 진행하고, 중단되면 기존 stalled/retry 경로에서 이어 간다. Brief 준비는 서버의 review 전환·정제 완료·수정에서 시작한다. Brief 컴포넌트의 mount나 이전→다음 이동이 prewarm mutation이나 화면 전체 pending을 만들지 않는다. 마지막 주관식 반영과 새 질문 생성처럼 실제로 필요한 작업의 대기는 유지한다. `Server-Timing`은 POST 서버 처리 시간이며 브라우저 왕복·렌더링 시간을 포함하지 않는다.

이번 코드 점검에서는 Role 목록·회사 사용자 갱신을 요청 단위로 공유하고, 후보 작업의 권한은 최대 30분 공유하며, 단계 변경/Intro의 큐 발행을 응답 뒤로 옮겼다. 회사 결정의 Slack 작업은 기존 회사 이벤트로 저장하며 발송을 기다리지 않는다. 상태 태그 변경·진행 이력·이메일 예약 정리는 아직 응답 전에 완료한다. DB 왕복을 트랜잭션 하나로 묶는 변경은 포함하지 않았다. 권한 캐시 추가분은 격리 테스트로 확인했으며 실제 후보 수락·거절의 소요 시간을 다시 측정하거나 배포하지 않았다.
