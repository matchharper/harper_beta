# Harper Organization Workspace v2

## 목적

Organization은 회사 사용자가 Harper가 추천한 인재를 빠르게 검토하고,
채용 팀이 같은 기준과 진행 상태를 공유하는 작업 공간이다. 이번 개편은
기존의 단일 파이프라인 화면을 다음 여섯 가지 업무 흐름으로 분리한다.

1. **Home**: 지금 처리해야 하는 연결 결정을 가장 먼저 보여준다.
2. **Inbox**: Workspace에 추천되어 연결 검토가 시작된 인재를 최신순으로 확인한다.
3. **Jobs**: Role별 후보자 파이프라인과 채용 진행 상태를 관리한다.
4. **Team**: 회사 정보, 초대, 멤버와 권한을 관리한다.
5. **Settings**: Slack 연결과 Organization 알림을 관리한다.
6. **Help**: 회사 사용자가 실제 업무 중 참고할 제품 설명과 FAQ를 제공한다.
7. **역할 대화**: 공통 채팅 UI에서 company-side LLM과 새 역할을 등록하고,
   등록된 역할의 정보도 같은 대화에서 수정한다. 오른쪽은 Role, Company, Setting,
   Calibration 탭으로 기존 Organization 데이터와 같은 query cache를 보여준다.

화면은 데스크톱에서 고정 왼쪽 사이드바와 오른쪽 콘텐츠로 구성한다. 모바일에서는
같은 목적지를 유지하는 축약 내비게이션을 제공한다. 역할을 고르기 전 `/org/new`와
다른 Organization 화면은 256px 사이드바를 유지한다. `New` 아래의 `Recent`에는
마지막 대화가 최신인 역할을 먼저, 대화가 없는 역할은 생성 시각이 최신인 순서로
보여준다. 역할별 대화를 열면 sidebar는 72px 아이콘 모드로 접히며 각 아이콘의 이름은
hover tooltip과 접근성 label로 제공한다.

## URL과 코드 구조

| 화면 | URL | 책임 |
| --- | --- | --- |
| Home | `/org/home` | 대기 결정, 미열람 추천, 진행 중 Jobs 요약 |
| Inbox | `/org/inbox` | Workspace별 추천 인재, 미열람/연결 대기 필터 |
| Jobs | `/org/jobs` | 전체 Role 및 Role별 pipeline |
| 새 역할 등록 | `/org/new` | 왼쪽 company-side LLM 채팅, 오른쪽 Role/Company/Setting/Calibration 상세 영역 |
| Team | `/org/team` | 회사 정보, 초대, 멤버/권한 |
| Settings | `/org/settings` | 회사 공용 Slack 연결, 개인 Google Calendar 연결, 알림 설정 |
| Help | `/org/help` | Harper 사용 안내, FAQ |

기존 `/org?orgId=...` 초대 링크는 가입 호환성을 위해 유지하고, bootstrap 후
`/org/home`으로 정규화한다. `orgId`, `roleId`, 후보자 상세 query는 필요한
페이지 이동에서 보존한다.

각 `src/pages/org/*.tsx` 파일은 자신의 페이지 컴포넌트를 명시적으로 구성한다.
`OrgWorkspaceApp`은 인증, bootstrap 로딩/오류 처리, URL 정규화, 공통 sidebar와
콘텐츠 레이아웃까지만 담당한다. Home/Jobs/Team/Settings의 query, mutation,
filter, dialog와 페이지 전용 navigation을 `OrgWorkspaceApp`에 두지 않는다.

공통 bootstrap 응답은 TanStack Query를 SSOT로 유지하고
`useOrgWorkspace()`를 통해 현재 workspace, 멤버, 역할, 권한을 읽는다. 이 hook은
Query 응답을 접근하기 쉽게 제공할 뿐 서버 데이터를 별도 store에 복제하지 않는다.
페이지 전용 서버 데이터는 해당 페이지에서 Query hook을 직접 호출한다.

- Home: board query, Home에서 Jobs/후보자로 이동하는 navigation
- Inbox: 내부 수락/아카이브 단계를 제외한 Workspace 추천 목록,
  열람/연결 대기 filter
- Jobs: role/filter/board/detail query, 후보자/role mutation, Jobs dialog와 agent
- Team: 회사 정보, 초대, 멤버/권한 mutation
- Settings: Slack query와 mutation, 사용자별 Google Calendar 연결 query와 mutation
- Help: 정적 도움말 콘텐츠

Jobs 내부에서 여러 형제 컴포넌트가 함께 사용하는 값은 책임별 도메인 context로
공유한다. navigation, filter, board query, detail query, candidate action,
role action을 각각의 hook으로 읽고, 모든 값을 하나의 거대한 context에 합치지
않는다. 이렇게 하면 filter 입력처럼 자주 바뀌는 값이 후보자 상세나 Agent까지
불필요하게 다시 렌더링하지 않는다. 값과 callback을 shell에서 수십 개의 props로
전달하지 않으며, 한 컴포넌트 안에서만 사용하는 form draft와 dialog open 상태는
그 컴포넌트의 `useState`로 유지한다.

공통 사이드바, 페이지 헤더 등 반복 UI는 `components/org/workspace`에 둔다.

## Home 행동 우선순위

- `pending_connection` 후보자를 Role별로 묶고 추천 시각이 오래된 후보자를 먼저
  보여준다.
- Role별 대기 수와 전체 처리 필요 수를 표시한다.
- 한 Role에 연결 대기가 **5명 이상**이면 “결정 전까지 새 연결이 잠시
  중단된다”는 안내를 표시한다. 이 값은 UI 상수로 한 곳에서 관리한다.
- 열람 여부는 후보자 내용이 아니라 사용자별 UI 힌트이므로 기존과 같이
  localStorage에 저장한다. Home과 Jobs는 같은 workspace/user 키를 사용한다.
- 아직 열지 않은 연결 대기 후보자 중 최대 5명을 간결한 이동 행으로 제공한다.
- 진행 중 Jobs는 전체 Jobs 화면의 Role/단계 수를 축약해 보여준다.

## 권한 모델

| 기능 | Owner | Admin | Viewer |
| --- | --- | --- | --- |
| Organization 열람 | 가능 | 가능 | 가능 |
| 후보자 상세/이력서 열람 | 가능 | 가능 | 가능 |
| 후보자 수락·거절/단계 이동 | 가능 | 가능 | 불가 |
| Pipeline 칼럼 추가·수정·삭제 | 가능 | 가능 | 불가 |
| 후보자 피드 메모 작성·수정·삭제 | 가능 | 가능 | 불가 |
| Role 수정·중단·재개 | 가능 | 가능 | 불가 |
| 회사 정보 수정 | 가능 | 가능 | 불가 |
| 멤버 초대·초대 취소·재발송 | 가능 | 불가 | 불가 |
| 멤버 권한 변경 | 가능 | 불가 | 불가 |
| Slack 연결·해제·알림 설정 | 가능 | 가능 | 불가 |
| 본인 Google Calendar 연결·해제 | 가능 | 가능 | 가능 |

권한은 bootstrap 응답을 React Query가 캐시하고 화면에서는 그 값을 기반으로
control을 숨기거나 비활성화한다. 같은 데이터를 Zustand에 다시 복제하면 권한
변경 직후 두 캐시가 어긋날 수 있으므로 별도 전역 store를 두지 않는다.
클라이언트 권한 처리는 사용성만 위한 것이고, 모든 쓰기 API가 서버에서 다시
권한을 확인한다.

`Personal integrations`는 회사 공용 연결과 별개다. 개인 Google Calendar는
로그인한 직원에게 귀속되며, Owner/Admin도 다른 직원의 연결을 관리할 수 없다.
현재는 연결과 해제만 제공하며 일정 조회·생성이나 company-side LLM 도구는 제공하지 않는다.

내부 Harper 운영 계정은 internal workspace에서 Owner와 같은 가상 권한을 갖는다.
기존 `member` 값은 호환 기간 동안 Admin으로 해석하고 migration에서 `admin`으로
정규화한다.

마지막 Owner를 Viewer/Admin으로 내리거나 제거하는 작업은 서버가 거부한다.

## 초대 흐름

1. Owner가 Team 화면에서 초대 모달을 연다.
2. 이메일과 `Admin` 또는 `Viewer` 권한을 선택한다. 필요할 때 Owner도 선택할
   수 있다.
3. 초대 행에 선택한 권한을 함께 저장하고 메일을 보낸다.
4. 초대받은 사용자가 로그인하면 이메일과 일치하는 pending invitation의 권한으로
   membership을 만든다.
5. 공용 초대 링크로 가입하고 이메일 invitation이 없는 사용자는 안전한 기본값인
   Viewer로 가입한다.
6. Owner는 pending invitation의 더 보기 메뉴에서 다시 보내기 또는 초대 취소를
   실행할 수 있다.

## Slack 알림

현재 실제 이벤트에 맞춰 다음 세 종류를 제공한다.

- 후보자 연결 수락
- 후보자 프로세스 중단
- 새 멤버 합류

각 채널은 workspace Slack integration 행으로 저장하며, 알림 설정은 연결된 모든
채널 행에 동일하게 반영하고 발송 직전에 확인한다. 하나의 Organization에 여러
채널을 연결할 수 있고 각 채널의 최근 발송 성공·실패 상태를 따로 관리한다. Slack
상태는 모든 멤버가 볼 수 있지만 채널 추가·제거와 알림 설정은 Owner와 Admin만
가능하다.

## 데이터와 로딩

- 인증/bootstrap, board, candidate detail, Slack 상태는 TanStack Query를 사용한다.
- 모든 조회 hook은 재사용 가능한 `queryOptions()` 또는
  `infiniteQueryOptions()` factory를 export한다.
- 데이터 의존 화면은 빈 값이 확정되기 전까지 공통 Skeleton/로딩 상태를 보여준다.
- mutation 성공 시 `queryKeys.org.all` 또는 Slack query를 invalidate하여 서버
  결과를 다시 읽는다.
- 후보자 stage, 메모, 권한, 초대는 optimistic authority로 취급하지 않고 서버
  성공 후 갱신한다.

## 화면 디자인 원칙

Organization 화면은 “카드 모음”이 아니라 하나의 작업 문서처럼 보여야 한다.
Claude Console과 xAI Console의 관리 화면에서 공통적으로 보이는 단일 배경,
넓은 여백, 행 기반 정보 구조를 기준으로 다음 규칙을 적용한다.

### 배경과 표면

- Workspace shell, sidebar, page content의 기본 배경은 모두
  `bg-bg-default`를 사용한다.
- 일반적인 정보 묶음에 별도 배경을 만들지 않는다. 페이지 배경 위에서 섹션
  제목, 설명, 본문이 바로 이어져야 한다.
- `bg-bg-floating`은 dialog, dropdown, popover처럼 실제로 떠 있는 UI에만
  사용한다.
- `bg-bg-weak`과 상태 배경은 hover, 선택 상태, 오류, 경고처럼 의미가 있을
  때만 사용한다.

### 정보 구조

- 페이지는 `OrgPageHeader` 다음에 여러 `OrgSection`을 세로로 배치한다.
- 섹션 사이 위계는 둥근 카드가 아니라 여백과
  `border-neutral-1000-a05` 구분선으로 만든다.
- 반복 데이터는 카드 grid보다 table/list row를 우선한다. 행 전체 이동이
  가능하면 hover 배경만 추가한다.
- 섹션 제목은 아이콘 박스 없이 텍스트로 시작한다. 아이콘은 navigation,
  실제 상태, 아이콘 없이는 의미가 불분명한 조작에만 쓴다. 텍스트로 의미가
  충분히 전달되는 버튼·목록 행·설명에는 아이콘을 덧붙이지 않는다.
- `Bot`, `BotMessageSquare`, `Sparkle`, `Sparkles`, `Wand`,
  `WandSparkles`, `BrainCircuit`, `Stars`처럼 제품을 막연히 AI처럼 보이게
  만드는 아이콘은 사용하지 않는다. 실제 기능을 설명할 때도 채팅, 검색,
  전송처럼 구체적인 행위를 나타내는 중립 아이콘을 선택한다.
- `title + description + icon well + bordered card` 패턴을 일반적인 섹션
  구성으로 사용하지 않는다.

### 밀도와 타이포그래피

- 기본 본문 너비는 읽기 쉬운 `1240px` 이하로 유지하고 좌우 여백을 충분히
  둔다.
- 일반 텍스트는 `10px`에서 `17px`, `font-light | font-normal |
  font-medium`만 사용한다.
- 페이지 제목은 `20px`, 섹션 제목은 `16px` 전후를 기본으로 하고, 숫자나
  핵심 상태만 제한적으로 더 크게 표시한다.
- 본문과 행 제목은 `12px`에서 `14px`를 기본으로 한다. 반복 행은 보통
  `py-3`에서 `py-3.5`, 섹션 헤더 아래 여백은 `mb-5`, 섹션 사이 여백은
  `space-y-8`
  이내에서 시작한다.
- 텍스트 버튼은 `MuteButton size="md"`를 기본으로 하고, 고밀도 toolbar만
  `size="sm"`을 쓴다. modal의 기본 padding은 `p-5`에서 `p-6`, 일반
  content pane은 `p-4`에서 `p-5`를 사용한다. 큰 padding은
  빈 상태나 의도적인 읽기 여백에만 허용한다.
- 설명은 한 섹션에 한 번만 제공한다. 같은 의미를 카드마다 반복하지 않는다.

### 카드 허용 범위

- Jobs pipeline의 후보자 카드와 칼럼
- 차트처럼 하나의 시각적 캔버스가 필요한 데이터 시각화
- dialog, dropdown, popover, floating agent처럼 실제 overlay인 UI
- 오류·경고·결정 필요처럼 배경 자체가 상태를 전달하는 callout

허용된 카드도 페이지 기본 배경과 분리할 이유가 없으면
`bg-bg-default`를 사용한다. 장식 목적의 shadow와 icon well은 추가하지 않는다.

### 구현 규칙

- 공통 섹션은 `components/org/workspace/OrgSection.tsx`의
  `OrgSection`, `OrgSectionHeader`를 사용한다.
- 행의 기본 구조는 `border-t` 또는 `divide-y`, `py-2.5`, 필요할 때만
  `hover:bg-bg-weak`을 사용한다.
- form control과 button은 기존 `components/ui` 기본 컴포넌트를 사용한다.
- 로딩 중에는 최종 섹션 구조와 비슷한 Skeleton을 보여주며 빈 데이터로 먼저
  렌더링하지 않는다.
- Jobs/파이프라인의 업무 밀도는 유지하되, shell과 page header 배경은 같은
  원칙을 따른다.

## Harper 내부 모드

`@matchharper.com` 계정은 internal workspace를 `/org`의 동일한 구조에서 운영할
수 있다. 내부 운영 데이터는 다음 원칙으로 회사 사용자 데이터와 분리한다.

- `내부:수락` 후보자는 내부 계정에서만 `수락` 칼럼으로 표시하고, 일반 회사
  사용자의 board 응답에서는 제외한다.
- 과거 회사 사용자가 수락한 추천은 `org_stage_change`의 `connected` 이력을
  확인해 내부 수락과 구분하고 기존처럼 `연결됨`으로 표시한다.
- 후보자 상세의 `Harper 내부 정보` 탭에는 Ops 인사이트, 다른 추천, 대화 내역,
  계정 상태와 최근 7일 추천 반응 지표를 제공한다.
- 내부 데이터 API는 `@matchharper.com` 세션만 허용한다. 일반 회사 사용자는
  숨겨진 추천 ID나 Talent ID를 직접 요청해도 상세·이력서 API에서 거절된다.
- 내부 전용 칼럼과 상세 영역에는 `rgba(0, 0, 0, 0.05)`의 촘촘한 사선
  overlay를 `z-index: 10`으로 표시하고, 회사 사용자에게 숨겨지는 데이터라는
  안내를 함께 제공한다.

## 필요한 DB 변경

Migration에서 다음을 적용한다.

- `company_user_workspace.authority`를 `owner | admin | viewer`로 정규화하고
  check constraint를 추가한다.
- `company_user_workspace.role`은 워크스페이스별 직함으로 사용한다. 값이 없으면
  이름과 직함을 받는 최초 프로필 모달을 완료할 때까지 계속 표시한다.
- Owner가 없는 기존 workspace는 가장 오래된 membership 한 명을 Owner로
  승격한다.
- `company_workspace_invitations.role`을 추가한다.
- `company_slack_integrations`에 세 알림 종류의 boolean preference를 추가한다.

실행할 SQL은 구현과 함께 `supabase/migrations`에 추가한다.
