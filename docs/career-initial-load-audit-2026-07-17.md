# /career initial load audit - 2026-07-17

## 결론

`/career` 첫 진입이 20~30초까지 걸릴 이유는 제품 요구사항상 없다. 현재 지연의 핵심은 필요한 데이터를 늦게 불러오는 문제가 아니라, 첫 화면을 보여주기 전 경로가 너무 많은 일을 한 번에 하고, 그중 일부가 직렬로 묶여 있다는 점이다.

가장 큰 원인은 다음 네 가지다.

1. 클라이언트가 `POST /api/talent/auth/bootstrap`을 끝낸 뒤에야 `GET /api/talent/session`을 호출한다. 두 요청은 각각 서버 인증, DB read/write를 다시 수행한다.
2. `/api/talent/session`은 "홈 초기 화면 데이터"가 아니라 대화, 프로필, 설정, 인사이트, 온보딩 체크리스트, 이력 count, 최근 추천 기회 preview, 추천 run, 전체 active role count, 내부 콜 요청, 메시지별 opportunity preview까지 한 번에 만드는 omnibus endpoint다.
3. 점검 당시 `/career` 홈에서는 `opportunityLimit=0`을 넘기지만, 서버는 `beforeMessageId === null`이면 `RECENT_OPPORTUNITY_PREVIEW_LIMIT=8`을 강제로 사용해서 추천 이력 preview를 읽었다. 이 preview는 라이브 홈 UI에서 실제로 쓰이지 않았다.
4. 추천 이력 count는 `count: "exact"` 쿼리 9개와 `saved_stage is null` row 전체 조회를 병렬로 실행한다. 여기에 추천 이력 preview의 무거운 company/role 조인과 active company role 전체 count가 첫 세션 응답에 들어간다. 추가 측정에서 active role exact count는 약 20만 건을 세고 있었고, 단독으로 약 1.1초가 걸렸다.

LLM 프롬프트에 필요한 데이터는 무작정 빼면 안 된다. 다만 이번에 확인한 바로는 LLM 프롬프트용 최근 추천 이력은 `/career` 초기 session payload가 아니라 채팅 턴에서 `fetchRecentRecommendedOpportunitiesForPrompt`로 별도 조회된다. 따라서 초기 session의 `recentOpportunities` payload 제거는 채팅 프롬프트 경로를 건드리지 않는 한 LLM 품질을 해치지 않는다.

2026-07-17 후속 변경으로 `recentOpportunities` 관련 session response, 클라이언트 state/context/type, preview mock, README 설명을 제거했다. 또한 `opportunityLimit=0` initial session은 더 이상 추천 item preview를 가져오지 않고 count만 유지하도록 바뀌었다. LLM prompt용 `fetchRecentRecommendedOpportunitiesForPrompt` 경로는 유지했다.

## 점검 범위

확인한 주요 경로:

- `src/pages/career/[[...tab]].tsx`
- `src/components/career/CareerWorkspacePage.tsx`
- `src/components/career/CareerWorkspaceScreen.tsx`
- `src/components/career/CareerFlowProvider.tsx`
- `src/components/career/CareerHomePanel.tsx`
- `src/components/career/mobile/CareerMobileHomeView.tsx`
- `src/hooks/career/useCareerAuth.ts`
- `src/hooks/career/useCareerApi.ts`
- `src/hooks/career/useCareerSession.ts`
- `src/hooks/career/useTalentOnboardingStatus.ts`
- `src/store/useAuthStore.ts`
- `src/pages/_app.tsx`
- `src/app/api/talent/auth/bootstrap/route.ts`
- `src/app/api/talent/session/route.ts`
- `src/app/api/talent/onboarding/status/route.ts`
- `src/app/api/talent/session/reengagement/route.ts`
- `src/lib/supabaseServer.ts`
- `src/lib/talentOnboarding/server.ts`
- `src/lib/talentOnboarding/profileStore.ts`
- `src/lib/talentOnboarding/stateStore.ts`
- `src/lib/talentOnboarding/messageStore.ts`
- `src/lib/talentOnboarding/calls.ts`
- `src/lib/talentOpportunity.ts`
- `src/lib/career/chatTurn.ts`
- `src/components/feedback/CustomCrispWidget.tsx`

DB 규모는 Supabase service role로 `head + estimated count`만 확인했다. secret 값은 출력하지 않았다. 로컬 migration은 현재 worktree에서 다수 삭제 상태라, migration 파일만으로 인덱스 유무는 단정하지 않았다. SQL 실행 RPC도 `exec_sql`, `execute_sql`, `debug_sql`, `run_sql` 모두 노출되어 있지 않았다.

확인된 대략적 테이블 규모:

- `talent_messages`: 약 100,931 rows
- `talent_opportunity_recommendation`: 약 23,843 rows
- `company_workspace`: 약 20,887 rows
- `opportunity_discovery_run`: 약 9,339 rows
- `talent_opportunity_chat_preview`: 약 10,177 rows
- `talent_calls`: 약 3,423 rows
- `talent_conversations`: 약 2,988 rows
- `talent_setting`: 약 2,397 rows
- `talent_users`: 약 2,397 rows
- `talent_experiences`: 약 12,925 rows
- `talent_educations`: 약 4,260 rows
- `talent_insights`: 약 1,708 rows

추가로 개인정보 값을 출력하지 않고 분포만 계산했다.

- `talent_opportunity_recommendation` 전체: 23,858 rows
- 추천 이력 사용자별 row 수: p50 9, p75 17, p90 30, p95 39, p99 67, max 171
- `feedback is null` 추천 이력 사용자별 row 수: p50 6, p75 11, p90 20, p95 28, p99 44, max 140
- `feedback='like' and saved_stage is null`: p50 1, p95 4, max 6
- `talent_messages` 전체: 100,934 rows
- 메시지 대화별 row 수: p50 36, p75 55, p90 81, p95 106, p99 191, max 1,872
- chat 메시지 대화별 row 수: p50 29, p75 41, p90 57, p95 74, p99 153, max 1,615

읽기 전용으로 현재 Supabase/PostgREST에서 같은 패턴의 쿼리도 일부 재현했다. 네트워크/서버 위치, 캐시, cold start가 다르므로 production trace로 보지는 말고 상대 비용 참고값으로만 봐야 한다.

- max 추천 이력 사용자 기준 `history_external_preview_8`: 약 828ms
- 같은 사용자 `history_internal_preview_20`: 약 206ms
- 같은 사용자 추천 count 개별 exact query: 약 176~288ms 범위
- 같은 사용자 `liked_null_stage_rows`: 약 227ms
- `active_company_roles_count`: 약 1,159ms, count 약 202,598
- max 메시지 대화 기준 `visible_messages_batch_40`: 약 195ms
- 같은 대화 `talent_opportunity_chat_preview` 조회: 약 337ms

이 결과는 20~30초를 단독으로 설명하지는 않는다. 하지만 첫 화면 요청 하나에 1초급 쿼리와 수백 ms 쿼리 여러 개, 직렬 API, serverless cold start, Supabase Auth lookup, retry가 겹치면 tail latency가 크게 튈 수 있는 구조임을 확인한다.

## 실제 첫 진입 흐름

### 1. 페이지 라우팅

`/career`는 Pages Router의 `src/pages/career/[[...tab]].tsx`에서 처리된다. `getStaticProps`는 active tab만 내려주고, 실데이터는 모두 클라이언트에서 가져온다. 즉 SSG 자체가 느린 원인은 아니다.

### 2. 앱 전역 auth init

`src/pages/_app.tsx`에서 mount 후 `useAuthStore.init()`을 호출한다. `init()`은 `supabase.auth.getSession()`을 기다린 뒤 `user`와 `loading=false`를 세팅한다. `/career`는 이 전에는 auth loading 상태다.

관련 코드:

- `_app.tsx`: `useEffect(() => init(), [init])`
- `useAuthStore.ts`: `init` 내부 `supabase.auth.getSession()`

### 3. CareerWorkspacePage

`CareerWorkspacePage`는 `authLoading || !router.isReady || !user`이면 전체 로딩 상태를 보여준다. user가 생기면 `CareerFlowProvider`를 렌더링한다.

여기서 별도로 `useTalentOnboardingRedirect`도 실행된다. 이 훅은 `/api/talent/onboarding/status`를 `refetchOnMount: "always", staleTime: 0`으로 매번 호출한다. 다만 이 status query는 현재 코드상 `/career` 렌더 자체를 막지는 않고, official jobs draft 처리와 onboarding redirect에만 쓰인다. 즉 20~30초의 주 blocker라기보다는 중복 API/인증/DB 부하 요인이다.

### 4. CareerFlowProvider의 session fetch

`CareerFlowProvider`는 `/career` 홈에서 `includeInitialHistory=false`이므로 `useCareerSession({ opportunityLimit: 0 })`을 호출한다.

문제는 `useCareerSession` 내부다.

```ts
await fetchWithAuth("/api/talent/auth/bootstrap", { method: "POST", ... });
await fetchWithAuth(`/api/talent/session?locale=...&messageLimit=20&opportunityLimit=0`);
```

이 두 요청은 직렬이다. bootstrap이 끝나기 전에는 session 요청이 시작되지 않는다. `sessionPending`은 session query 전체가 끝나야 false가 된다.

### 5. 홈 skeleton gate

`CareerFlowProvider`는 `workspaceDataLoading = sessionPending || sessionDataNeedsLocalHydration`로 계산한다. `CareerHomePanel`과 `CareerMobileHomeView`는 `workspaceDataLoading`이면 각각 skeleton만 렌더링한다.

결과적으로 사용자가 보는 "첫 데이터 화면"은 아래 전체 chain이 끝난 뒤에야 나온다.

```text
_app auth init
  -> CareerWorkspacePage user ready
  -> POST /api/talent/auth/bootstrap
  -> GET /api/talent/session
  -> hydrateSession
  -> workspaceDataLoading false
  -> CareerHomePanel / CareerMobileHomeView first data screen
```

### 6. 데스크톱과 모바일 렌더 차이

데스크톱 `/career`는 홈 오른쪽 패널만 보는 경우에도 왼쪽 `CareerChatPanel`을 항상 렌더링한다. 따라서 초기 session의 `messages`, `nextBeforeMessageId`, `conversation`, `stage`, `sessionPending`은 데스크톱 첫 화면에도 직접 연결된다.

모바일 홈은 `CareerMobileChatLauncher` 안에 `CareerChatPanel`을 두고, 사용자가 chat을 열기 전까지 주 화면은 `CareerMobileHomeView`다. 그래도 같은 `CareerFlowProvider`와 session payload를 쓰기 때문에 session이 끝나야 `workspaceDataLoading`이 풀리는 것은 동일하다.

history/jobs 탭은 별도다. `useCareerMobileHistoryOpportunities`는 해당 탭에 표시할 item이 없고 count상 더 가져올 것이 있으면 `/api/talent/opportunities`를 자동 호출한다. 이 동작은 홈 첫 화면 최적화와 분리해서 봐야 한다.

## 클라이언트에서 확인한 중복/추가 작업

### fetchWithAuth가 매 API마다 세션을 다시 읽음

`useCareerApi`는 API 호출마다 `supabase.auth.getSession()`을 호출해 access token을 가져온다. `/career` 초기에는 session chain, onboarding status, referral capture, visit log 등 여러 요청이 겹치므로 Supabase client session read도 반복된다.

이 자체만으로 20초를 만들 가능성은 낮지만, 네트워크/스토리지/토큰 refresh와 겹치면 초기 chain 비용이 늘어난다.

### onboarding status API가 session과 정보가 겹침

`/api/talent/onboarding/status`는 `getRequestUser` 후 `talent_users`, `talent_conversations`, `talent_setting`을 병렬 조회한다. `/api/talent/session`도 같은 사용자에 대해 profile, conversation, setting을 읽는다.

이 status query는 첫 화면 렌더 blocker는 아니지만, 초기 요청 수와 auth/DB 부하를 늘린다. session payload에 이미 충분한 status 정보가 있으므로 합치거나 session 이후로 미루는 편이 낫다.

### CustomCrispWidget이 `/career`에서도 항상 mount됨

`_app.tsx`는 `shouldMountCustomCrisp = shouldShowCustomCrispLauncher || isCareerWorkspacePage`로 계산한다. career workspace에서는 launcher를 숨겨도 widget component는 mount된다.

`CustomCrispWidget`은 localStorage에 저장된 thread가 있으면 `setTimeout(..., 0)`으로 `/api/feedback/crisp/[id]`를 fetch한다. 첫 화면을 직접 block하지는 않지만 초기 네트워크 경쟁을 만든다. lazy mount 또는 idle 이후 mount로 미루는 것이 좋다.

### visit log는 blocker가 아니라 경쟁 요청

`useCareerVisitLog`는 mount 후 `career_app_opened`를 `keepalive`로 `/api/logs`에 보낸다. 클라이언트에서 await하지 않으므로 화면을 직접 막지는 않는다. 다만 `postLogEvent`가 다시 `supabase.auth.getSession()`을 읽고, 서버는 `getRequestUser` 후 `logs.insert`를 수행한다. 따라서 초기 네트워크/서버 부하에는 포함된다.

## bootstrap endpoint 점검

`POST /api/talent/auth/bootstrap`은 이름과 달리 가벼운 bootstrap이 아니다.

기존 사용자에게도 기본적으로 다음 일을 한다.

1. `getRequestUser(req)`로 Supabase Auth user 확인
2. `talent_users` existing 조회
3. email onboarding token이 있으면 RPC `claim_career_email_onboarding_lead` 및 추가 lead 검증
4. `ensureTalentUserRecord`
5. invite token이 있으면 `claimTalentNetworkInvite`
6. `markTalentUserLoggedIn`
7. `upsertTalentSetting`

`upsertTalentSetting`은 내부에서 `fetchTalentSetting`, `fetchTalentLocaleProfile`, `talent_setting.upsert(...).select(...).single()`을 실행한다. 즉 기존 사용자도 매 `/career` mount마다 setting을 read-read-write 한다.

신규 사용자일 때는 추가로 signup source resolve, logs insert, contact queue enqueue, referral attribution, Slack notify까지 await된다. 신규 사용자 첫 진입은 더 느려질 수 있다.

중요한 중복:

- `bootstrap`에서 `ensureTalentUserRecord`와 `markTalentUserLoggedIn`을 수행한다.
- 곧바로 이어지는 `/api/talent/session`도 다시 `ensureTalentUserRecord`와 `markTalentUserLoggedIn`을 수행한다.
- `bootstrap`에서 `upsertTalentSetting`을 한 뒤, `/api/talent/session`에서 `fetchTalentSetting`을 최소 2회 더 수행한다.

## session endpoint 점검

`GET /api/talent/session`은 첫 화면의 핵심 병목이다.

### session의 직렬 pre-work

session handler는 병렬 구간에 들어가기 전 아래 작업을 순서대로 기다린다.

1. `getRequestUser(req)`
2. `ensureTalentUserRecord`
3. `markTalentUserLoggedIn`
4. `fetchTalentSetting`
5. 최신 `talent_conversations` 조회
6. conversation이 없으면 insert
7. `fetchTalentUserProfile`
8. stage가 `profile`이면 `autoStartClaimedTalentConversation`, 필요 시 profile 재조회

여기까지가 끝나야 본격적인 `Promise.all` 구간으로 들어간다.

### session의 병렬 payload 로드

그 다음 아래 9개를 `Promise.all`로 로드한다.

1. `fetchVisibleMessagesPage`
2. `fetchTalentStructuredProfile`
3. `getTalentResumeSignedUrl`
4. `fetchTalentSetting` again
5. `fetchTalentInsights`
6. `fetchTalentOpportunityHistoryPage`
7. `fetchLatestOpportunityRun`
8. `fetchActiveCompanyRoleCount`
9. `fetchPendingInternalOpportunityCallRequests`

병렬이라도 전체 응답은 가장 느린 작업을 기다린다. 그리고 이 묶음 안에 정확 count, 무거운 nested join, storage signed URL, 여러 table read가 같이 들어 있다.

### session의 post-work

`Promise.all` 후에도 응답 전 추가 작업이 있다.

- onboarding이 끝나지 않았으면 `getCareerOnboardingChecklistCoverage`
  - 내부적으로 `getOrCreateCareerOnboardingCall`
  - active call 조회
  - 없으면 insert
  - 있으면 checklist merge/update 가능
- visible messages의 `messageIds`로 `talent_opportunity_chat_preview` 조회
- preview에 없는 recommendation id는 `fetchTalentOpportunityHistoryByIds`
- 메시지 본문에 posting role id가 있으면 `fetchTalentPostingCardsByRoleIds`

즉 `/api/talent/session`은 read endpoint처럼 보이지만 `last_logined_at`, `talent_calls`, conversation seeding 등 write side effect가 있다. 이 때문에 캐싱도 어렵고, 단순 조회보다 느려질 수밖에 없다.

### session 이후 reengagement

`CareerFlowProvider`는 session hydration 이후 stage가 `profile`이 아니면 `/api/talent/session/reengagement`를 호출할 수 있다. 이 endpoint는 idle 조건을 만족하면 `runCareerChatTurn`을 실행하고 LLM/tool path까지 들어간다.

이 작업은 첫 session 응답 이후 `useEffect`에서 실행되므로 "첫 데이터 화면 표시"의 직접 blocker는 아니다. 하지만 session 직후 같은 화면에서 추가로 무거운 API가 붙고, 사용자는 이것까지 초기 로딩처럼 체감할 수 있다. 그러므로 first paint 지표와 "진입 직후 안정화" 지표를 분리해서 측정해야 한다.

## 추천 이력 관련 병목

### 홈에서 `opportunityLimit=0`인데 preview를 로드함

`CareerFlowProvider`는 홈에서 `opportunityLimit: includeInitialHistory ? 20 : 0`을 넘긴다. `/career` 홈에서는 `includeInitialHistory=false`라서 `0`이다.

점검 당시 session route는 다음 로직을 사용했다.

```ts
const historyOpportunitiesIncluded = opportunityLimit > 0;
const shouldLoadOpportunityPage = historyOpportunitiesIncluded || beforeMessageId === null;
const historyFetchLimit = historyOpportunitiesIncluded
  ? opportunityLimit
  : RECENT_OPPORTUNITY_PREVIEW_LIMIT;
```

초기 session은 `beforeMessageId === null`이므로 `shouldLoadOpportunityPage=true`가 되고, `opportunityLimit=0`이어도 `RECENT_OPPORTUNITY_PREVIEW_LIMIT=8`로 추천 이력 preview를 읽었다. 후속 변경 후에는 `historyOpportunitiesIncluded=false`일 때 `historyFetchLimit=0`이어서 counts만 유지하고 item preview는 가져오지 않는다.

### preview select가 무겁다

`TALENT_OPPORTUNITY_HISTORY_SELECT`는 `talent_opportunity_recommendation`에서 시작해 `company_roles`, `company_workspace`, `company_db`, `company_data`까지 nested join한다. role description, company description, funding data 등 홈 count에는 필요 없는 긴 필드도 포함된다.

### preview는 라이브 홈에서 실제로 안 쓰임

제거 전 `recentOpportunities`는 session response에 포함되고 `CareerFlowProvider` state/context에도 들어갔다. 하지만 라이브 홈 컴포넌트인 `CareerHomePanel`과 `CareerMobileHomeView`는 `recentOpportunities`를 읽지 않았다.

제거 전 `rg recentOpportunities src` 결과, 실제 사용처는 타입/context/preview 페이지와 README뿐이었다. `src/components/career/README.md`에는 home tab이 `recentOpportunities`를 렌더링한다고 되어 있었지만 live code와 맞지 않았다. 후속 변경 후 `src`에서는 `recentOpportunities`, `CareerRecentOpportunity`, `normalizeRecentOpportunities`, `RECENT_OPPORTUNITY_PREVIEW_LIMIT`가 모두 제거됐다.

따라서 현재 `/career` 홈 첫 로드에서 `recentOpportunities`를 만들기 위한 추천 이력 preview fetch는 제거 완료 상태다.

### count 계산도 비싸다

`fetchTalentOpportunityHistoryCounts`는 다음을 병렬 실행한다.

- feedback null count
- feedback null + internal source count
- feedback like count
- feedback dislike count
- feedback like + saved_stage saved count
- feedback like + saved_stage applied count
- feedback like + saved_stage connected count
- feedback like + saved_stage closed count
- feedback like + saved_stage hidden count
- feedback like + saved_stage null rows 전체 조회 후 JS에서 default stage 계산

모든 count는 `count: "exact"`이다. `newInternalCount`는 count를 위해 `company_roles` join까지 한다. `saved_stage is null`은 count가 아니라 row를 모두 가져온다.

테이블 규모가 약 2.4만 row라서 인덱스가 완벽하면 견딜 수 있지만, first screen path에 이 쿼리 묶음을 매번 넣는 구조는 좋지 않다. 인덱스가 부족하거나 Supabase/PostgREST cold path가 겹치면 seconds 단위로 튈 수 있다.

### activeCompanyRoleCount도 first screen blocker로는 과함

`fetchActiveCompanyRoleCount`는 `company_roles` 전체에서 active count를 exact로 센다. 홈에서는 `"현재 Harper 네트워크에서 {count}개의 기회를 스캔..."` copy에만 쓰고, 그것도 `activeCompanyRoleCount * 2`로 표시한다.

이 값은 사용자별 실시간 critical data가 아니다. CDN/cache/cron/materialized value로 충분하고, 첫 session 응답을 막을 이유가 없다.

추가 측정에서는 이 exact count가 약 202,598개 active role을 세고 있었고 약 1.1초가 걸렸다. 실제 production cold path에서는 더 커질 수 있다. 이 값은 첫 화면의 정확성보다 copy 보조값에 가까워, 가장 먼저 분리해도 되는 후보 중 하나다.

## 홈 화면에서 실제로 쓰는 데이터

라이브 desktop home:

- `workspaceDataLoading`: skeleton gate
- `user`, `talentProfile`: greeting/profile copy
- `stage`, `isOnboardingDone`, `talentPreferences`, `profileVisibility`: 상태 카드/CTA
- `historyOpportunityCounts`: 새 추천, 저장/진행 count
- `historyOpportunities`: in-progress company label용. 다만 `/career` 홈의 초기 session에서는 `historyOpportunitiesIncluded=false`라 실제로 빈 배열이 들어간다.
- `activeCompanyRoleCount`: 스캔 중 기회 수 copy
- `opportunityRun`: 추천 run 상태
- `pendingInternalOpportunityCallRequests`: 내부 기회 call CTA
- resume/profile fields: 프로필 import/recovery UI

라이브 mobile home도 유사하게 `historyOpportunityCounts`, `historyOpportunities`, `activeCompanyRoleCount`, `pendingInternalOpportunityCallRequests`, `talentProfile`, stage/preferences를 쓴다.

라이브 홈에서 안 쓰는 것:

- `recentOpportunities`

홈에서 count는 보이므로 완전히 제거하면 UI가 바뀐다. 하지만 count를 지금처럼 무거운 preview fetch와 묶을 필요는 없다. count는 별도 aggregate/RPC/cache로 가볍게 내려주거나, 첫 paint 후 독립 query로 채워도 된다.

추가 확인:

- 제거 전 `recentOpportunities`는 `SessionResponse`에 optional이고, normalize 함수도 배열이 아니면 `[]`를 반환했다. 후속 변경에서는 response field 자체와 normalize/type/context/mock을 제거했다.
- preview page는 자체 initial history data를 쓰므로 session API의 `recentOpportunities` 제거와 직접 연결되지 않는다. preview mock에 있던 recent-only data도 함께 제거했다.
- README에는 home이 `recentOpportunities`를 렌더링한다고 되어 있었지만 live code와 불일치했다. 후속 변경에서 README도 수정했다.
- `historyOpportunities`는 home의 in-progress company label에 쓰이지만, 현재 `/career` 홈 initial session에서는 `historyOpportunitiesIncluded=false`라 빈 배열이다. 즉 지금도 첫 홈에서 실제 company label은 count 기반 fallback으로 동작한다.

## LLM 프롬프트 데이터 보존 검토

사용자가 강조한 "안 보이지만 LLM prompt로 들어가는 데이터"는 유지해야 한다.

확인 결과, 채팅 프롬프트는 `src/lib/career/chatTurn.ts`의 `runCareerChatTurn`에서 별도로 구성된다. 여기서 다음 데이터를 읽는다.

- `fetchTalentUserProfile`
- `fetchTalentInsights`
- `fetchTalentSetting`
- onboarding completion event
- official jobs onboarding intent event
- pending opportunity feedback prompt context
- recent activity summaries
- `fetchRecentRecommendedOpportunitiesForPrompt`
- `fetchTalentStructuredProfile`
- `getCareerOnboardingChecklistCoverage`
- active internal fit hold question
- user chat turn count
- recent messages with summary

특히 최근 추천 이력 프롬프트는 `fetchRecentRecommendedOpportunitiesForPrompt`를 통해 `talent_opportunity_recommendation`에서 별도 select로 가져온다. 이것은 `/api/talent/session`의 `recentOpportunities` payload와 별개다.

따라서 안전한 원칙은 다음이다.

- 채팅/voice/reengagement API의 prompt context fetch는 유지한다.
- 초기 `/api/talent/session`에서 live home에 안 쓰는 `recentOpportunities` 생성은 제거 완료했다.
- prompt용 최근 추천 이력 최적화가 필요하면 `fetchRecentRecommendedOpportunitiesForPrompt` 자체를 별도로 profile하고, session 최적화와 섞지 않는다.

## 왜 20~30초까지 늘어날 수 있는가

정확한 production trace는 없지만, 코드 구조상 다음이 합쳐지면 충분히 20초대까지 튈 수 있다.

- client auth init 대기
- `bootstrap`과 `session`의 직렬 API chain
- 두 API 각각의 `getRequestUser`
- `bootstrap` 기존 사용자 write/upsert
- `session` pre-work의 여러 직렬 DB read/write
- `session` 병렬 구간의 느린 exact count/nested join/storage signed URL
- `session` post-work의 onboarding call get-or-create, message preview enrichment
- `useCareerSession` retry: non-auth failure는 최대 2회 retry, retry delay는 1초/2초 수준
- onboarding status, visit log, referral capture, Crisp thread fetch 등 주변 요청 경쟁
- Next/serverless cold start 또는 Supabase/PostgREST cold path

한두 개 쿼리가 느린 문제가 아니라, 첫 화면 readiness가 너무 많은 optional/secondary work에 결합되어 있다.

## 우선순위 조치

### P0 - home initial session payload를 줄이기

`/career` 홈의 initial session에서 `opportunityLimit=0`이면 추천 이력 item preview를 읽지 않도록 바꿔야 한다.

현재:

```ts
shouldLoadOpportunityPage = historyOpportunitiesIncluded || beforeMessageId === null;
historyFetchLimit = historyOpportunitiesIncluded ? opportunityLimit : 8;
```

권장:

- `opportunityLimit=0`이면 `fetchTalentOpportunityHistoryPage` item fetch 금지
- `recentOpportunities` 생성 금지 또는 별도 lazy endpoint로 이동
- history tab 진입 시에만 `opportunityLimit=20`으로 history items 로드
- message preview에 필요한 recommendation은 visible messages에 preview rows가 있을 때만 필요한 id만 조회

### P0 - bootstrap/session 직렬 chain 제거

bootstrap과 session은 합치거나, bootstrap을 정말 필요한 경우에만 실행해야 한다.

권장:

- 기존 로그인 사용자의 `/career` 진입에서는 bootstrap write/upsert를 생략
- invite token, email onboarding token, missing talent user 등 mutation이 필요한 경우만 bootstrap 실행
- 또는 `/api/talent/session`이 bootstrap 결과까지 한 번에 처리하되 중복 `ensureTalentUserRecord`, `markTalentUserLoggedIn`, `fetchTalentSetting`을 제거

### P0 - first screen blocker에서 write side effect 빼기

`GET /api/talent/session`에서 아래 write는 첫 화면 응답을 막지 않게 해야 한다.

- `markTalentUserLoggedIn`
- onboarding call get-or-create/update
- profile stage auto-start seeding

필요하면 별도 mutation 또는 background/after 작업으로 이동한다. read endpoint가 write를 포함하면 caching도 어렵고 tail latency가 커진다.

### P1 - opportunity counts를 aggregate/RPC/cache로 바꾸기

`fetchTalentOpportunityHistoryCounts`의 9개 exact count + null saved_stage row fetch는 하나의 SQL aggregate/RPC나 materialized per-user counter로 바꾸는 것이 맞다.

확인해야 할 인덱스:

- `talent_opportunity_recommendation(talent_id, feedback, saved_stage, created_at desc)`
- `talent_opportunity_recommendation(talent_id, role_id)`
- `company_roles(role_id, source_type)`
- `talent_messages(conversation_id, id desc)`
- `talent_conversations(user_id, updated_at desc)`
- `talent_setting(user_id)`
- `talent_calls(user_id, kind, status)`
- `talent_opportunity_chat_preview(assistant_message_id, rank)`

로컬 migration 상태만으로 인덱스 부재를 단정하지 말고, Supabase에서 실제 index를 확인한 뒤 없는 것만 추가해야 한다.

### P1 - activeCompanyRoleCount cache

`activeCompanyRoleCount`는 사용자별 critical data가 아니다. cron/materialized table/env cached endpoint 등으로 5~30분 TTL을 둬도 된다. 초기 session 응답의 exact count에서 분리한다.

### P1 - onboarding status 중복 제거

`useTalentOnboardingStatus`는 `/career` mount마다 `/api/talent/onboarding/status`를 다시 호출한다. session payload의 `conversation`, `talentPreferences.isOnboardingDone`, `profile`로 redirect 판단을 대체하거나, onboarding page 진입 전용으로만 호출한다.

### P2 - 주변 요청 지연

- `CustomCrispWidget`은 launcher가 숨겨진 career workspace에서는 사용자가 열거나 idle이 될 때 mount한다.
- visit log/referral capture는 `requestIdleCallback` 또는 session 완료 이후로 낮은 우선순위 처리한다.
- `fetchWithAuth`는 이미 auth store에 있는 access token을 재사용하고, 필요할 때만 `supabase.auth.getSession()`을 호출한다.

## 액션별 부작용 평가

여기서 "부작용 없음"은 엄격히 보면 거의 없다. 대부분의 최적화는 UI 표시 타이밍, 분석 로그, stale data 허용치, API response shape 중 하나를 바꾼다. 따라서 아래처럼 분류한다.

| 액션 | 기대 효과 | 실제 수행 시 부작용 평가 | 판단 |
| --- | --- | --- | --- |
| 초기 session에서 `opportunityLimit=0`일 때 추천 item preview fetch를 하지 않고 count만 유지 | live home에서 안 쓰는 `recentOpportunities` 생성 제거, heavy nested join 제거 | live home UI/LLM prompt 영향은 현재 코드 기준 없음. session response/type/context/preview/README에서 관련 기대를 같이 제거했으므로 코드 내부 의존도는 남지 않음 | 수행 완료 |
| `recentOpportunities` 필드 자체를 제거하지 않고 `[]`로 내려주기 | response shape 안정성 유지 | 숨은 외부 소비자까지 고려하면 보수적이지만, 현재 `src` 내부 소비자는 없어서 최종 변경에서는 필드 자체를 제거함 | 미채택 |
| message preview enrichment는 유지하되 `historyPageOpportunities`를 seed로 쓰지 않기 | 현재 home에서 이미 seed가 비어 있으므로 변화 없음 | 현재 로직상 message preview는 `talent_opportunity_chat_preview` rows가 있으면 `fetchTalentOpportunityHistoryByIds`로 보강됨. preview 품질 영향 없음 | 안전 |
| `activeCompanyRoleCount`를 session에서 제거하고 lazy-load | first session에서 1초급 global exact count 제거 | 홈 문구가 처음에 fallback 문구로 보이거나 뒤늦게 바뀐다. 숫자 정확도/표시 타이밍 변화 있음 | 기능 부작용 있음, UX 허용 필요 |
| `activeCompanyRoleCount`를 서버 cache/materialized value로 유지한 채 session에 포함 | UI 문구 유지, exact count 반복 제거 | count가 수분 단위로 stale할 수 있음. 현재도 `*2` 표시라 정확성 요구는 낮아 보임 | 낮은 부작용 |
| bootstrap과 session 합치기 | 직렬 API 왕복 제거, 중복 auth/DB 제거 | signup tracking, invite claim, email onboarding claim, referral attribution, `trackSignUp` 타이밍이 바뀔 수 있음 | 효과 큼, 부작용 검토 필요 |
| mutation이 필요한 경우에만 bootstrap 실행 | 기존 사용자 path 가속 | 클라이언트가 "기존 사용자"를 모르면 서버에서 status 판단이 필요. token/referral/mail/invite/email onboarding 케이스 누락 위험 | 조건 설계 필요 |
| `markTalentUserLoggedIn`을 background/after로 이동 | session write 제거 | `last_logined_at`이 늦게 반영되거나 실패할 수 있음. analytics/admin recency에 영향 | 완전 무부작용 아님 |
| `upsertTalentSetting`을 매번 하지 않고 missing/변경 때만 수행 | bootstrap read-read-write 제거 | 로그인할 때마다 `updated_at`이 갱신되던 부수 효과가 사라짐. 이 timestamp를 recency로 쓰는 코드가 있으면 영향 | 확인 후 가능 |
| onboarding checklist `getOrCreateCareerOnboardingCall`을 session에서 write 없는 read로 바꾸기 | GET session의 insert/update 제거 | 처음 onboarding user에게 active call row가 즉시 생기지 않을 수 있음. call 시작/진행 로직과 충돌 없는지 확인 필요 | 중간 위험 |
| `/api/talent/onboarding/status`를 session payload로 대체 | 중복 auth/DB 제거 | onboarding redirect 타이밍, official jobs draft cleanup 조건이 바뀔 수 있음 | 테스트 필요 |
| recommendation counts를 aggregate RPC로 교체 | 9개 exact count + row fetch를 1회로 축소 | `saved_stage is null` default stage, internal source count, hidden/saved semantics를 완전히 맞춰야 함 | shadow compare 후 전환 |
| 관련 composite index 추가 | 기존 쿼리 속도 개선 | 일반적으로 앱 의미 변화는 없음. 하지만 production index build는 DB 부하/lock 정책 확인 필요. `CONCURRENTLY` 고려 | DB 운영 리스크만 있음 |
| `CustomCrispWidget`을 user open 또는 idle 이후 mount | 초기 bundle/effect/fetch 경쟁 제거 | 기존 문의 thread 선조회가 늦어짐. 사용자가 바로 support를 열면 첫 표시가 늦을 수 있음 | 낮은 UX 부작용 |
| `fetchWithAuth`가 auth store token을 먼저 쓰고 필요 시 `getSession` fallback | 반복 session read 감소 | token refresh/stale token 처리 실수 시 401 증가 가능. fallback 설계 필수 | 낮은 위험, 테스트 필요 |
| `useCareerMessageHistory` older page용으로 별도 lightweight messages endpoint 도입 | `/api/talent/session` 재사용으로 생기는 불필요한 session pre-work 제거 | 메시지 pagination response shape를 새로 유지해야 함. 현재 beforeMessageId path는 preview fetch는 안 하지만 여전히 session pre-work를 탄다 | P1, 테스트 필요 |

가장 "부작용이 거의 없는" 순서는 다음이다.

1. `opportunityLimit=0` initial session에서 item preview를 중단하고 counts는 유지한다. 후속 변경에서는 `recentOpportunities` 필드 자체도 제거했다.
2. `activeCompanyRoleCount`를 cache/materialized value로 바꾸고 response field는 유지한다.
3. `/api/talent/session`에 서버 timing log를 추가한다. 단, 개인정보/프롬프트 내용을 로그에 남기지 않는다.
4. `CustomCrispWidget` fetch를 idle/open 이후로 미룬다.

반대로 바로 하면 안 되는 것:

- session에서 `talentProfile`, `talentInsights`, `talentPreferences`, `messages`를 제거하는 것. 데스크톱 chat/home/profile과 LLM-adjacent 상태에 직접 영향이 있다.
- onboarding status redirect를 제거하는 것. 신규/미완료 사용자 flow가 바뀐다.
- bootstrap을 없애는 것. email onboarding, invite, referral, signup logging이 묶여 있다.
- recommendation counts를 0 또는 optimistic fallback으로 바꾸는 것. home/history/mobile badge와 CTA 조건이 바뀐다.

## 권장 목표 상태

첫 화면용 endpoint는 다음 정도만 blocking payload로 가져와야 한다.

- auth user id 확인
- conversation id/stage
- visible messages first page
- profile summary + structured profile
- setting/preferences
- insights
- onboarding progress, 단 write 없는 read 방식
- home card에 필요한 lightweight counts, 가능하면 aggregate/RPC/cache
- pending internal call requests가 실제 CTA에 필요하면 유지하되 별도 profile 필요

아래는 initial blocking path에서 빼는 것이 맞다.

- live home에서 안 쓰는 `recentOpportunities`
- history tab item list
- active company role global exact count
- latest opportunity run이 critical하지 않은 경우 lazy
- message opportunity preview enrichment 중 실제 메시지에 없는 preview
- login timestamp update
- onboarding call create/update
- Crisp feedback thread fetch

## 최종 판단

현재 `/career` 초기 로딩은 "데이터가 많아서 어쩔 수 없는 로딩"이 아니다. 직렬 bootstrap/session 구조와 omnibus session payload 때문에 생긴 구조적 지연이다.

가장 먼저 고칠 부분은 `opportunityLimit=0`인데도 추천 이력 preview를 읽고 `recentOpportunities`를 만드는 로직이었다. 이 데이터는 라이브 홈에서 안 쓰이며, LLM 프롬프트용 최근 추천 이력과도 별도 경로다. 이 항목은 후속 변경으로 제거 완료했고, 다음은 bootstrap/session 중복과 추천 이력 count 집계를 정리해야 한다.

이 세 가지를 고치면 `/career` 첫 데이터 화면은 서버 cold start를 제외하고도 수 초 이내로 줄어드는 것이 정상이다.

추가 점검 후 더 엄밀한 결론은 다음과 같다.

- 제일 먼저 실행해도 되는 액션이었던 `recentOpportunities`용 preview item fetch 제거는 완료됐다. 현재 live UI와 LLM prompt에는 영향이 없고, source 내부 관련 의존도도 제거했다.
- 두 번째는 `activeCompanyRoleCount`의 cache화다. 이 값은 실제로 약 20만 active role을 exact count하고 있었고, 홈 문구 하나에만 쓰인다.
- 세 번째는 session endpoint timing 로그다. 현재 구조상 20~30초는 충분히 가능한데, 실제 production에서는 bootstrap, session pre-work, opportunity preview/count, active role count, onboarding checklist, message preview 중 어느 구간이 tail을 만드는지 숫자로 찍어야 한다.
- bootstrap/session 통합과 onboarding status 제거는 효과가 크지만 flow 부작용 가능성이 있어 바로 밀어붙이면 안 된다. email onboarding, invite, referral, signup analytics를 보존하는 설계가 먼저다.
