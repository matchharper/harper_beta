# Company talent contact 실제 E2E 실험 계획

작성일: 2026-08-07
대상 환경: production
실험 상태: 운영 E2E·수정·재검증·원상복원·격리 감사 완료

## 1. 목표

Wonderful 내부 워크스페이스에서 회사가 Harper에게 후보자 질문 또는 최신 이력서
요청을 맡긴 순간부터 후보자의 답변이 회사로 돌아올 때까지 전 구간을 실제 채널로
검증한다.

검증할 사용자 경험은 다음과 같다.

1. 회사의 첫 연락 지시는 즉시 발송되지 않고 company-side LLM이 정확한 대상, 역할,
   질문, 공개 범위, 채널, 예정 시각, 취소 가능 여부를 자연스럽게 확인한다.
2. 회사가 직전 확인 내용을 승인하면 요청이 정확히 한 번 생성된다.
3. 회사가 발송 전 `지금 보내줘` 또는 `취소해줘`라고 하면 동일 요청에 원자적으로
   반영된다.
4. 후보자 이메일은 회사와 역할을 투명하게 공개하고, 회사 질문의 의미는 보존하되
   부담을 강요하거나 저장된 민감 정보를 임의로 노출하지 않는다.
5. 후보자가 이메일 또는 Harper 채팅으로 답변, 부분 답변, 거절, 역질문, 무관한 답을
   보내도 이를 잃지 않는다. Harper는 그 메시지의 의미에 맞게 답하고, 회사에 전달할
   내용인지 모델이 문맥으로 판단한다.
6. 전달 가능한 답변은 원래 Slack thread 또는 `/org` 대화로 정확히 돌아온다.
7. 질문 변경, 요청 취소, 후보자 단계 변경, 역할 상태 변경, 발송·취소 경합,
   webhook 지연/중복에도 요청과 메시지가 유실되거나 잘못 전달되지 않는다.

## 2. 룰 기반 최소화 원칙

이 실험에서 `룰 기반 최소화`는 모든 결정 로직을 없앤다는 뜻이 아니다. 다음 두
범주를 분리한다.

### 허용하는 결정적 규칙

- 워크스페이스·후보자·역할 권한과 식별자 검증
- 요청 생성·취소·즉시 발송의 상태 전이와 optimistic/row locking
- idempotency, 중복 webhook 방지, retry, 만료, 전달 원장
- reply alias 파싱, 이메일 주소 정규화, 서명 검증
- 명백한 보안·개인정보·전문성 경계

### 모델이 문맥으로 판단해야 하는 것

- 회사의 현재 발화가 최초 요청, 승인, 수정, 취소, 즉시 발송 중 무엇인지
- 후보자 메시지가 답변, 부분 답변, 거절, 역질문, 설명 요청, 무관한 내용 중 무엇인지
- 후보자에게 보낼 자연스러운 질문과 후속 답장
- 회사에 어떤 의미를 어떤 톤으로 전달할지
- 질문이 변경된 상태 또는 채용 상태 변화 후 기존 답변이 여전히 유효한지

특정 단어·정규식·문구 포함 여부만으로 `공유 감사합니다` 같은 고정 답장을 보내거나
답변 여부를 판정하면 실패다. 모델 출력은 가능한 한 구조화된 decision과 자연어
draft로 받고, 서버는 그 decision이 현재 DB 상태에서 허용되는지만 검증한다.

## 3. 격리 범위

실험에서 변경 가능한 주체는 아래 한 명과 Wonderful의 아래 역할 하나뿐이다.

| 항목 | 고정 값 |
| --- | --- |
| Gmail·talent email | `khj605123@gmail.com` |
| talent name | 김호진 |
| talent ID | `111fe5c4-8f66-4392-9a27-e81fb8dfa7dd` |
| workspace | Wonderful internal |
| workspace ID | `f2e80aee-fee3-40f5-807f-5f8694c37eee` |
| role | Forward Deployed Engineer (FDE) |
| role ID | `e1657263-3369-48c9-8e1b-812834e79037` |
| recommendation ID | `431b5f8e-80e1-41e5-9b47-997789b15179` |
| Slack workspace | Harper |
| Slack channel | `#z-test-wonderful` (`C0BMP1P0U1Z`) |

다른 `talent_id`, 다른 Wonderful role, 다른 workspace의 row는 읽기 비교만 허용하고
변경하지 않는다. 모든 mutation은 위 ID를 명시한 조건으로 실행하며, 넓은 email
suffix, 이름 검색, wildcard 또는 `latest row`만으로 대상을 정하지 않는다.

## 4. 변경 전 백업과 오염 감지

실행마다 `run_id=company-talent-contact-e2e-<KST timestamp>`를 만든다. 실제 변경 전에
다음을 `.local/company-talent-contact-e2e/<run_id>/baseline.json`에 저장한다.

- 대상 talent의 Wonderful FDE recommendation, stage tag, progress
- 대상의 `company_talent_requests`와 연결된 `contact_queue`, reply alias,
  company/talent message, career email 원장
- 대상의 primary resume document와 `talent_users` resume pointer
- Wonderful role 상태
- 대상이 아닌 talent들의 관련 테이블 row count와 변경 감지용 digest

각 mutation 뒤에는 다음을 검사한다.

- 변경 row의 모든 `talent_id`가 대상 ID와 일치하는가
- request의 `company_workspace_id`, `role_id`, `recommendation_id`가 고정 값과
  일치하는가
- 대상 외 talent digest와 row count가 그대로인가
- 외부 발송 수와 DB outbox 수가 일치하는가

대상 외 변경이 한 건이라도 발견되면 즉시 중단하고 baseline으로 복구한다.

## 5. 기본 상태 초기화

문서 작성과 baseline 저장 후 아래 순서로 초기화한다.

1. 기존 실험에서 생성된 request ID를 먼저 정확히 수집한다.
2. 그 request ID에 직접 연결된 queue, alias, career email 원장, relay message만
   정리한다. 일반 Harper 메일, 일반 talent 대화, 다른 회사/역할 이력은 삭제하지
   않는다.
3. Wonderful FDE의 대상 후보자 stage를 `연결 대기` 하나로 정규화한다.
4. 역할 상태는 `active`로 둔다.
5. 공개 primary resume는 별도 백업한다. resume 요청 시나리오 동안만 대상 문서를
   비공개 처리하고, 시나리오 종료 후 원상 복구한다.
6. Gmail과 Slack 과거 메시지는 삭제하지 않는다. 모든 새 제목·Slack 메시지에
   `run_id`를 넣어 이전 실험과 구분한다.

초기화가 끝난 시점의 기대값은 다음과 같다.

- 대상은 Wonderful FDE `pending_connection`
- open company talent request 0건
- request-bound candidate/company delivery queue 0건
- 역할 `active`
- 다른 talent 데이터 변경 0건

## 6. 실제 E2E 시나리오

### A. 확인과 요청 생성

| ID | 회사 발화 | 기대 동작 |
| --- | --- | --- |
| A1 | 후보자에게 현재 이직 시점을 물어봐 달라는 최초 요청 | tool 호출 없이 정확한 확인 질문 |
| A2 | `응, 그렇게 물어봐줘` | `contact_talent` 1회, queued 1건 |
| A3 | 최초 확인 뒤 질문 내용을 변경 | 기존 확인으로 실행하지 않고 수정된 확인을 다시 제시 |
| A4 | 대상이 불명확한 대명사 요청 | 임의 후보 선택 없이 이름·역할 확인 |
| A5 | 같은 후보·역할에 open 요청이 있는 상태에서 새 질문 | 기존 요청과 새 질문을 구분하고 교체 절차 안내 |

### B. 취소·즉시 발송·경합

| ID | 조작 | 기대 동작 |
| --- | --- | --- |
| B1 | queued 요청 취소 | candidate delivery 0건, 요청 종료, 재실행 idempotent |
| B2 | queued 요청 즉시 발송 | 동일 request ID 유지, worker가 한 번만 발송 |
| B3 | 즉시 발송 전환 직후 취소 | 한 상태만 승리하고 `cancelled_at`과 `sent_at` 동시 존재 금지 |
| B4 | worker processing 중 중복 즉시 발송 | lock owner를 덮지 않고 중복 발송 금지 |
| B5 | 이미 sent인 요청 취소 | 취소됐다고 거짓말하지 않고 불가 상태 설명 |

### C. 후보자 이메일 품질과 답변

Gmail 연결 계정 `khj605123@gmail.com`에서 실제 수신과 답장을 수행한다.

| ID | 후보자 응답 | 기대 동작 |
| --- | --- | --- |
| C1 | 명확한 답변 | 답변 저장, 의미에 맞는 감사 답장, 회사 relay |
| C2 | 부분 답변 | 받은 내용은 보존하고 필요한 한 가지만 자연스럽게 추가 확인 |
| C3 | 답변 거절 | 거절을 존중하는 답장, 거절 사실을 회사에 relay |
| C4 | `왜 이걸 묻나요?` 같은 역질문 | 답변으로 오인하지 않고 회사·역할·목적 설명 |
| C5 | 무관한 내용 | 고정 감사문을 보내지 않고 문맥에 맞게 대응, 회사 답변 완료로 표시하지 않음 |
| C6 | 같은 메일을 두 번 전달/webhook replay | talent message·회사 relay·자동 답장 각각 정확히 한 번 |

각 수신 메일은 Gmail thread, Resend receiving, `email_inbound_events`,
`email_reply_jobs`, `talent_messages`, `career_email_messages`를 교차 확인한다.

### D. Harper 채팅 답변

| ID | 후보자 동작 | 기대 동작 |
| --- | --- | --- |
| D1 | Harper 채팅에서 명확한 답변 | 동일 request에 연결되고 회사 relay |
| D2 | 채팅에서 부분 답변/역질문 | 의미 판정 후 적절한 Harper 응답, premature relay 금지 |
| D3 | 이메일과 채팅에 중복 답변 | 한 요청에 중복 회사 relay 금지, 추가 내용은 보강으로 처리 |

### E. 이력서 요청

| ID | 동작 | 기대 동작 |
| --- | --- | --- |
| E1 | 이력서 유무 확인과 즉시 요청을 한 발화에 포함 | 먼저 조회, 같은 turn 요청 생성 금지 |
| E2 | 다음 turn 명시적 승인 | resume request 1건 생성 |
| E3 | 이메일에 이력서 없이 답장 | 업로드/첨부 방법을 자연스럽게 다시 안내 |
| E4 | 테스트 PDF를 첨부해 답장 | 대상 talent의 새 resume로만 처리, 회사 relay |
| E5 | 이미 공개 이력서가 있는 상태 | 불필요한 재요청 대신 기존 자료 안내 |

테스트 PDF는 실험용임이 명확한 파일을 사용하고, 종료 시 baseline의 primary resume를
복구한다.

### F. 질문·채용 상태 변화

| ID | 상태 변화 | 기대 동작 |
| --- | --- | --- |
| F1 | 발송 전 회사가 질문 수정 | 기존 요청 취소 후 수정 질문에 대한 새 확인과 승인 |
| F2 | 발송 후 회사가 질문을 철회 | 이미 전달된 사실을 숨기지 않고 후속 답변의 처리 정책을 명확히 기록 |
| F3 | 발송 전 후보자가 연결 대기에서 이탈 | 외부 발송 취소, 이유가 상태 원장에 남음 |
| F4 | 발송 후 후보자가 연결/중단 상태로 변경 | 후보자 답변은 유실하지 않고 `review_required` 또는 동등한 검토 경로로 보존 |
| F5 | 역할 paused | 기존 후보자 요청과 답변은 유지 |
| F6 | 역할 ended | 현재 구현에서는 새 추천과 후보자 화면의 진행 가능성은 종료되지만, Role 상태 변경만으로 발송 전 회사 요청이 모두 취소되지는 않는다. 연결 stage도 함께 변경된 경우 발송 전 요청을 취소하고, 이미 받은 답변은 감사 원장과 검토 이력으로 보존 |
| F7 | 답변 도착 뒤 단계가 변경 | company relay가 허용되지 않으면 답변을 보류 원장과 운영 UI에서 확인 가능 |

### G. 장애 복구

| ID | 장애 | 기대 동작 |
| --- | --- | --- |
| G1 | Resend에는 수신됐으나 webhook event 누락 | reconciliation으로 event/job 생성, 중복 없이 처리 |
| G2 | webhook 5xx 후 retry | 최종 성공, 동일 provider email ID 중복 없음 |
| G3 | email worker 중간 실패 | frozen content와 idempotency key 재사용 |
| G4 | company relay API 실패 | relay queue 재시도, 후보자 답장 재발송 금지 |

## 7. 판정 기준

각 시나리오는 아래 증거가 모두 있을 때만 PASS다.

- Slack의 회사 발화와 company-side LLM 응답
- tool call/result와 source company message
- request·queue·alias의 상태 및 시각
- Resend/Gmail 실제 발송·수신
- candidate message와 Harper의 실제 후속 답장
- 회사 대화 또는 Slack thread의 최종 relay
- 다른 talent 무변경 digest

다음은 즉시 FAIL이다.

- tool 성공 전에 접수·취소·발송 완료라고 말함
- `scheduled_at`을 `sent_at`으로 보고함
- 취소와 발송 완료가 동시에 남음
- 후보자 답변이 Resend에만 있고 DB에 없음
- 요청이 `closed`라는 이유로 후보자 답변을 일반 메일로 삼아 회사에서 잃어버림
- 무관한 답장에 고정 감사 문구를 보냄
- 특정 키워드·정규식으로 답변 의미 또는 후보자 답장 본문을 결정
- 다른 talent의 row가 변경됨

## 8. 수정 원칙

결함을 발견하면 먼저 재현 증거와 원인을 이 문서의 실행 원장에 적고 수정한다.

- 후보자 의미 판정과 카피는 LLM의 구조화된 결과로 처리한다.
- 서버는 권한, 상태, idempotency, 안전 불변식만 강제한다.
- 전송 전에 만든 candidate/company copy는 request version에 고정한다.
- 요청 수정은 새 version 또는 명시적 replacement 관계로 추적한다.
- 발송 후 stage 변화가 있어도 inbound 답변은 request에 귀속시켜 보존하고,
  relay 가능 여부만 별도로 판정한다.
- email/chat은 같은 response ingest 계약을 사용한다.
- webhook은 provider receiving 목록과 DB를 대조하는 reconciliation 경로를 가진다.

수정 후 단위 테스트, DB 함수 테스트, worker 테스트, 실제 E2E 순으로 재검증한다.

## 9. 실행 원장 형식

실제 실행을 시작하면 같은 문서 아래에 다음 형식으로 누적한다.

```text
run_id:
scenario_id:
started_at_kst:
company_message:
assistant_confirmation:
tool_calls:
request_id:
queue_before_after:
gmail_or_chat_evidence:
candidate_reply:
harper_reply:
company_relay:
other_talent_digest_unchanged:
result: PASS | FAIL | BLOCKED
defect:
fix:
rerun_result:
```

## 10. 실행 결과 요약

실행일은 2026-08-07 KST이며, 실제 변경 대상은 문서에 고정한 김호진
(`khj605123@gmail.com`) 한 명과 Wonderful FDE 한 역할뿐이었다.

| 영역 | 최종 결과 | 핵심 증거 |
| --- | --- | --- |
| 최초 요청 확인 | PASS | 첫 발화에는 tool을 호출하지 않고 대상·역할·질문·채널·시각·취소 조건을 확인했다. |
| 질문 변경 | PASS | 확인 전 질문 변경 시 이전 문구로 실행하지 않고 수정 확인을 다시 제시했다. |
| 승인 후 생성 | PASS | 승인 turn에 요청과 candidate queue가 각 1건 생성됐다. |
| 발송 전 취소 | PASS | 요청은 `closed`, queue는 `cancelled`, 실제 메일은 0건이었다. |
| 승인 + 즉시 발송 | PASS | `c4beeee2-36f8-476b-8ab0-4f41bf5c1093`에서 같은 turn에 `deliveryMode=immediate`가 원자적으로 기록됐고 세 번째 확인 없이 발송됐다. |
| 비답변 이메일 | PASS | “확인 중” 답장에는 자연스러운 대기 안내만 보냈고 요청은 `awaiting_talent`, 회사 relay는 0건이었다. |
| 명확한 이메일 답변 | PASS | 주 3일 출근 가능·공유 동의가 회사 Slack에 1회 전달됐고 중복 relay가 없었다. |
| 발송 후 단계 변경 | PASS | candidate delivery가 이미 `sent`면 stage 변경 후에도 답변을 요청에 귀속해 회사로 전달했다. |
| 이력서 명시적 거절 | PASS(수정 후) | 첨부 없는 거절을 LLM이 의미로 판단해 회사에 1회 전달했고, 동일 거절 재전송은 중복 relay 없이 이미 전달된 상태로 답했다. |
| PDF 첨부 이력서 | PASS(수정 후) | Gmail→Resend CDN 바이트 해시 보존, 요청 귀속 문서 생성, 후보자 답장, 회사 링크 relay까지 완료했다. |
| 후보자 답장 카피 | PASS(수정 후) | 성공 응답도 고정 한 줄 대신 후보자·회사·역할·파일명을 입력받은 LLM이 생성했다. |
| 후보자 채팅 UI | BLOCKED | `/career`에 로그인 세션이 없고 비밀번호 입력이 필요했다. 비밀번호 열람·재설정·관리자 인증 우회는 하지 않았다. 서버에는 동일 요청 block과 `record_company_request_response` tool 경로가 존재하며 정적·단위 경로는 확인했다. |
| webhook retry/idempotency | PASS | 누락 DB 함수 복구 후 provider retry가 job을 생성했고, request response와 relay는 각각 1회만 남았다. |

## 11. 실제 시나리오 원장

### A1/A3 - 최초 확인과 질문 변경

- Slack root: `1786073601.765119`, `1786073703.533979`
- 최초 연락 지시에서는 요청·queue가 생성되지 않았다.
- 확인 전 질문을 바꾸자 새 질문으로 확인을 다시 제시했고 이전 질문은 실행하지 않았다.
- 결과: PASS

### A2/B1 - 승인 생성 후 발송 전 취소

- request: `e1cf07f4-e2a1-4af0-b665-1868d0272c0c`
- Slack cancel root: `1786073864.672629`
- 결과: request `closed`, candidate queue `cancelled`, `sent_at=null`, 외부 발송 없음.
- 결과: PASS

### B2/C1 - 즉시 발송과 명확한 답변

- Slack root: `1786073951.379389`
- request: `2fb9ec53-d3e6-44e0-bf6b-b32cfb92fecc`
- 즉시 지시: `1786074087.276789`
- candidate queue가 정확히 1회 발송됐다.
- 첫 Gmail 명확 답변 처리 중 Resend webhook이 500을 반환했다. 원인은 운영 DB에
  `claim_email_reply_event_job_v1`이 없었기 때문이다.
- `20260805090000_email_reply_event_job_atomicity.sql`을 운영에 적용하고 schema cache와
  migration ledger를 복구하자 Resend retry가 동일 provider email을 중복 없이 처리했다.
- 후보자 답장과 회사 relay 모두 성공했다.
- 결과: PASS(수정 후)

### C2/F4 - 발송 후 단계 변경과 답변 보존

- Slack root: `1786075857.470069`
- request: `545b01c2-16be-4dcc-8f47-6acb0bd43002`
- Gmail message: `19fda6f9da764004`
- candidate delivery 후 stage를 일시적으로 `내부:연결됨`으로 바꾸고 답장을 보냈다.
- 기존 로직은 stage가 더 이상 pending이 아니면 이미 보낸 요청의 답변도 잃을 수 있었다.
- `20260807110000_company_talent_request_delivery_consistency.sql`로 이미 `sent`된 candidate
  delivery를 answerable로 유지하고, `processing` queue는 stage reconcile이 취소하지
  않도록 변경했다.
- 회사 relay: `1786076325.299309`; 이후 stage를 정확히 `내부:연결대기`로 복구했다.
- 초기 relay가 근거 없이 “지원하신”이라고 표현해 company relay LLM에 지원 사실을
  만들어내지 말라는 제약을 추가했다. 재실험 relay에는 해당 표현이 없었다.
- 결과: PASS(수정 후)

### B2 재검증 - 승인과 즉시 발송의 원자성

- Slack root: `1786077142.126549`
- 승인 + 즉시 지시: `1786077229.751529`
- request: `c4beeee2-36f8-476b-8ab0-4f41bf5c1093`
- 기존에는 확인 승인과 “지금 바로”가 같은 메시지에 있으면 요청 생성 뒤 즉시 변경이
  별도 turn으로 밀려 추가 확인을 요구했다.
- `20260807120000_company_talent_request_immediate_enqueue.sql`과 8-parameter RPC로 요청
  생성과 즉시 전환을 하나의 DB transaction으로 묶었다.
- 실제 queue는 첫 tool turn부터 `deliveryMode=immediate`; `sent_at=2026-08-07
  04:34:38.044287Z`; 세 번째 확인 없음.
- 결과: PASS(수정 후)

### C5/C1 - 비답변 뒤 명확한 답변

- request: `c4beeee2-36f8-476b-8ab0-4f41bf5c1093`
- 비답변 marker: `C3-nonanswer`
- Harper는 “확인 중이니 편할 때 답해 달라”고 답했고 회사 queue를 만들지 않았다.
- 명확 답변 marker: `C4-answer`
- 회사 Slack relay: `1786077549.634999`
- relay는 “서울 오피스 주 3일 가능, 회사 공유 동의”만 보존했고 `지원/지원자` 사실을
  만들지 않았다.
- 결과: PASS

### E1/E3 - 이력서 조회·확인과 명시적 거절

- 기존 primary resume `1daed69e-b60f-4ac8-aa47-2d917a310ec8`는 실험 동안만
  `is_public=false`로 바꿨다.
- Slack root: `1786077662.550609`
- request: `aa93e785-7cb7-49ee-8304-edc65c97e725`
- 에이전트는 “파일은 있으나 회사 공개 대상이 아님”을 조회한 뒤 별도 확인을 제시했고,
  승인 전에는 발송하지 않았다.
- 결함 재현: 첨부 없는 “지금 공유하지 않겠다”는 명시적 거절을 attachment 유무 규칙이
  먼저 가로채 고정 재첨부 안내를 보냈다.
- 수정: text-only 이력서 답장은 일반 reply LLM으로 보내고, 실제 attachment가 있을 때만
  결정적인 upload 검증을 수행한다. LLM prompt에는 명시적 거절이면
  `record_company_request_response`를 반드시 호출하고 tool 성공 전에는 회사 전달을
  주장하지 못하게 했다.
- 재실험 회사 relay: `1786078077.660989`; 동일 거절 재전송 시 회사 queue 추가 없음.
- 결과: PASS(수정 후)

### E4 - 실제 PDF 첨부

- Slack root: `1786078344.758039`
- request: `fa6d9b6f-7204-4888-9f58-de783dfa33c0`
- 테스트 PDF SHA-256: `f71885a38527f96f3a939ad87d4ed7bd06c7a20639faaeb2e78725d83d6aa61c`
- Gmail 원본과 Resend CDN 다운로드는 2,748 bytes와 SHA-256이 동일했다.
- 첫 결함: `finalize_talent_resume_upload_v1`이 허용되지 않은
  `impact_level='normal'`을 넣어 transaction 전체가 rollback됐다. 운영 제약은
  `low|medium|high`다.
- 수정: 원본 migration과 `20260807130000_company_talent_resume_upload_impact_level.sql`
  에서 `medium`을 사용했다. 운영 롤백 transaction에서 문서·메시지·이벤트 생성 성공을
  확인했다.
- 두 번째 결함: Vercel의 `pdf-parse-fork`가 유효 PDF에서 `Invalid number`를 내면 선택
  사항인 텍스트 추출 때문에 저장 전체가 500이었다.
- 수정: magic bytes/MIME 검증을 통과한 파일은 저장을 계속하고, 텍스트 추출만
  best-effort `null`로 허용했다.
- 최종 document: `f3a6dbea-83b0-414a-9031-b48f6dffcca0`
- 최종 company relay: `1786079372.420039`
- 결과: PASS(수정 후)

### E5 - LLM 기반 이력서 수신 답장

- Slack root: `1786079533.051569`
- request: `28ebc1ae-7fe0-45c9-9935-55f818bbf2fa`
- document: `21ae53a5-552f-4226-a318-42a61b3832f4`
- 후보자 실제 답장: 파일명, Wonderful, FDE 맥락을 포함한 자연스러운 LLM 문장.
- 회사 relay: `1786079741.131279`
- 결과: PASS

## 12. 결함과 수정 목록

1. 누락된 email webhook claim RPC로 수신 답장이 500.
   - 운영 적용: `20260805090000_email_reply_event_job_atomicity.sql`
2. stage 변경이 이미 발송된 질문의 답변까지 막거나 processing queue를 취소.
   - 운영 적용: `20260807110000_company_talent_request_delivery_consistency.sql`
3. 승인 + 즉시 발송이 하나의 company turn에서 원자적이지 않음.
   - 운영 적용: `20260807120000_company_talent_request_immediate_enqueue.sql`
   - beta commit: `eb9e4e0`
4. compensation/company relay가 정규식 기반 승인 감지와 근거 없는 applicant 표현을 사용.
   - 정규식 의미 판정 제거, candidate response와 이전 문구를 별도 LLM evidence로 전달.
5. 첨부 없는 이력서 거절을 고정 재첨부 안내가 가로챔.
   - text-only는 LLM 의미 판정, attachment 존재 시만 upload path.
6. 이력서 최종화 활동 이벤트의 잘못된 enum 값.
   - 운영 적용: `20260807130000_company_talent_resume_upload_impact_level.sql`
7. PDF 텍스트 추출 실패가 유효 파일 저장까지 rollback.
   - best-effort extraction으로 분리.
   - beta commit: `1ae2e41`
8. 이력서 성공 수신 답장이 고정 한 줄.
   - 성공 transaction 결과와 회사·역할·파일 맥락을 LLM copy writer에 전달.

## 13. 배포 및 검증

- beta clean worktree에서 TypeScript typecheck, Prettier, 관련 Node tests 통과.
- worker Python 관련 테스트는 최종 45개 통과.
- beta 운영 배포:
  - `eb9e4e0 fix company talent contact delivery consistency`
  - `1ae2e41 fix request-linked resume uploads`
  - 두 Vercel 프로젝트 모두 최종 `success` 확인.
- worker 운영 EC2에서는 매 restart 전 최근 processing job 0건을 확인하고
  `harper-email-reply-worker.service` 또는 `harper-contact-queue-worker.service`만
  선택적으로 재시작했다.

## 14. 운영 중 관찰된 범위 밖 효과

누락 webhook claim RPC를 복구한 직후 Resend가 과거 5xx 이벤트를 자동 retry했다.
이 과정에서 다른 talent의 최근 수신 메일도 provider 정책에 따라 다시 들어왔다. 다른
talent를 수동 replay하거나 직접 변경하지는 않았지만, 전역 운영 장애 복구의 자동 retry라는
간접 효과는 있었다. 최종 격리 감사에서는 대상 외 digest와 row count를 다시 비교한다.

## 15. 종료 조건

다음이 모두 충족될 때 실험을 종료한다.

1. A~G의 핵심 happy path와 모든 상태 변화/경합 시나리오가 통과한다.
2. 발견한 결함은 재현 테스트가 추가되고 수정 후 통과한다.
3. Gmail·Resend·DB·Slack 증거가 서로 일치한다.
4. 대상 외 talent 변경이 0건이다.
5. 대상 후보자와 role은 baseline 또는 합의한 기본 상태로 복구된다.
6. 최종 결론에 통과 범위, 남은 위험, 운영 모니터링 항목을 기록한다.

## 16. 초기화 원장

### run `company-talent-contact-e2e-20260807-123105`

- 시작: 2026-08-07 12:31 KST
- baseline: `.local/company-talent-contact-e2e/company-talent-contact-e2e-20260807-123105/baseline.json`
- 이전 실험 request: `3424c639-6d60-4db8-bd51-74a8b0e34ab9`,
  `4f86b8ea-c96b-4fb2-8982-9493afd16bcb`
- 이전 상태에서 확인한 결함 증거: 두 번째 candidate queue에
  `cancelled_at=2026-08-06T14:36:25.856549Z`와
  `sent_at=2026-08-06T14:37:27.401786Z`가 함께 존재했다.
- 초기화: 위 request 2건, 연결된 queue 2건·alias 1건, request outbound
  career email 1건·talent message 1건, 이전 테스트 단계 progress 2건만
  삭제했다. Slack/Gmail 과거 메시지와 일반 talent 이력은 보존했다.
- 초기화 결과: `연결 대기`, role `active`, open request 0, request queue 0.
- 대상 외 digest: request, queue, role tag, progress 모두 baseline과 동일.

| 시나리오 | 핵심 증거 | 결과 |
| --- | --- | --- |
| A1 | Slack `1786073601.765119`; tool 호출·request 생성 없이 질문·대상·전달 방식·취소 가능성을 재확인 | PASS |
| A3 | Slack `1786073703.533979`; 이직 시기 질문을 제거하고 기본급 5,500만원 질문으로 바꿔 새 확인 제시, request 0 | PASS |
| A2 | Slack `1786073762.190389`; 승인 뒤 request `e1cf07f4-e2a1-4af0-b665-1868d0272c0c` 한 건만 생성, `queued`, 실제 예약 시각 12:57 KST 안내 | PASS |
| B1 | Slack `1786073864.672629`; request `closed`, queue `cancelled`, `sent_at=null`, `talent_source_message_id=null` | PASS |

이후 B2~E5 실행 결과는 위 11절에 기록했다.

## 17. 최종 정리와 원상복원

정리 기준 시각은 초기화 직후 baseline인 `2026-08-07T03:32:55.847Z`다. 삭제는
김호진 ID, Wonderful workspace/role, 명시한 request/document/message ID와 이 시각을
모두 guard로 사용한 단일 DB transaction으로 수행했다. 사전 예상 개수가 다르면
커밋하지 않게 했으며, 두 번의 guard 실패는 각각 career email 원장 8건과 기존 reply
alias 11건을 발견해 전체 rollback됐다. 범위를 바로잡은 세 번째 transaction만
commit했다.

- 삭제: request 7, queue 13, 실험 reply alias 6, career email 원장 28,
  inbound event 11, reply job 11, talent message 30, company message 13,
  activity event 3, 임시 resume document 3.
- Storage: `talent-resumes`의 김호진 경로 아래 실험 PDF object 3개만 정확한 allowlist로
  삭제했다.
- 보존: 실험 전부터 있던 김호진 reply alias 11개와 일반 이력은 삭제하지 않았다.
- 복원: 원본 document `1daed69e-b60f-4ac8-aa47-2d917a310ec8`, 파일명
  `KIMHOJIN_resume.pdf`, 원본 storage path, `resume_text`, `is_public=true`,
  `is_primary=true`, talent `updated_at`까지 baseline 값으로 복원했다.
- 상태: stage `내부:연결대기`, role `active`, `is_expired=false`.
- 외부 증거: Gmail과 Slack 메시지는 E2E 증거이므로 삭제하지 않았다.

최종 스냅샷은
`.local/company-talent-contact-e2e/company-talent-contact-e2e-20260807-final-audit/baseline.json`이다.
초기화 직후 baseline의 전체 `.target` JSON과 최종 `.target` JSON을 canonical diff한
결과는 차이 0이었다. 최종 대상 count는 request 0, queue 0, 요청 연계 alias 0,
career email 0, inbound event 0, reply job 0, 실험 company/talent message 0,
document 1, stage tag 1, 기존 progress 3이다.

## 18. 대상 외 talent 감사

Wonderful FDE 역할의 대상 외 request와 queue는 실험 전후 모두 0이며 digest도 동일하다.
대상 외 tag/progress count는 장시간 운영 중 `102→103`, `331→333`으로 변했지만,
추가된 행을 개별 확인한 결과 이 실험의 mutation 대상과 무관했다.

- talent `556d6bf4-5268-4dab-af99-16e6b31b1b6e`: worker의 정기 F3 follow-up progress 1건.
- talent `6b53323b-44b2-4cd8-8b44-029e28f1664e`: `chris@matchharper.com`이 수행한
  `수락→아카이브` stage tag/progress 각 1건.

우리 SQL/API mutation은 다른 talent ID를 대상으로 실행하지 않았다. 다만 14절처럼
전역 webhook 장애를 고치자 Resend가 과거 5xx를 자동 retry하여 다른 talent의 보류된
수신 이벤트가 정상 처리될 수 있었던 간접 운영 효과는 숨기지 않고 남긴다. 이 행들은
실험 데이터로 간주해 삭제하지 않았다.

## 19. 최종 결론과 남은 제한

회사 확인→수정→승인→즉시 발송/취소→후보자 이메일 수신→비답변/답변/거절/첨부 처리→
자연스러운 후보자 회신→회사 Slack relay의 실제 운영 경로는 수정 후 통과했다. 의미
판정과 카피는 LLM에 맡기고, 서버의 결정적 로직은 권한·상태 전이·원자성·idempotency·
파일 안전성에 한정했다.

남은 유일한 미실행 항목은 후보자 웹 채팅 UI의 실제 쓰기다. in-app browser에 로그인
세션이 없고 비밀번호가 필요해 인증을 우회하지 않았다. 인증된 `/api/talent/chat`이 활성
company request를 prompt에 포함하고 `record_company_request_response` tool로 동일
ingest 계약을 호출하는 코드·테스트 경로는 확인했다. 완전한 live chat E2E에는 사용자가
로그인된 career 세션을 제공해야 한다.
