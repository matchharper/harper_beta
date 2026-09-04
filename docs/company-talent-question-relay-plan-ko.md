# 회사 질문 ↔ 후보자 전달 구현 문서

상태: 구현 기준 문서
최종 점검: 2026-09-01

## 1. 목표

회사와 진행 중인 후보자를 검토하는 회사가 Harper에게 추가 질문이나 이력서 요청을 할 수 있다.
Harper는 이미 안전하게 공유 가능한 정보로 먼저 답하고, 확답할 수 없을 때만 회사의 명시적
확인을 받아 후보자에게 연락한다. 후보자의 답변이나 실제 이력서 업로드가 도착하면 원래
회사 대화 또는 Slack thread로 돌아가 결과를 전달한다.

이 기능은 `연결 대기`에만 한정하지 않는다. 연결 대기, 연결됨, 최종 오퍼와 회사가 정의한
모든 진행 중 프로세스 단계에서 같은 범용 질문·자료 요청 흐름을 사용한다. 회사 내부 전용,
아카이브, 프로세스 종료 상태는 새 연락 대상이 아니다.

핵심 원칙은 다음과 같다.

- 질문 종류를 미리 열거하지 않는다. 모든 텍스트 질문은 하나의 범용 요청이다.
- 문서 업로드가 필요한지만 `expects_document` boolean으로 구분한다.
- 후보자의 원문을 회사에 그대로 노출하지 않는다. 후보자가 승인한 의미만 Harper 말투로
  다시 쓴다.
- 연봉·보상 질문은 내용으로 감지하며, 저장된 값을 회사에 먼저 공개하지 않는다.
- 요청 원장, 발송 outbox, 실제 메시지 기록의 책임을 섞지 않는다.
- 후보자 LLM에는 DB row나 JSON blob 전체가 아니라 짧게 가공한 텍스트만 넣는다.
- 같은 기능이라면 적은 상태와 적은 컬럼을 우선한다.

## 2. 전체 흐름

### 2.1 회사 질문

1. 회사가 현재 회사 프로세스에서 진행 중인 후보자에 관해 묻는다.
2. company-side LLM은 프로필과 후보자가 Harper에게 말해준 다섯 가지 직업 관련 정보
   (`next_scope`, `location`, `team_style_fit`, `must_haves`, `deal_breakers`)로 답할 수 있는지
   판단한다. 이 정보는 회사별 동의나 작성 시점으로 제한하지 않고 항상 함께 읽으며, 보상
   insight는 포함하지 않는다.
3. 명확한 근거가 있으면 후보자에게 불리하지 않게 재서술해 답한다.
4. 근거가 없거나 애매하면 현재 확인 범위를 설명하고, 대신 후보자에게 연락할지 묻는다.
5. 회사가 명시적으로 요청하면 `contact_talent(kind=question)`가 범용 질문 원문과 대상을 저장한다.
6. worker의 별도 copy LLM이 후보자용 제목과 본문을 작성한다.
7. 같은 본문이 이메일과 Harper 채팅에 전달된다.
8. 후보자가 답하면 활성 요청이 있을 때만 답변 기록 tool을 노출한다.
9. 후보자가 승인한 의미를 별도 copy LLM이 회사용 Harper 문장으로 작성한다.
10. 결과를 원래 회사 대화 또는 Slack thread에 전달한다.

### 2.2 이력서 요청

1. 회사가 이력서를 요청하면 Harper는 먼저 후보자 프로필 정보를 확인하도록 안내한다.
2. 회사가 그래도 요청하라고 명시하면 `contact_talent(kind=resume)`를 실행한다.
3. 후보자는 이메일 첨부 또는 `/career/profile`의 signed request link로 업로드할 수 있다.
4. 업로드 파일은 회사 전용 사본이 아니라 후보자의 일반 primary resume로 등록된다.
5. 일반 이력서 업로드와 동일하게 `is_primary=true`, `is_public=true`로 저장하며 이전 primary를
   교체한다.
6. 채팅에는 사용자가 기회 반응을 남길 때와 같은 system action으로
   `요청받은 이력서를 업로드했습니다.` 메시지를 만든다.
7. 실제 document commit이 성공한 뒤에만 회사 전달 outbox를 만든다.
8. 회사에는 후보자 상세에서 새 이력서를 확인할 수 있다고 알린다.

일반 프로필 업로드에는 요청 ID가 없으므로 활성 이력서 요청을 자동 완료하지 않는다. 이메일
첨부와 profile request link만 해당 요청을 완료한다.

## 3. 최소 데이터 모델

`company_talent_requests`는 업무 원장이다. 총 13개 컬럼만 둔다. 질문 종류나 답변 종류를
분류하는 컬럼은 없다.

| 컬럼 | 이유 |
|---|---|
| `id` | 요청 식별자 |
| `company_workspace_id` | 회사 범위와 조회 |
| `role_id` | 역할 및 회사 진행 중 상태 검증 |
| `recommendation_id` | 후보자 상세 링크와 추천 대상을 고정 |
| `talent_id` | 후보자 및 활성 요청 매칭 |
| `source_company_message_id` | 원래 회사 대화와 Slack thread를 역참조하는 단일 source |
| `expects_document` | 실제 문서 commit이 필요한 요청인지 구분 |
| `request_context` | 후보자에게 중립화해 물어볼 범용 질문 |
| `workflow_status` | 업무 단계 |
| `expires_at` | 오래된 요청 자동 종료 |
| `talent_source_message_id` | 후보자가 답한 실제 user message 연결 |
| `document_id` | 실제 업로드로 요청을 완료한 resume |
| `created_at` | 생성 시각 |

### 3.1 넣지 않는 컬럼

- 질문 분류 enum: 질문 범위를 예측할 수 없고 분기만 늘린다.
- `request_kind`, `question_kind`, `response_mode`: `expects_document` 하나로 충분하다.
- 회사 conversation/thread/source: `source_company_message_id`로 모두 찾을 수 있다.
- 후보자 conversation: reply alias와 발송 outbox가 가진다.
- 이메일 subject/text/html/address/provider id: `contact_queue`의 책임이다.
- 회사 전달 body/message id/Slack timestamp: delivery outbox와 `company_messages`의 책임이다.
- 이력서 baseline, fulfillment source, 회사별 grant: 실제 `document_id` 하나면 충분하다.
- 후보자 원문 복사본: `talent_source_message_id`가 실제 메시지를 가리킨다.
- 요청 `updated_at`과 `status_reason`: 발송·답변·회사 메시지 시각, `expires_at`, 현재 stage,
  outbox `last_error`에서 더 정확하게 파생한다.
- 저장된 보상 snapshot과 공유 방식 enum: 후보자에게 보인 문구는 실제 발송 outbox에만
  고정하고, 답변 자체는 실제 user message를 근거로 다시 쓴다.

## 4. Outbox와 메시지 기록

`contact_queue`에는 요청 FK와 type을 추가한다.

- `company_request_candidate_delivery`
- `company_request_company_delivery`

후보자 발송을 만들 때 `payload.delivery`에 아래 snapshot을 한 번만 고정한다.

candidate delivery의 `scheduled_at`은 요청 생성 시점에서 최소 20분 뒤이며, KST
08:00 이상 20:00 미만인 가장 빠른 시각으로 정한다. worker도 같은 조건을 다시 검사해
오래된 app code나 수동 queue 변경이 있어도 허용 시간 밖에는 발송하지 않는다.

```text
to, from, replyTo
subject
chatText
emailText, emailHtml
conversationId
idempotencyKey
```

재시도에서는 copy LLM을 다시 호출하지 않고 같은 snapshot을 사용한다. provider 처리 상태는
기존 `contact_queue.status`, `attempts`, `sent_at`, `resend_email_id`, `last_error`를 사용한다.

회사 전달 문장은 company delivery queue의 `payload.delivery.body`에 한 번만 고정한다. 실제
결과는 기존 테이블에 남긴다.

- 후보자 채팅: `talent_messages`
- 후보자 이메일 기록: `career_email_messages`
- 회사 채팅·Slack 기록: `company_messages`
- 회신 routing: `email_reply_aliases`

따라서 요청 테이블에 같은 정보를 중복 저장하지 않는다.

## 5. 상태 모델

업무 상태 문자열에 DB CHECK enum을 두지 않는다. 애플리케이션이 현재 사용하는 단계는
다음과 같다.

| 상태 | 의미 |
|---|---|
| `queued` | 후보자 연락 outbox 생성 |
| `awaiting_talent` | 이메일·채팅 전달 완료, 답변 또는 문서 대기 |
| `relay_queued` | 답변 또는 문서 수신, 회사 전달 대기 |
| `delivered` | 회사 전달 완료 |
| `review_required` | 답변 후 stage 변경 등으로 자동 전달 보류 |
| `closed` | 만료, stage 변경, 후보자 연락 전 종료 |
| `failed` | 재시도 한도 초과 |

`sending`, `relaying`은 transport queue 상태이므로 업무 원장에 두지 않는다. `answered`,
`fulfilled`도 `talent_source_message_id`와 `document_id`로 알 수 있어 별도 상태가 필요 없다.

## 6. 후보자 LLM 입력

후보자 chat/email LLM에는 활성 요청이 있을 때만 아래처럼 가공한 텍스트를 추가한다.

```text
requestId: ...
response: text answer | uploaded resume
company: ...
role: ...
question: ...
```

보상 질문이면 별도 정책 문장만 붙인다. DB row 전체, timestamp 상세, workspace ID,
recommendation ID, 전송 payload, provider 값은 넣지 않는다. 후보자 정보를 읽는 모든 쿼리는
`select *` 대신 명시적 컬럼을 사용한다.

후보자에게는 활성 요청이 있을 때만 범용 `record_company_request_response` 하나를 노출한다.
텍스트 답변과 거절을 같은 방식으로 실제 user message에 연결한다. 이력서 요청에서는 명시적
거절·최신본 없음에만 이 tool을 사용한다.

첨부 업로드 성공은 LLM tool이 아니라 document service가 기록한다.

## 7. 후보자 이메일 작성 프롬프트

이메일 품질을 나중에 점수화하는 별도 LLM은 두지 않는다. 최초 작성 프롬프트가 다음 구조를
직접 요구한다.

1. 제목은 포지션과 연락 목적을 알 수 있게 쓰되 긴급함을 만들지 않는다.
2. 본문은 세 개의 짧은 문단으로 쓴다.
   - 이름이 있으면 이름을 넣어 인사하고, 자연스러울 때만 부담 없는 연결 문장을 짧게 추가
   - 어느 회사·포지션의 검토에서 왜 지금 Harper가 연락하는지 설명
   - 회사의 표현을 중립적으로 바꾼 한 가지 질문, 어떤 방식으로 답하면 되는지, 편하게
     답장해도 된다는 마무리
3. `안녕하세요` 다음에 질문 한 줄만 보내는 형태를 금지한다.
4. 후보자에게 불리할 수 있는 의심, 부정적 추측, 회사의 거친 원문을 복사하지 않는다.
5. 개인적인 사건, 이전 대화, 마감, 회사의 강한 관심, 채용 결정을 지어내지 않는다.
6. 업로드 URL, 선택권·공유 안내, signature/footer는 모델이 만들지 않는다. 서버의 고정 문구가
   붙인다.
7. 보상 질문에서는 금액을 모델 입력에 넣지 않고, 이번 요청에서 회사에 전달해도 되는 정확한
   금액·범위·표현을 묻도록 한다.

copy LLM 입력은 JSON row가 아니라 다음 라벨만 있는 짧은 텍스트로 제한한다.

```text
language
candidateName
company
role
requestNeedsResume
neutralContext
asksAboutCompensation
hasStoredCompensation (boolean only)
```

signed upload URL과 저장된 보상 금액은 copy LLM 입력에 넣지 않는다. 고정 서버 블록에서만
붙인다.

모델 장애 시 후보자 메일은 같은 구조의 결정론적 fallback을 사용한다. 회사 전달에서
모델 장애가 나면 후보자 원문을 fallback으로 보내지 않고 queue를 재시도한다.

## 8. 보상 정책

보상은 질문 enum이 아니라 `request_context`의 의미로 감지한다.

- 회사 질문 시 insight의 보상 값을 먼저 공개하지 않는다.
- 기존 보상 표현은 요청 row에 복사하지 않고 후보자 발송 시점에만 읽는다.
- 후보자 메일 작성 LLM에는 값이 있는지 boolean만 전달한다.
- 서버 고정 문구로 `이 표현 그대로 전달할까요, 범위나 다른 표현으로 전달할까요?`를 묻는다.
- 후보자에게 실제로 보인 표현은 candidate delivery outbox에 고정한다. 이는 재시도 일관성과
  `그대로 전달해 주세요` 같은 답변 해석에만 사용한다.
- 후보자가 금액·범위·표현을 직접 답하거나, 방금 제시한 표현의 전달을 명시적으로 승인한
  경우에만 회사 전달 단계로 간다.
- 회사 전달 copy LLM은 그 승인된 근거만 받아 Harper 말투로 다시 쓰며 숫자·통화·범위를
  바꾸지 않는다.

## 9. 이력서 저장과 접근

요청으로 받은 이력서에 회사별 접근 권한을 만들지 않는다. 일반 profile resume와 같은 저장
규칙을 사용한다.

```text
kind = resume
is_primary = true
is_public = true
```

`talent_users.resume_*` legacy mirror도 함께 갱신한다. 회사의 이력서 열람은 기존 후보자 프로필
공개 규칙만 따른다. 요청 행은 `document_id`로 업로드 완료 사실만 연결한다.

## 10. Idempotency와 오류 처리

- 회사 원문 메시지 하나당 요청 하나를 unique하게 만든다.
- 후보자별 활성 요청 수를 DB에서 제한하지 않는다. 이메일은 request별 reply alias로 정확히
  routing하고, 채팅은 현재 표시한 최신 활성 요청 하나에만 답변 tool을 노출한다.
- 후보자/회사 outbox는 `(request_id, type)` unique이다.
- 발송 copy는 provider 호출 전에 queue payload에 고정한다.
- candidate email idempotency key는 request ID에서 결정한다.
- 실제 메시지 ID는 outbox payload에 고정해 재시도 시 재사용한다. 요청 FK 자체에는 메시지
  개수를 제한하는 unique를 두지 않는다.
- 모든 요청의 `expires_at`은 생성 시점 + 14일이다. 활성 요청 조회·답변·업로드·발송 경계는
  이 시각을 지난 요청을 거부하고 `closed` 처리한다.
- 후보자가 하나의 진행 중 단계에서 다른 진행 중 단계로 이동해도 요청은 유지한다.
- 후보자 연락 전에 회사 프로세스가 종료·아카이브되거나 내부 전용 상태가 되면 `closed`,
  답변 후 더 이상 진행 중이 아니게 되면 `review_required`로 둔다.
- resume는 storage 검증과 DB transaction이 성공한 후에만 `document_id`를 기록한다.
- DB transaction 실패 시 새 storage object를 제거한다.
- copy generation 또는 provider 오류는 queue 재시도 정책을 사용하고, 한도 초과 시에만
  요청을 `failed`로 둔다.
- candidate delivery가 `queued` 또는 `failed`일 때만 회사가 취소할 수 있다. 취소 RPC는
  request와 outbox를 함께 잠근 뒤 outbox를 `cancelled`, 요청을 `closed`로 한 transaction에서
  바꾼다. `processing` 이후에는 취소 성공으로 응답하지 않는다.
- 회사 agent의 `read_talent`과 후보자 상세 피드는 예정 시각, 주제, 발송 상태와 취소 가능
  여부를 같은 outbox 상태에서 읽는다.

## 11. 점검 항목

- 범용 질문에 enum 분기가 없는가
- 요청 테이블에 transport/message 중복 컬럼이 없는가
- 후보자 정보 조회가 명시적 컬럼만 선택하는가
- 후보자 LLM 입력에 compact text만 들어가는가
- 저장 보상 금액이 회사 또는 copy LLM에 먼저 노출되지 않는가
- 후보자 메일 프롬프트가 세 문단, 목적 설명, 답변 방법을 요구하는가
- 회사 전달 copy 모델 실패가 원문 전달로 degrade되지 않는가
- 이력서가 일반 primary resume로 등록되는가
- 이메일 첨부와 profile link가 동일한 finalize transaction을 사용하는가
- 일반 profile upload가 요청을 우연히 완료하지 않는가
- 원래 web conversation 및 Slack thread로 돌아가는가
- 진행 중 단계 사이의 이동, 프로세스 종료, 중복 provider call, DB rollback 시 안전한가

## 12. 구현 위치

- DB 및 RPC: `supabase/migrations/20260805100000_company_talent_requests.sql`,
  `supabase/migrations/20260806040000_schedule_and_cancel_company_talent_requests.sql`
- web 정책·compact context: `src/lib/companyTalentRequests/`
- company-side LLM tools: `src/lib/org/agent/tools.ts`, `toolExecution.ts`
- 후보자 이메일/회사 relay prompt: `harper_worker/email_reply/talent_request_copy.py`
- outbox 처리: `harper-email-reply-worker.service` 내부의
  `harper_worker/email_reply/contact_queue.py`
- 후보자 email reply context/tool: `harper_worker/email_reply/db.py`, `prompt.py`, `tools.py`
- 이력서 업로드: `src/app/api/talent/resume/upload/route.ts`
- 이메일 첨부 ingest: `src/app/api/internal/company-talent-requests/ingest-resume/route.ts`
- 회사 전달: `src/app/api/internal/company-talent-requests/deliver/route.ts`
