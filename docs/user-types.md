# User Types (Company vs Talent/Candidate)

이 앱에는 **서로 다른 두 종류의 유저**가 공존합니다. 같은 Supabase `auth.users` 풀을 공유하지만, 가입 후 들어가는 도메인 테이블이 다르고, 권한·리다이렉트·랜딩 경로도 모두 다릅니다.

신규 구현자는 이 문서를 읽고 다음을 이해할 수 있어야 합니다:
1. 어떤 페이지가 어떤 유저용인가
2. 회원가입 진입점이 어디인가
3. 왜 어떤 유저는 `/my`에 들어가면 빈 화면이 뜨거나 리다이렉트 되는가

---

## 1. 두 유저 타입 한눈에

| 항목 | **Company User** | **Talent / Candidate User** |
|---|---|---|
| 별칭 | 리크루터, 채용 담당자, 회사 측 유저 | 캔디데이트, 후보자, 구직자, 커리어 유저 |
| 도메인 테이블 | `company_users` | `talent_users` |
| Zustand 스토어 | `useCompanyUserStore` (`src/store/useCompanyUserStore.ts`) | `useTalentUserStore` (별도 — `src/store/`에 존재 시) |
| 메인 화면 | `/my/*` (검색, ATS, 매치, 빌링 등 13개 페이지) | `/career`, `/career/onboarding`, `/career/preview` |
| 로그인/가입 페이지 | `/radar`, `/find`, `/search`, `/pricing` 등 우상단 로그인 모달 | `/career_login` 전용 |
| Bootstrap API | `POST /api/auth/bootstrap` | `POST /api/talent/auth/bootstrap` |
| 추가 인증 게이트 | `company_users.is_authenticated = true` 필요 (초대 코드로만 활성화) | 없음 — 가입 즉시 사용 가능 |
| 활성화 방법 | `/invitation` 페이지에서 초대 코드 redeem | (없음) |
| AppLayout(`/my/*` 셸) 통과 조건 | `companyUser && companyUser.is_authenticated` | (해당 없음, 사용 안 함) |
| 결제(Toss) | 사용함 (`/api/toss/payments/prepare` 등) | 사용 안 함 |

> **핵심 사실**: 두 유저 타입은 **`auth.users` row를 공유할 수 있지만 일반적으로는 별개**입니다. 한 이메일이 양쪽 도메인 테이블에 동시에 row를 가질 수도 있고(이론상 충돌 없음), 보통은 한쪽만 가집니다.

---

## 2. 회원가입 경로 (실제 시연 가능한 흐름)

### 2.1 Company User로 가입하기

다음 페이지 중 어디서든 시작할 수 있습니다 — 동일한 모달을 띄웁니다:

- `/radar` (가장 흔함, Harper 데모 페이지)
- `/find`
- `/search`
- `/pricing`

흐름:

```
[1] 위 페이지 중 하나 접속
       │
       ▼
[2] 우상단 "로그인" / "Sign in" 클릭 → 로그인 모달 노출
       │
       ▼
[3] 모달 하단 "처음이라면 회원가입" 토글 → signup 모드
       │
       ▼
[4] 이메일 + 비밀번호 입력 → supabase.auth.signUp()
       │ (Supabase가 인증 메일 발송)
       ▼
[5] 메일에서 확인 링크 클릭 → email_confirmed_at 설정
       │
       ▼
[6] 다시 로그인 → 로그인 모달의 onSubmit에서 자동으로
       fetch("/api/auth/bootstrap", { Authorization })
       │
       ▼
[7] /api/auth/bootstrap 라우트가
       company_users.upsert({ user_id, email, name, profile_picture })
       (is_authenticated = false 기본값)
       │
       ▼
[8] 라우터가 router.push("/invitation")
       │
       ▼
[9] /invitation 페이지에서 초대 코드 입력
       │
       ▼
[10] /api/invitation/redeem이 company_users.is_authenticated = true로 업데이트
       │
       ▼
[11] /my/* 접근 가능 (AppLayout 게이트 통과)
```

**초대 코드가 없으면 11단계에 도달할 수 없습니다.** 개발 환경에서 코드 없이 검증하려면 §3의 우회 방법을 사용하세요.

관련 파일:
- 로그인 모달 컴포넌트: `src/components/Modal/LoginModal.tsx`, `src/components/common/AppHeader.tsx`
- Bootstrap 라우트: `src/app/api/auth/bootstrap/route.ts`
- 초대 redeem 라우트: `src/app/api/invitation/redeem/route.ts`
- AppLayout 게이트: `src/components/layout/app.tsx:58-68`

### 2.2 Talent/Candidate User로 가입하기

전용 페이지 `/career_login` 하나만 진입점입니다.

```
[1] /career_login 접속
       │
       ▼
[2] "회원가입" 토글 → 이메일 + 비밀번호 + 비밀번호 확인 입력
       │
       ▼
[3] supabase.auth.signUp() → 인증 메일
       │
       ▼
[4] 메일 확인 후 로그인 → fetch("/api/talent/auth/bootstrap")
       │
       ▼
[5] talent_users.upsert({ user_id, email, ... }) — 추가 게이트 없음
       │
       ▼
[6] /career 또는 /career/onboarding 접근 가능
```

관련 파일:
- 로그인 페이지: `src/pages/career_login.tsx`
- Bootstrap 라우트: `src/app/api/talent/auth/bootstrap/route.ts`
- Talent 도메인 라이브러리: `src/lib/talentOnboarding/`

---

## 3. 권한 게이트 / 리다이렉트 매트릭스

| 시도 | 결과 |
|---|---|
| 비로그인 → `/my/*` | AppLayout이 `useEffect`로 `router.replace("/")` → 랜딩으로 이동 |
| Company auth 됐지만 `is_authenticated=false` → `/my/*` | `/`로 강제 이동 (AppLayout 같은 게이트) |
| Talent 유저로 `/my/*` 진입 | `company_users` row 없음 → `companyUser = null` → `/`로 이동 |
| Company 유저로 `/career/*` 진입 | 별도 게이트는 없으나 talent_users row가 없어 일부 데이터가 비어 보임 |
| 비로그인 → `/career` | `/career_login`으로 이동 (career 게이트) |

---

## 4. 개발 시 흔한 함정

### 4.1 "지금 로그인했는데 /my에 빈 화면이 뜬다"

가능한 원인:
- 현재 로그인된 유저는 **talent 유저**이고 `company_users` row가 없음 → 리다이렉트
- bootstrap이 실패했거나 호출되지 않음 → `company_users` row가 없음
- `is_authenticated=false` 상태 → 게이트 통과 못함
- 그냥 로딩 중 — AppLayout 라인 362/432: `{!isLoadingCredits && userId && children}` → 로딩이 끝나기 전엔 본문이 비어있음

### 4.2 검증용 우회 (개발 환경 전용)

초대 코드 없이 `/my/*` 모바일 분기 등을 검증하려면 Supabase SQL Editor에서:

```sql
-- 현재 로그인된 유저의 auth.users.id를 알고 있다고 가정
insert into company_users (user_id, email, name, is_authenticated)
values ('<auth-user-id>', '<email>', 'Test User', true)
on conflict (user_id) do update set is_authenticated = true;
```

**프로덕션에서는 절대 사용 금지.** 이 SQL은 `/invitation` 흐름을 우회합니다.

### 4.3 같은 이메일이 양쪽 테이블에 들어갈 수 있는가?

기술적으로 가능합니다. `company_users`와 `talent_users`는 외래키로 분리돼 있고 어느 쪽도 상대 테이블의 존재를 확인하지 않습니다. 한 auth 유저가 동시에 두 페르소나로 사용될 수 있다는 뜻이지만, 현재 UI 흐름은 둘 중 하나만 가정하고 설계됐습니다. 새 기능을 추가할 때 양쪽 row가 동시에 존재할 가능성을 가정해야 한다면 별도 도메인 검토가 필요합니다.

---

## 5. 관련 코드 빠르게 찾기

```bash
# Company user 관련
grep -rn "company_users" src/                  # 모든 사용처
src/store/useCompanyUserStore.ts               # 클라이언트 상태
src/app/api/auth/bootstrap/route.ts            # 가입 후 row 생성
src/app/api/invitation/redeem/route.ts         # is_authenticated 활성화
src/components/layout/app.tsx                  # /my/* 게이트
src/components/Modal/LoginModal.tsx            # 로그인/가입 UI
src/lib/billing/server.ts                      # 결제 시 검증

# Talent user 관련
grep -rn "talent_users" src/                   # 모든 사용처
src/app/api/talent/auth/bootstrap/route.ts     # 가입 후 row 생성
src/lib/talentOnboarding/                      # 온보딩 도메인 로직
src/pages/career_login.tsx                     # 로그인/가입 UI
src/pages/career/                              # talent 전용 화면
```

---

## 6. 변경 이력에 반드시 반영해야 하는 것

다음을 수정하면 이 문서도 함께 업데이트:
- 새 유저 타입 추가 (예: ops user, admin user)
- bootstrap 라우트 동작 변경
- `is_authenticated` 의미·활성화 경로 변경
- AppLayout 게이트 로직 변경
- 새 회원가입 진입점 추가
