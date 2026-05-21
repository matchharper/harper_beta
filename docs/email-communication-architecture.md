# Harper Email Communication Architecture

작성일: 2026-05-19

## 1. 메일 소통을 가능하게 할 방법

Harper가 이메일로 유저와 소통하려면 네 가지가 필요하다.

1. 수신 이벤트
   - 유저가 Harper 주소로 메일을 보내면 시스템이 즉시 알 수 있어야 한다.
   - 현재 선택지는 Resend Inbound webhook 또는 Gmail API Pub/Sub다.

2. 유저 식별
   - 가장 안전한 방식은 `reply+token@domain` 형태의 reply alias를 쓰고, token hash를 DB의 `email_reply_aliases`와 매칭하는 것이다.
   - token이 없는 새 inbound는 fallback으로 `From` 이메일이 `talent_users.email`과 정확히 하나만 매칭될 때만 처리한다.

3. 비동기 처리
   - webhook handler는 오래 걸리는 LLM 호출과 발송을 직접 하지 않는다.
   - webhook은 DB에 inbound event와 job만 저장하고 즉시 2xx를 반환한다.
   - 별도 worker가 job을 claim해서 답장 생성과 발송을 처리한다.

4. 발송
   - Resend Send API로 thread reply를 보낸다.
   - `In-Reply-To`, `References`, idempotency key를 넣어 중복 발송과 threading 문제를 줄인다.

### Resend vs Gmail Pub/Sub

Resend inbound가 현재 목적에는 더 단순하다.

- Gmail Pub/Sub는 Google Workspace/Gmail mailbox 중심 구조에 적합하다.
- Resend inbound는 webhook, 원문 조회, thread reply, 발송 API가 한 provider 안에서 닫힌다.
- Harper는 이메일 주소를 서비스 인터페이스로 쓰려는 것이지 Gmail inbox 자체를 운영하려는 것이 아니므로 Resend 쪽이 구현과 운영이 가볍다.

## 2. 구체적으로 우리가 구현할 방법

현재 구현 경로는 다음이다.

```text
Resend email.received webhook
  -> Next route: /api/internal/email/resend
  -> signature verify
  -> email_inbound_events insert
  -> email_reply_jobs insert
  -> Python worker polling
  -> claim_email_reply_jobs(...)
  -> Resend Receiving API로 원문 조회
  -> reply alias 또는 sender email로 Harper talent user 매칭
  -> talent_messages에 inbound user message 저장
  -> 모델이 필요 시 update_talent_profile tool 실행
  -> LLM으로 email reply 생성
  -> talent_messages에 assistant message 저장
  -> Resend Send API로 reply 발송
  -> email_reply_jobs status 업데이트
```

### Next.js 역할

Next.js는 webhook receiver만 담당한다.

- `src/app/api/internal/email/resend/route.ts`
  - Resend/Svix signature 검증
  - `email.received` 이벤트만 처리
  - `ingestResendInboundEvent` 호출

- `src/lib/email/inbound.ts`
  - inbound event dedupe insert
  - `email_reply_jobs` queue insert
  - reply alias 생성 helper

Vercel Cron 기반 `/api/internal/email/sweep`는 제거했다. 답장 처리 로직은 Python worker 한 곳에만 둔다.

### Python worker 역할

새 worker 위치:

- `harper_worker/email_reply/`
- `harper_worker/email_reply_worker.py`

실행:

```bash
cd /Users/gimhojin/Desktop/harper/harper_worker
PYTHONPATH=. ../myenv/bin/python email_reply_worker.py poll
```

테스트용 1회 실행:

```bash
PYTHONPATH=. ../myenv/bin/python email_reply_worker.py once
```

필수 env:

- `DATABASE_URL`
- `WORKER_DB_ROLE=harper_worker` 권장
- `RESEND_API_KEY`
- `EMAIL_REPLY_FROM_EMAIL` 또는 `RESEND_FROM_EMAIL`
- `EMAIL_REPLY_DOMAIN`, 권장값 `reply.matchharper.com`
- `ANTHROPIC_API_KEY`, `GROK_API_KEY`, 또는 `OPENAI_API_KEY`

튜닝 env:

- `EMAIL_WORKER_BATCH_SIZE`: 한 번에 claim할 job 수, 기본 10, 최대 20
- `EMAIL_WORKER_CONCURRENCY`: 병렬 처리 worker thread 수, 기본 4, 최대 20
- `EMAIL_WORKER_POLL_INTERVAL_SEC`: polling 주기, 기본 1초
- `EMAIL_MAX_RETRY_COUNT`: job retry 횟수, 기본 3
- `EMAIL_REPLY_MODEL`: reply 생성 모델, 기본 `OPP_DELIVERY_COPY_MODEL` 또는 `claude-sonnet-4-6`
- `EMAIL_REPLY_MAX_THREAD_CHARS`: 수신 메일 안에 포함된 이전 thread context 한도, 기본 16000자
- `EMAIL_REPLY_DRY_RUN=true`: 발송 없이 DB 저장까지만 확인

Reply alias domain은 `EMAIL_REPLY_DOMAIN`을 사용하며 기본값은 `reply.matchharper.com`이다. 이 도메인은 Resend receiving domain으로 설정하고 MX record를 붙여야 한다.

모델 provider는 `EMAIL_REPLY_MODEL` prefix로 결정한다.

- `claude-*`: Anthropic, `ANTHROPIC_API_KEY` 사용
- `grok-*`: xAI, `GROK_API_KEY` 사용
- 그 외: OpenAI, `OPENAI_API_KEY` 사용

### DB 구조

추가 테이블:

- `email_reply_aliases`
  - reply token hash와 Harper user/conversation 매칭

- `email_inbound_events`
  - Resend inbound event dedupe용 원장

- `email_reply_jobs`
  - worker가 claim하는 queue
  - `user_message_id`, `assistant_message_id`를 저장해서 retry 시 같은 답장을 재사용

추가 RPC:

- `claim_email_reply_jobs(worker_id, batch_size, max_attempts, stale_after_seconds)`
  - `for update skip locked`로 여러 worker가 동시에 돌아도 같은 job을 중복 claim하지 않는다.

### 병렬성과 1분 100개 문제

Vercel Cron은 1분 단위라 100개가 쌓이면 한 함수 안에서 처리량, max duration, 동시성 제약을 모두 신경써야 한다.

Python worker는 polling 간격과 병렬성을 직접 조절한다. 예를 들어:

- `EMAIL_WORKER_BATCH_SIZE=20`
- `EMAIL_WORKER_CONCURRENCY=10`
- `EMAIL_WORKER_POLL_INTERVAL_SEC=1`

이면 한 번에 20개씩 claim하고 최대 10개를 동시에 처리한다. 필요하면 worker process를 여러 개 띄울 수 있고, DB claim RPC가 `skip locked`를 쓰기 때문에 중복 처리를 피한다.

### 현재 의도적으로 제외한 것

이메일 답장은 웹 채팅의 모든 tool orchestration을 그대로 재사용하지 않는다.

- 이메일 worker는 `update_talent_profile` tool만 실행한다.
- 이 tool은 최신 inbound email에 명시된 durable profile/preference/insight/memo 변경만 저장한다.
- 답장 prompt에는 현재 저장된 profile, setting, insight, recent conversation과 수신 메일에 보이는 이전 thread context를 넣는다.
- 추천 검색이나 회사 리서치 같은 긴 작업은 이메일 답장에서 직접 실행하지 않고, 필요 시 제한을 설명하는 답장을 보낸다.

이 결정은 이메일이 짧고 비동기적인 채널이며, 긴 tool 실행이 자동으로 발생하는 것을 피하기 위한 것이다.

### 외부 문서

- Resend Receiving: https://resend.com/docs/dashboard/receiving/introduction
- Resend get email content: https://resend.com/docs/dashboard/receiving/get-email-content
- Resend reply to emails: https://resend.com/docs/dashboard/receiving/reply-to-emails
- Resend idempotency keys: https://resend.com/docs/dashboard/emails/idempotency-keys
