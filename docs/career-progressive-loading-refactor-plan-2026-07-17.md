# /career progressive loading refactor plan - 2026-07-17

## 목표

`/career`를 하나의 거대한 session payload가 끝난 뒤 한 번에 hydrate하는 구조에서, shell과 패널별 data query가 독립적으로 완료되는 구조로 바꾼다.

원하는 동작:

- 좌측 chat messages가 먼저 끝나면 좌측 chat을 먼저 보여준다.
- 우측 opportunities/history가 먼저 끝나면 우측 list를 먼저 보여준다.
- profile/settings/insights는 profile/settings UI가 필요할 때 읽되, 채팅 LLM prompt에는 영향을 주지 않는다.
- 서버 데이터는 React Query cache로 공유하고, UI-only 상태만 context/Zustand에 둔다.

## 원칙

### 1. Server data는 useQuery가 기본이다

컴포넌트 또는 패널이 읽는 서버 데이터는 query key를 갖는 hook으로 관리한다.

- chat messages: message query
- opportunities/history: opportunities query
- profile/settings/insights: profile/settings query
- pending call requests, latest opportunity run, counts: 필요 패널별 query

같은 서버 데이터를 여러 곳에서 쓰면 같은 query key를 쓰는 hook을 여러 군데에서 호출한다. React Query가 cache/dedupe/refetch/invalidation을 처리한다.

### 2. Zustand/context는 UI state 중심이다

전역 store/context에 서버 payload를 복사해 오래 들고 있으면 stale 처리와 invalidation 책임이 커진다.

적합한 global state:

- active tab
- selected opportunity id
- modal open state
- draft input
- split panel width
- voice/chat input mode

부적합한 global state:

- messages 전체
- opportunities 전체
- profile/settings/insights snapshot
- count aggregate

### 3. LLM prompt context는 UI lazy loading과 분리한다

LLM prompt에 필요한 profile/preferences/insights/recent recommendations는 클라이언트 profile 화면이 mount되었는지와 무관해야 한다.

현재 prompt 경로는 서버에서 별도 조회한다.

- `src/lib/career/chatTurn.ts`
  - `fetchTalentUserProfile`
  - `fetchTalentInsights`
  - `fetchTalentSetting`
  - `fetchTalentStructuredProfile`
  - `fetchRecentRecommendedOpportunitiesForPrompt`
- `src/app/api/talent/chat/route.ts`
  - 채팅 요청 처리 중 profile/settings/insights/recent recommendations를 서버에서 별도 조회
- `src/lib/career/realtimeInstructions.ts`
- `src/lib/talentOnboarding/onboardingCompletionWrapup.ts`

따라서 profile UI를 lazy-load해도, 채팅 API가 서버 prompt context fetch를 유지하면 LLM prompt 데이터는 사라지지 않는다.

반대로 하면 안 되는 것:

- 채팅 API가 클라이언트의 현재 profile state를 prompt source로 믿게 바꾸는 것
- profile tab이 mount되지 않았다는 이유로 서버 prompt context 조회를 생략하는 것
- `fetchRecentRecommendedOpportunitiesForPrompt`를 `/api/talent/session` payload 제거와 함께 삭제하는 것

## 현재 구조의 문제

현재 `CareerFlowProvider`는 다음 일을 한 번에 한다.

- `POST /api/talent/auth/bootstrap`
- `GET /api/talent/session`
- session payload에서 conversation/stage/messages/profile/settings/insights/history counts/opportunity run/pending calls를 hydrate
- `workspaceDataLoading` 하나로 home/mobile home을 통째로 skeleton 처리
- chat messages는 session payload를 initial page로 받음
- opportunities/history는 별도 `/api/talent/opportunities` query가 이미 있지만 `sessionData`가 있어야 enable됨

이 때문에 서버 내부에서 messages가 먼저 끝나도 HTTP response가 닫히기 전까지 클라이언트는 알 수 없다. opportunities query도 session 완료 전에는 시작하지 않는다.

## 목표 구조

```text
auth ready
  -> lightweight shell/bootstrap
       - user
       - conversation id
       - conversation stage
       - resume link metadata only if onboarding/profile shell needs it

  -> chat messages query
       - /api/talent/messages
       - message page + opportunity previews for rendered messages

  -> opportunities query
       - /api/talent/opportunities
       - items + counts

  -> home summary query
       - activeCompanyRoleCount
       - latest opportunity run
       - pending internal call requests
       - history counts if home needs counts

  -> profile query
       - profile/settings/insights
       - enabled only for profile/settings UI or explicit refresh
```

각 영역은 자기 loading/error/empty state를 갖는다.

## 안전한 단계별 구현

### Step 1. Opportunities/history query를 session 완료에서 분리

상태: 적용 대상.

이미 `useCareerHistoryState`는 `/api/talent/opportunities`를 사용한다. 지금은 `enabled`가 `Boolean(userId && sessionData)`라서 full session이 끝날 때까지 시작하지 않는다.

변경:

- `enabled`를 auth/user 기준으로 완화한다.
- active history tab이면 session 완료 전에도 `/api/talent/opportunities`가 시작되게 한다.
- `historyLoading`이 `sessionPending`에 묶이지 않게 한다.
- session에서 내려온 history page가 있으면 cache seed로만 사용한다.

부작용 평가:

- LLM prompt 영향 없음. prompt는 server-side chat route에서 별도 조회한다.
- mutation/follow-up에는 conversation id가 필요하지만, read query는 user auth만으로 충분하다.
- feedback action은 기존처럼 conversation id가 있어야 실행되며, session 완료 전 action은 UI disabled/loading 상태로 막을 수 있다.

### Step 2. Chat messages lightweight endpoint 도입

상태: 1차 적용.

새 endpoint:

- `GET /api/talent/messages`
- auth user의 latest conversation 또는 전달된 conversation id의 visible messages만 반환
- message opportunity preview enrichment는 유지
- profile/settings/insights/history counts/opportunity run은 읽지 않음

부작용 평가:

- LLM prompt 영향 없음. message read는 prompt 생성이 아니다.
- conversation 생성/claimed auto-start는 기존 session/bootstrap에 남긴다. message endpoint는 없는 conversation을 새로 만들지 않는다.
- stage를 같이 내려줘야 session 완료 전 chat timeline이 잘못 profile upload UI를 보여주지 않는다.

### Step 3. Session을 shell과 background detail로 분리

상태: 설계 필요.

현재 `/api/talent/session`은 bootstrap 이후 전체 hydrate를 담당한다. 이것을 두 층으로 나눈다.

- shell: conversation id/stage, auth-dependent routing에 필요한 최소값
- detail: profile/settings/insights/home summary 등 panel query

부작용 평가:

- email onboarding, invite claim, referral attribution, signup analytics는 bootstrap/shell에 남겨야 한다.
- `autoStartClaimedTalentConversation` side effect는 shell/session에서 한 번만 일어나야 한다.
- `markTalentUserLoggedIn`은 background로 뺄 수 있지만 analytics/admin recency 부작용이 있어 별도 검토가 필요하다.

### Step 4. Profile/settings/insights를 profile/settings query로 이동

상태: session split 이후 적용.

profile UI가 mount될 때 profile/settings/insights를 query로 읽는다. 단, chat prompt는 계속 서버에서 직접 fetch한다.

부작용 평가:

- profile tab 첫 진입 시 skeleton이 필요하다.
- home/nav greeting/avatar가 profile snapshot에 의존하면 auth user fallback을 먼저 쓰고 profile query 완료 후 교체한다.
- unsaved draft와 persisted query snapshot이 충돌하지 않게 draft state는 profile form hook 안에 둔다.

## 이번 변경에서 적용한 범위

이번 1차 변경은 Step 1과 Step 2의 read-only 부분을 적용한다.

- opportunities/history list read를 full session 완료 전에 시작할 수 있게 한다.
- `historyLoading`에서 full `sessionPending` 의존을 제거한다.
- `GET /api/talent/messages`를 추가해 chat messages와 conversation `id/stage`를 full session과 별도로 읽는다.
- `useCareerMessageHistory`가 session seed가 없을 때 lightweight messages endpoint를 먼저 사용할 수 있게 한다.
- chat panel의 pending 기준을 full session pending에서 message readiness + onboarding 판단 안정성 기준으로 좁힌다. `stage=completed`는 먼저 풀 수 있지만, `stage=chat/profile`은 `talentPreferences.isOnboardingDone` 확인 전까지 미완료 확정 UI를 보여주지 않는다.
- home/mobile home의 `workspaceDataLoading`은 full session 판단 전 skeleton을 유지한다. home summary/profile/preferences/count를 아직 별도 query로 분리하지 않았기 때문에 여기까지 무리하게 progressive하게 풀면 완료 사용자가 미완료 UI를 잠깐 볼 수 있다.
- LLM prompt 관련 서버 fetch는 건드리지 않는다.

## 2026-07-17 재점검에서 확인한 회귀와 수정

- `workspaceDataLoading`이 message shell 기준으로 너무 빨리 풀리면 home/mobile home이 full session 판단 전에 렌더링될 수 있다. 현재는 `sessionUnresolved || sessionDataNeedsLocalHydration` 기준으로 되돌려, home은 안전한 판단 전 skeleton을 유지한다.
- `CareerTimelineSection`은 `CareerChatPanel`의 welcome gating과 별개로 `showVoiceStartPrompt`를 직접 사용할 수 있다. context에서 `showVoiceStartPrompt: !chatSessionPending && showVoiceStartPrompt`로 내려, pending 중 voice start prompt가 노출되지 않게 했다.
- `useCareerAutoStart`는 side effect가 있으므로 `!sessionPending && !isOnboardingDone`일 때만 user/token을 넘긴다. completed 사용자는 message query가 먼저 끝나도 onboarding auto-start가 실행되지 않는다.

## 검증 체크리스트

- `rg "fetchRecentRecommendedOpportunitiesForPrompt" src` 결과가 유지되는지 확인한다.
- `/career/history` 첫 진입에서 `/api/talent/opportunities`가 session 완료를 기다리지 않고 시작되는지 확인한다.
- 기존 conversation이 있는 `/career` 첫 진입에서 `/api/talent/messages`가 session 완료 전 chat messages를 채울 수 있는지 확인한다.
- profile tab을 열기 전 profile UI query를 빼는 변경은 아직 하지 않는다.
- `pnpm exec tsc --noEmit --pretty false`
- 변경 파일 eslint
