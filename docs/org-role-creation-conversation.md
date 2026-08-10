# Company-side LLM 역할 생성 대화 모드 설계

## 1. 목적과 범위

`/org/new`에 회사 사용자가 Harper와 대화하며 역할을 새로 작성하거나 이미 등록된
역할을 수정하는 `role_creation` 모드를 추가한다. 이 모드는 기존 `/org`
company-side LLM과 같은 모델 실행 기반을 쓰지만, 대화 범위·시스템 프롬프트·도구·완료
조건은 분리한다.

이 작업의 우선순위는 다음과 같다.

1. `/career`의 화면, API 요청, 프롬프트 선택, 온보딩 전환 조건에 회귀가 없어야 한다.
2. `/org`의 기존 일반 채팅과 Slack company-side LLM 동작이 유지되어야 한다.
3. 역할 생성 중 입력한 값이 오른쪽 상세 화면에 즉시 반영되어야 한다.
4. LLM이 빈칸을 순서대로 읽는 폼이 아니라, 좋은 매칭에 필요한 정보를 판단해
   자연스럽고 답하기 쉽게 질문해야 한다.
5. 역할 활성화는 서버가 검증한 명시적 사용자 선택으로만 일어나야 한다.

배포와 운영 문서 갱신은 이 문서의 범위가 아니다. 이 문서는 로컬 구현 계약을
정의하며, 실제 배포 시에는 저장소 루트 `AGENTS.md`의 Notion 동기화 절차를 별도로
수행한다.

## 2. 회귀 방지 경계

### `/career`

- Career 채팅의 컴포넌트 public props와 기본값을 바꾸지 않는다.
- Career API, 온보딩 모드 판정, 시스템 프롬프트, tool allowlist,
  `[[HARPER_ONBOARDING_DONE]]` 전환 계약을 수정하지 않는다.
- 공통 채팅 UI를 재사용하더라도 기존 Career 렌더 트리와 CSS 토큰의 결과가 같아야
  한다.
- 공통 `open_url`/`web_search` 정의를 Career에서 사용하게 바꾸는 경우에도 기존
  tool 이름과 JSON schema, 일반 URL 응답 계약을 유지한다. LinkedIn Apify reader는
  company-side 호출에서만 명시적으로 활성화하며, Career의 기존 “지원하지 않음”
  응답도 그대로 유지한다.

### `/org` 일반 채팅과 Slack

- `mode`를 보내지 않은 기존 요청은 항상 `general`로 해석한다.
- 일반 웹 채팅과 Slack은 현재의 workspace-scoped conversation(`role_id IS NULL`)을
  계속 사용한다.
- 기존 일반 채팅 프롬프트, tool loop, 후보자 mention, 변경 제안/확정 로직은
  수정하지 않는다.
- `role_creation`은 API entry point에서 전용 orchestrator로 분기하며 일반
  orchestrator에 조건문을 누적하지 않는다.

## 3. 사용자 흐름

### 3.1 새 역할 시작

1. 사용자가 “새로운 역할 등록”을 누르면 `/org/new`로 이동한다.
2. 아직 `roleId`가 없으면 오른쪽 패널을 렌더하지 않고 채팅 영역이 남은 화면 전체를
   사용한다.
3. composer는 ChatGPT 첫 화면처럼 수직 중앙 근처에 배치한다.
4. composer 위에 다음 안내를 `font-normal`의 조금 큰 본문으로 표시한다.

   > 안녕하세요. 새롭게 채용을 원하는 역할에 대해 알려주세요. JD 링크 혹은 파일을
   > 주시거나, 쭉 설명해주셔도 좋습니다.

5. 타이핑이나 파일 선택만으로 서버 상태를 만들지 않는다. 텍스트 또는 첨부 파일을
   처음 전송할 때 draft 역할을 만든다.
6. 파일만 전송하는 것도 허용하며, 저장되는 사용자 메시지는 첨부 자료를 기준으로
   역할 등록을 시작한다는 짧은 문장을 사용한다.
7. 서버가 생성된 `roleId`를 SSE `role_created` 이벤트로 응답하면 URL을
   `/org/new?orgId=...&roleId=...`로 교체한다. 브라우저 history에 중복 시작
   화면은 남기지 않는다.
8. 이후 화면은 왼쪽 role 전용 채팅, 오른쪽 Role/Company/Setting/Calibration
   상세로 전환된다.

### 3.2 draft 재개

- `company_roles.status = 'draft'`인 역할을 `/org/jobs`에 “준비중”으로 표시한다.
- draft 카드/역할 선택기를 누르면 일반 역할 상세가 아니라
  `/org/new?roleId=...`로 이동한다.
- 해당 역할의 role-scoped conversation만 불러와 그대로 이어간다.
- 다른 role의 role-creation 대화, 일반 `/org` 채팅, Slack 메시지는 보이지 않는다.
- 이름을 아직 파악하지 못한 draft는 `새 역할`이라는 중립적인 임시 이름을 쓴다.

### 3.3 Recent 역할과 등록 후 수정

- 펼쳐진 Organization sidebar의 `New` 아래에는 구분선과 `Recent` 역할 목록을 둔다.
- 역할별 대화가 있으면 마지막 메시지가 최신인 역할부터 보여준다. 아직 대화하지 않은
  역할끼리는 역할 생성 시각이 최신인 순서로 보여준다.
- 항목을 누르면 해당 역할의 `/org/new?roleId=...`로 이동하고, 역할 등록 과정에서 쓰던
  role-scoped 대화와 오른쪽 상세 화면을 그대로 연다.
- 이미 등록된 역할도 같은 대화에서 역할 정보와 내부 matching context를 수정할 수
  있다. 수정값은 즉시 저장하며 역할을 다시 활성화하거나 생성 확인을 요구하지 않는다.
- 역할별 대화가 시작된 화면에서는 sidebar를 아이콘 너비로 접고, 처음 `/org/new`에
  들어온 상태에서는 `Recent`를 선택할 수 있도록 펼친 상태를 유지한다.
- 데스크톱 역할 대화에서는 채팅과 상세 사이 divider를 pointer 또는 방향키로 조절할
  수 있다. 채팅 폭은 전체의 28~72% 범위에서 움직이며, 마지막 폭은 Zustand persist를
  통해 브라우저 localStorage에 저장해 다음 방문에도 복원한다.
- 기존 `/org` 오른쪽 아래의 workspace 범용 대화 launcher는 노출하지 않는다.

### 3.4 활성화

1. LLM은 현재 저장 상태가 역할을 검토하기에 충분해 보일 때
   `request_role_creation_confirmation`을 활용한다.
2. 이 tool은 status를 바꾸지 않고, 서버가 현재 DB 상태를 다시 검증한 뒤 assistant
   message에 다음 선택지를 붙인다.

   - LLM이 최신 대화와 저장값을 바탕으로 공개 역할 정보, 내부 매칭 기준, Slack,
     담당자를 이해하기 쉬운 형태로 정리하고 최종 의사를 묻는다.
   - 선택지: `예`, `아니오`

3. 자유 텍스트의 “예”, LLM의 추론, tool 호출 자체는 완료로 인정하지 않는다.
4. 사용자가 발급된 선택지의 `예` 버튼을 누르면 별도 confirm API가 다음을 검증한다.

   - 선택지가 같은 workspace/role/conversation의 아직 처리되지 않은 최신 선택지인지
   - role이 여전히 `draft`인지
   - 모든 필수 역할 필드가 존재하는지
   - Slack 채널과 담당자 한 명을 사용자가 대화에서 명시적으로 확인했는지

5. 검증 성공 시에만 role status를 `active`로 전환하고 대화 phase를 `completed`로
   기록한다. 이후 일반 Role 상세로 이동한다.
6. `아니오`는 draft를 유지하고 선택지만 `declined`로 닫는다. Harper는 무엇을 더
   다듬을지 묻는다.
7. 이미 처리된 선택지를 재클릭해도 결과가 중복 적용되지 않아야 한다.

## 4. 데이터 모델과 격리

### 4.1 역할 상태

- 신규 상태: `draft`
- migration은 기존 `company_roles_status_check`가 허용하던 제품 상태를 유지하면서
  `draft`를 먼저 추가한 뒤 생성 로직을 사용한다.
- 생성 기본값:
  - `name = '새 역할'`
  - `status = 'draft'`
  - `source_type = 'internal'`
  - `is_expired = false`
- draft는 내부 역할 검색과 talent-side 추천 검색에 노출하지 않는다.
- activation 시 기존 검색 vector trigger가 내용을 다시 계산할 수 있어야 한다.
- draft 자동 삭제는 하지 않는다. 사용자는 목록에서 다시 시작할 수 있다.

### 4.2 conversation scope

두 conversation 종류를 동시에 유지한다.

| scope | `company_conversations.role_id` | 사용처 |
| --- | --- | --- |
| workspace | `NULL` | 기존 `/org` 일반 채팅 및 Slack |
| role creation | 해당 role UUID | `/org/new` 역할 생성 대화 |

Role-creation conversation metadata에는 최소 다음을 둔다.

- `scope: 'role_creation'`
- `phase: 'collecting' | 'confirmation_pending' | 'confirmation_processing' | 'completed'`
- `confirmedSlackChannelIds: string[]`
- `confirmedAssigneeUserId: string | null`
- `pendingConfirmationMessageId: number | null`
- 처리 중인 confirmation의 action/message/decision과 60초 lease 시작 시각
- 마지막으로 처리한 confirmation의 action/message/decision과 처리 시각
- `completedAt`, `completedBy` (완료 시)

`company_messages.message_type`은 role creation에서 항상 `chat`이다. role-specific
conversation을 조회할 때 conversation id와 role id를 함께 검사하므로 Slack worker가
workspace conversation에 쓴 메시지가 쿼리 결과에 들어갈 수 없다.

### 4.3 첫 전송 멱등성

- 클라이언트는 역할이 없는 첫 전송 직전에 `crypto.randomUUID()`로 `draftRoleId`를
  만든다.
- 서버는 권한과 UUID를 검사한 뒤 그 ID로 draft를 insert한다.
- 동일 요청의 네트워크 재시도에서는 이미 존재하는 동일 workspace의 draft를 재사용한다.
- 기존 active role의 ID나 다른 workspace role의 ID를 `draftRoleId`로 보내면 거부한다.

### 4.4 문서

1차 구현에서는 원문 파일을 서버에 영구 저장하지 않는다. 사용자가 전송할 때만
인증된 추출 API로 파일을 보내고, 역할 생성 대화를 다시 이어갈 수 있도록 크기가
제한된 추출 텍스트와 표시용 metadata(파일명, MIME, 크기)를 해당 role-scoped
사용자 메시지 metadata에 보관한다. 클라이언트에 대화 내역을 반환할 때는 표시용
metadata만 보내고 추출 텍스트는 제거한다.

보안 원칙:

- workspace 접근 권한과 role 소속을 서버에서 다시 검사한다.
- 파일 원문이나 공개 URL을 보존하지 않는다.
- 확장자와 MIME만 신뢰하지 않고 크기와 허용 형식을 함께 검증한다.
- 추출 텍스트를 system instruction이 아닌 `untrusted_document` context로 감싼다.
- 파일 안의 “이전 지시를 무시하라” 같은 문장은 자료 내용일 뿐 실행 지시가 아니다.
- 원문/추출문을 로그에 출력하지 않는다.

향후 원문 다운로드나 재처리가 필요해지면 private storage와 별도 document table을
추가하되, 현재 역할 생성의 완료 조건으로 두지 않는다.

## 5. 필수 정보와 완료 검증

완료에 필요한 값은 다음과 같다.

| 항목 | 저장 위치 | 검증 |
| --- | --- | --- |
| 역할명 | `company_roles.name` | `새 역할`이 아닌 비어 있지 않은 값 |
| 공개 설명 | `description` | 비어 있지 않음. 내용의 충분성은 대화 prompt가 nudge로 보강 |
| 내부 요청/기준 | `request` | 비어 있지 않은 matching 기준 |
| 근무 지역 | `location_text` | 비어 있지 않음 |
| 근무 방식 | `work_mode` | 비어 있지 않음 |
| 고용 형태 | `type` | 한 개 이상 |
| 연결 Slack | notification 설정 + conversation confirmation | 한 개 이상, 활성 채널, 명시적 확인 |
| 담당자 | `company_role_assignees` + conversation confirmation | 활성 workspace member 정확히 한 명 |

설명 길이 하나로 품질을 단정하지 않는다. 다만 직무명만 반복한 한 문장처럼 역할의
미션·주요 결과·범위 중 어느 것도 알 수 없는 경우에는 확인을 요청한다.

## 6. 질문 정책

### 6.1 기본 원칙

- system prompt는 이미 알려준 내용을 활용하고 현재 DB·첨부·링크를 함께 살펴보는 편이
  자연스럽다고 안내한다.
- 한 가지 깊이 있는 질문이 대체로 답하기 쉽고, 짧고 독립적인 두 질문은 함께 물어도
  좋다는 정도의 대화 가이드를 제공한다.
- 새로 얻은 정보를 먼저 저장하고 이해한 내용을 간단히 보여주면 사용자가 진행 상황을
  파악하기 쉽다고 설명한다.
- Markdown 구역, bullet, 이유, 예시는 내용이 복잡할 때 가독성을 높이는 선택지로
  제안한다. 서버는 문장 수, 글자 수, Markdown 사용 여부를 판정하지 않는다.
- 좋은 매칭, 후보자에게 역할을 정확히 설명하는 일, 내부 screening 기준에 실제로
  영향을 주는 질문을 우선하면 좋다고 안내한다.
- 공개 설명과 내부 기준을 구분하고, 민감한 기준은 내부 matching context로 다루는 편이
  좋다고 안내한다.

### 6.2 유의미한 nudge

LLM은 회사 단계·크기·산업·역할 수준에 따라 정보 가치가 큰 부분을 골라 질문한다.
예:

- 초기 조직: 역할 경계, 직접 소유할 결과, hands-on 비중, 불확실성 속 의사결정
- 성장 조직: 팀 간 interface, scale 문제, 기존 시스템/프로세스의 제약
- 매니저: 팀 구성, 직접 관리 범위, 채용/성과관리 책임
- IC: 기대 산출물, 기술/도메인 깊이, 독립 실행 범위
- 규제/도메인 특화 회사: 실제 매칭에 쓰일 필수 도메인 경험이나 자격

설명에 공백이 있으면 “좋은 분들은 이 역할에서 첫 6~12개월에 무엇을 맡는지
궁금해해요”처럼 질문 이유를 한 문장으로 설명한다. 이유는 일반론을 길게 말하지 않고
이번 역할에 구체적으로 연결한다.

### 6.3 내부 기준과 다른 역할의 기억

- 공개하기 어렵지만 꼭 지켜야 하는 조건과 가산점 기준을 편하게 공유할 수 있다고
  안내한다.
- 다른 역할의 `request`/memory를 읽을 수 있지만 원문을 무조건 복사하지 않는다.
- 회사 단계, 직군, seniority가 이번 역할과 실제로 유사한 기준만 추려
  “이전 역할에서 X를 중요하게 보셨는데 이번에도 적용할까요?”라고 제안한다.
- 사용자가 동의한 뒤에만 이번 role request/memory에 반영한다.
- 차별적이거나 법적·윤리적으로 부적절한 기준은 저장/적용하지 않고 직무 관련 기준으로
  재구성하도록 유도한다.

### 6.4 Slack과 담당자

- 사용 가능한 Slack 채널이 하나면 그 이름을 제시하고 “여기에 연결할까요?”라고
  묻는다.
- 여러 개면 역할에 가장 맞는 후보를 제시하되 확신이 없으면 짧은 선택지를 제공한다.
- 현재 작성자가 활성 workspace member이면 이름을 제시하고 “OO님을 담당자로
  등록할까요?”라고 묻는다.
- 담당자가 하는 일(알림 확인, 후보자 진행의 대표 연락점)을 한 문장으로 설명한다.
- 도구는 사용자가 명시적으로 동의한 뒤 호출한다.
- 연결 가능한 Slack이 없으면 완료할 수 없음을 설명하고 연결 경로를 안내한다.

## 7. role_creation 도구

Role-creation mode에는 역할 작성에 필요한 작은 범위의 도구를 제공한다.

### 공통 읽기

- `open_url`: 일반 URL 및 LinkedIn profile/job/company 읽기
- `web_search`: 공개 웹 검색

### 역할 작성

- `update_role_draft`
  - 현재 role만 수정할 수 있다.
  - title, description, request, location, work mode, employment types,
    salary, external JD URL, Guide for Harper(memory)를 부분 업데이트한다.
  - `roleId`는 model input으로 받지 않고 server context에서 고정한다.
- `update_company_context`
  - Company 탭의 회사명, 로고, 한 줄 소개, 설명/pitch, 위치, 설립연도, 인원,
    홈페이지/LinkedIn, 투자 정보를 부분 수정한다.
  - 사용자가 회사 전체에 적용하려는 사실을 저장할 때 활용하기 좋다.
- `read_other_roles`
  - 같은 workspace의 다른 역할만 읽는다.
  - 비교에 필요한 설명/request/memory를 제한된 개수와 크기로 반환한다.
- `set_role_notification`
  - 활성 Slack channel ID들과 담당자 한 명을 설정한다.
  - 현재 대화에서 사용자가 대상 채널과 담당자를 분명하게 선택한 경우 활용하기 좋다고
    tool description에서 안내한다.
  - conversation confirmation metadata도 함께 갱신한다.
- `request_role_creation_confirmation`
  - 모든 필수값을 서버에서 검사한다.
  - 준비되지 않았으면 missing field를 tool error로 돌려주고 선택지를 만들지 않는다.
  - 준비되었으면 confirmation choice를 만들 뿐 status는 바꾸지 않는다.

후보자 조회/수락/거절/단계 이동, meeting, Slack reply 도구는 이 모드에 제공하지 않는다.

## 8. URL 읽기와 LinkedIn Apify routing

`open_url`은 URL을 정규화한 후 host/path로 reader를 선택한다.
아래 LinkedIn reader는 company-side LLM에서만 opt-in하며 Career에는 적용하지 않는다.

| URL | reader | 결과 원칙 |
| --- | --- | --- |
| `linkedin.com/in/*`, `/pub/*` | profile actor | 기본 정보, headline/about, 현재·과거 경험, 교육, 핵심 skills |
| `linkedin.com/jobs/view/*` 등 job URL | job actor | URL/job ID가 정확히 일치하는 공고 1개만 |
| `linkedin.com/company/*` | company actor | 회사 소개, 규모, 산업, 위치, 홈페이지, specialties, funding 요약 |
| 그 외 | 기존 Firecrawl/documents cache | 기존 계약 유지 |

Job actor가 여러 행을 반환하면 정규화한 LinkedIn job ID 또는 canonical URL로 exact
match한 한 행만 선택한다. exact match가 없으면 첫 행을 추측해서 쓰지 않고 읽기 실패로
처리한다.

모든 reader는 actor raw payload를 그대로 반환하지 않는다. role 작성에 필요한 필드만
pick하고 문자열/배열 길이를 제한하며 인증정보, 내부 actor metadata, 불필요한 crawl
데이터는 버린다.

## 9. 파일 UX와 파싱

- 파일 버튼은 `purpose='role-creation'` composer에만 보인다. `/career`와 `/org` 일반
  composer에는 나타나지 않는다.
- 허용: `.md`, `.markdown`, `.txt`, `.text`, `.pdf`, `.docx`, `.doc`, `.json`
  및 텍스트 기반 `.csv`, `.yaml`, `.yml`, `.xml`, `.html`, `.rtf`.
- 거부: image, video, audio, executable/archive.
- 한 번의 메시지에 최대 3개, 파일당 10MB, 합계 25MB로 제한한다.
- 선택한 파일은 즉시 전송하지 않고 composer 위 rounded-full chip으로 표시한다.
- chip의 X로 전송 전 제거할 수 있다.
- 서버도 같은 제한을 다시 검증한다.
- PDF는 기존 parser, DOCX는 Mammoth, 일반 텍스트/JSON은 UTF-8 기반으로 읽는다.
- legacy `.doc`는 OLE binary 안의 긴 printable ASCII/UTF-16LE run만 보수적으로
  추출한다. 읽을 수 없는 문서는 오류를 반환하고 역할 대화를 추측으로 진행하지 않는다.
- 추출 텍스트는 파일별/turn 전체 길이를 제한하고 truncation 여부를 기록한다.
- 첨부 실패 시 그 turn 전체를 실패시켜 파일을 읽었다고 LLM이 오인하지 않게 한다.

## 10. 프론트엔드 상태와 실시간 반영

- message query key는 `workspaceId + mode + roleId`로 분리한다.
- 역할 생성 전에는 history query를 실행하지 않는다.
- `role_created` 수신 즉시 URL을 replace하고 role-scoped history key로 전환한다.
- tool turn 완료 후 다음을 invalidate한다.
  - org bootstrap/role 목록
  - 해당 role notification query
  - 해당 role creation message history
- 오른쪽 Role/Setting 패널은 role `updatedAt`, `memoryUpdatedAt`을 key에 포함해 대화
  turn이 끝난 뒤 저장된 서버값을 다시 표시한다. 같은 시점에 오른쪽 폼을 편집한 경우에는
  저장된 서버값이 우선하며, 일반 폼과 같은 unsaved-change 경고를 사용한다.
- Company 탭은 기존 `/org/team`과 같은 컴포넌트와 query를 사용하므로 company tool
  변경 후 같은 invalidation으로 반영한다.

## 11. 오류·경계 상황

- 권한 없음: role 생성/조회/수정/완료 모두 서버 403.
- 다른 workspace roleId: 404로 숨긴다.
- active/ended role로 role-creation 진입: 새 대화를 만들지 않고 일반 역할 상세로
  이동하도록 client에 상태를 알린다.
- roleId 없는 첫 turn LLM 실패: draft와 user message는 보존해 목록에서 재개할 수 있다.
- tool 일부 성공 후 LLM 실패: 성공한 변경을 오른쪽 화면에 반영하고 재시도 가능한 오류를
  보여준다.
- 서버는 모델 응답의 글자 수나 형식을 기준으로 재생성하거나 상태별 고정 답변으로
  교체하지 않는다. 모델 content가 전혀 없으면 해당 turn을 실패로 처리해 빈 assistant
  message를 저장하지 않는다.
- 최종 확인 전 설명과 예/아니오 선택 뒤 결과 안내도 최신 저장 상태를 읽은 LLM이
  작성한다. 활성화와 멱등성 처리는 안내문 생성 성공 여부와 분리한다.
- 중복 완료 클릭: 같은 action/message/decision이면 첫 완료 결과를 반환하는 idempotent
  응답. 처리 중에는 conversation metadata lease와 compare-and-set으로 한 요청만 진행한다.
- 완료 대기 중 role 필드가 바뀜: confirmation 클릭 시 재검증하며, 부족하면 draft를
  유지하고 새 missing 항목을 안내한다.
- 암호화·손상 문서 등 parser 오류: 해당 파일을 읽을 수 없다는 오류를 표시하고 그 turn은
  전송하지 않는다.
- Slack channel이 비활성화되거나 담당자가 workspace에서 빠짐: 완료 시 재검증 실패.
- 동시에 두 탭에서 대화: message는 같은 role conversation에 순서대로 저장된다. 완료는
  conversation lease로 선점하고, DB trigger가 generic status 변경을 막으며 service-role 전용
  completion RPC만 `draft → active`를 수행한다.
- notification tool과 confirmation tool이 같은 turn에 실행되면 confirmation metadata는
  turn 시작 시점이 아니라 notification 반영 뒤 최신 conversation metadata를 기반으로 저장한다.

## 12. 관측성과 개인정보

- tool status는 사용자에게 `링크 읽는 중`, `역할 정보 반영 중`, `완료 조건 확인 중`
  수준으로만 표시한다.
- 새 역할 생성 경로는 문서 본문, private request, memory를 application log에 쓰지 않는다.
  API의 예기치 않은 실패는 route 이름과 error만 기록한다.
- LLM context에는 같은 workspace의 필요한 데이터만 포함한다.
- 다른 역할의 민감한 criteria는 회사 사용자에게 필요한 범위에서만 쓰며 후보자용 공개
  설명과 섞지 않는다.

## 13. 검증 계획

### 정적·단위 검증

- role status normalization에서 `draft`가 보존되는지
- 일반/role conversation 선택 함수가 서로 다른 row를 반환하는지
- message query key가 role별로 충돌하지 않는지
- 필수 필드 validator의 missing 목록
- confirmation tool은 status를 바꾸지 않는지
- confirm API는 버튼 token/message ID 없이는 활성화하지 않는지
- LinkedIn URL 분류, job exact-match, compact sanitizer
- 허용/거부 확장자, 3개/크기 제한, PDF/DOCX/텍스트 parsing
- draft가 internal role search 대상이 아닌지

### 통합 검증

1. 텍스트 첫 전송 → draft 1개 → URL roleId → 오른쪽 패널 등장
2. 동일 request 재시도 → draft 중복 없음
3. 파일 세 개 선택/하나 제거/전송 → 두 파일만 메시지와 LLM context에 포함
4. 서로 다른 두 draft → 각자 대화만 표시
5. Slack-origin message → role creation history에 없음
6. tool update → Role/Company/Setting 패널 갱신
7. 필수값 부족 completion request → 선택지 없음
8. 필수값 충족 → 선택지 표시 → 텍스트 “예”로는 draft 유지
9. `아니오` 버튼 → draft 유지, 다시 대화 가능
10. `예` 버튼 → active 전환, 일반 role 상세 이동

### 회귀 검증

- `/career` 관련 변경 파일 diff를 확인하고 의도하지 않은 source 변경이 없는지 검사한다.
- Career chat/onboarding 관련 기존 tests, typecheck, lint를 실행한다.
- `/org` 일반 채팅의 workspace conversation/history/tool 목록 snapshot을 확인한다.
- Slack company-side LLM이 여전히 workspace conversation에만 기록하는지 확인한다.

## 14. 구현 순서

1. migration과 status/search 격리
2. role-scoped store와 mode-aware message API
3. 전용 prompt/tool set/orchestrator
4. shared web tools와 LinkedIn readers
5. file validation/parsing/storage
6. confirm endpoint와 서버 validator
7. hook/query key/SSE events
8. centered composer, attachment chips, role-specific timeline
9. draft 목록 재개 routing과 오른쪽 live panel
10. unit/type/lint/build 및 `/career` diff audit
