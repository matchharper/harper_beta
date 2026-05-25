# Harper Candidate Design System — Renewal v1

> **작성**: Design (2026-05-21) · **최종 업데이트**: 2026-05-22
> 

> **상태**: ✅ 구현 완료 — `src/renewal/` 경로에서 확인 가능
> 

> **컴포넌트 가이드**: [https://harper-components.vercel.app](https://harper-components.vercel.app)
> 

---

# 왜 리뉴얼했나

기존 Harper candidate 화면은 기능은 작동했지만 디자인 언어가 없었어요.

- 컬러: `beige` + `brightnavy` + `black` 3개 시스템이 페이지마다 뒤섞임
- 폰트: `hedvig` / `geist` / `inter` / `garamond` 4종이 규칙 없이 혼용
- 버튼: `BeigeButton` / `CareerPrimitives` / `btn-ink` 3개가 같은 역할 중복
- 수치: `text-[54px]`, `text-[34px]`, `border-beige900/15` 등 하드코딩

이번 리뉴얼은 **코드를 바꾸지 않고 Harper beige 아이덴티티를 유지하면서**, [Claude.ai](http://Claude.ai) 디자인 시스템을 참고해 토큰 체계를 구축했어요.

---

# 1. 컬러 토큰 시스템

## Surface Hierarchy (5단계 깊이)

| 토큰 | 값 | 사용처 |
| --- | --- | --- |
| `--surface-base` | `#fdf6ee` | 페이지 배경 |
| `--surface-raised` | `#fdfaf3` | 패널, 카드 |
| `--surface-sunken` | `#f7f0e8` | 인풋, 내부 컨테이너 |
| `--surface-hover` | `#f2e7dc` | hover 상태 |
| `--surface-active` | `rgba(46,23,6, 0.08)` | 선택된 항목 |

## Text Tokens (opacity 계층)

| 토큰 | 값 | 사용처 |
| --- | --- | --- |
| `--text-primary` | `rgba(46,23,6, 0.90)` | 제목, 주요 텍스트 |
| `--text-secondary` | `rgba(46,23,6, 0.65)` | 설명, 레이블 |
| `--text-tertiary` | `rgba(46,23,6, 0.45)` | 힌트, 보조 |
| `--text-placeholder` | `rgba(46,23,6, 0.30)` | 플레이스홀더 |
| `--text-disabled` | `rgba(46,23,6, 0.20)` | 비활성 |

## Fill Tokens

| 토큰 | 값 | 사용처 |
| --- | --- | --- |
| `--fill-primary` | `rgba(46,23,6, 0.90)` | 채워진 버튼, 강조 요소 |
| `--fill-secondary` | `rgba(46,23,6, 0.08)` | 탭 배경, subtle 영역 |
| `--fill-hover` | `rgba(46,23,6, 0.12)` | hover 피드백 |
| `--fill-tertiary` | `rgba(46,23,6, 0.04)` | 가장 연한 fill |

## Border Tokens

| 토큰 | 값 | 사용처 |
| --- | --- | --- |
| `--hairline` | `#e8dfd5` | 인풋 기본 border, 카드 경계 |
| `--hairline-soft` | `#ece5dc` | 섹션 내부 구분선 |
| `--stroke-light` | `rgba(46,23,6, 0.06)` | 패널 구분 |
| `--stroke-medium` | `rgba(46,23,6, 0.12)` | focus ring |
| `--stroke-strong` | `rgba(46,23,6, 0.20)` | 강조 border |

> **hairline vs stroke-light**: `--hairline`은 고정 hex — 어떤 surface 위에서도 항상 같은 색으로 보인다. `--stroke-light`(opacity 기반)은 배경에 따라 살짝 달라진다. **인풋·카드 border는 항상 `--hairline`을 쓸 것.**
> 

## Gradient Tokens

| 토큰 | 사용처 |
| --- | --- |
| `--grad-warm` | 랜딩 페이지 배경 |
| `--grad-honey` | 온보딩 배경 |
| `--grad-amber` | 온보딩 Done state 포인트 |
| `--grad-bronze` | CTA 강조 (예정) |

---

# 2. 타이포그래피 시스템

## 폰트 패밀리

| 역할 | 폰트 | Tailwind 클래스 |
| --- | --- | --- |
| **Display (editorial)** | Hedvig Letters Serif | `.type-display-*` |
| **Title / Body / Caption** | Geist | `.type-title-*` `.type-body-*` `.type-caption` |
| **한글 기본** | PretendardVariable (로컬) | `font-sans` |
| **한글 serif** | Noto Serif KR (fallback) | display 클래스 자동 적용 |

## Type Scale

| 클래스 | 크기 | 굵기 | Line Height | Letter Spacing | 용도 |
| --- | --- | --- | --- | --- | --- |
| `.type-display-xl` | 38px | 400 | 1.05 | -0.04em | 랜딩 H1 |
| `.type-display-lg` | 34px | 400 | 1.10 | -0.03em | 섹션 헤드 |
| `.type-display-md` | 28px | 400 | 1.15 | -0.02em | 서브섹션 |
| `.type-display-sm` | 22px | 400 | 1.20 | -0.02em | 카드 제목, 로그인 타이틀 |
| `.type-title-lg` | 18px | 500 | 1.40 | -0.01em | 섹션 intro |
| `.type-title-md` | 16px | 500 | 1.40 | — | 카드 타이틀 |
| `.type-title-sm` | 15px | 500 | 1.40 | — | 리스트 레이블 |
| `.type-body-md` | 14px | 400 | 1.55 | — | 기본 본문 |
| `.type-body-sm` | 13px | 400 | 1.55 | — | 보조 설명, footer |
| `.type-caption` | 12px | 500 | 1.40 | — | 배지, 캡션 |
| `.type-caption-upper` | 11px | 500 | 1.40 | +0.06em | 카테고리 태그, 대문자 레이블 |

**원칙**: Display는 항상 weight 400. Bold display는 Harper 톤과 맞지 않음

---

# 3. 컴포넌트

## Button

4단계 위계로 통합된 단일 버튼 primitive. `src/renewal/components/ui/Button.tsx`

```tsx
<Button variant="solid">저장하기</Button>       // 주요 CTA
<Button variant="secondary">임시저장</Button>   // 중간 위계 보조 CTA
<Button variant="outline">취소</Button>         // 3순위 액션
<Button variant="ghost">더보기</Button>         // 텍스트형 링크
```

| prop | 값 | 설명 |
| --- | --- | --- |
| `variant` | `solid` `secondary` `outline` `ghost` | 버튼 위계 |
| `shape` | `square` `rounded` `icon` | 모서리 형태 |
| `size` | `sm` `md` `lg` | 크기 |
| `icon` / `endIcon` | LucideIcon | 좌우 아이콘 |
| variant | 내부 매핑 | 사용처 |
| --- | --- | --- |
| `solid` | Reshaped `solid/primary` | 주요 CTA |
| `secondary` | Reshaped `faded/neutral` | 보조 CTA, 모달 취소 |
| `outline` | Reshaped `outline/neutral` | 3순위 액션 |
| `ghost` | Reshaped `ghost/neutral` | 텍스트형 링크 버튼 |

> **Reshaped 컬러 특이도 주의**: `RenewalLayout.tsx`에서 `html [data-rs-theme][data-rs-color-mode]` 선택자로 Reshaped 기본 파란색을 Harper 브랜드 컬러로 덮어씁니다. `html` 없이 쓰면 특이도가 밀려 파란 버튼이 됩니다.
> 

## CardButton

카드 형태의 인터랙티브 버튼. `src/renewal/components/ui/CardButton.tsx`

```tsx
<CardButton onClick={handleClick}>
  <div className="flex flex-col gap-1">
    <span className="type-title-sm">포지션 탐색하기</span>
    <span className="type-body-sm text-[var(--text-secondary)]">관심 있는 기회를 찾아보세요</span>
  </div>
</CardButton>
```

- `p-4`, `rounded-[var(--r-lg)]`, hairline 테두리
- 네이티브 `<button>` 기반 (Reshaped 미사용 — Reshaped의 내부 CSS가 padding을 덮어쓰는 문제 방지)

## ChoiceCard

선택/비선택 상태가 있는 카드형 버튼. `src/renewal/components/ui/ChoiceCard.tsx`

```tsx
<ChoiceCard selected={isSelected} onClick={() => setSelected(!isSelected)}>
  풀타임 합류
</ChoiceCard>
```

| 상태 | 배경 | 텍스트 | 테두리 |
| --- | --- | --- | --- |
| selected | `rgba(46,23,6,0.90)` 다크 브라운 | `#fdf6ee` 밝은 크림 | 없음 |
| unselected | 투명 | `--text-primary` | `--hairline` |
- 네이티브 `<button>` 기반, selected/unselected 동일한 `px-4 py-3` padding 보장

## TabButton

페이지 내 탭 전환 버튼. `src/renewal/components/ui/TabButton.tsx`

```tsx
<TabButton active={tab === "saved"} onClick={() => setTab("saved")}>
  저장됨
</TabButton>
```

## Badge

상태 태그 및 숫자 뱃지. `src/renewal/components/ui/Badge.tsx`

```tsx
<Badge variant="warm">New</Badge>
<Badge variant="primary">추천</Badge>
<Badge variant="outline">Review</Badge>
```

| variant | 배경 | 용도 |
| --- | --- | --- |
| `warm` | `--surface-hover` | 일반 상태 태그 |
| `primary` | `--fill-primary` | 강조 배지 |
| `outline` | 투명 + `--hairline` | 보조 레이블 |

**탭 숫자 뱃지 (On-dark)**: 탭 위에 얹는 숫자 카운터는 별도 인라인 스타일 적용

| 탭 상태 | 뱃지 배경 | 뱃지 텍스트 |
| --- | --- | --- |
| active (선택) | `#ffffff` 순백 | `rgba(46,23,6,0.90)` 브라운 |
| inactive | `rgba(46,23,6,0.90)` 브라운 | `#fdf6ee` 밝은 크림 |

## Input / Textarea

```tsx
<Input type="email" placeholder="email@example.com" value={email} onChange={...} />
```

- 기본 border: `--hairline` (고정 hex, surface 무관)
- focus: `ring-1 ring-[--stroke-medium]`

---

# 4. 파일 구조

```
src/
├── globals.css                      ← renewal 토큰 + 타이포 클래스 전역 등록
│
├── renewal/
│   ├── RenewalLayout.tsx            ← CSS 토큰 + Reshaped 주입 래퍼
│   ├── globals.css                  ← renewal 전용 스타일 (RenewalLayout과 동기)
│   └── components/
│       ├── ui/
│       │   ├── Button.tsx           ← 통합 버튼 (solid/secondary/outline/ghost)
│       │   ├── CardButton.tsx       ← 카드형 버튼 (네이티브 button)
│       │   ├── ChoiceCard.tsx       ← 선택형 카드 (네이티브 button)
│       │   ├── TabButton.tsx        ← 탭 버튼
│       │   ├── Badge.tsx            ← 상태 배지
│       │   ├── Input.tsx            ← 인풋
│       │   ├── Textarea.tsx         ← 텍스트에어리어
│       │   ├── FormField.tsx        ← 레이블 + 인풋 묶음
│       │   ├── Callout.tsx          ← 안내 박스
│       │   ├── SectionHeader.tsx    ← 섹션 헤더
│       │   ├── ProgressBar.tsx      ← 진행 바
│       │   └── ToggleButton.tsx     ← 토글
│       └── career/
│           └── CareerWorkspaceScreen.tsx  ← 워크스페이스 홈
│
└── components/career/
    └── CareerHistoryPanel.tsx       ← 포지션 탭 (renewal 디자인 적용)
```

> **원본 파일 보호**: `src/renewal/`이 샌드박스. 원본 라우트(`/career/history` 등)는 `src/globals.css`에 토큰을 전역 등록해 renewal 컴포넌트를 렌더링합니다.
> 

---

# 5. 미리보기 링크

| 페이지 | 로컬 URL |
| --- | --- |
| 컴포넌트 가이드 | [http://localhost:3000/renewal/components](http://localhost:3000/renewal/components) |
| 랜딩 | [http://localhost:3000/renewal/talent](http://localhost:3000/renewal/talent) |
| 로그인 | [http://localhost:3000/renewal/career_login](http://localhost:3000/renewal/career_login) |
| 온보딩 | [http://localhost:3000/renewal/career/onboarding](http://localhost:3000/renewal/career/onboarding) |
| 워크스페이스 | [http://localhost:3000/renewal/career/workspace](http://localhost:3000/renewal/career/workspace) |
| 포지션 탭 | [http://localhost:3000/career/history](http://localhost:3000/career/history) |

**배포된 컴포넌트 가이드**: [https://harper-components.vercel.app](https://harper-components.vercel.app)

---

# 6. 개발자 적용 규칙

## ✅ Do

- 색상은 항상 CSS 토큰 사용: `text-[var(--text-primary)]`, `bg-[var(--surface-raised)]`
- 인풋·카드 border는 `--hairline` (opacity 아닌 고정 hex)
- 헤딩은 `type-display-*`, 본문은 `type-body-md`, 레이블은 `type-title-sm`
- CardButton / ChoiceCard처럼 커스텀 패딩이 필요한 경우 Reshaped 대신 네이티브 `<button>` 사용

## ❌ Don't

- `text-beige900`, `bg-beige100`, `border-beige900/15` 같은 팔레트 직접 참조 금지
- `text-[54px]`, `text-[34px]` 같은 임의 px 값 금지 — `type-display-*` 클래스로 대체
- `font-hedvig` / `font-geist` 직접 사용 금지 — 타입 클래스가 처리
- `font-bold`로 display 텍스트 강조 금지 — 크기를 키울 것
- Reshaped Button에 `attributes.style`로 padding 덮어쓰기 금지 — 내부 CSS에 의해 무시됨