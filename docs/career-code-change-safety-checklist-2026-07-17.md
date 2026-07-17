# /career code change safety checklist - 2026-07-17

이 문서는 `/career` 코드를 수정할 때마다 반드시 확인할 기준이다.

## 1. Loading truthfulness

- 아직 확정되지 않은 상태를 임시 기본값으로 보여주지 않는다.
- 특히 onboarding 완료 여부는 `conversation.stage` 하나만으로 미완료 확정하지 않는다.
- `talentPreferences.isOnboardingDone` 또는 full session 판단이 필요한 화면은 판단 완료 전 skeleton/pending state를 보여준다.
- progressive loading을 적용해도 "미완료 UI -> 완료 UI"처럼 의미가 뒤집히는 flicker가 없어야 한다.

## 2. Query boundary

- 컴포넌트/패널 전용 서버 데이터는 가능하면 `useQuery`/`useInfiniteQuery`로 관리한다.
- 같은 서버 데이터는 같은 query key로 공유한다.
- session payload에 새 데이터를 붙이기 전에, 패널별 endpoint가 맞는지 먼저 판단한다.
- read-only query를 먼저 시작하더라도 mutation에 필요한 id/conversation/stage가 준비됐는지 확인한다.

## 3. LLM prompt integrity

- UI lazy loading과 LLM prompt context fetch를 섞지 않는다.
- profile/settings/insights/recent recommendation prompt context는 server-side chat route에서 직접 fetch되어야 한다.
- 다음 경로를 삭제하거나 조건부 생략하지 않는다.
  - `fetchTalentUserProfile`
  - `fetchTalentSetting`
  - `fetchTalentInsights`
  - `fetchTalentStructuredProfile`
  - `fetchRecentRecommendedOpportunitiesForPrompt`
- profile 화면이 mount되지 않았다는 이유로 LLM prompt 데이터가 빠지면 안 된다.

## 4. Side effects

- 새 read endpoint는 conversation 생성, claimed auto-start, invite claim, referral attribution 같은 side effect를 실행하지 않는다.
- side effect가 필요한 bootstrap/session 경로는 중복 실행되지 않게 유지한다.
- `markTalentUserLoggedIn`, signup tracking, email onboarding claim은 이동 시 analytics/admin recency 부작용을 검토한다.

## 5. UI readiness

- chat timeline은 messages와 onboarding 완료 판단이 모두 안전한 상태일 때만 incomplete/onboarding UI를 보여준다.
- chat의 voice start prompt, welcome, auto-start side effect는 같은 pending/onboarding-done 기준으로 막는다.
- opportunities/history list는 read query가 먼저 끝나면 먼저 보여줄 수 있다.
- home/mobile home은 아직 profile/preferences/count가 session payload에 묶여 있으므로 full session 판단 전 skeleton을 유지한다.
- profile/settings 화면은 데이터가 없을 때 form 기본값을 persisted 값처럼 보여주지 않는다.
- skeleton은 "아직 판단 중"일 때만 쓰고, empty state는 "판단 완료 후 데이터 없음"일 때만 쓴다.

## 6. Verification

매 변경 후 최소 확인:

- `rg "fetchRecentRecommendedOpportunitiesForPrompt" src`로 prompt 경로 보존 확인
- 새/변경 endpoint가 불필요한 profile/settings/insights fetch를 하지 않는지 확인
- onboarding 완료 사용자가 미완료 welcome/profile upload UI를 잠깐이라도 보지 않는지 확인
- `showVoiceStartPrompt`, `useCareerAutoStart`, `workspaceDataLoading`이 session/onboarding 판단보다 먼저 풀리지 않는지 확인
- `pnpm exec tsc --noEmit --pretty false`
- 변경 파일 eslint
