# Mock Interview Implementation

이 문서는 `/career`에서 모의 인터뷰를 구현하는 방식만 다룬다.

## 목표

유저가 채팅에서 모의 인터뷰를 요청하거나, 추천 Job 모달에서 `모의 인터뷰` 버튼을 누르면 모의 인터뷰 준비 화면을 보여준다.

처음부터 바로 인터뷰를 시작하지 않는다. 먼저 아래처럼 준비 카드를 보여준다.

```text
Take a mock interview

Let's prepare for your TwelveLabs interview.

Goal: Practice your pitch, technical deep dives, and motivations for the Senior ML Research Engineer role.
Focus: We'll cover your OptimizerAI background, multimodal embedding research, and distributed training at scale.
Feedback: You'll get direct feedback on your narrative and technical clarity.

Join (~15 mins)
or continue in chat
```

`Join`은 전화 모드로 시작한다. `continue in chat`은 텍스트 인터뷰로 시작한다.

## 유입 경로

### 1. 채팅 요청

유저가 아래처럼 말하면 모의 인터뷰 준비를 시작한다.

```text
모의 인터뷰 해줘
TwelveLabs 인터뷰 준비해줘
이 공고로 mock interview 해줘
```

서버는 메시지를 저장하고, 가장 최근 추천 공고 또는 메시지에서 추정한 회사/역할을 바탕으로 모의 인터뷰 세션을 만든다.

### 2. Job 모달 버튼

추천 Job 상세 모달에 `모의 인터뷰` 버튼을 추가한다.

이 버튼은 `opportunityId`를 API에 넘긴다. 서버는 해당 추천 공고의 회사, 역할, JD를 기준으로 인터뷰 준비를 한다.

## 사용자 흐름

1. 유저가 모의 인터뷰를 요청한다.
2. 채팅창에 `인터뷰 준비중...` 메시지를 보여준다.
3. 서버가 회사/역할/JD를 기준으로 인터뷰 자료를 만든다.
4. 채팅창에 `Take a mock interview` 준비 카드를 보여준다.
5. 유저가 `Join (~15 mins)` 또는 `continue in chat`을 선택한다.
6. 선택한 인터뷰 타입을 고른다.
   - Technical interview
   - Fit interview
   - Mixed interview
7. 인터뷰가 시작된다.
8. 인터뷰 중에는 화면에 `Mock interview mode`가 표시된다.
9. 유저가 종료 버튼을 누르거나 전화가 종료되면 피드백 메시지를 남긴다.

## 인터뷰 준비 데이터

준비 데이터는 세 가지를 사용한다.

1. 추천 공고의 JD
2. 유저의 프로필/이력/대화 insight
3. 인터넷 검색 결과

인터넷 검색은 브라우저를 여는 것이 아니다. 서버에서 Brave Web Search API에 검색어를 보내고, 결과 URL과 snippet을 받는다.

예:

```text
query = "TwelveLabs Senior ML Research Engineer interview questions"
query = "TwelveLabs interview experience machine learning"
query = "TwelveLabs multimodal AI interview"
```

`BRAVE_SEARCH_API_KEY`가 없으면 인터넷 검색은 건너뛰고, JD와 유저 프로필만으로 준비한다.

검색 결과는 면접 질문을 그대로 복사하기 위한 것이 아니다. 회사/역할의 인터뷰 포커스를 잡는 참고 자료로만 사용한다.

## DB 테이블

### `talent_mock_interview_session`

모의 인터뷰 1회를 나타낸다.

필드:

```text
id
talent_id
conversation_id
opportunity_recommendation_id
role_id
company_name
role_title
status
interview_type
duration_minutes
setup_payload
research_payload
feedback_payload
started_at
completed_at
created_at
updated_at
```

`status`:

```text
preparing
ready
in_progress
completed
cancelled
failed
```

`interview_type`:

```text
technical
fit
mixed
```

## 메시지 타입

기존 `talent_messages`를 사용한다.

추가 message type:

```text
mock_interview_preparing
mock_interview_setup
mock_interview
mock_interview_feedback
```

`mock_interview_setup`의 `content`는 JSON 문자열로 저장한다. 클라이언트는 이 JSON을 파싱해서 준비 카드를 렌더링한다.

## API

### `POST /api/talent/mock-interview/prepare`

모의 인터뷰 세션을 만들고 준비 카드를 생성한다.

body:

```json
{
  "conversationId": "...",
  "opportunityId": "optional",
  "sourceMessage": "optional"
}
```

동작:

1. conversation 소유권 확인
2. 공고 context 로드
3. `talent_mock_interview_session` 생성
4. `mock_interview_preparing` 메시지 저장
5. Brave Search로 인터뷰 참고 자료 검색
6. setup payload 생성
7. session status를 `ready`로 변경
8. `mock_interview_setup` 메시지 저장

### `POST /api/talent/mock-interview/start`

준비된 모의 인터뷰를 시작한다.

body:

```json
{
  "conversationId": "...",
  "sessionId": "...",
  "interviewType": "technical",
  "channel": "call"
}
```

동작:

1. session 소유권 확인
2. status를 `in_progress`로 변경
3. 첫 질문 메시지 생성
4. call이면 Realtime token이 이 session을 보고 모의 인터뷰 지시문을 사용한다.
5. chat이면 첫 질문을 채팅창에 렌더링한다.

### `POST /api/talent/mock-interview/end`

모의 인터뷰를 종료하고 피드백을 생성한다.

body:

```json
{
  "conversationId": "...",
  "sessionId": "..."
}
```

동작:

1. session 소유권 확인
2. 최근 mock interview 메시지를 읽는다.
3. 답변이 너무 짧으면 짧은 종료 메시지만 만든다.
4. 충분히 진행됐으면 narrative, technical clarity, motivation, next practice point 중심으로 피드백을 만든다.
5. `mock_interview_feedback` 메시지 저장
6. session status를 `completed`로 변경

## 채팅 중 인터뷰 진행

모의 인터뷰 session이 `in_progress`이면 `/api/talent/chat`은 일반 career chat prompt를 쓰지 않는다.

대신 mock interview prompt를 사용한다.

규칙:

1. 인터뷰어처럼 한 번에 하나의 질문만 한다.
2. 답변이 얕으면 follow-up 질문을 한다.
3. technical interview에서는 구현/스케일/트레이드오프를 파고든다.
4. fit interview에서는 동기, 협업, 실패 경험, 회사 선택 기준을 묻는다.
5. mixed interview에서는 pitch, technical deep dive, motivation을 섞는다.
6. 매 답변마다 긴 평가를 하지 않는다.
7. 종료 시에만 피드백을 정리한다.

## 전화 모드

전화 모드는 기존 Realtime call UI를 재사용한다.

변경점:

1. active mock interview session이 있으면 `/api/realtime/token`은 career onboarding prompt 대신 mock interview prompt를 만든다.
2. `Join (~15 mins)` 버튼을 누르면 먼저 `/api/talent/mock-interview/start`를 호출한다.
3. 그 다음 기존 call mode를 시작한다.
4. 통화 종료 시 `/api/talent/chat/call-wrapup`은 active mock interview session을 확인하고 mock interview feedback을 만든다.

## UI

기존 beige 컴포넌트를 사용한다.

새 색상, 새 radius, 새 shadow를 만들지 않는다.

렌더링 위치:

- `CareerTimelineSection`: `mock_interview_preparing`, `mock_interview_setup`, `mock_interview_feedback` 렌더링
- `CareerComposerSection`: 모의 인터뷰가 진행 중이어도 텍스트 입력 가능
- `CareerTimelineSection` 상단: `Mock interview mode` 배지와 `인터뷰 종료` 버튼
- `OpportunityDetailModal`: `모의 인터뷰` 버튼 추가

## MVP에서 하지 않는 것

아래는 이번 구현에서 제외한다.

1. 실제 15분 타이머 강제 종료
2. provider별 인터뷰 후기 크롤러
3. 인터뷰 유형별 점수 저장
4. 녹음 파일 저장
5. 캘린더/리마인더
6. 회사별 고정 question bank 관리 UI

## 구현 순서

1. migration 추가
2. mock interview server helper 추가
3. prepare/start/end API 추가
4. `/api/talent/chat`에 mock interview 진행 분기 추가
5. `/api/realtime/token`에 mock interview prompt 분기 추가
6. `/api/talent/chat/call-wrapup`에 mock interview feedback 분기 추가
7. career context에 prepare/start/end handler 추가
8. timeline 준비 카드 UI 추가
9. Job 모달 버튼 연결
10. typecheck
