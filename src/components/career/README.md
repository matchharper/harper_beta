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

- `chat/inline/CareerInlineUi.tsx`
  - 매칭 결과·기회 모음·원하는 조건을 실제 채팅 본문 안에 표시합니다.
  - parser는 `src/lib/career/inlineUi.ts`, 연결 지점은 `CareerMessageBubble.tsx`입니다.
  - 기존 기회 카드·진행 행·Brief 편집을 재사용하며, preview도 같은 renderer에 synthetic runtime을 주입합니다.
  - 표시 계약과 아직 적용하지 않은 LLM 가이드 계획: [Career 인라인 UI](../../../docs/career-inline-chat-ui-ko.md).

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
  - 할 일 / 기회 / 내 정보 / 원하는 조건을 표시하고,
    기회 안에서 기존 history 화면의 새 기회·진행중·저장함 등을 선택합니다.
  - 기회 메뉴 배지는 응답 대기 중인 Harper 연결 포지션 수를 우선 표시하며, 없으면
    아직 열람하지 않은 새 jobs 수를 표시합니다. 99 이상은 `99+`, 0은 숨깁니다.
  - 펼친 너비 244px, 접힌 너비 64px, 행 높이 36px, 메뉴 간격 4px이며,
    선택 상태는 `/org` sidebar를 참고합니다.
    너비·여백은 `aside`, 행 디자인은 `NAV_ITEM_CLASS_NAME`에서 수정합니다.
  - Harper 오른쪽 버튼으로 접고 펼칩니다. 접으면 메뉴 아이콘과 28px 프로필 사진을
    표시하며, 선택한 상태는 `useCareerWorkspaceUiStore.ts`에서 브라우저에 저장합니다.
  - 정보 탭은 `home | tasks | history | profile | documents | brief | watchlist`이고, 대화는 별도 패널입니다.
  - 하단의 설정 버튼이 `CareerSettingsModal` 을 엽니다.
  - 하단 사진·이름·이메일은 `CareerProfileMenu.tsx`의 `sidebar` variant입니다.

- `CareerHomePanel.tsx`
  - home 탭의 요약 화면입니다.
  - welcome, 대화 시작 CTA, preference 요약을 보여줍니다.
  - `variant="onboarding"`은 기존 인터뷰 진행률·통화/완료 버튼과 체크리스트만
    재사용하며, 온보딩이 완료되면 표시하지 않습니다.

- `CareerTasksPanel.tsx` / `CareerActionItemsPanel.tsx`
  - 데스크톱 홈의 오른쪽 패널과 모바일 홈/할 일에 `career_action_items`의 현재 목록을 표시합니다.
  - 제목·설명·버튼 텍스트·action·우선순위·긴급도를 원본 Career LLM이 `manage_action_items`로 관리합니다.
    우선순위가 높은 순서, 같은 우선순위는 긴급도 순서로 표시합니다. 최대 10개는 guide의 큐레이션 기준이며 DB/UI가 강제로 자르지 않습니다.
  - `send_message`는 저장된 텍스트를 채팅에 전송하고, `compose_reply`는 입력창 위에 항목을 선택하여 사용자가 답하거나 파일을 첨부하게 합니다.
    `compose_reply`를 선택하는 것만으로 메시지를 보내지 않으며, 두 방식 모두 외부 지원·폼 응답 자체를 실행하지 않습니다. 서버가 소유권·revision을 확인하고 정확한 카드 snapshot을 사용자 메시지 payload에 보존합니다.
  - 재방문·대화·비동기 위임 작업이 같은 context와 도구를 사용합니다. 완료 cursor, 재방문 완료, 화면 재진입/주기 조회로 갱신합니다.
    고정 제안·진행 section은 표시하지 않으며 원본 대기 요청은 기존 composer 및 관련 화면에서 계속 조회합니다.
  - 온보딩 전에는 기존 `CareerHomePanel variant="onboarding"`을 사용합니다. Dev Controls는 기존 권한 계약을 유지합니다.
  - 로컬 미리보기: `/career/preview?tab=tasks`; 두 클릭 동작의 합성 항목을 제공합니다. `taskDecisions=0`은 빈 목록입니다.

- `profile/CareerProfileWorkspace.tsx`
  - 내 정보는 neutral TabBoxes의 프로필 / 내 자료로 구성됩니다. `/career/profile`은 프로필을, `/career/documents`는 내 자료를 선택합니다. 원하는 조건(`/career/brief`)은 독립 사이드 메뉴이며 내 정보 탭을 표시하지 않습니다.
  - `/career/documents`는 `view="documents"`로 내 자료(링크·문서·연결된 서비스)와 문서 상세를 보여줍니다.
  - 문서 카드는 모바일 2열, md 이상 3열로 가로 공간을 채웁니다.
  - 기존 `profileSection=links|connections` 및 문서·콜노트 상세 주소도 새 문서 탭으로 전환합니다.
  - `/career/brief`는 `view="brief"`로 같은 선호 기준·차단 기업 UI를 별도 탭에서 보여줍니다.
  - 기존 `/career/profile?profileSection=brief` 링크는 `/career/brief`로 전환합니다.

- `mobile/CareerMobileNavigationMenu.tsx`
  - 상단 메뉴 버튼과 펼친 채팅에서 공통으로 쓰는 왼쪽 슬라이드 메뉴입니다.
  - 공통 Dialog로 포커스·Escape·배경 클릭 닫기를 처리하고 항목 선택 시 메뉴를 닫습니다.

- `CareerSettingsModal.tsx`
  - 데스크톱 왼쪽 하단 또는 모바일 상단의 설정 버튼으로 여는 모달.
  - `기회 설정 / 계정 / 초대하기(대상 사용자)` 탭으로 구성됩니다.
  - 기회 설정은 `settings/CareerOpportunitySettingsSection`으로 수신 스위치 두 개를 표시합니다. 기존 저장 경로와 중지 확인을 유지하며 공유 상태 변경도 같은 context에서 읽습니다.
  - 계정의 `settings/CareerLanguageSetting`은 공통 Select와 기존 locale 저장 API를 사용합니다. 프로필 드롭다운의 언어 메뉴·별도 모달은 제거했습니다.

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
  - 설정의 `기회 설정`에서는 기회 수신을 관리하고, 프로필 공유 방식 선택기는 내 정보 > 프로필 탭의 최상단에 둡니다. 프로필의 기존 요약·설정 바로가기를 이 선택기로 대체합니다. `ProfileVisibilityPanel`에서 옵션을 선택하면 기존 hook을 통해 즉시 저장합니다.
  - `CareerPreferencesSettingsSection`은 근무 형태 선택과 제외할 회사 추가·삭제를 원하는 조건(`/career/brief`)에 표시합니다. 기존 설정 원본을 사용하며 Brief 행으로 복사하지 않습니다.
  - 저장 실패로 draft가 남으면 `되돌리기`와 `설정 저장`을 제공합니다. 되돌리기는 마지막 저장 snapshot으로 복구합니다.

- `CareerProfileSharingSummary.tsx`
  - 홈에서 현재 공유 상태와 프로필 바로가기를 표시합니다. 프로필 탭에서는 실제 공유 방식 선택기를 표시합니다.

- `settings/CareerResumeLinksSettingsSection.tsx`
  - 링크·문서와 별도의 `연결된 서비스` 영역을 표시합니다. Gmail 연결·해제·이메일 가져오기는 기존 `CareerGmailSettingsRow`를 재사용합니다.

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
  - 내 기회는 저장함·진행중 탭을 표시하고, 종료/보관 탭과 숨긴 포지션 버튼은 데스크톱 상단 오른쪽에 둡니다. 저장함은 `SavedOpportunityList`에서 새 기회와 같은 접힌 행 UI를 사용하며 클릭하면 바로 상세로 이동합니다. 보기 선택은 없고, 행 오른쪽에 지원하기 버튼과 마감 정보를 표시합니다. 남은 기간이 10일 이하면 카운트다운, 그보다 길면 날짜로 표시합니다. 진행중은 지원함·진행중·최종 합격, 종료/보관은 진행 종료·보관한 항목을 합칩니다.
  - 데스크톱·모바일의 저장 단계 목록은 같은 로더를 사용합니다. 진행중의 `applied`·`connected`·`offer`는 기존 `savedStages` API로 함께 조회하고, 각 단계의 서버 `nextOffset`으로 추가 로딩과 완료를 판단합니다. 저장한 지원 이력은 `listPosition: previous`여도 해당 단계에 포함하며, 조회 실패 후 재시도와 캐시 누락 시 복구를 지원합니다.
  - 진행중 목록은 `ProgressOpportunityList`에서 상단 상태 필터 없이 해당 탭의 기회를 모두 표시합니다. 이전 필터 선택은 적용하거나 저장하지 않습니다. 단계별 모든 페이지를 불러옵니다. `ProgressOpportunityRow`는 저장함과 같은 `OpportunityCard`를 사용하며 오른쪽에 상태 자체를 누르는 기존 드롭다운 버튼, 내부 하단에는 예정된 일정이 있을 때만 작은 일정 정보를 표시합니다. 목록에는 일정 추가 버튼과 빈 일정 안내를 표시하지 않습니다. 저장함·진행중의 내부 연결 카드는 연결 텍스트나 배지 대신 회사 로고에 주황색 `border-primary` 테두리를 표시합니다. 로고에 hover하거나 키보드로 focus하면 shared `Tooltips`로 “Harper로 연결중인 기회.”를 보여줍니다. 행을 클릭하면 상세로 이동합니다. 모든 상세 상단은 같은 `OpportunityCard`를 사용하고 상태 드롭다운을 카드 오른쪽의 `headerActions`에 표시합니다. 진행중 상세는 접힌 상태로 시작하며 상단 카드를 누르면 공고를 펼칩니다. 다른 상세는 기존처럼 펼친 상태로 시작합니다. 진행중의 `headerFooter`는 목록과 같은 `OpportunityAppointmentSummary`를 사용하고 `showAppointmentCreate`를 켜서 일정 추가를 유지합니다. 상태 변경·일정 추가는 카드를 펼쳐도 같은 위치에 남습니다. 아래 일정 목록에는 일정 추가 버튼과 빈 일정 안내를 중복 표시하지 않습니다. 상세는 48px/64px 섹션 간격으로 일정·준비 내용·진행 이력을 먼저 보여줍니다. 회사 간단 소개·모의 인터뷰 버튼과 하단의 별도 공고 상세 정보 버튼은 표시하지 않습니다. 상태 드롭다운은 저장함(`saved`)·지원함·진행중·최종 합격(`offer`)·종료/보관(`closed`)을 저장하고 해당 탭으로 이동합니다. 저장된 개인 단계가 회사 태그보다 우선하며, 최종 합격은 저장 성공 후 역할 멘션과 함께 Harper 채팅으로 전송합니다. `AppointmentCreateButton`은 인증된 `POST /api/talent/meeting-schedules`를 통해 기존 `write_talent_meeting_schedule`에 외부 일정을 저장합니다. 공고 소유 범위를 확인하고 재시도는 같은 요청 ID를 사용합니다. 데스크톱은 버튼에 붙은 팝오버, 모바일은 하단 시트에 일정·내용 입력과 날짜 달력을 표시합니다. 종료 시각은 없으며 `source_refs.calendarDate`로 날짜만 선택한 사실을 유지합니다. 당일 자정이 지나도 당일 일정은 목록에 유지하고 모델 입력에서도 시각을 만들지 않습니다. 저장 후 해당 사용자 이력 캐시의 역할별 다음 일정과 일정 쿼리를 갱신하며 회사 초대나 캘린더 생성은 실행하지 않습니다.

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
