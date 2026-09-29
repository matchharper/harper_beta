# Career Components

`src/components/career` 는 career workspace UI와 그 UI가 기대하는 컨텍스트 계약을 담고 있습니다.
실제 상태 소유는 이 폴더의 provider + `src/hooks/career/*` 에 있고, API 저장 경로는 `src/app/api/talent/*` 에 있습니다.

## Entry Points

- `src/pages/career/index.tsx`
  - 로그인 확인 후 `CareerFlowProvider` 를 감싸고 `CareerWorkspaceScreen` + `CareerSettingsModal` 을 렌더링합니다.

- `src/pages/career/preview.tsx`
  - 실제 API 없이 UI를 빠르게 미리보기하기 위한 preview 페이지입니다.
  - `?tab=tasks&onboarding=1`로 온보딩 진행 중 상태를 확인할 수 있습니다.
  - `CareerSidebarContextValue`, `CareerChatPanelContextValue` shape 변경 시 이 파일도 같이 맞춰야 합니다.

## Runtime Structure

- `CareerFlowProvider.tsx`
  - career 페이지의 실제 조립 지점입니다.
  - auth, session, chat, profile, preferences, settings, voice 관련 hook 을 묶고 두 개의 context 로 내려줍니다.

- `CareerWorkspaceScreen.tsx`
  - workspace 전체 shell 입니다.
  - 데스크톱은 왼쪽 메뉴 → 대화창 → 오른쪽 canvas로 구성합니다.
  - `/career`의 데스크톱 기본 화면은 할 일이며, 모바일 기본 홈은 유지합니다.
  - 대화창·오른쪽 패널 비율과 divider는 이 파일에서 조립하며,
    저장된 너비 기본값·범위는 `src/store/useCareerWorkspaceUiStore.ts`에 있습니다.

- `CareerWorkspaceNav.tsx`
  - 데스크톱 왼쪽 메인 nav. 상단 AppBar와 오른쪽의 workspace 탭을 대체합니다.
  - 할 일 / 새 기회 / 내 기회 / 프로필 / 선호 기준을 표시하고,
    새 기회·내 기회는 기존 history 화면의 `new`·`saved` 목록으로 연결합니다.
  - 펼친 너비 244px, 접힌 너비 64px, 행 높이 36px, 메뉴 간격 4px이며,
    선택 상태는 `/org` sidebar를 참고합니다.
    너비·여백은 `aside`, 행 디자인은 `NAV_ITEM_CLASS_NAME`에서 수정합니다.
  - Harper 오른쪽 버튼으로 접고 펼칩니다. 접으면 메뉴 아이콘과 28px 프로필 사진을
    표시하며, 선택한 상태는 `useCareerWorkspaceUiStore.ts`에서 브라우저에 저장합니다.
  - 정보 탭은 `home | tasks | history | profile | brief | watchlist`이고, 대화는 별도 패널입니다.
  - 하단의 설정 버튼이 `CareerSettingsModal` 을 엽니다.
  - 하단 사진·이름·이메일은 `CareerProfileMenu.tsx`의 `sidebar` variant입니다.

- `CareerHomePanel.tsx`
  - home 탭의 요약 화면입니다.
  - welcome, 대화 시작 CTA, preference 요약을 보여줍니다.
  - `variant="onboarding"`은 기존 인터뷰 진행률·통화/완료 버튼과 체크리스트만
    재사용하며, 온보딩이 완료되면 표시하지 않습니다.

- `CareerTasksPanel.tsx`
  - `/career/tasks`에서 지금 결정, Harper 제안, Harper가 하는 중을 보여줍니다.
  - 하단에 `CareerHomeDevControls`를 표시합니다. 데스크톱·모바일 모두 온보딩 완료
    여부와 관계없이 유지하며, 노출 권한은 Dev Controls의 기존 계정 조건을 따릅니다.
  - 온보딩 중에는 `CareerHomePanel variant="onboarding"`을 목록 최상단에 표시합니다.
    완료 여부가 아직 로딩 중이거나 `isOnboardingDone`·`stage="completed"`이면 숨깁니다.
  - 결정할 일이 있으면 결정 → 제안 → 진행, 없으면 진행 → 제안 순서입니다.
  - 회사 질문·이력서는 기존 composer 요청 카드, 연결 제안은 포지션 상세,
    일정 요청은 현재 유효한 일정 선택 화면으로 이어집니다.
  - pending-actions 조회를 composer·메뉴 숫자와 공유하고, 수락 후 진행 조회는
    할 일 화면을 열었을 때만 실행합니다. 대기 표시는 경과 시간이 아닌 저장된 단계에 따릅니다.
  - Harper 제안은 `useCareerTaskSuggestions`로 독립 조회합니다. 미응답 외부 추천은
    최신 4개 회사 로고를 2×2로 표시하고, 추천 확인 버튼은 가장 최근 새 기회 상세로 이동합니다.
    사용자가 직접 추가한 기회와 숨긴 기회는 제외합니다. 피드백·목록 갱신 후 다시 조회합니다.
  - 저장된 개인 링크 수 + 활성 Gmail 연결(1/0)이 1 이하이면 아직 없는 자료의
    추가를 요청하는 Link2 아이콘과 `/career/profile?profileSection=links` 이동 버튼을 표시합니다.
    미저장 초안은 세지 않으며, 링크가 이미 2개 이상이면 Gmail 조회도 생략합니다.
    각 추가 제안만 skeleton을 표시하므로 다른 할 일의 표시를 기다리게 하지 않습니다.
    외부 추천 피드백·자료 보완 항목은 기존 통화·질문 제안 뒤에 항상 마지막으로 표시합니다.
  - 로컬 미리보기: `?tab=tasks&taskFeedback=1&profileLinks=0&gmail=0`.
    `profileLinks=0|1|2`, `gmail=0|1`로 자료 보완 표시 경계를 확인할 수 있습니다.

- `profile/CareerProfileWorkspace.tsx`
  - `/career/profile`은 구조화 프로필·이력서/링크의 기존 in-page tab shell입니다.
  - `/career/brief`는 `view="brief"`로 같은 선호 기준·차단 기업 UI를 별도 탭에서 보여줍니다.
  - 기존 `/career/profile?profileSection=brief` 링크는 `/career/brief`로 전환합니다.

- `CareerSettingsModal.tsx`
  - 데스크톱 왼쪽 하단 또는 모바일 상단의 설정 버튼으로 여는 모달.
  - `프로필 설정 / 내 이력서·링크 / 계정 관리` 탭으로 구성됩니다.
  - profile 탭에서도 `CareerProfileSettingsSection` 을 그대로 재사용합니다.

## Context Boundaries

- `CareerSidebarContext.tsx`
  - preview 호환을 위해 `CareerSidebarContextValue` 전체 계약은 유지합니다.
  - runtime 구독은 변경 빈도와 도메인에 따라 다음 hook으로 분리합니다.
    - `useCareerSidebarContext` — workspace shell, onboarding/run 상태와 공통 액션
    - `useCareerHistoryContext` — opportunity history 조회 결과와 액션
    - `useCareerProfileContext` — profile/preferences/Search Brief/Memory/settings와 저장 액션
    - `useCareerCompanyFollowContext` — company follow 전용 상태와 액션

- `CareerChatPanelContext.tsx`
  - `useCareerChatPanelContext` — chat/timeline/composer 상태
  - `useCareerCallContext` — transcript, mute, connection 등 고빈도 call 상태
  - call transcript가 바뀔 때 일반 chat/profile/history consumer가 다시 렌더되지
    않도록 별도 context로 유지합니다.

## Prompt-critical Data Loading

UI에 현재 보이는 탭과 prompt에 필요한 데이터의 로딩 시점은 분리되어 있습니다.

- text chat `/api/talent/chat`
  - 요청 시점에 서버가 talent setting, 전체 Search Brief, 관련 Memory,
    structured profile, 최근 대화와 추천 기회를 조회해 prompt를 만듭니다.
- voice call `/api/realtime/token`
  - `buildCareerRealtimeSessionInstructions`가 요청 시점의 DB 데이터를 조회해
    realtime instructions를 만듭니다.
- `settingsDataEnabled`
  - profile/settings 편집 UI의 클라이언트 조회 시점만 제어합니다.
  - prompt용 setting/context/profile 로딩을 제어하면 안 됩니다.
- `/api/talent/session`
  - workspace bootstrap과 UI hydration에 사용합니다. 이 응답의 클라이언트
    복사본을 prompt 데이터의 유일한 소스로 간주하지 않습니다.

따라서 탭 lazy loading이나 Context 경계를 변경할 때도 chat/realtime API의
서버-side prompt 조회는 visible UI 여부와 무관하게 유지해야 합니다.

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
  - `CareerBlockedCompaniesSettingsSection`은 차단 기업 입력·목록·추가/삭제 저장 기능만 재사용하며, 선호 기준(`/career/brief`) 맨 아래에 표시됩니다.

- `settings/CareerResumeLinksSettingsSection.tsx`
  - 이력서 파일/링크 저장 전용 섹션.

- `profile/CareerTalentProfilePanel.tsx`
  - talent structured profile 렌더러.
  - Search Brief는 바로 표시하고 label은 유지한 채 값을 한 번에 인라인 편집합니다.
  - Memory는 관리 모달을 열 때 `/api/talent/contexts`에서 페이지 단위로 읽습니다.
  - 경험/학력/extra 등 구조화 프로필도 함께 표시합니다.

### Chat

- `CareerChatPanel.tsx`
  - chat 탭 shell.
  - timeline + composer 만 조립합니다.

- `chat/CareerTimelineSection.tsx`
  - 메시지 목록, 상태 카드, 온보딩 흐름 표시.

- `chat/CareerComposerSection.tsx`
  - 텍스트 입력, 통화 시작 액션, submit UI.

- `chat/CareerMessageBubble.tsx`
  - 메시지 bubble presentation.
  - `components/chat`의 공통 bubble, 선택지, 날짜, Thinking log primitive에
    career 전용 rich text와 marker parsing을 주입합니다.

### Supporting UI

- `CareerHistoryPanel.tsx`
  - history 탭 표시.
  - 데스크톱의 새 기회는 새 포지션 목록만 표시하고 상단 탭을 숨깁니다.
  - 내 기회는 상단의 저장한 포지션·보관함 탭과 제외한 포지션 버튼을 유지합니다.

- `CareerInPageTabs.tsx`
  - profile 탭 내부 상단 탭.

- `ui/CareerPrimitives.tsx`
  - 공용 button, field, textarea, tab-like primitive 모음.

- `constants.ts`
  - career UI shared constants.

- `useCareerVoiceInput.ts`
  - voice input 관련 component-level helper.

## State Ownership In Hooks

실제 저장/dirty 로직은 대부분 `src/hooks/career/*` 에 있습니다.

- `useCareerTalentPreferences.ts`
  - `talentPreferences` draft 와 saved snapshot 을 분리합니다.
  - `hasUnsavedTalentPreferencesChanges`, `onResetTalentPreferences` 제공.

- `useCareerTalentContexts.ts`
  - Search Brief와 Memory 행 상태를 관리합니다.
  - Brief는 session/chat 응답으로 갱신하고, Memory 목록은 관리 화면에서 lazy pagination 합니다.
  - 추가·수정·삭제는 revision을 포함한 `/api/talent/contexts` 변경 요청을 사용합니다.

- `useCareerTalentInsights.ts`
  - 온보딩·이관 기간의 keyed Brief projection을 읽는 legacy compatibility 상태입니다.
  - 새 Search Brief/Memory 저장 경로로 사용하지 않습니다.

- `useCareerTalentSettings.ts`
  - `profileVisibility`, `blockedCompanies` 를 draft 기반으로 관리합니다.
  - 이전의 auto-save 는 제거되었고, explicit save/reset 흐름만 남아 있습니다.

- `useCareerProfile.ts`
  - resume upload, resume links 저장.

- `useCareerSession.ts`
  - `/api/talent/session` bootstrap 결과를 가져옵니다.

## Storage Map

profile settings 는 한 군데가 아니라 두 저장소로 나뉩니다.

- visibility / blocked companies / engagement / preferred location / career move intent
  - API: `/api/talent/settings`, `/api/talent/preferences`
  - DB: `talent_setting`

- Search Brief / Memory
  - API: `/api/talent/contexts`
  - DB: `talent_contexts` (`collection = brief | memory`)
  - 일반 Brief는 자유 형식 `label + content`, Memory는 `content`로 저장합니다.
  - 기존 온보딩 연결용 `key`는 선택적 호환 metadata이며 일반 UI/tool 입력이 아닙니다.
  - 사용자별 짧은 `ref`는 LLM용 식별자, 내부 `id + revision`은 UI 동시수정 검사용입니다.

`CareerProfileSettingsSection` 상단의 `Last updated` 는 아래 세 시각 중 가장 최신값을 표시합니다.

- `talent_users.updated_at`
- `talent_setting.updated_at`
- `talent_contexts.updated_at`

## API Contracts That This Folder Depends On

- `/api/talent/session`
  - 초기 hydrate payload.
  - `profileSettingsMeta` 를 포함해야 합니다.

- `/api/talent/network/profile`
  - network application 저장 후 `updatedAt` 반환.

- `/api/talent/preferences`
  - preferences와 온보딩 호환용 keyed Brief projection을 hydrate 합니다.
  - Search Brief/Memory 쓰기는 받지 않습니다.

- `/api/talent/contexts`
  - Brief 조회와 항목별 add/update/delete를 제공합니다.
  - Memory 목록은 cursor pagination으로 읽습니다. 일반 chat/session 응답에 전체 Memory를 싣지 않습니다.

- `/api/talent/settings`
  - settings 저장 후 `updatedAt` 반환.

## When You Edit This Area

profile 설정 필드를 추가하거나 저장 방식을 바꿀 때는 보통 아래를 같이 봐야 합니다.

1. `src/components/career/types.ts`
2. `src/components/career/CareerSidebarContext.tsx`
3. `src/hooks/career/useCareerTalentPreferences.ts`
4. `src/hooks/career/useCareerTalentContexts.ts`
5. `src/hooks/career/useCareerTalentSettings.ts`
6. `src/app/api/talent/session/route.ts`
7. 관련 저장 API route (`settings`, `preferences`, `contexts`)
8. `src/pages/career/preview.tsx`

이 중 하나라도 빠지면 runtime 에서는 동작해도 preview, hydrate, dirty-state, reset, updated-at 표시가 어긋날 수 있습니다.
