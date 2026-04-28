# Career Components

`src/components/career` 는 career workspace UI와 그 UI가 기대하는 컨텍스트 계약을 담고 있습니다.
실제 상태 소유는 이 폴더의 provider + `src/hooks/career/*` 에 있고, API 저장 경로는 `src/app/api/talent/*` 에 있습니다.

## Entry Points

- `src/pages/career/index.tsx`
  - 로그인 확인 후 `CareerFlowProvider` 를 감싸고 `CareerWorkspaceScreen` + `CareerSettingsModal` 을 렌더링합니다.

- `src/pages/career/preview.tsx`
  - 실제 API 없이 UI를 빠르게 미리보기하기 위한 preview 페이지입니다.
  - `CareerSidebarContextValue`, `CareerChatPanelContextValue` shape 변경 시 이 파일도 같이 맞춰야 합니다.

## Runtime Structure

- `CareerFlowProvider.tsx`
  - career 페이지의 실제 조립 지점입니다.
  - auth, session, chat, profile, preferences, settings, voice 관련 hook 을 묶고 두 개의 context 로 내려줍니다.

- `CareerWorkspaceScreen.tsx`
  - workspace 전체 shell 입니다.
  - 좌측 nav 와 우측 canvas 를 구성합니다.

- `CareerWorkspaceNav.tsx`
  - 좌측 메인 nav.
  - 탭은 `home | profile | chat | history` 네 개입니다.
  - 하단의 설정 버튼이 `CareerSettingsModal` 을 엽니다.

- `CareerHomePanel.tsx`
  - home 탭의 요약 화면입니다.
  - welcome, 대화 시작 CTA, preference 요약, 최근 추천 기회 섹션을 얇게 보여줍니다.
  - 추천 기회는 `recentOpportunities` payload 를 받아 최근 7일 이내 항목 최대 4개만 렌더링합니다.

- `profile/CareerProfileWorkspace.tsx`
  - profile 탭 내부의 in-page tab shell.
  - `선호 조건 / 프로필 / 하퍼 인사이트 / 이력서·링크` 네 섹션을 전환합니다.

- `CareerSettingsModal.tsx`
  - 우측 상단 설정 버튼으로 여는 모달.
  - `프로필 설정 / 내 이력서·링크 / 계정 관리` 탭으로 구성됩니다.
  - profile 탭에서도 `CareerProfileSettingsSection` 을 그대로 재사용합니다.

## Context Boundaries

- `CareerSidebarContext.tsx`
  - profile/settings/history/sidebar 쪽에서 쓰는 읽기/쓰기 상태 계약입니다.
  - 저장 상태, dirty 상태, reset/save 액션도 여기에 포함됩니다.

- `CareerChatPanelContext.tsx`
  - chat 패널 전용 상태 계약입니다.

## Main UI Files

### Profile / Settings

- `CareerProfileSettingsSection.tsx`
  - 현재 profile 설정의 주 UI입니다.
  - 아래 항목을 한 화면에서 관리합니다.
    - network application draft
    - talent preferences draft
    - profile visibility
    - blocked companies
  - 상단에 가장 최근 저장 시각을 보여줍니다.
  - 섹션 전체에서 변경사항이 생기면 우하단에 `Refresh`, `설정 저장` 버튼이 나타납니다.
  - `Refresh` 는 서버 재조회가 아니라 마지막 저장 snapshot 으로 draft 를 되돌립니다.
  - `profileVisibility` 클릭 시 자동 저장하지 않습니다.

- `settings/CareerResumeLinksSettingsSection.tsx`
  - 이력서 파일/링크 저장 전용 섹션.

- `profile/CareerTalentProfilePanel.tsx`
  - talent structured profile 렌더러.
  - 경험/학력/extra 등 읽기 중심 패널입니다.

- `profile/CareerHarperInsightsSection.tsx`
  - insight 탭 전용 편집 UI.
  - `talent_insights.content` 의 현재 key-value 를 그대로 렌더링합니다.
  - 고정 필드 목록을 갖지 않고, 내부 구조화 결과나 대화 흐름으로 생성된 key 를 그대로 편집합니다.
  - 저장은 `useCareerTalentInsights.ts` 를 통해 `/api/talent/preferences` 의 `insightContent` payload 로 분리됩니다.

- `CareerNetworkApplicationSection.tsx`
  - 이전 형태의 combined profile form 성격이 강한 파일입니다.
  - 현재 `profile/CareerProfileWorkspace` 나 `CareerSettingsModal` 의 주 렌더 경로에는 연결되어 있지 않습니다.
  - 수정이 필요하면 실제 사용 여부를 먼저 확인한 뒤 유지/삭제를 결정하세요.

### Chat

- `CareerChatPanel.tsx`
  - chat 탭 shell.
  - timeline + composer 만 조립합니다.

- `chat/CareerTimelineSection.tsx`
  - 메시지 목록, 상태 카드, 온보딩 흐름 표시.

- `chat/CareerComposerSection.tsx`
  - 텍스트 입력, voice 관련 액션, submit UI.

- `chat/CareerMessageBubble.tsx`
  - 메시지 bubble presentation.

- `chat/CareerVoiceInputLevelFill.tsx`
  - voice input level visualization.

### Supporting UI

- `CareerHistoryPanel.tsx`
  - history 탭 표시.

- `CareerInPageTabs.tsx`
  - profile 탭 내부 상단 탭.

- `ui/CareerPrimitives.tsx`
  - 공용 button, field, textarea, tab-like primitive 모음.

- `ui/CareerLinkInputRow.tsx`
  - 링크 입력 row primitive.

- `constants.ts`
  - career UI shared constants.

- `useCareerVoiceInput.ts`
  - voice input 관련 component-level helper.

## State Ownership In Hooks

실제 저장/dirty 로직은 대부분 `src/hooks/career/*` 에 있습니다.

- `useCareerNetworkApplication.ts`
  - `networkApplication` draft 와 saved snapshot 을 분리합니다.
  - `hasUnsavedNetworkApplicationChanges`, `onResetNetworkApplication` 제공.

- `useCareerTalentPreferences.ts`
  - `talentPreferences` draft 와 saved snapshot 을 분리합니다.
  - `hasUnsavedTalentPreferencesChanges`, `onResetTalentPreferences` 제공.

- `useCareerTalentInsights.ts`
  - `talentInsights` draft 와 saved snapshot 을 분리합니다.
  - `talent_insights.content` 의 동적 key-value 를 그대로 저장합니다.
  - `hasUnsavedTalentInsightsChanges`, `onResetTalentInsights` 제공.

- `useCareerTalentSettings.ts`
  - `profileVisibility`, `blockedCompanies` 를 draft 기반으로 관리합니다.
  - 이전의 auto-save 는 제거되었고, explicit save/reset 흐름만 남아 있습니다.

- `useCareerProfile.ts`
  - resume upload, resume links 저장.

- `useCareerSession.ts`
  - `/api/talent/session` bootstrap 결과를 가져옵니다.

## Storage Map

profile settings 는 한 군데가 아니라 세 저장소로 나뉩니다.

- network application
  - API: `/api/talent/network/profile`
  - DB: `talent_users.career_profile`

- visibility / blocked companies / engagement / preferred location / career move intent
  - API: `/api/talent/settings`, `/api/talent/preferences`
  - DB: `talent_setting`

- Harper's insight key-value
  - API: `/api/talent/preferences`
  - DB: `talent_insights.content`
  - key 는 고정 schema 가 아니라 `content` JSONB 에 저장된 값 기준으로 동적으로 정해집니다.
  - 현재 내부 구조화에서 `technical_strengths`, `desired_teams` 가 seed 될 수는 있지만 UI는 이 둘을 하드코딩하지 않습니다.

`CareerProfileSettingsSection` 상단의 `Last updated` 는 아래 세 시각 중 가장 최신값을 표시합니다.

- `talent_users.updated_at`
- `talent_setting.updated_at`
- `talent_insights.last_updated_at`

## API Contracts That This Folder Depends On

- `/api/talent/session`
  - 초기 hydrate payload.
  - `profileSettingsMeta` 를 포함해야 합니다.
  - home 탭용 `recentOpportunities` 도 여기서 같이 내려옵니다.

- `/api/talent/network/profile`
  - network application 저장 후 `updatedAt` 반환.

- `/api/talent/preferences`
  - preferences 와 `talentInsights` 를 함께 hydrate 합니다.
  - preferences 저장 시 `preferencesUpdatedAt`, insight 저장 시 `insightUpdatedAt` 반환.

- `/api/talent/settings`
  - settings 저장 후 `updatedAt` 반환.

## When You Edit This Area

profile 설정 필드를 추가하거나 저장 방식을 바꿀 때는 보통 아래를 같이 봐야 합니다.

1. `src/components/career/types.ts`
2. `src/components/career/CareerSidebarContext.tsx`
3. `src/hooks/career/useCareerNetworkApplication.ts`
4. `src/hooks/career/useCareerTalentPreferences.ts`
5. `src/hooks/career/useCareerTalentInsights.ts`
6. `src/hooks/career/useCareerTalentSettings.ts`
7. `src/app/api/talent/session/route.ts`
8. 관련 저장 API route (`settings`, `preferences`, `network/profile`)
9. `src/pages/career/preview.tsx`

이 중 하나라도 빠지면 runtime 에서는 동작해도 preview, hydrate, dirty-state, reset, updated-at 표시가 어긋날 수 있습니다.
