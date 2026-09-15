# 회사 ↔ 후보자 지속 중계 구조 구현 계획

문서 기준: 2026-09-15  
문서 상태: 목표 제품·구현 계획. 현재 production 동작을 설명하지 않는다.  
관련 현재 구현: `docs/company-talent-question-relay-plan-ko.md`

## 0. 내가 이해한 요구사항

이번 변경의 목표는 현재의 `회사 요청 1회 → 후보자 답변 1회 → 종료` 구조에
`추가 답변`이라는 예외를 하나 더 붙이는 것이 아니다.

Harper는 회사와 후보자 사이에서 양쪽의 말을 대신 전달할 수 있는 agent다. 회사가 특정
후보자에게 실제로 한 번이라도 연락했다면, 그 회사·Role·후보자 사이에는 이후에도 이어질 수
있는 연락 맥락이 생긴다. 최초 회사 연락이 질문이었는지, 이력서 요청이었는지, 단순 안내였는지,
후보자가 이미 한 번 답했는지는 이후 전달 가능 여부를 결정하는 조건이 아니다.

따라서 목표 경험은 다음과 같다.

1. 회사는 기존 company-side LLM의 모든 prompt와 동작을 그대로 사용할 수 있다.
2. 여기에 질문이나 이력서 요청으로 분류되지 않는 일반적인 `연락/전달` 옵션만 additive하게
   추가한다.
3. 후보자는 현재 `awaiting_talent` 요청에 대한 최초 답변뿐 아니라, 과거에 실제 연락받은
   회사·Role 맥락을 골라 언제든 이어서 말을 전달할 수 있다.
4. `최초 답변`과 `추가 전달`은 서로 다른 제품 행동이나 별도 intent가 아니다. 둘 다
   `후보자가 선택한 회사 연락 맥락으로 메시지를 전달하는 것`이다.
5. `이미 답변했는지`는 후보자가 대상을 고르는 데 도움이 되는 가벼운 표시일 뿐, 전달을
   허용하거나 차단하는 상태가 아니다.
6. 후보자 tool 결과는 가능한 한 JSON 구조가 아니라 LLM이 바로 읽을 수 있는 짧은 텍스트로
   제공한다.
7. 기존 회사 연락과 무관한 내용을 전달하려는 경우에는 가급적 그러지 않는 편이 좋다고
   후보자에게 한 줄로 알려주되, 이를 키워드·분류기·서버 차단 규칙으로 만들지 않는다.

이를 한 문장으로 줄이면 다음과 같다.

> 회사의 실제 최초 연락은 지속 중계 권한을 여는 사건이고, 이후의 모든 후보자 메시지는
> `답변 차수`가 아니라 선택한 회사 연락 맥락에 연결된 독립적인 전달이다.

### 0.1 재점검에서 추가로 확정한 설계

초안 작성 뒤 현재 chat, email reply, company contact, queue, resume upload 경로를 다시 대조했다.
그 결과 다음 항목은 선택적인 개선이 아니라 구현에 반드시 포함해야 하는 계약으로 확정한다.

1. `contact`를 기존 `question`과 같은 값으로 저장하면 candidate context가 나중에 다시 이를
   질문으로 해석한다. 회사 LLM이 명시적으로 선택한 `question | resume | contact`를 request에
   보존한다.
2. text만 relay 원장에 담으면 최초 이력서 이후 새 이력서 전달을 표현할 수 없다. relay는
   text와 선택적인 request-linked document를 모두 지원한다.
3. email reply alias는 routing anchor일 뿐 본인 인증 수단이 아니다. 유효한 alias를 알고
   있어도 실제 발신자가 해당 talent의 검증된 이메일이 아니면 relay할 수 없다.
4. generic `contact`는 답장을 요구하지 않으므로 `처리할 항목`에 자동으로 만들지 않는다.
   후보자가 회신하면 받을 수 있지만, 미회신을 미완료 상태로 표현하지 않는다.
5. 같은 회사·Role에서 여러 company contact row가 생겨도 하나의 흐름으로 읽혀야 한다.
   별도 session 테이블 대신 workspace·Role·talent scope로 read-time timeline을 만든다.
6. relay 접수와 회사 수신 완료를 분리한다. candidate tool 성공은 outbox 생성까지만 보장하고,
   실제 수신 여부는 relay별 delivery 상태에서 읽는다.
7. retry 중 같은 source message에 LLM 표현 차이로 다른 text가 들어와도 기존 relay를 덮어쓰지
   않는다. 첫 기록을 정본으로 유지하고 기존 성공을 반환하며, 수정은 새 사용자 발화로만 한다.
8. 기존 company-side prompt의 원문은 byte-level baseline으로 보호한다. 새 capability는 기존
   문단을 재작성하지 않고 tool schema의 additive field와 격리된 contact-mode 입력으로만 넣는다.

## 1. 현재 구조가 두 번째 전달을 막는 이유

현재 `company_talent_requests` 한 행은 다음 세 책임을 동시에 갖는다.

- 회사가 후보자에게 보낸 최초 요청
- 후보자의 최초 응답 한 건
- 그 응답을 회사에 전달하는 outbox 한 건

구체적으로는 다음 단일값 계약 때문에 두 번째 전달을 담을 수 없다.

- `company_talent_requests.talent_source_message_id`는 한 개뿐이다.
- 최초 응답을 기록하면 `workflow_status`가 `awaiting_talent`에서 `relay_queued`, 이후
  `delivered`로 끝난다.
- `contact_queue`의 회사 전달도 요청당 `company_request_company_delivery` 한 건만 허용한다.
- 후보자 chat/email LLM은 `awaiting_talent`인 요청이 있을 때만
  `record_company_request_response`를 받는다.
- 요청 전용 email reply alias도 최초 응답이나 문서가 기록된 뒤에는 더 이상 그 요청으로
  resolve되지 않는다.

따라서 지금 구조에서는 후보자가 첫 답변 뒤에 “그리고 이것도 전달해 주세요”라고 말해도
대상을 읽을 수 없고, 기록할 두 번째 칸도 없으며, 별도의 회사 전달 outbox도 만들 수 없다.

## 2. 목표 개념 모델

### 2.1 세 가지 개념을 분리한다

| 개념 | 의미 | 현재/목표 저장 위치 |
| --- | --- | --- |
| 최초 회사 연락 | 회사가 실제로 후보자에게 보낸 한 번의 연락, 명시적 contact kind와 그 원래 회사 대화 | 기존 `company_talent_requests` 유지·확장 |
| 연결된 연락 맥락 | 후보자가 이후 전달 대상을 고를 수 있는 회사·Role·최초 연락 | 기존 요청과 실제 `sent` delivery에서 read-time으로 계산 |
| 후보자 전달 | 후보자가 그 맥락으로 회사에 보내 달라고 맡긴 독립적인 메시지 | 새 `company_talent_relays` |

새 thread/session 테이블은 만들지 않는다. 현재 필요한 지속 관계는 다음 durable fact에서
안전하게 재구성할 수 있기 때문이다.

```text
company_talent_requests
  + candidate delivery가 실제 sent였음
  + company_workspace_id / role_id / talent_id
```

별도 thread 테이블을 만들더라도 당장 이를 읽어야 하는 독립 consumer나, 위 사실에서 복원할
수 없는 추가 정보가 없다. 논리적인 conversation scope는 회사·Role·후보자 tuple이고,
`requestId`는 그 안에서 어떤 최초 연락의 맥락으로 되돌아갈지를 정하는 routing anchor다.

현재 `contact_talent`는 Role과 recommendation을 필수로 받으므로 실제 전송 anchor는 계속
Role 단위다. 후보자가 회사명만 말하면 같은 workspace의 연락을 회사 단위로 검색할 수 있지만,
그 회사에 여러 Role 연락이 있으면 LLM이 목록을 보여주고 최소한으로 어느 맥락인지 확인한다.
이번 변경에서 Role 없는 새로운 company-wide contact 모델을 만들지는 않는다.

### 2.2 `연결됨`의 정확한 정의

후보자에게 전달 가능한 회사 연락은 다음 조건으로만 성립한다.

1. 요청의 `talent_id`가 현재 인증된 후보자와 일치한다.
2. 해당 요청의 `company_request_candidate_delivery`가 실제 `sent`이고 `sent_at`이 있다.
3. 요청이 가리키는 회사 workspace가 존재하고 수신 가능한 내부 destination이 하나 이상 있다.

다음은 전달 가능 여부의 gate가 아니다.

- `company_talent_requests.workflow_status`
- `talent_source_message_id` 유무
- 최초 답변 완료 여부
- 요청의 과거 만료 시각
- 현재 Role stage
- Role의 paused/ended 여부
- `talent_setting.status` 또는 `profile_visibility` 값

회사가 실제로 연락한 뒤 Role 상태가 바뀌었다는 이유만으로 후보자가 이미 열린 연락 맥락에
말을 남길 수 없게 하지 않는다. 대신 목록에 현재 Role 상태를 사람이 읽는 표현으로 보여주고,
회사 전달 문구가 현재 채용 진행 중이라고 추정하지 않게 한다.

원래 company message나 Slack thread가 보관 정책상 사라졌다는 이유만으로 연결 사실을
없애지는 않는다. destination은 `원래 Slack thread → 원래 /org conversation → 같은 Role의
/org conversation → workspace의 허용된 fallback` 순서로 해석하고, 실제 수신 가능한 경로가
전혀 없을 때만 새 relay를 받지 않거나 `delivery unavailable`로 명확히 돌려준다. 조용히 다른
회사나 Role로 보내지 않는다.

명시적 차단, 후보자 계정 삭제, 회사 workspace 삭제·접근 폐기처럼 별도의 hard
safety/authorization 경계가 생기면 그 사실만 서버가 검사한다. 질문의 관련성이나 적절성은
서버가 판정하지 않는다. `testOnly` Role은 canonical marker와 allowlist 규칙을 그대로 적용해
일반 talent 목록과 relay 경로에 나타나지 않게 한다.

### 2.3 `답변함`은 상태가 아니라 표시다

`list_company_requests`는 각 최초 연락에 다음 중 하나를 표시할 수 있다.

- `첫 답변을 아직 보내지 않음`
- `첫 답변을 보냄`

이 값은 기존 `talent_source_message_id` 또는 backfill된 최초 relay에서 계산한다. 어느 값이든
`relay_to_company`를 호출할 수 있다. `answered`, `follow_up`, `additional`, `second_reply` 같은
새 intent·enum·state branch는 만들지 않는다.

## 3. 후보자-side agent 변경

### 3.1 기본 동작

후보자-side LLM은 다음 세 방식으로 전달 대상을 얻는다.

1. 회사 요청 메일의 reply alias로 들어온 경우: 그 메일의 정확한 request ref를 현재 맥락으로
   받는다.
2. Career의 미답변 요청 card를 선택한 경우: 선택한 정확한 request ref를 받는다.
3. 일반 Career 대화이거나 대상이 불명확한 경우: `list_company_requests`로 후보자가 실제
   연락받은 맥락을 읽고 고른다.

1번과 2번도 더 이상 `awaiting_talent` 여부를 요구하지 않는다. 정확한 request anchor가 있고
실제 candidate delivery가 sent였다면 첫 답변 이후에도 같은 email thread나 Career 대화에서
계속 전달할 수 있다.

### 3.2 새 read tool: `list_company_requests`

목적은 `활성 요청 찾기`가 아니라 `내가 어느 회사·Role의 어떤 연락 맥락으로 말을 전달할 수
있는지 찾기`다.

권장 입력 계약은 다음처럼 작게 유지한다.

```text
query?       회사명, Role명 또는 후보자가 기억하는 연락 주제
limit?       기본 10, 최대 20
cursor?      직전 결과의 불투명한 다음 페이지 cursor
```

회사명·Role명·주제를 각각 enum이나 별도 intent로 나누지 않는다. `query`는 일반 text search고,
필요할 때만 사용한다.

모델에 돌려주는 결과는 배열 JSON이 아니라 다음과 같은 text block이다.

```text
전달 가능한 회사 연락 2건

[1]
ref: <opaque request ref>
회사 · Role: Acme · Backend Engineer
연락 성격: 질문
처음 받은 연락: 결제 장애 대응에서 맡은 범위 확인
보낸 시각: 2026-09-10 14:20 KST
후보자 전달: 2회
최근 전달 상태: 회사에 전달 완료 · 2026-09-12 10:30 KST
현재 Role: 종료됨

[2]
ref: <opaque request ref>
회사 · Role: Beta · Product Lead
연락 성격: 일반 연락
처음 받은 연락: 최신 역할 범위 안내
보낸 시각: 2026-09-14 09:10 KST
후보자 전달: 없음
최근 전달 상태: -
현재 Role: 진행 중

다음 결과 없음
```

여기서 `ref`는 LLM 내부 routing용이며 최종 사용자 답변에 노출하지 않는다. raw UUID를 그대로
보여줄 필요는 없고, 서버가 발급하고 현재 talent에게만 resolve하는 opaque ref를 사용한다.
실제 후보자가 받은 연락의 subject/`chatText` 또는 candidate-safe `request_context`만 사용한다.
원래 회사 사용자의 내부 message, company note, 평가 근거, stage tag, recommendation ID,
workspace ID, provider 정보는 반환하지 않는다.

`contact_kind=question|resume`이면 필요할 때 `첫 답변: 아직 없음/접수됨`을 함께 보여줄 수 있다.
`contact`에는 답변을 요구했다는 표현을 쓰지 않고 `후보자 전달` 건수만 보여준다. relay가
있다면 `접수됨`, `회사 전달 준비 중`, `회사 전달 완료`, `재시도 필요`처럼 candidate-safe한
delivery fact를 분리해 표시한다. 답변을 작성했다는 사실과 회사가 수신했다는 사실을
`보냄` 하나로 합치지 않는다.

정렬은 request 생성 시각이 아니라 `후보자에게 보낸 시각`, relay 생성 시각, 회사 delivery
시각 중 최근 activity를 기준으로 한다. activity 중 새 relay가 생겨도 페이지가 중복·누락되지
않도록 첫 호출의 `snapshot_at`과 `(last_activity_at, request_id)`를 signed opaque cursor에 넣는다.
다음 page는 snapshot 이전 event만 사용하고, 그 뒤 생긴 relay는 새 목록 호출에서 보인다.
`last_activity_at`은 request status가 아니라 실제 sent candidate delivery와 relay/company delivery
event 시각으로 계산한다. 같은 회사·Role의 연락이 여러 개면 각각의 주제와 시각을 보여주되,
tool text에서는 같은 scope로 묶어 읽기 쉽게 연속 배치한다.

tool protocol 자체가 객체를 요구하더라도 model-facing payload는 `text` 한 필드에 위 block을
담는다. paging cursor나 typed error처럼 executor가 필요한 최소 metadata만 별도 필드로 두고,
DB row 배열을 그대로 반환하지 않는다.

표시 언어와 시각은 현재 candidate locale/time zone을 사용하고, 알 수 없을 때만 기존 기본값을
쓴다. 번역 때문에 company/Role 고유명사나 candidate-visible 원문 의미를 바꾸지 않는다.

### 3.3 새 write tool: `relay_to_company`

이 tool은 첫 답변과 이후 전달을 같은 방식으로 처리한다.

```text
requestRef  list 또는 현재 selected contact context에서 얻은 exact opaque ref
message     후보자가 이번에 회사에 전달하도록 명시적으로 맡긴 의미
```

`message`는 별도 semantic JSON으로 분해하지 않는다. downstream company relay writer가 실제로
읽어야 하는 최소 human-readable text 한 필드만 둔다. 후보자-side LLM은 최신 대화 전체에서
후보자가 전달을 승인한 의미만 담고, 새로운 사실·평가·확신을 만들지 않는다.

서버는 다음을 책임진다.

- 현재 인증 후보자와 request의 `talent_id` 일치
- 실제 candidate delivery `sent` 확인
- `message` 타입·길이·빈 값 검증
- 현재 후보자가 작성한 user message ID를 evidence로 함께 고정
- `(request_id, source_talent_message_id)` idempotency
- relay row와 회사 delivery outbox의 원자적 생성
- 회사 workspace와 destination의 수신 가능 여부 확인
- test-only isolation과 명시적 contact block 확인

서버는 다음을 하지 않는다.

- 키워드로 답변/추가 답변/거절을 분류
- 원래 질문과 관련 있는지 점수화
- 후보자의 문장을 임의의 deterministic 문구로 교체
- `awaiting_talent`인지 검사
- 이미 답변했다는 이유로 거부

동일한 `(request_id, source_talent_message_id)`가 재시도되면 first-write-wins로 기존 relay를
그대로 반환한다. model retry가 `message`를 조금 다르게 paraphrase하거나 document 인자가
달라져도 이미 접수한 content/document를 수정·재발송하지 않는다. mismatch는 내부 integrity
metric에만 남기고 model에는 `이 사용자 메시지는 이미 같은 대상으로 접수되었다`는 user-safe
fact를 준다. 실제 정정은 후보자가 새 user message로 명시해야 새 relay가 된다. 한 후보자
메시지에서 여러 회사에 각각 전달하라는 명시적 요청은 request가 다르므로 request별 tool call과
relay를 만들 수 있다.

model-facing `relay_to_company`는 임의의 저장 문서를 고르는 `documentId`를 받지 않는다. 문서
공유는 현재 request-linked resume upload처럼 사용자가 파일 업로드 자체로 명시적으로 승인한
경로가 내부 relay service에 검증된 `document_id`를 넘긴다. 따라서 LLM이 과거 이력서를
임의로 골라 회사에 공유할 수 없다.

모델에 돌려주는 성공 결과도 text 중심으로 한다.

```text
전달을 접수했습니다.
대상: Acme · Backend Engineer
기준 연락: 결제 장애 대응에서 맡은 범위 확인
현재 결과: 회사 전달 준비 중
아직 회사 수신 완료로 확인된 단계는 아닙니다.
```

오류 역시 `not_active_company_request` 같은 raw code만 보내지 않고, LLM이 정확한 다음 답변을
쓸 수 있는 짧은 text로 반환한다. 내부 typed error code는 log와 retry 판단에만 유지한다.

Career에서는 onboarding 완료 후 list와 relay tool을 기본 제공한다. onboarding 중이라도 실제
sent company contact나 선택된 company contact가 존재하면 이 두 tool만 예외적으로 제공해 이미
열린 연락에 답할 수 있게 한다. 회사가 실제 연락했다는 사실보다 onboarding 상태를 더 강한
gate로 사용하지 않는다. 정확한 ref가 없는 relay 호출은 실패시키고 LLM이 list를 먼저 쓰게
한다. email에서는 talent identity가 검증된 뒤 같은 두 tool을 제공하며, request alias가 있으면
selected contact ref를 바로 주고 list 호출을 생략한다. tool allowlist, stop-after policy,
thinking log에도 두 tool을 빠짐없이 등록한다.

### 3.4 기존 `record_company_request_response` 호환

기존 tool과 RPC를 한 번에 제거하지 않는다.

1. 먼저 `relay_to_company`가 사용하는 공통 relay service/RPC를 만든다.
2. `record_company_request_response`는 그 공통 경로를 호출하는 compatibility adapter로 바꾼다.
3. 최초 응답이면 기존 `talent_source_message_id`와 request milestone을 함께 갱신해 기존 UI,
   progress feed, `read_contact`가 깨지지 않게 한다.
4. Career chat과 email reply의 model-facing tool은 평가가 통과한 뒤 generic tool을 우선하도록
   전환한다.
5. 기존 tool을 숨기거나 제거하는 일은 별도 cleanup 단계로 두며, 이번 구조 도입의 선행 조건으로
   삼지 않는다.

재진행 의향 확인의 `positive/negative/other`와 Position 복구는 기존 특수 side effect를
compatibility adapter에 남긴다. 최초 재진행 답변에는 기존
`record_company_request_response`를 계속 사용하고, 그 결과로도 공통 relay row가 정확히 한 건
생기게 한다. 이후 같은 연락에 보내는 메시지는 일반 `relay_to_company`이며 다시 disposition을
계산하거나 Position을 바꾸지 않는다. 이렇게 해야 기존 Position 복구 계약을 보존하면서
generic relay tool에 재진행 전용 semantic field를 넣지 않을 수 있다.

ordinary question/contact의 첫 전달은 generic tool로 처리할 수 있다. resume attachment는 upload
service가 공통 relay service를 직접 호출한다. rollout 동안 두 model-facing tool이 동시에
노출되는 경우에도 같은 source/request unique key가 중복 회사를 막지만, prompt에서는 선택된
재진행 첫 답변만 legacy tool을 사용하도록 명확히 한다. 장기적으로 재진행 상태 변경을 별도
명시적 candidate action으로 분리한 뒤 legacy tool 제거를 검토한다.

### 3.5 후보자 prompt 변경

후보자-side 공통 prompt에는 generic capability를 짧게 설명한다.

- 후보자가 회사에 무엇을 전달해 달라고 하면 현재 exact request context를 사용하거나
  `list_company_requests`로 대상을 찾는다.
- 첫 답변 여부와 관계없이 같은 relay 의미로 처리한다. ordinary contact는
  `relay_to_company`를 사용하고, 기존 Position side effect가 필요한 최초 재진행 답변만 3.4의
  compatibility tool을 사용해 같은 relay 원장을 만든다.
- 대상과 전달 내용, 보내 달라는 의사가 분명하면 별도 확인을 반복하지 않고 같은 turn에 tool을
  호출한다. 문구 상담·초안 요청·회사에 관한 일반 질문은 외부 전달 승인으로 추정하지 않는다.
- 대상·전달 의미가 불명확하면 한 번에 답할 수 있는 최소 질문만 한다.
- tool 성공 전에는 회사 전달이 접수·완료됐다고 말하지 않는다.

요청과 무관한 전달에 관한 제품 지시는 다음 한 줄만 추가한다.

> If the requested message is unrelated to the selected company contact, briefly mention that it is usually better to keep the relay relevant to that contact; do not use a rule or keyword check, and do not block the user if they still clearly want it sent.

관련성을 정규식, 회사명 포함 여부, 단어 목록, classifier, 점수로 판정하지 않는다. 이 한 줄을
여러 시나리오별 금지·허용 규칙으로 확장하지 않는다.

### 3.6 기본 context 최소화

모든 후보자 turn마다 과거 회사 요청 전체를 prompt에 주입하지 않는다.

- 정확한 email alias나 selected pending action이 있으면 해당 request 하나만 넣는다.
- 정확한 대상이 없으면 `회사 연락 이력이 있음/없음` 정도의 capability signal만 제공한다.
- 실제 목록은 LLM이 필요할 때 `list_company_requests`로 읽는다.
- 선택된 request context에도 회사명, Role, 후보자에게 실제 전달된 주제와 request ref만 넣는다.

현재의 `Pending company request`라는 이름도 모델의 판단을 `미답변 요청`에 고정하므로,
generic context에서는 `Selected company contact`처럼 중립적인 이름을 사용한다. 미답변 card에서
진입한 경우에만 `first response not yet recorded`를 사실로 함께 제공한다.

회사에서 온 body와 candidate가 보낸 relay 내용은 모두 다른 사용자가 작성한 untrusted data다.
prompt에는 명확한 data delimiter 안에 넣고 system/tool 지시로 해석하지 않는다. HTML, control
character, quoted email history를 transport 수준에서 정리하는 것은 허용하지만, 특정 문구를
근거로 관련성·답변 여부·전달 의도를 deterministic하게 판정하지 않는다.

## 4. company-side agent 변경

### 4.1 기존 prompt 동결

다음 기존 company-side prompt 자산은 이번 변경에서 수정·삭제·재작성하지 않는다.

- company-side system prompt
- service knowledge prompt
- UX-writing prompt
- 기존 contact confirmation/draft/schedule 규칙
- 기존 question/resume/reengagement 설명과 동작
- web과 Slack의 기존 final-answer 계약

구현 전후 snapshot/fingerprint test로 이 파일들의 기존 block이 동일함을 확인한다. 전체 파일
snapshot은 additive field 때문에 당연히 달라지므로, 현재 shared system/service/UX prompt
constant와 기존 `question`, `resume`, reengagement tool-description 문단을 baseline fixture로
고정해 각각 byte-level hash를 비교한다. 필요한 capability 추가는 기존 문단 뒤의
`contact_talent` additive clause와 candidate contact copy writer의 격리된 contact-mode 입력
계약 안에서만 한다.

### 4.2 기존 `contact_talent`에 일반 연락 옵션 추가

새 시나리오 전용 company tool을 만들지 않는다. 이미 후보자 연락이라는 외부 capability를 가진
`contact_talent`를 확장한다.

```text
kind: question | resume | contact
contactContext?: 회사가 후보자에게 전달하려는 의미와 맥락
```

- 기존 `question`, `resume`, `requestContext`는 그대로 유지한다.
- `kind=contact`일 때만 `contactContext`를 사용한다.
- batch item에도 같은 optional field를 추가한다.
- DB 호환 단계에서는 `contactContext`를 기존 `request_context`에 저장한다.
- LLM이 선택한 kind는 새 `contact_kind=question|resume|contact`에 그대로 저장하고 나중에
  문장 내용으로 다시 추론하지 않는다.
- `expects_document=false`, `intent=ordinary`로 저장하되 이 두 값으로 후보자 응답 방식을
  제한하지 않는다.
- `contact`는 질문을 반드시 포함하거나 답변을 요구하지 않는다. 감사, 안내, 후속 확인,
  후보자 답변에 대한 회사의 회신 등 어떤 professional contact도 담을 수 있다.

executor의 입력 matrix는 명확히 둔다.

| kind | 필요한 의미 입력 | 허용하지 않는 조합 |
| --- | --- | --- |
| `question` | 기존 `requestContext` | `contactContext` |
| `resume` | 기존처럼 Role 기반 resume context 생성 | `contactContext`, `resumeStageId` |
| `contact` | `contactContext` | `requestContext`, `resumeStageId` |

이 matrix는 machine contract 검증일 뿐, `contactContext` 문장이 질문처럼 보인다는 이유로 kind를
바꾸는 의미 분류는 하지 않는다. revise 시에도 request에 저장한 `contact_kind`를 읽어 같은
writer mode를 유지하고, edit 문구에서 다시 kind를 추측하지 않는다.

기존 create draft → revise → explicit approval → schedule/immediate → send 흐름은 그대로 사용한다.
일반 연락이라는 이유로 회사 승인 없이 자동 발송하지 않는다.

`request_context`를 검증하는 현재 `assertSafeProfessionalQuestion`을 contact에 그대로 호출하면
일반 안내도 질문 계약을 통과해야 하는 모순이 생긴다. 공통 normalization/구조 검증과 기존
question safety 검증을 분리한다. `question`과 `resume`의 현재 검증은 그대로 유지하고,
`contact`에는 비어 있지 않음·허용 길이·control character 제거·hard safety만 적용한다.
의문부호, 질문형 종결어미, 특정 단어로 kind를 교정하거나 contact를 question으로 바꾸지 않는다.

### 4.3 회사측 copy writer 일반화

후보자 연락 copy writer는 `question`이나 `resume`일 때 현재 계약을 그대로 사용한다. 특히
`CANDIDATE_CONTACT_SHARED_SYSTEM_PROMPT`와 기존 current-task 문구는 byte-identical하게 둔다.
`contact`일 때만 다음 outcome을 추가한다.

- 회사가 전달하려는 의미를 보존한다.
- 질문이 없으면 억지로 질문이나 답변 CTA를 만들지 않는다.
- 이전 후보자 relay에 대한 회신이면 현재 대화에서 그 맥락을 자연스럽게 이어간다.
- 회사 내부 평가·거친 표현·확인되지 않은 관심도는 후보자에게 새로 만들지 않는다.
- 후보자는 답장을 선택할 수 있지만, 모든 연락을 `답변 대기 요청`처럼 표현하지 않는다.

`question/contact` 구분을 서버가 문장 부호나 의문문 여부로 교정하지 않는다. company-side LLM이
회사 대화의 의미를 보고 적절한 option을 선택하며, copy 품질은 prompt와 evaluation으로
개선한다.

### 4.4 이어지는 회사 대화

후보자 relay는 최초 회사 요청의 `source_company_message_id`가 가리키는 원래 `/org` conversation
또는 Slack thread에 도착한다. 회사가 그 답변을 보고 “이 내용도 전해 주세요”라고 하면 기존
company-side LLM이 같은 후보자·Role 맥락에서 `contact_talent(kind=contact)`로 새 초안을 만든다.

새 회사 연락 행을 만들더라도 논리적으로는 같은 회사·Role·후보자 흐름이다. 후보자측
`list_company_requests`는 같은 tuple의 연락들을 함께 찾을 수 있고, 각 최초 연락의 주제와
답변 여부를 보여주므로 필요한 anchor를 고를 수 있다.

company-side `read_contact(contactId)`는 선택한 request의 relay만 보여주는 데서 끝내지 않고,
같은 `(workspace_id, role_id, talent_id)` scope의 실제 발송된 contact와 relay를 시간순으로
읽을 수 있게 한다. draft는 그것을 만든 회사 사용자에게 필요한 기존 관리 정보로만 표시하고,
후보자에게 실제 보내지지 않은 내용을 대화 history처럼 섞지 않는다. 이 timeline은 read-time
projection이므로 새 conversation/session 상태를 저장하지 않는다.

후보자 relay가 company conversation에 기록될 때는 최근 문맥에서 바로 회신할 수 있도록
model-private `candidate_contact_ref`에 exact `talentId`, `roleId`, `requestId`, `relayId`를 넣는다.
회사가 “그럼 이것도 전해 주세요”라고 하면 company-side LLM은 이 ref로 별도 talent 재검색 없이
`contact_talent(kind=contact)` 초안을 만든다. ref가 recent context에서 사라졌을 때만
`list_contacts`/`read_contact`로 복구한다. 이 opaque ref는 회사 사용자에게 출력하지 않는다.

## 5. 데이터 모델과 DB 계약

### 5.1 새 테이블이 필요한 이유

새 테이블은 LLM의 intent, 요약, 대화 계획 또는 transient judgment를 저장하기 위한 것이 아니다.
기존 데이터만으로 복원할 수 없는 다음 durable fact를 저장한다.

> 후보자가 특정한 과거 회사 연락 맥락으로 새 메시지 전달을 승인했고, 그 메시지에 대한 독립
> 회사 delivery가 생성되었다.

이를 읽는 concrete consumer는 company delivery worker, idempotent retry, company message
finalizer, `list_company_requests`, `read_contact`다. 기존 request의 단일
`talent_source_message_id`와 단일 outbox로는 두 번째 사실을 표현할 수 없으므로 새 relay 원장이
필요하다.

### 5.2 `company_talent_relays`

먼저 `company_talent_requests`에는 `contact_kind text not null`을 additive하게 추가한다. 기존
행은 `expects_document=true → resume`, 나머지는 `question`으로 deterministic backfill한다.
새 행부터 company-side LLM이 tool에서 선택한 `question | resume | contact`를 그대로 저장한다.
이는 대화 의미를 사후 분류하는 enum이 아니라 candidate presentation과 resume upload가 실제로
읽는 명시적 외부 명령이다. `expects_document`는 기존 reader 호환을 위해 유지하며 새 write에서
`resume`과 일관되게 기록한다. backfill 검증 뒤에는
`expects_document = (contact_kind = 'resume')`라는 구조적 CHECK로 잘못된 조합만 막는다.

최소 컬럼은 다음과 같다.

| 컬럼 | 이유 |
| --- | --- |
| `id uuid` | relay별 delivery·idempotency 식별자 |
| `company_talent_request_id uuid` | 최초 회사 연락과 원래 company destination anchor |
| `source_talent_message_id bigint` | 후보자의 실제 승인 발화 evidence |
| `relay_content text` | 후보자-side LLM이 후보자의 명시적 전달 요청에서 만든 최소 전달 의미 |
| `document_id uuid null` | request-linked upload로 이번 relay에서 명시적으로 공유한 문서 |
| `created_at timestamptz` | 정렬과 목록 표시 |

두지 않는 컬럼은 다음과 같다.

- first/follow-up/additional intent
- question/resume/answer type
- relevance score
- confidence
- delivery plan
- LLM reasoning
- 별도 workflow status
- company/role/talent 중복 FK

relay delivery 상태와 sent/failed/retry 시각은 `contact_queue`가 소유한다. 회사·Role·후보자와
destination은 연결된 request에서 읽는다.

필수 제약은 다음 정도로 제한한다.

- request FK
- source talent message FK
- text relay는 `relay_content` non-empty, attachment relay는 `document_id` 필수라는 최소 payload
  check와 안전한 최대 길이
- `document_id`가 있으면 해당 request의 talent가 소유한 실제 committed document인지 검증
- unique `(company_talent_request_id, source_talent_message_id)`

한 relay에 여러 임의 첨부를 지원하는 것은 이번 범위가 아니다. 현재 resume request가 허용하는
한 개의 검증된 파일을 정확히 연결한다. 미래에 실제 multi-attachment 요구가 생기면 relay와
document의 join table을 추가하되, 지금 사용되지 않는 일반 attachment 모델을 미리 만들지 않는다.

read 성능을 위해 최소한 relay의 `(company_talent_request_id, created_at, id)`와 request의
`(talent_id, updated_at, id)`, `(company_workspace_id, role_id, talent_id, created_at, id)` index를
검토한다. relay 생성/전달 시 request의 기존 `updated_at`을 activity 시각으로 touch하면 후보자
목록 첫 page의 후보군을 좁히는 데 쓸 수 있지만, cursor 정본은 snapshot 이전 실제 event 시각이다.
별도 denormalized `last_activity_at` 컬럼은 만들지 않는다. 이 touch는 reply eligibility나 workflow
판단에는 사용하지 않는다.

### 5.3 `contact_queue` 확장

`company_talent_relay_id uuid null` FK를 추가한다.

기존 요청당 한 회사 delivery만 허용하는 unique index는 역할을 나눈다.

- 후보자 방향 최초 연락: 기존처럼 request당 candidate delivery 한 건
- legacy 회사 방향 최초 응답: 기존처럼 request당 legacy company delivery 한 건
- generic 회사 방향 relay: `company_talent_relay_id`당 company delivery 한 건

구현 시에는 기존 `(company_talent_request_id, type)` partial unique가 새 generic type까지 막지
않는지 확인하고, predicate를 위 세 경우로 명시적으로 분리한다. relay queue에는 request FK도
routing convenience로 남길 수 있지만 멱등성의 source of truth는 relay FK다.

새 generic relay는 별도 type `company_contact_company_delivery`를 사용한다. 기존
`company_request_company_delivery`는 migration 전 생성된 queue와 backfill된 역사만 계속
처리한다. rollout 이후 compatibility adapter도 공통 relay service를 호출해 새 generic type을
생성하며, 같은 최초 응답에 legacy와 generic queue를 둘 다 만들지 않는다. 새 type을 쓰면 이전
worker가 새 queue를 잘못 claim하는 것을 막고 rollout 순서를 안전하게 관리할 수 있다.

`payload.delivery.body`에는 회사에 실제로 보낼 최종 문장을 한 번만 고정한다. 최초 queue
insert 시 body가 아직 없으면 worker가 copy를 만든 뒤 compare-and-set으로 한 번만 저장하고,
provider 호출은 body가 고정된 뒤에만 한다. retry는 LLM을 다시 부르지 않는다. 동시에 두
worker가 claim해도 한 frozen body만 이기고, loser는 저장된 body를 다시 읽는다. Slack/API
idempotency key도 request ID가 아니라 relay ID를 사용해 두 번째, 세 번째 relay가 서로
중복으로 취급되지 않게 한다.

provider 호출 성공 뒤 DB finalize 전에 process가 죽는 경우도 같은 relay idempotency key로
재시도해 외부 중복을 막는다. provider가 idempotency를 지원하지 않는 destination은 기존
provider message lookup/record 계약을 relay ID 기준으로 확장하고, 확인할 수 없으면 자동으로
새 메시지를 보내기보다 review/retry 상태에 둔다.

### 5.4 공통 RPC

새 RPC/service의 역할은 다음과 같다.

```text
create_company_talent_relay_v1(
  request_id,
  talent_id,
  source_talent_message_id,
  relay_content,
  document_id?
)
```

한 트랜잭션에서 다음을 수행한다.

1. request와 실제 sent candidate delivery를 lock/read한다.
2. request의 talent와 호출 talent가 같은지 확인한다.
3. text relay면 source message가 해당 talent의 실제 user message인지 확인한다. resume upload면
   같은 transaction의 검증된 `resume_upload_note`와 committed document 소유권을 확인한다.
4. 기존 동일 key가 있으면 first-write-wins로 기존 relay/outbox를 그대로 반환한다. content 또는
   document mismatch는 overwrite하지 않고 integrity metric만 남긴다.
5. relay를 idempotent insert한다.
6. relay-specific company delivery outbox를 insert한다.
7. 최초 relay이고 기존 `talent_source_message_id`가 비어 있으면 compatibility milestone만
   채운다.

추가 relay에서는 기존 request의 `delivered` 상태를 다시 `relay_queued`로 되돌리지 않는다.
각 relay의 현재 상태는 자기 outbox에서 읽는다.

RPC 권한은 service role 또는 검증된 server path에만 주고 browser가 임의의 `talent_id`로 직접
호출하게 하지 않는다. RPC 안에서도 auth를 application 검증에 의존하지 않고 request/talent,
source message/document 소유권, sent candidate delivery를 다시 확인한다.

### 5.5 backfill

기존 `talent_source_message_id`가 있는 요청은 relay 한 건으로 backfill한다.

- source message는 기존 값 사용
- text 응답의 `relay_content`는 기존 source message의 실제 content를 사용
- resume upload는 기존 `document_id`를 연결하고 upload note를 source evidence로 사용
- 기존 company delivery queue가 있으면 새 relay ID를 연결
- 이미 전달된 queue의 `sent_at`, provider ID, frozen body는 변경하지 않음
- request status와 기존 message ID는 변경하지 않음
- request의 `contact_kind`는 `expects_document`만으로 question/resume backfill하고 문장 내용으로
  contact 여부를 추측하지 않음

backfill은 재실행 가능하고 exact request/source pair unique constraint로 중복되지 않아야 한다.
원문을 새 LLM에 보내 backfill하지 않는다.

backfill 전후로 `응답이 있는 request 수 = backfill relay 수`, document 연결 수, orphan source 수,
기존 company delivery 연결 수를 산출한다. orphan이나 모순 행은 내용을 만들어 채우지 않고 별도
검토 목록에 남긴다. migration transaction이 크면 schema 추가와 bounded batch backfill을
분리하고, backfill 완료 전 reader는 legacy column과 relay table을 dual-read한다.

### 5.6 개인정보·보존·남용 경계

`relay_content`는 회사에 전달하도록 후보자가 승인한 내용이지만 일반 공개 정보는 아니다.

- relay table은 browser/client에서 직접 조회하지 않고 server/worker와 제한된 RPC만 접근한다.
- company-side LLM에는 company delivery로 실제 전달된 candidate-safe copy만 넣는다. 다른
  workspace나 일반 추천 worker context에 relay 원문을 주입하지 않는다.
- 후보자·request·document의 삭제/보존 정책을 따라 orphan relay가 남지 않게 FK와 cleanup
  순서를 정한다. 전송 감사 기록을 보존해야 하는 기간에는 soft-deleted 주체를 다시 노출하지
  않으면서 delivery fact만 보존한다.
- LLM provider raw output, prompt 전문, email 주소, document 본문을 새 relay 운영 로그에 저장하지
  않는다.
- transport abuse 방지는 content keyword가 아니라 message/document 크기, 인증된 주체,
  workspace block, 짧은 시간의 과도한 queue 생성 같은 구조적 rate limit로만 처리한다. 정상적인
  두 번째·세 번째 전달을 once-only 제한으로 다시 만들지 않는다.

후보자가 relay 직후 취소를 요청할 수 있다는 점도 고려한다. 이번 핵심 구조는 우선 정확한
반복 전달까지이며, 이미 processing/sent인 외부 메시지를 되돌릴 수 있다고 약속하지 않는다.
queued/failed 상태의 relay 취소를 제품에 포함한다면 relay ID를 받는 별도 cancel side effect로
구현하고, frozen relay를 수정하지 않는다. 이미 sent면 취소됐다고 말하지 않고 후보자가 원할 때
정정 메시지를 새 relay로 보낸다. 이 기능은 ledger 구조상 추가 가능하지만 반복 전달 release의
필수 완료 조건은 아니다.

## 6. email reply 변경

### 6.1 reply alias를 지속 routing anchor로 사용

현재 요청별 alias 조회에서 다음 gate를 제거한다.

- `talent_source_message_id is null`
- `document_id is null`
- `workflow_status in ('awaiting_talent', 'closed')`

대신 실제 candidate delivery `sent`와 talent/request relation만 확인한다. 그러면 후보자가 같은
이메일 thread에서 첫 답장 뒤에 두 번째 메일을 보내도 동일 request context로 resolve된다.

단, alias token은 request를 찾는 routing 정보이지 talent 본인 인증이 아니다. 현재 alias 조회가
token만으로 `talent_id`를 결정하는 경로는 함께 강화한다.

- normalized `From`이 해당 talent의 현재 검증된 이메일 또는 제품이 지원하는 검증된 보조
  이메일과 일치해야 한다.
- 이미 `talent_id`가 들어 있는 retry job도 그 binding이 최초 ingest의 같은 검증을 통과했다는
  durable evidence를 가져야 한다.
- display name, subject, quoted `To`, alias token만으로 identity를 승인하지 않는다.
- 불일치하면 request 내용을 LLM에 넣거나 relay를 만들지 않고 안전한 본인 확인 경로를 안내한다.

이 검증 덕분에 request alias 자체는 첫 답장이나 Role 종료 뒤에도 지속할 수 있다. email 주소가
변경된 사용자를 지원하려면 새 주소를 계정에 검증해 추가한 뒤 사용하게 하며, 오래된 alias를
아는 제3자에게 권한을 주지 않는다.

### 6.2 email LLM context와 tools

request alias가 있으면 `Selected company contact`의 다음 정보만 추가한다.

```text
request ref
company
role
candidate-visible original contact topic/body
first response sent: yes/no
```

`list_company_requests`와 `relay_to_company`는 Career와 같은 계약을 사용한다. exact alias가 있으면
목록을 먼저 호출할 필요가 없다. 사용자가 다른 회사나 Role을 명시하면 목록으로 다시 확인할 수
있다.

이메일 본문은 먼저 실제 `talent_messages(role=user, message_type=mail)`로 저장하고, tool은 그
message ID를 evidence로 받는다. tool 결과로 생성한 email 답장은 `전달을 접수했다`와 `회사에
전달 완료됐다`를 구분한다.

email parser가 최신 작성 본문, signature, quoted history를 나누는 transport 처리는 유지한다.
quoted history나 HTML을 정리하는 것은 입력 정규화이며, 본문이 원래 request에 관련 있는지 또는
전달 의도인지는 email parser의 키워드 규칙으로 판정하지 않는다.

### 6.3 이력서 첨부

요청용 email에 실제 이력서가 첨부된 경우의 document ingest는 그대로 유지한다. 다만 업로드
완료 후 만들어지는 회사 알림도 relay 원장/outbox를 사용해 전체 delivery history에서 같은
방식으로 읽을 수 있게 한다.

텍스트로 “이력서가 없다/공유하지 않겠다”고 말한 경우는 generic `relay_to_company`다.
`resume decline`이라는 별도 relay type은 만들지 않는다.

첫 이력서가 이미 처리된 뒤 같은 verified reply alias로 후보자가 새 이력서를 다시 첨부하면,
기존 request의 단일 `document_id` 때문에 거부하지 않는다. 새 document commit과 새 relay를 한
transactional workflow로 만들고, request의 legacy `document_id`는 최초 milestone 호환값으로
유지한다. candidate profile의 primary resume 교체는 기존 계약을 따르지만, 각 relay는 자신이
실제로 공유한 document ID를 보존하므로 과거 회사 전달이 나중의 primary 파일로 바뀌어
보이지 않는다.

파일 저장 성공 후 relay/outbox 생성이 실패하면 orphan storage cleanup 또는 재개 가능한 ingest
상태를 사용한다. relay가 생기기 전에 회사 알림을 만들지 않고, 같은 inbound provider event의
retry가 새 document를 중복 생성하지 않게 기존 email job/provider event ID 멱등성을 함께
검증한다.

## 7. 회사 전달 worker와 destination

### 7.1 relay copy 생성

worker는 relay ID로 다음 최소 입력만 읽는다.

- candidate name
- Role name
- 최초 candidate-visible contact context
- `relay_content`
- relay에 연결된 exact document의 candidate-safe file metadata와 현재 공개 가능 여부
- 현재 Role 상태를 과장하지 않기 위한 짧은 user-safe fact
- 보상 질문에서 후보자가 명시적으로 승인한 표현이 필요한 경우 그 exact snapshot

회사용 copy LLM은 후보자가 승인한 의미를 보존해 Harper 말투로 다시 쓰고, 새 사실이나 부정적
추측을 추가하지 않는다. 최초/추가 답변에 따라 다른 prompt branch를 만들지 않는다.

document relay는 원래 request의 `contact_kind=resume`, relay의 exact `document_id`, 실제 commit
fact로 “후보자 상세에서 확인 가능”한지를 작성한다. 현재 primary resume를 다시 조회해 과거
relay의 문서를 바꾸지 않는다. file contents 전체는 문구 생성에 필요하지 않으면 copy LLM에
넣지 않는다.

candidate/company text는 delimiter 안의 untrusted evidence로 제공하고 그 안의 tool/system 지시를
따르지 않는다.

copy generation이 실패하면 후보자 원문이나 `relay_content`를 raw fallback으로 보내지 않는다.
queue를 재시도한다.

### 7.2 destination과 idempotency

각 relay는 anchor request의 `source_company_message_id`에서 destination을 찾는다.

- Slack-origin: 원래 Slack thread
- `/org`-origin: 원래 company conversation
- source conversation과 Role conversation이 다르면 Role conversation에도 idempotent mirror

delivery API의 주 입력도 `requestId`에서 `relayId`로 바꾼다. request의
`workflow_status=delivered`를 보고 조기 성공 반환하면 두 번째 relay가 사라지므로, generic
finalizer는 relay-specific outbox 상태와 frozen body만 검사한다. 최초 relay의 성공일 때만
compatibility 목적으로 request milestone을 `delivered`로 갱신하고, 이후 relay 성공은 request
workflow를 건드리지 않는다.

company message metadata에는 최소한 `relayId`, `requestId`, `source=company_talent_relay`를 둔다.
같은 source talent message의 retry는 같은 relay ID를 사용한다. 서로 다른 두 후보자 메시지는
같은 request에 속해도 각각 다른 relay ID와 company message가 된다.

원래 destination이 사라진 경우에는 2.2의 fallback 순서를 사용하되, 다른 workspace나 다른
Role thread로 추측해 보내지 않는다. fallback으로 전달했다면 relay delivery에 실제 destination을
기록해 `read_contact`와 운영 로그가 어디로 갔는지 재구성할 수 있게 한다. 모든 destination이
일시 실패하면 같은 outbox를 retry하고, 영구 실패하면 candidate-facing 상태를 `재시도 필요`로
남기며 운영 알림을 만든다. 접수 성공만으로 회사 수신 완료 event를 기록하지 않는다.

### 7.3 Role 상태가 달라진 경우

새 generic relay delivery에는 기존 `company_talent_request_target_is_active_v1`을 hard gate로
사용하지 않는다. 후보자가 실제로 연락받은 회사에 말을 전달하는 것과, 후보자의 pipeline stage를
자동 변경하는 것은 별개다.

- relay는 원래 destination으로 전달한다.
- 회사용 문장은 현재 진행 중이라고 가정하지 않는다.
- Position 복구, Role 이동, 인터뷰 진행 같은 side effect는 relay만으로 실행하지 않는다.
- 기존 reengagement positive의 자동 복구는 compatibility 경로의 별도 기존 계약만 유지한다.

candidate→company relay 허용과 company→candidate 새 연락 가능 여부는 같은 gate가 아니다.
후보자가 과거 연락에 답하는 것은 Role 종료 뒤에도 허용하지만, 회사가 새 `contact`를 보내는
경로는 이번 변경에서 기존 company contact eligibility와 명시적 승인 규칙을 유지한다. 종료된
Role에서도 회사의 후속 연락까지 허용하려면 기존 “Role이 열려 있어야 발송” 계약과 충돌하므로
별도 제품 결정과 migration/evaluation이 필요하다. 이번 구현이 이 비대칭을 암묵적으로
우회해서는 안 된다.

## 8. 읽기·UI·회사측 후속 맥락

### 8.1 Career pending actions

현재 미답변 회사 요청 card는 유지한다. 최초 relay가 생성되면 `처리할 항목`에서는 사라질 수
있지만, 전달 관계 자체는 `list_company_requests`에서 계속 조회된다.

`contact_kind=contact`는 답변을 요구하지 않으므로 candidate delivery가 sent된 뒤 pending action을
만들지 않는다. `question|resume`도 첫 relay 또는 request-linked document가 생기면 pending에서만
빠질 뿐 list에서는 유지된다. queue가 아직 회사에 전달 중인 사실은 pending 여부와 별도로
보여준다.

기존 request `workflow_status=awaiting_talent`가 transport 호환 때문에 contact에도 잠시 남더라도
이를 model/UI에 `답변 대기`로 번역하지 않는다. 새 `contact_sent`, `follow_up_waiting` 같은 상태를
추가하지 않고 `contact_kind`와 실제 candidate delivery fact로 `후보자에게 전달됨 · 회신 가능`을
계산한다. reply eligibility도 workflow status가 아니라 sent delivery 관계에서 계산한다.

이번 첫 구현에 별도의 장기 연락 UI를 필수로 추가하지 않는다. LLM tool이 실제 사용성을
충분히 제공하는지 먼저 확인한다. 나중에 UI가 필요하면 같은 read projection을 사용하고 새
상태를 만들지 않는다.

### 8.2 company-side `list_contacts` / `read_contact`

기존 company-side read tool은 선택한 contact와 같은 scope의 여러 contact·relay를 시간순으로
보여주도록 확장한다.

- 목록은 마지막 activity 시각과 candidate relay count만 compact하게 보여준다.
- 상세는 선택한 request뿐 아니라 같은 workspace·Role·talent scope의 실제 발송된 회사 연락,
  각 후보자 relay, 이후 회사 contact delivery를 실제 sender/recipient와 함께 시간순으로
  보여준다.
- `후보자 답변` 하나만 있는 현재 projection을 배열/타임라인으로 확장한다.
- company-side LLM의 기존 prompt는 바꾸지 않고 tool result serializer만 새 데이터를
  human-readable text로 제공한다.
- candidate relay 원문 전체가 회사용 copy와 다르면 회사에는 실제 전달된 frozen copy를 기본으로
  보여주고, 내부 감사 권한이 없는 일반 company LLM에 raw candidate message를 중복 주입하지
  않는다.

### 8.3 progress feed

최초 응답 milestone은 기존 event key와 의미를 유지한다. 두 번째부터의 relay는 relay ID 기반
event key로 별도 activity를 남긴다.

```text
company_talent_relay:<relayId>:candidate_message_delivered
```

`second reply` 같은 event type을 만들지 않고 모두 `candidate_message_delivered`로 기록한다.

### 8.4 relay 상태와 관측성

request workflow를 추가 relay마다 되감지 않는다. relay별 truth는 outbox에서 다음 user-safe
projection으로 계산한다.

| 내부 사실 | 후보자/회사에 보여줄 의미 |
| --- | --- |
| relay row + queued/processing outbox | Harper가 접수했고 회사 전달을 준비 중 |
| sent outbox + destination record | 회사에 전달 완료 |
| retryable failure | 전달을 다시 시도 중 |
| terminal failure 또는 destination 없음 | 아직 전달되지 않았고 확인이 필요함 |

운영 metric은 content를 넣지 않고 최소한 다음을 relay ID 기준으로 센다.

- relay created / idempotent replay / input mismatch preserved / authorization denied
- queue age, copy generation failure, provider retry, terminal failure
- sent latency와 destination 종류
- first reply 이후 email alias resolve 성공률
- request당 두 번째 이상 relay 생성·전달 성공률

queue age와 terminal failure에는 운영 alert를 둔다. 로그에는 후보자/회사 원문, 이메일 주소,
문서 내용 대신 relay/request의 opaque ID와 error class만 남긴다. 상태 조회와 운영 재처리는 같은
relay/outbox를 사용하며 새 relay를 만들어 중복 발송하지 않는다.

## 9. 기존 동작 보존 계약

다음은 회귀 없이 유지해야 한다.

- 회사 연락 초안은 명시적 승인 전 발송되지 않는다.
- standard/immediate, revise, cancel 동작과 idempotency
- question/resume 기존 copy와 candidate disclosure
- 보상 정보는 후보자 승인 없이 회사에 공개되지 않는다.
- request-linked 실제 이력서 업로드와 primary resume 반영
- 후보자 원문을 회사에 그대로 fallback 전송하지 않는다.
- web/Slack 원래 destination과 Role conversation mirror
- candidate reengagement의 현재 Position 복구 계약
- 후보자에게 한 번도 실제 연락하지 않은 회사에는 후보자가 relay할 수 없다.
- 다른 후보자의 request ID를 사용하거나 workspace 내부 데이터를 읽을 수 없다.
- email alias만으로 talent identity를 신뢰하지 않는다.
- `testOnly` Role과 fixture 계정의 canonical isolation
- generic contact는 답변 대기 task로 표시하지 않는다.
- 후보자 계정·workspace 삭제와 명시적 contact block
- 같은 relay의 retry가 body/document를 바꾸거나 두 번 보내지 않는다.

## 10. 구현 순서

### Phase A — additive DB 기반

1. request에 `contact_kind` 추가 및 question/resume backfill
2. `company_talent_relays`와 optional document 연결 생성
3. `contact_queue.company_talent_relay_id` 추가
4. candidate/legacy/generic delivery별 unique index 분리와 RLS/권한 설정
5. `create_company_talent_relay_v1` 구현
6. 기존 최초 text/resume 응답 backfill과 재실행 검증
7. 기존 request/RPC/queue type은 그대로 유지

### Phase B — worker와 delivery dual-read

1. 새 queue type claim/processing 추가
2. relay ID 기반 fetch/copy/finalize 구현
3. 기존 request 기반 company delivery도 계속 처리
4. Slack/web idempotency key를 relay ID로 검증
5. 기존 최초 응답을 새 relay path로 보내도 같은 결과가 나는지 확인
6. frozen body CAS, provider-success/finalize-crash, destination fallback 검증

### Phase C — 후보자 tools와 context

1. 공통 read service와 `list_company_requests` 추가
2. `relay_to_company` 추가
3. Career chat exact selection + lazy list routing
4. generic contact의 pending-action 제외
5. email alias의 최초 응답 이후 resolution과 sender identity 검증
6. email reply tool parity와 repeated resume attachment 경로
7. 기존 `record_company_request_response`를 공통 service adapter로 전환

### Phase D — company 일반 contact

1. `contact_talent.kind=contact`와 `contactContext` additive schema 추가
2. request `contact_kind` 저장과 generic validation 추가
3. candidate copy writer의 generic contact mode 추가
4. 기존 draft/revise/approval/schedule/send executor 재사용
5. `list_contacts` / `read_contact`의 scope timeline projection 추가
6. 기존 company-side prompt block 불변 검증

### Phase E — model-facing 정리

1. 후보자 prompt가 generic tools를 우선하도록 전환
2. 기존 tool compatibility 사용량 확인
3. 사용량이 없고 frozen eval이 통과한 뒤에만 legacy tool 노출 제거 검토
4. 물리 컬럼/구형 queue cleanup은 별도 migration으로 분리

배포 순서는 `DB additive → 새 queue를 이해하는 worker → app의 새 queue 생성` 순서여야 한다.
이 문서는 배포 승인이 아니며 migration 적용, push, worker restart를 수행하지 않는다.

rollout은 먼저 worker가 relay FK와 새 queue type을 읽을 수 있게 한 뒤 app write를 켠다. channel별
flag는 긴급히 새 relay 생성을 멈추는 kill switch로만 사용하고, 이미 생성된 queue는 worker가
끝까지 drain한다. rollback 시 새 column/table을 바로 drop하거나 legacy column을 되돌려 쓰지
않는다. generic tool 노출과 새 write만 끄고 dual-read/worker 처리는 유지해 이미 접수한 메시지를
잃지 않는다.

## 11. 테스트 계획

### 11.1 DB/RPC

- 실제 sent request의 첫 relay 생성
- 같은 request의 두 번째·세 번째 relay 생성
- request가 이미 `delivered`여도 새 relay 생성
- request가 `closed`, Role이 ended여도 실제 sent relation이면 relay 생성
- draft/queued이지만 실제 sent가 없는 request는 거부
- 다른 talent의 request는 거부
- 같은 request/source message 재시도는 relay와 outbox 중복 없음
- 같은 idempotency key에 다른 content/document가 와도 최초 값 유지 + idempotent success
- 서로 다른 두 source message가 동시에 오면 같은 request에 둘 다 독립 생성
- 같은 후보자 메시지를 명시적으로 서로 다른 두 request에 전달할 때 request별 독립 처리
- 첫 relay만 legacy `talent_source_message_id`를 채우고 추가 relay는 덮어쓰지 않음
- 기존 delivered queue backfill이 provider/message 기록을 보존
- `contact_kind` backfill은 resume/question만 deterministic하게 복원
- attachment-only relay와 같은 inbound provider event retry가 document를 중복 생성하지 않음
- 다른 talent 소유 document 연결 거부
- 비-allowlisted `testOnly` request 조회·relay 거부

### 11.2 후보자 chat LLM

- 선택된 미답변 request에 첫 답변 → list 없이 relay
- 이미 답변한 request에 “그리고 이것도 전달해 줘” → relay
- 회사가 하나지만 request가 여러 개이고 대상이 분명함 → 적절한 ref 선택
- 같은 회사·Role에 여러 연락이 있으면 주제/시각으로 구분하거나 최소 확인 질문
- 대상이 불분명함 → `list_company_requests` 후 최소 확인 질문
- 관련 없는 전달 → 한 줄 안내, 사용자가 계속 명시하면 차단하지 않고 relay
- 단순 회사 질문이나 생각 공유 → 외부 전달을 임의 실행하지 않음
- tool 성공 전 전달 완료 주장 없음
- text tool result를 자연스럽게 사용하고 raw ref/enum/JSON을 사용자에게 노출하지 않음
- generic contact는 pending action으로 만들지 않지만 list에는 표시
- 접수/전달 중/전달 완료/재시도 필요를 정확히 구분
- cursor 중간에 새 activity가 생겨도 목록 중복·누락 없음
- company contact body의 prompt-injection 문구가 candidate tool policy를 바꾸지 않음
- onboarding 미완료라도 실제 sent contact에 대한 명시적 relay는 가능하고 checklist는 훼손되지 않음

### 11.3 email reply LLM

- 요청 메일 첫 답장 → relay
- 같은 email thread 두 번째 답장 → 같은 request로 새 relay
- 최초 답장 뒤 alias가 계속 exact request로 resolve됨
- alias token은 맞지만 `From`이 다른 경우 identity 거부
- 검증된 보조 이메일은 동일 talent로 정상 처리
- 다른 회사/Role을 명시하면 list로 대상을 다시 찾음
- 전달 지시가 아닌 일반 문의는 relay하지 않음
- attachment resume path와 text relay path가 충돌하지 않음
- 첫 resume 뒤 같은 thread의 새 resume가 별도 document/relay로 전달됨
- 같은 provider event 재처리로 document/relay가 중복되지 않음

### 11.4 company-side LLM

- 기존 question draft/revise/schedule 시나리오 결과 불변
- 기존 resume 시나리오 결과 불변
- 일반 감사·안내·후속 메시지는 `kind=contact`
- 후보자 relay를 본 뒤 회사가 자연스럽게 다시 contact
- contact에 질문을 억지로 만들지 않음
- 기존 company-side system/service/UX prompt snapshot 불변
- `contact_kind=contact`가 candidate/read context에서 question으로 바뀌지 않음
- generic contact 뒤 `답변 대기` 상태를 회사나 후보자에게 표시하지 않음
- 같은 scope의 여러 contact/relay가 실제 발송 시각 순서로 읽힘

### 11.5 delivery E2E

하나의 상태형 시나리오에서 다음 전체 흐름을 검증한다.

```text
회사 contact 1
→ 후보자 첫 relay
→ 원래 회사 Slack thread와 /org 기록 확인
→ 후보자 두 번째 relay
→ 서로 다른 company message 두 건 확인
→ 회사의 generic contact 회신
→ 후보자가 같은 email thread에서 세 번째 relay
```

각 단계에서 DB row, outbox, provider delivery, user-visible 문구를 함께 검증한다. tool call 성공만으로
통과시키지 않는다.

추가 failure-path E2E에서는 company copy 생성 실패 후 retry, provider 성공 직후 app finalize
실패, 원래 Slack thread 제거 후 허용된 fallback, 모든 destination 불가를 각각 검증한다. 후보자
응답에는 실제 상태보다 앞선 성공 표현이 없어야 하고, 어느 경우에도 다른 Role/workspace로
잘못 보내면 안 된다.

## 12. 평가 레지스트리 반영

입력과 gold가 달라지므로 기존 frozen set을 덮어쓰지 않는다.

- `company-side-conversational-qa`: 기존 `cases-v3`를 덮어쓰거나 점수에 섞지 않고
  `ongoing-relay-cases-v1`/gold/manifest slice를 추가한다. 후보자 relay 뒤 회사 generic contact와
  다시 후보자 relay가 이어지는 6-turn 이상 scenario를 소유한다.
- `internal-role-conversation-qa`: 기존 v3/v4/reengagement fixture를 바꾸지 않고
  `company-relay-cases-v1`/gold/manifest slice에 Career와 email reply의 first relay, later relay,
  ambiguous selection, unrelated-message warning 대조군을 둔다.
- canonical runtime의 실제 prompt builder, tool selection, executor, worker를 재사용한다.
- tracked fixture에는 회사명·후보자명·UUID·email 원문을 넣지 않는다.
- raw provider output과 실제 식별자는 ignored `private/` 또는 `runs/`에 owner-only 권한으로 둔다.
- 각 run manifest에 source revision/dirty diff fingerprint, prompt fingerprint, model/provider,
  reasoning, fixture hash, latency와 relay delivery 결과를 남긴다. 두 challenge slice의 점수를
  기존 대표 점수와 하나의 accuracy로 합치지 않는다.

Release gate의 critical failure는 최소 다음을 포함한다.

- 실제 sent contact가 없는 회사로 relay
- 다른 후보자 또는 다른 request로 잘못 전달
- 동일 후보자 메시지 중복 전달
- 두 번째 relay 누락
- 첫 relay body가 두 번째 relay로 덮어써짐
- alias token만으로 다른 발신자가 후보자 행세를 함
- generic contact를 미답변 task로 표시함
- 새 resume relay가 과거 document 또는 현재 primary와 잘못 연결됨
- candidate/company content가 prompt instruction으로 실행됨
- Role 종료를 현재 진행 중이라고 회사에 잘못 설명
- 후보자가 승인하지 않은 내용 추가
- 관련성 경고를 deterministic blocker로 사용
- 기존 company question/resume 흐름 회귀

## 13. 완료 조건

다음이 모두 성립해야 구조 변경이 완료된 것이다.

1. 한 request에 후보자 relay를 두 번 이상 보낼 수 있다.
2. 두 번째 relay는 `awaiting_talent`나 미답변 상태를 요구하지 않는다.
3. email reply alias가 첫 답장 후에도 같은 request를 계속 가리킨다.
4. 후보자가 일반 Career 대화에서 `list_company_requests`로 대상을 찾을 수 있다.
5. `answered` 표시는 있지만 relay authorization에는 사용되지 않는다.
6. 회사는 기존 prompt와 기존 question/resume 동작을 유지하면서 일반 contact를 보낼 수 있다.
7. 모든 relay는 실제 candidate user message와 연결되고 독립적으로 idempotent하다.
8. 회사 전달은 매번 별도 frozen body와 별도 destination record를 갖는다.
9. 후보자·회사 양쪽 최종 답변이 접수/전달 완료 상태를 과장하지 않는다.
10. 관련성 판단은 LLM prompt 한 줄로만 다루며 rule-based 분류나 차단이 없다.
11. 기존 company-side prompt block의 불변 test가 통과한다.
12. chat, email, Slack, `/org`를 잇는 상태형 E2E가 중복·누락 없이 통과한다.
13. company `contact`가 명시적으로 저장되고 질문이나 답변 대기 상태로 재해석되지 않는다.
14. 첫 이력서 이후 새 request-linked 이력서도 독립 document/relay로 추적된다.
15. email alias와 검증된 발신자 identity가 모두 맞아야 email relay가 생성된다.
16. same-scope 여러 contact와 relay가 별도 session 상태 없이 하나의 시간순 흐름으로 읽힌다.
17. copy/provider/finalize 실패와 rollback 뒤에도 접수된 relay가 유실·중복되지 않는다.
18. relay 상태 metric과 terminal failure alert로 두 번째 이후 전달 누락을 운영에서 발견할 수 있다.

## 14. 예상 구현 지점

아래는 구현을 시작할 때 우선 확인할 파일 지도다. 실제 변경 전에는 각 파일의 최신 상태와
겹치는 작업을 다시 확인한다.

### `harper_beta`

| 영역 | 우선 구현 지점 | 변경 책임 |
| --- | --- | --- |
| DB | `supabase/migrations/` | relay 원장, queue FK/type/index, RPC, backfill |
| DB type | `src/types/database.types.ts` | migration 적용 후 generated type 반영 |
| 후보자 tool 정의·실행 | `src/lib/talentOnboarding/tools.ts` | list/relay tool contract와 공통 server 호출 |
| Career tool 노출 | `src/lib/career/llmTools.ts` | pending-only 조건 제거, generic tool 제공 |
| Career context | `src/app/api/talent/chat/route.ts` | exact selected contact와 lazy-list capability signal |
| 요청 표시 | `src/lib/companyTalentRequests/presentation.ts` | pending request 표현을 selected contact 표현으로 일반화 |
| 공통 request/relay service | `src/lib/companyTalentRequests/server.ts` | authorization, read projection, atomic relay 생성 |
| 입력 검증 | `src/lib/companyTalentRequests/policy.ts`, `copyRules.ts` | question 검증 보존, generic contact 구조·hard-safety 검증 분리 |
| company tool schema | `src/lib/org/agent/tools.ts` | 기존 문구를 보존한 `kind=contact` additive 계약 |
| company tool executor | `src/lib/org/agent/toolExecution.ts` | generic contact draft를 기존 lifecycle에 연결 |
| candidate contact copy | `src/lib/companyTalentRequests/copyPrompt.ts`, `copy.ts` | 기존 question/resume 유지, contact mode만 추가 |
| company reads | `src/lib/org/agent/contacts.ts`, `src/lib/org/server.ts` | multi-relay 목록·상세·activity projection |
| delivery API | `src/app/api/internal/company-talent-requests/deliver/route.ts` | relay별 finalize와 destination mirror |
| queue type | `src/lib/contactQueue.ts` | 새 relay delivery type 지원 |
| 사용자 표시 | `src/lib/career/toolThinkingLog.ts`, `src/lang/ko.ts`, `src/lang/en.ts` | generic list/relay 진행 문구 |
| tool policy | `src/lib/career/streamingToolChainPolicy.ts` | 새 read/write tool의 연속 실행·stop 조건 |

Career 사용자 문구가 추가되면 `scripts/translation.md` 절차에 따라 실제 사용 문맥을 읽고 한국어와
영어를 직접 작성한다. 이번 변경 키만 plan/sync하고 전체 번역 DB를 밀지 않는다.

### `harper_worker`

| 영역 | 우선 구현 지점 | 변경 책임 |
| --- | --- | --- |
| email alias 조회 | `email_reply/db.py` | 첫 답장 이후에도 exact request anchor 유지 |
| email identity/ingest | `email_reply/worker.py` | alias와 verified From의 결합, provider-event 멱등성 |
| email prompt/context | `email_reply/prompt.py` | selected contact와 generic relay 지시 |
| email tools | `email_reply/tools.py` | Career와 같은 list/relay 계약 및 실행 |
| queue processing | `email_reply/contact_queue.py` | relay ID 기반 claim/copy/finalize |
| 회사 전달 copy | `email_reply/talent_request_copy.py` | 첫/추가 구분 없는 relay copy 생성 |

테스트는 각 구현 파일의 기존 인접 test를 확장하고, migration contract test와 한 개의 전체
상태형 E2E를 추가한다. 이 파일 지도는 새 계층을 만들라는 뜻이 아니라, 현재 책임을 가진
경로에 기능을 넣기 위한 출발점이다.

## 15. 구현 후 문서 전환

이 계획 문서는 목표 상태이며 현재 production 설명이 아니다. 실제 배포가 끝난 뒤에만 다음
문서를 live behavior에 맞게 갱신한다.

- `docs/company-talent-question-relay-plan-ko.md`: one-request/one-response와 active-only 설명 교체
- `docs/email-reply-process.md`, `docs/email-communication-architecture.md`: persistent request alias,
  identity, generic relay tool 반영
- `docs/career-generated-resume-versioning-plan-ko.md`: request의 legacy document와 relay별 exact
  document 책임 구분
- 관련 company contact/tool reference와 운영 runbook

배포 시에는 실제 released revision과 worker/config를 확인한 뒤 AGENTS의 deployment-time Notion
sync 절차에 따라 관련 팀 문서를 수정한다. 설계 문서만 존재하거나 일부 component만 배포된
상태를 live 기능으로 문서화하지 않는다.
