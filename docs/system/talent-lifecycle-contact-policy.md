# Career Contact Queue Policy

작성일: 2026-06-11  
상태: draft

## 목적

가입/온보딩 중간에 나간 유저에게 너무 늦지 않게 한 번 더 연락한다.

지금은 큰 lifecycle automation system을 만들지 않는다. 단순한 `contact_queue` 테이블 하나로 시작한다.

모든 메일은 시스템 알림처럼 보내지 않는다. 실제 사람 같은 AI headhunter Harper가 직접 챙겨서 보내는 느낌으로 쓴다. 문체는 짧고 자연스럽게, "버튼을 눌러주세요"보다 "제가 기다리고 있을게요", "이 메일에 답장해주셔도 됩니다"에 가깝게 간다.

## 기본 테이블

`contact_queue`

```text
id
user_id
scheduled_at
type
status
sent_at
cancelled_at
created_at
updated_at
payload
```

`type` 예시:

```text
career_signup_no_profile_submit
career_profile_submitted_no_answer
internal_recommendation_call_abandoned
```

`status` 예시:

```text
queued
stopped
sent
cancelled
failed
```

처음 구현에서는 `queued`, `sent`, `cancelled`, `failed` 정도만 있어도 된다. `stopped`는 나중에 사람이 운영상 멈춘 queue를 구분하고 싶을 때 쓴다.

## 공통 규칙

`N`은 1~3 사이의 random hour 값이다.

```text
N = random integer between 1 and 3
```

queue worker는 전체 유저를 훑지 않는다. `contact_queue`에서 아래 조건만 본다.

```text
status = 'queued'
scheduled_at <= now()
```

메일을 보내기 직전에는 항상 현재 상태를 다시 확인한다.

- 이미 온보딩을 완료했으면 보내지 않는다.
- 이미 취소된 queue면 보내지 않는다.
- 최근 30분 안에 Harper를 사용한 흔적이 있으면 지금 보내지 않고 다시 N시간 뒤로 미룬다.
- 같은 type의 메일은 유저에게 반복해서 보내지 않는다.

최근 30분 안의 Harper 사용 흔적은 일단 아래 중 하나로 본다.

- 최근 30분 안에 `talent_messages`에 user message가 있음
- 최근 30분 안에 active `talent_calls.last_active_at`이 업데이트됨

정확한 activity definition은 구현하면서 현재 테이블 기준으로 맞춘다.

## 1. 회원가입만 하고 프로필을 제출하지 않은 경우

### Queue 생성

유저가 career 회원가입 또는 career login을 완료하면 queue를 만든다.

```text
type = career_signup_no_profile_submit
scheduled_at = now() + N hours
status = queued
```

### 발송 시점 체크

worker가 이 queue를 pull했을 때 아래를 확인한다.

- 이미 프로필을 제출했으면 이 queue는 `cancelled` 처리한다.
- 이미 온보딩을 완료했으면 이 queue는 `cancelled` 처리한다.
- 아직 프로필 제출 전이면 메일을 보낸다.

### 메일 생성

이 메일은 LLM을 쓰지 않는다. 고정 템플릿으로 보낸다.

내용 방향:

- 아직 프로필 제출과 온보딩이 완료되지 않았다고 알려준다.
- `/career/onboarding` 링크를 보낸다.
- 추가로 계속 연락하지는 않겠다고 말한다.
- 부담 주지 않고 기다리고 있겠다는 톤으로 끝낸다.

예시:

```text
안녕하세요, 하퍼입니다.

가입은 해주셨지만 아직 프로필을 제출하지 않으셔서 짧게 리마인드만 연락드려요.

편하신 시간에 접속하신 뒤 링크드인 혹은 이력서 등을 알려주시면, 제가 ~~님의 정보를 알 수 있어요.

제출해주신 뒤에는 저랑 가볍게 5분 정도 통화 혹은 채팅으로 선호하시는 것들에 대해서 알려주시면 제 네트워크를 최대한 활용해서 도와드릴게요.

여기서 이어서 하실 수 있어요:
{onboarding_link}

당장은 아니고, 나중에 언제든 돌아오셔도 괜찮아요.

이 건으로 계속 메일드리지는 않을게요. 편하실 때 이어서 와주세요. 기다리고 있겠습니다.
```

## 2. 프로필은 제출했지만 온보딩 질문 답변이 없는 경우

### Queue 생성

유저가 프로필을 제출하면 먼저 기존 signup queue를 취소한다.

```text
type = career_signup_no_profile_submit
status = cancelled
cancelled_at = now()
```

그 다음 새 queue를 만든다.

```text
type = career_profile_submitted_no_answer
scheduled_at = now() + N hours
status = queued
```

### 발송 시점 체크

worker가 이 queue를 pull했을 때 아래를 확인한다.

- 이미 온보딩을 완료했으면 이 queue는 `cancelled` 처리한다.
- 최근 30분 안에 Harper를 사용한 흔적이 있으면 메일을 보내지 않고 `scheduled_at = now() + N hours`로 미룬다.
- 온보딩 질문 답변이 이미 충분히 진행된 case : 마무리만 해달라는 식으로 보내고, 질문도 같이 한다.

### 메일 생성

이 메일은 LLM을 사용한다.

LLM에 넣을 정보:

- 유저 프로필 정보
- 제출한 링크/이력서 요약
- 최근 대화 내용 (채팅, voice call, 이메일 등 전부 포함)
- `talent_calls` 상태
- 온보딩 질문 답변이 이미 충분히 진행된 case : onboarding checklist에서 남은 질문

메일 내용 방향:

- 프로필을 봤다는 느낌이 있어야 한다.
- "프로필을 보니 ~~~시네요"처럼 유저별 맥락을 짧게 언급한다.
- 추천을 바로 시작한다는 말은 하지 않는다.
- 연결 가능한 기회가 있을 수 있지만, 5분 정도의 커리어 인터뷰가 끝나야 제대로 도와줄 수 있다고 말한다.
- 사이트로 돌아와서 마무리해도 되고, 온보딩 질문 답변이 이미 충분히 진행된 case : 이메일로 답장해도 된다고 말한다.

예시 방향:

```text
안녕하세요, {name}님. Harper입니다.

프로필은 잘 받았습니다. {profile_observation}

다만 바로 기회를 추천드리기보다는, 짧게 몇 가지를 더 확인해야 {name}님께 맞는 연결을 제대로 볼 수 있을 것 같아요.

5분 정도만 커리어 인터뷰를 마무리해주시면 됩니다.
{resume_link}
```

### 남은 질문이 4개 이하인 경우

`talent_calls`와 onboarding checklist를 봤을 때 남은 질문이 4개 이하라면 메일 안에 질문을 직접 넣는다.

이 경우 사이트로 들어와도 되고, 메일로 바로 답장해도 된다고 안내한다.

예시 방향:

```text
사이트로 들어오셔서 마무리해주셔도 좋고, 더 편하시면 이 메일에 아래 질문만 답장해주셔도 됩니다.

1. {question_1}
2. {question_2}
3. {question_3}
4. {question_4}

편하게 문장으로 답해주시면 제가 이어서 정리해둘게요.
```

질문은 최대 4개까지 넣는다.

## 3. 온보딩을 완료한 경우

유저가 온보딩을 완료하면 pending signup/profile reminder queue를 취소한다.

```text
type in (
  'career_signup_no_profile_submit',
  'career_profile_submitted_no_answer'
)
status = cancelled
cancelled_at = now()
```

온보딩 완료 후에는 이 문서의 reminder 메일을 보내지 않는다.

## 4. Internal 추천용 call 이탈

이건 가입 퍼널과 별도다.

아직 internal 추천용 call 자체가 구현되기 전이므로 지금은 참고 케이스로만 둔다.

나중에 구현하면 이런 형태가 된다.

```text
type = internal_recommendation_call_abandoned
scheduled_at = talent_calls.last_active_at + 1 hour
status = queued
```

조건:

- internal 추천용 call을 시작함
- 기준 질문-답변 갯수를 충족하지 못함
- call이 완료되지 않음
- 마지막 활동 이후 1시간 동안 돌아오지 않음
- 같은 call에 대해 1회만 보냄

내용 방향:

- 방금 하던 추천용 대화를 이어가자는 톤
- 사이트로 돌아와도 되고 이메일로 답장해도 된다고 안내
- 남은 질문이 적으면 메일 안에 바로 질문을 넣음

## 구현 메모

처음에는 복잡한 policy engine을 만들지 않는다.

필요한 함수는 이 정도면 충분하다.

```text
enqueueSignupNoProfileSubmit(user_id)
cancelSignupNoProfileSubmit(user_id)
enqueueProfileSubmittedNoAnswer(user_id)
cancelProfileSubmittedNoAnswer(user_id)
pullDueContactQueue()
sendOrRescheduleContact(queue_row)
```

추후 연락 케이스가 늘어나면 `type`만 추가한다. 그때도 먼저 `contact_queue`에 row를 만들고, 발송 직전에 현재 상태를 다시 확인하는 방식은 유지한다.
