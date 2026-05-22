# Career Email Onboarding A/B Test Implementation Plan

작성일: 2026-05-20  
대상: `harper_beta` Next.js 랜딩페이지, `harper_worker` 이메일 답장 워커  
상태: 구현 완료, 운영 전 마이그레이션 적용 및 필수 env 확인 필요

## 구현 결과 요약

- DB는 2개 테이블만 쓴다.
  - `career_email_onboarding_leads`: lead 상태, 임시 talent/conversation, review queue lock까지 포함한다.
  - `career_email_onboarding_events`: funnel, rate limit, audit event를 남긴다.
- 별도 task 테이블은 만들지 않는다. `leads` row의 `step`, `review_attempts`, `review_locked_at`, `review_locked_by`를 worker queue 상태로 쓴다.
- 이 기능 때문에 새로 필요한 필수 env는 최소화한다.
  - Next/worker 공통 메일 발송: `RESEND_API_KEY`, `EMAIL_REPLY_FROM_EMAIL` 또는 `RESEND_FROM_EMAIL`
  - worker가 Next internal API를 호출할 때: `INTERNAL_WORKER_API_SECRET`
  - 로그인/캘린더 링크 서명은 기존 `TALENT_NETWORK_INVITE_SECRET` 또는 `SUPABASE_SERVICE_ROLE_KEY`를 재사용한다.
  - 선택: `CAREER_EMAIL_ONBOARDING_CALENDAR_URL`

## 1. 목표

랜딩페이지의 기존 시작 CTA를 A/B 테스트한다.

- A안: 현재처럼 `/career_login?next=/career/onboarding&source=network`로 이동한다.
- B안: CTA 클릭 시 이메일 입력 모달을 띄우고, 이후 온보딩을 웹 대화가 아니라 이메일 왕복으로 진행한다.

테스트의 핵심 가설은 다음이다.

> "회원가입과 웹 온보딩을 바로 요구하는 것보다, 이메일 하나만 받고 Harper가 먼저 자연스럽게 말을 거는 흐름이 초기 진입 장벽을 낮추고 온보딩 완료율을 높인다."

## 2. 현재 코드베이스에서 확인한 기반

### 랜딩페이지

- 메인 랜딩은 `src/pages/index.tsx`다.
- 현재 CTA는 `careerStartHref`를 통해 로그인 또는 온보딩으로 이동한다.
- 랜딩 로그는 `landing_logs`에 저장된다.
- 현재 이벤트는 `new_visit`, `new_session`, `first_scroll_down`, `click_start`를 `career_landing_v1` abtest로 기록한다.
- 이벤트 source는 `src/lib/landingLogTypes.ts`의 `withLandingLogSource`로 붙인다.

### 이메일 수신과 답장

이미 `docs/email-communication-architecture.md`에 정리된 Resend 기반 이메일 답장 구조가 있다.

현재 흐름:

```text
Resend email.received webhook
  -> /api/internal/email/resend
  -> email_inbound_events insert
  -> email_reply_jobs insert
  -> harper_worker/email_reply_worker.py
  -> Resend Receiving API로 원문 조회
  -> reply alias 또는 sender email로 talent user 매칭
  -> talent_messages 저장
  -> LLM 답장 생성
  -> Resend Send API 발송
```

주요 파일:

- `src/app/api/internal/email/resend/route.ts`
- `src/lib/email/inbound.ts`
- `src/lib/email/security.ts`
- `supabase/migrations/20260519123000_email_communication.sql`
- `harper_worker/email_reply/worker.py`
- `harper_worker/email_reply/prompt.py`
- `harper_worker/email_reply/resend.py`

### 프로필 수집 및 ingestion

- 웹 온보딩의 프로필 ingestion은 `src/lib/talentOnboarding/profileIngestion.ts`에 있다.
- 내부 API로는 `src/app/api/internal/career/ingest-profile/route.ts`가 있고, 현재는 내부 사용자 auth를 요구한다.
- 이메일 워커는 Python이므로 이 TS 함수를 직접 import할 수 없다. 이메일 온보딩에서 링크나 이력서가 도착하면 worker가 호출할 수 있는 secret 기반 internal API 또는 별도 task runner가 필요하다.

### 중요한 보강 필요점

이메일 온보딩용으로 `claim_career_email_onboarding_lead` RPC를 둔다. 이메일로 먼저 만든 임시 `talent_users` row와 관련 conversation/message/alias/job/profile rows를 실제 로그인 유저로 이전하는 역할이다.

이메일 온보딩에서는 로그인 전 임시 talent row를 만들기 때문에, 실제 회원가입 시 아래도 함께 옮겨야 한다.

- `email_reply_aliases.talent_id`
- `email_reply_jobs.talent_id`
- `email_reply_jobs.conversation_id`는 대화가 이전되면 그대로 유지 가능하지만, user reference는 확인해야 한다.
- 새로 만들 `career_email_onboarding_leads.talent_id`, `converted_user_id`

이 보강 없이 source talent row를 삭제하면 `email_reply_aliases`가 cascade로 삭제될 수 있다.

## 3. 제품 플로우

### B안 유저 경험

1. 유저가 랜딩페이지 CTA를 클릭한다.
2. 모달이 열린다.
3. 모달은 "Harper가 먼저 메일드릴게요"라는 톤으로 이메일을 요청한다.
4. 모달 하단에는 "웹에서 바로 시작하기" 작은 텍스트 버튼이 있고, 누르면 기존 로그인 플로우로 간다.
5. 이메일 제출 성공 시 모달은 감사 상태로 바뀐다.
6. 서버는 해당 이메일로 첫 메일을 보낸다.
7. 유저가 답장하면 기존 Resend inbound webhook과 Python worker가 받는다.
8. worker는 일반 이메일 답장이 아니라 `career_email_onboarding_leads`의 상태를 보고 온보딩 state machine으로 처리한다.
9. 링크드인, 이력서, Github, 개인 페이지, Scholar 등 프로필 자료를 받으면 저장하고 ingestion을 시작한다.
10. 즉시 "자료 받았고 읽어보겠다"는 짧은 답장을 보낸다.
11. ingestion과 짧은 profile review가 끝나면 2분 내외로 다시 메일을 보내 커피챗 링크를 안내한다.
12. 유저가 커피챗 링크를 누르면 redirect endpoint를 거쳐 click event를 기록한 뒤 Calendly 등 실제 예약 링크로 보낸다.

## 4. UX 카피

전체 톤은 "AI가 자동으로 처리한다"보다 "Harper가 직접 챙긴다"에 가깝게 한다. 과장된 마케팅 문구, 이모지, 장난스러운 표현은 줄이고, 짧고 사람 같은 문장으로 간다.

### CTA 모달

제목:

```text
제가 먼저 메일드릴게요.
```

본문:

```text
웹에서 바로 가입하지 않아도 괜찮습니다.
이메일만 남겨주시면 Harper가 먼저 연락드리고, 답장 몇 번으로 시작할 수 있게 도와드릴게요.
```

입력 placeholder:

```text
이메일 주소
```

Primary button:

```text
메일로 시작하기
```

하단 텍스트 버튼:

```text
웹에서 바로 시작하기
```

제출 성공 상태:

```text
감사합니다. 제가 곧 메일드릴게요.
```

보조 문구:

```text
몇 초 안에 Harper 메일을 확인하실 수 있습니다. 메일이 보이지 않으면 스팸함도 한 번 확인해 주세요.
```

### 메일 1: 첫 인사

Subject:

```text
From Harper to {displayName}
```

`displayName`은 아래 순서로 결정한다.

1. 기존 `talent_users.name`
2. 같은 이메일의 기존 waitlist name
3. 이메일 local-part를 안전하게 정리한 값
4. 확신이 없으면 subject를 `Harper에서 먼저 인사드려요`로 fallback

Body:

```text
안녕하세요, {displayName}님. Harper입니다.

이메일 남겨주셔서 감사해요. 긴 가입 폼부터 채우는 대신, 오늘은 메일로 가볍게 시작해볼게요 :)

앞으로 좋은 기회를 찾고, 준비하고, 실제로 연결되는 과정까지 제가 옆에서 챙겨보겠습니다.

괜찮으시면 이 메일에 "좋아요"라고만 답장 주세요. 혹시 지금 찾고 있거나 열어두고 있는 방향이 있다면 한 줄만 덧붙여주셔도 좋아요. 예를 들면 풀타임 합류, 현업과 병행할 파트타임/프로젝트, 가벼운 기술 자문 같은 것들이요.

아직 잘 모르겠으면 그냥 "좋아요"만 보내셔도 됩니다. 바로 이어서 필요한 자료와 회사에 소개드릴 때의 편한 방식을 여쭤볼게요.
```

이 메일의 `Reply-To`는 `reply+{token}@reply.matchharper.com` 형태의 alias다.

### 메일 2: 시작 답장 이후 자료 요청

유저가 "네", "시작해요", "좋아요"처럼 답하면 보낸다. 다만 유저가 첫 답장에 이미 링크나 이력서를 보냈다면 이 단계를 건너뛰고 메일 3으로 간다. 첫 답장에서 기회 형태가 명확하면 `talent_setting.engagement_types`에 저장하지만, 애매하거나 누락됐다고 해서 이 메일에서 바로 다시 묻지는 않는다.

Subject:

```text
Re: From Harper to {displayName}
```

Body:

```text
좋아요. 그럼 너무 무겁지 않게, 먼저 두 가지만 확인할게요 :)

제가 {displayName}님을 제대로 이해하고, 안 맞는 제안을 걸러내려면 최소한 링크드인이나 이력서 중 하나가 필요해요. 회사에 아무 자료나 넘기려는 용도가 아니라, 어떤 기회를 보내드리면 좋을지 판단하기 위한 기준으로만 볼게요.

가능하시면 링크드인/이력서 중 하나를 보내주세요. 이력서는 PDF로 첨부해도 괜찮고, GitHub, 개인 페이지, Google Scholar, 논문이나 프로젝트 링크처럼 도움이 될 만한 자료도 같이 주시면 더 정확하게 볼 수 있습니다.

마지막으로, 나중에 회사에 소개할 때 어느 쪽이 더 편하신지도 알려주세요.

1. 잘 맞는 기회라면 Harper가 필요한 정보만 익명으로 먼저 제안해도 괜찮아요.
2. 먼저 저에게 보여주고, 제가 괜찮다고 한 기회만 회사와 이야기하고 싶어요.

번호로 답해주셔도 되고, 편한 말로 적어주셔도 됩니다.
```

### 메일 3: 자료 수신 즉시 확인

Subject:

```text
Re: From Harper to {displayName}
```

Body:

```text
자료 받았어요. 감사합니다.

지금 바로 읽어보고, 제가 이해한 핵심과 다음 액션을 정리해서 몇 분 안에 다시 메일드릴게요.
```

### 메일 4: 프로필 리뷰 및 커피챗 요청

Subject:

```text
{displayName}님, 자료 확인했습니다
```

Body:

```text
확인했습니다.

{impressivePoint}

좋은 기회를 찾으려면 단순히 이력만 정리하는 것보다, 회사에 전달될 때 {displayName}님이 어떤 사람으로 보이면 가장 매력적인지 맞추는 과정이 중요합니다.

시간 괜찮으실 때 아래 링크로 5분만 이야기해요. 어떤 역할, 회사, 일하는 방식, 타이밍을 선호하시는지까지 맞춰두면 제가 덜 보내고 더 좋은 기회만 골라드릴 수 있습니다.

통화가 끝나면 제가 바로 활동을 시작하겠습니다.

{calendarLink}
```

`impressivePoint` 예시:

```text
특히 최근에 하신 {project_or_company} 쪽 경험이 눈에 들어왔어요. 단순 구현보다 문제를 구조적으로 풀어낸 흔적이 있어서, 초기 팀이나 연구 밀도가 높은 팀에 소개할 때 강점으로 잡을 수 있겠습니다.
```

자료가 부족할 때 fallback:

```text
보내주신 자료만으로도 방향은 어느 정도 잡을 수 있었습니다. 다만 더 좋은 기회를 고르려면 최근에 가장 자신 있는 프로젝트나 성과를 한두 가지 더 듣는 편이 좋겠습니다.
```

### Stop 처리

유저가 "그만", "메일 보내지 마세요", "unsubscribe" 등 명확한 중단 의사를 보내면:

```text
알겠습니다. 더 이상 이 흐름으로 메일드리지 않겠습니다.

나중에 다시 시작하고 싶으시면 이 메일에 편하게 답장 주세요.
```

lead status는 `paused`로 둔다.

## 5. A/B 배정 방식

### 원칙

- 로그인된 유저는 실험하지 않고 기존 `careerStartHref`로 보낸다.
- 비로그인 유저만 배정한다.
- 같은 브라우저에서는 항상 같은 variant가 나오게 한다.
- QA를 위해 query override를 둔다.

### 구현

현재 `src/pages/index.tsx`는 `CAREER_LANDING_LOCAL_ID_KEY`로 local id를 갖고 있다. 이 값을 기반으로 deterministic hash를 만든다.

```text
abtest_type: career_landing_email_onboarding_v1
variants:
  - web_onboarding
  - email_onboarding
```

할당:

```text
variant = hash(localId + abtest_type) % 100 < 50
  ? "email_onboarding"
  : "web_onboarding"
```

QA override:

```text
/?career_onboarding_variant=email
/?career_onboarding_variant=web
```

## 6. 프론트엔드 변경

### 추가 파일

- `src/components/landing/career/CareerEmailOnboardingModal.tsx`
- `src/lib/careerEmailOnboarding/client.ts`
- `src/lib/careerEmailOnboarding/experiment.ts`

### 수정 파일

- `src/pages/index.tsx`
- 필요 시 `src/lib/landingLogTypes.ts`

### 동작

`handleCareerStartClick`을 다음처럼 바꾼다.

```text
if authenticated:
  log click_start
  router.push(careerStartHref)

if variant === "web_onboarding":
  log click_start
  router.push(careerStartHref)

if variant === "email_onboarding":
  preventDefault
  log email_onboarding_modal_open
  open modal
```

모달 제출:

```text
POST /api/talent/email-onboarding/request
{
  email,
  localId,
  source: "career",
  abtestType: "career_landing_email_onboarding_v1",
  variant: "email_onboarding",
  isMobile,
  countryLang,
  pagePath
}
```

성공 시:

- 모달 상태를 `submitted`로 변경한다.
- `email_onboarding_submit_success` 로그를 남긴다.

실패 시:

- 사용자가 다시 제출할 수 있게 한다.
- 서버에는 실패 이벤트를 저장한다.
- UI 문구는 짧게 유지한다.

```text
메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.
```

하단 "웹에서 바로 시작하기" 클릭:

- `email_onboarding_web_login_click` 이벤트를 기록한다.
- 기존 `careerStartHref`로 이동한다.

## 7. 서버 API

### Endpoint

```text
POST /api/talent/email-onboarding/request
```

파일:

```text
src/app/api/talent/email-onboarding/request/route.ts
```

### 책임

1. 이메일 validate 및 normalize
2. IP/email rate limit
3. `career_email_onboarding_leads` upsert
4. 로그인 전 임시 `talent_users` 생성 또는 재사용
5. `talent_conversations` 생성 또는 재사용
6. `email_reply_aliases` 생성
7. 첫 메일 발송
8. lead status를 `awaiting_start`로 업데이트
9. server event 기록

### 임시 talent id

로그인 전 유저도 `email_reply_aliases`가 필요하므로 `talent_users` row가 필요하다. 기존 network flow가 `uuidv5`로 deterministic talent id를 만드는 패턴을 쓰고 있으므로 같은 접근을 쓴다.

```text
careerEmailOnboardingTalentId = uuidv5(
  `career_email_onboarding:${lead.id}`,
  CAREER_EMAIL_ONBOARDING_NAMESPACE
)
```

나중에 유저가 로그인하면 `/api/talent/auth/bootstrap`의 `mail` claim 흐름으로 실제 auth user id에 병합한다. 이때 RPC에 이메일 reply 관련 테이블 이전을 반드시 추가한다.

### 발송 helper

현재 request access 쪽에 Resend fetch 발송 코드가 있지만, 이메일 온보딩에서는 공용 helper로 분리하는 편이 낫다.

추가:

```text
src/lib/email/send.ts
```

제약:

- Next.js build 안전성을 위해 Resend SDK나 DB client를 module scope에서 초기화하지 않는다.
- 단순 `fetch("https://api.resend.com/emails", ...)` 함수로 구현하면 충분하다.
- `Idempotency-Key`는 `career-email-onboarding/lead/{leadId}/mail1`로 둔다.

필수 env:

```text
RESEND_API_KEY
EMAIL_REPLY_FROM_EMAIL 또는 RESEND_FROM_EMAIL
```

worker에서 profile ingestion internal API를 호출하려면 Next와 worker에 같은 값을 둔다.

```text
INTERNAL_WORKER_API_SECRET
```

이메일 온보딩 링크 서명은 기존 `TALENT_NETWORK_INVITE_SECRET`을 우선 사용하고, 없으면 `SUPABASE_SERVICE_ROLE_KEY`를 사용한다. 별도의 `CAREER_EMAIL_ONBOARDING_SECRET`은 두지 않는다.

선택 env:

```text
CAREER_EMAIL_ONBOARDING_CALENDAR_URL
```

## 8. DB 설계

### `career_email_onboarding_leads`

온보딩 실험의 canonical state다.

```sql
create table if not exists public.career_email_onboarding_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  normalized_email text not null,
  display_name text null,
  local_id text null,
  source text null,
  abtest_type text not null default 'career_landing_email_onboarding_v1',
  variant text not null default 'email_onboarding',
  is_mobile boolean null,
  country_lang text null,
  page_path text null,
  talent_id uuid null references public.talent_users(user_id) on delete set null,
  conversation_id uuid null references public.talent_conversations(id) on delete set null,
  reply_alias text null,
  status text not null default 'created',
  step text not null default 'created',
  profile_links text[] not null default '{}'::text[],
  resume_text text null,
  first_email_resend_id text null,
  review_email_resend_id text null,
  calendar_url text null,
  first_email_sent_at timestamptz null,
  first_inbound_at timestamptz null,
  profile_received_at timestamptz null,
  profile_ingested_at timestamptz null,
  review_attempts integer not null default 0,
  review_locked_at timestamptz null,
  review_locked_by text null,
  calendar_cta_sent_at timestamptz null,
  paused_at timestamptz null,
  converted_user_id uuid null,
  converted_at timestamptz null,
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint career_email_onboarding_leads_email_check
    check (length(trim(normalized_email)) > 3),
  constraint career_email_onboarding_leads_status_check
    check (status in ('created', 'active', 'paused', 'converted', 'failed')),
  constraint career_email_onboarding_leads_step_check
    check (step in (
      'created',
      'awaiting_start',
      'awaiting_profile',
      'profile_received',
      'profile_review_pending',
      'calendar_cta_sent',
      'paused',
      'converted',
      'failed'
    ))
);

create unique index if not exists career_email_onboarding_leads_email_uidx
  on public.career_email_onboarding_leads (normalized_email);

create index if not exists career_email_onboarding_leads_conversation_idx
  on public.career_email_onboarding_leads (conversation_id)
  where conversation_id is not null;

create index if not exists career_email_onboarding_leads_review_claim_idx
  on public.career_email_onboarding_leads (step, profile_received_at)
  where status = 'active'
    and step = 'profile_review_pending'
    and calendar_cta_sent_at is null;
```

### `career_email_onboarding_events`

Funnel 분석용 event log다. `landing_logs`는 기존 landing 분석에 계속 쓰고, 세부 funnel은 별도 테이블에 저장한다.

```sql
create table if not exists public.career_email_onboarding_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid null references public.career_email_onboarding_leads(id) on delete set null,
  local_id text null,
  normalized_email_hash text null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists career_email_onboarding_events_type_recent_idx
  on public.career_email_onboarding_events (event_type, created_at desc);

create index if not exists career_email_onboarding_events_lead_recent_idx
  on public.career_email_onboarding_events (lead_id, created_at desc)
  where lead_id is not null;
```

### 비동기 profile review claim

별도 task 테이블은 만들지 않는다. `career_email_onboarding_leads`의
`step='profile_review_pending'`, `review_attempts`, `review_locked_at`,
`review_locked_by`를 queue 상태로 사용한다. worker는
`claim_career_email_onboarding_reviews(...)` RPC로 pending lead를 claim한다.

### RPC 보강

`claim_career_email_onboarding_lead`에서 아래 이전을 처리한다.

```sql
update public.email_reply_aliases
   set talent_id = target_user_id
 where talent_id = source_row.user_id;

update public.email_reply_jobs
   set talent_id = target_user_id
 where talent_id = source_row.user_id;

update public.career_email_onboarding_leads
   set talent_id = target_user_id,
       converted_user_id = target_user_id,
       converted_at = coalesce(converted_at, now_ts),
       status = 'converted',
       step = 'converted',
       updated_at = now_ts
 where talent_id = source_row.user_id;
```

## 9. 이메일 워커 설계

### 추가 파일

```text
harper_worker/email_reply/onboarding.py
```

### 수정 파일

```text
harper_worker/email_reply/worker.py
harper_worker/email_reply/db.py
harper_worker/email_reply/resend.py
harper_worker/email_reply/config.py
```

### inbound 처리 분기

`process_job`에서 identity와 conversation을 resolve한 뒤, 일반 LLM 답장을 만들기 전에 lead를 조회한다.

```text
lead = find_active_email_onboarding_lead(conversation_id, user_id, sender_email)

if lead:
  process_email_onboarding_reply(...)
else:
  current generic email reply flow
```

### 상태머신

```text
created
  -> awaiting_start
  -> awaiting_profile
  -> profile_received
  -> profile_review_pending
  -> calendar_cta_sent
  -> converted
```

중단 흐름:

```text
any active step -> paused
```

실패 흐름:

```text
any step -> failed
```

### step별 처리

#### `awaiting_start`

유저 답장에서 처리한다.

- stop intent면 `paused`
- 답장에서 `open_to_matches`/`exceptional_only`나 `full_time`/`fractional`/`advisor`가 명확하면 `talent_setting`과 lead metadata에 저장
- profile link나 resume text가 있으면 바로 `profile_received`
- 그 외에는 `awaiting_profile`로 바꾸고 메일 2 발송

이 단계에서는 "네"만 허용하지 않는다. 사용자가 바로 질문을 하거나 "어떻게 하면 돼요?"라고 해도 자연스럽게 자료 요청으로 연결한다.
기회 형태가 애매한 경우에도 즉시 재질문하지 않고, 메일 2 이후 자료 수신 단계에서 부족한 값만 다시 묻는다.

#### `awaiting_profile`

유저 답장에서 링크와 본문을 파싱한다.

수집 대상:

- LinkedIn profile URL
- Github URL
- Google Scholar URL
- 개인 페이지
- PDF, DOCX 이력서 첨부
- TXT/MD 이력서 첨부
- 메일 본문에 붙여넣은 이력서 텍스트

유효 자료가 없으면 재요청한다.

```text
제가 볼 수 있는 링크나 이력서가 아직 없는 것 같아요.
링크드인 URL이나 이력서를 이 메일에 그대로 보내주시면 바로 확인하겠습니다.
```

유효 자료가 있으면:

- `talent_users.resume_links` 업데이트
- 첨부가 있으면 metadata에 Resend attachment 정보를 저장하고, internal API에서 PDF/TXT/MD 텍스트를 추출해 `resume_text` 업데이트
- `talent_messages`에는 기존 inbound job 처리에서 유저 메일을 저장
- `profile_visibility`나 `engagement_types`가 아직 확정되지 않았다면 메일 3 하단에서 부족한 항목만 짧게 질문
- 메일 3 즉시 발송
- lead step을 `profile_review_pending`으로 변경하고, worker가 lead를 직접 claim

#### `profile_review_pending`

이 상태에서 유저가 또 답장하면:

- 추가 자료면 merge한다.
- "아직인가요?" 같은 질문이면 짧게 상태 안내한다.
- 새 task row는 만들지 않는다. 같은 lead의 자료와 metadata만 merge한다.

#### `profile_review` task

worker가 별도 loop 또는 기존 email worker loop 말미에서 claim한다.

1. Next internal API를 호출해 profile ingestion 실행
2. 저장된 profile rows를 읽는다.
3. LLM으로 `impressivePoint` 1개와 짧은 profile summary를 만든다.
4. 메일 4 발송
5. lead step을 `calendar_cta_sent`로 바꾼다.

### attachment 처리

Resend inbound webhook은 body나 attachment 원문을 포함하지 않는다. 원문은 Receiving API로, 첨부는 Attachments API로 다시 조회해야 한다.

따라서 `harper_worker/email_reply/resend.py`에 다음을 추가한다.

```text
list_received_email_attachments(email_id)
```

처리:

- PDF, TXT, MD는 internal API에서 텍스트를 추출한다.
- DOC/DOCX는 파일명 기반으로 자료 수신은 인정하지만, 현재 텍스트 추출은 다음 iteration으로 둔다.
- 최대 파일 크기는 8MB, 최대 첨부 3개로 제한한다.
- MVP에서는 파일을 Supabase Storage에 복사하지 않고 Resend download URL로 즉시 읽어 텍스트만 반영한다.

참고한 공식 문서:

- Resend Receiving email content: https://resend.com/docs/dashboard/receiving/get-email-content
- Resend Receiving attachments: https://resend.com/docs/dashboard/receiving/attachments
- Resend reply headers: https://resend.com/docs/dashboard/receiving/reply-to-emails

## 10. profile ingestion 연결

이메일 워커가 Python이고 ingestion은 Next/TypeScript에 있으므로 worker에서 호출 가능한 internal endpoint를 만든다.

### 추가 endpoint

```text
POST /api/internal/career/email-onboarding/ingest-profile
```

파일:

```text
src/app/api/internal/career/email-onboarding/ingest-profile/route.ts
```

인증:

```text
Authorization: Bearer ${INTERNAL_WORKER_API_SECRET}
```

기존 `requireInternalApiUser`는 브라우저 auth 기반이라 worker에는 맞지 않는다. 별도의 `requireInternalWorkerSecret(req)` helper를 만든다.

요청:

```json
{
  "leadId": "...",
  "userId": "...",
  "links": ["https://www.linkedin.com/in/..."],
  "resumeText": "...",
  "resumeFileName": "resume.pdf",
  "resumeStoragePath": "..."
}
```

응답:

```json
{
  "ok": true,
  "linkedinUrl": "https://www.linkedin.com/in/...",
  "stats": {
    "experiencesFromLinkedin": 3,
    "educationsFromLinkedin": 2,
    "extrasFromLinkedin": 4,
    "experiencesFromLlm": 0,
    "educationsFromLlm": 0,
    "extrasFromLlm": 0
  },
  "warnings": []
}
```

이 endpoint 내부에서 `ingestTalentProfileFromLinkedin`을 재사용한다.

## 11. 커피챗 링크와 추적

메일 4의 `{calendarLink}`는 직접 Calendly URL을 넣지 말고 redirect endpoint로 감싼다.

```text
https://matchharper.com/api/talent/email-onboarding/calendar-click?lead={leadId}&token={signedToken}
```

이 endpoint는:

1. token 검증
2. `calendar_clicked` event 기록
3. `career_email_onboarding_leads.metadata.calendarClickedAt` 업데이트
4. `CAREER_EMAIL_ONBOARDING_CALENDAR_URL`로 redirect

이렇게 해야 email click-through를 funnel에서 볼 수 있다.

## 12. 분석 지표

### Landing funnel

- `new_visit`
- `first_scroll_down`
- `click_start`
- `email_onboarding_modal_open`
- `email_onboarding_web_login_click`
- `email_onboarding_submit_success`

### Email funnel

- `mail1_sent`
- `profile_request_sent`
- `profile_received`
- `profile_ingested` 또는 `profile_ingestion_skipped`
- `calendar_cta_sent`
- `calendar_clicked`
- `converted_signup`

### 주요 비교 지표

- CTA click to email submit
- CTA click to signup
- CTA click to profile material received
- CTA click to coffee chat click
- CTA click to onboarding completed
- 첫 메일 발송 후 24시간 내 답장률
- 자료 요청 후 24시간 내 profile material 제출률
- 웹 A안 대비 B안의 최종 activation rate

## 13. Rate limit 및 abuse 대응

공개 endpoint이므로 최소한 아래를 둔다.

- 같은 normalized email 기준 첫 메일 발송은 10분에 1회, 하루 3회 제한
- 같은 IP 기준 1시간 20회 제한
- honeypot field optional
- disposable email 차단은 MVP에서는 하지 않되, bounce나 spam이 늘면 추가
- stop intent 처리
- worker는 automated sender, no-reply, mailing list를 skip한다. 기존 helper를 그대로 쓴다.

## 14. 구현 순서

### 1단계: 데이터와 API

1. Supabase migration 추가
2. database types 갱신
3. `claim_talent_user_email_alias` RPC 보강
4. `src/lib/careerEmailOnboarding/server.ts` 추가
5. `POST /api/talent/email-onboarding/request` 구현
6. Resend 첫 메일 발송 helper 구현

### 2단계: 랜딩 UI

1. A/B assignment helper 추가
2. `CareerEmailOnboardingModal` 구현
3. `src/pages/index.tsx` CTA 분기 적용
4. landing log event 추가
5. 모바일/데스크톱 UI 확인

### 3단계: worker 온보딩 state machine

1. active lead lookup 추가
2. stop intent, start intent, profile material parser 추가
3. 메일 2, 메일 3 deterministic 발송
4. profile review lead claim 추가
5. 메일 4 생성 및 발송
6. idempotency key 적용

### 4단계: profile ingestion과 첨부

1. worker secret endpoint 추가
2. worker에서 internal ingestion API 호출
3. Resend attachments list helper 추가
4. PDF resume text extraction 추가
5. DOC/DOCX는 자료 수신만 인정하고 text extraction은 다음 iteration으로 분리

### 5단계: 분석과 QA

1. Admin career analytics에 email onboarding funnel 추가
2. dry run 모드로 첫 메일 발송 확인
3. 실제 Resend inbound reply thread 확인
4. 한 이메일로 전체 왕복 테스트
5. 임시 talent user가 실제 로그인 user로 claim되는지 확인

## 15. 테스트 시나리오

### UI

- 비로그인 email variant에서 CTA 클릭 시 모달이 열린다.
- 모달 제출 성공 시 감사 상태로 바뀐다.
- 모달 하단 "웹에서 바로 시작하기"는 기존 로그인으로 이동한다.
- 로그인 유저는 모달 없이 기존 flow로 간다.
- 모바일에서 input, 버튼, 하단 링크가 겹치지 않는다.

### API

- invalid email은 400
- 첫 메일이 성공적으로 발송된 같은 email 반복 요청은 이미 발송됨으로 처리한다.
- 짧은 시간 안에 여러 신규 요청이 들어오면 rate limit 처리한다.
- 정상 요청은 lead, talent_user, conversation, reply_alias를 만든다.
- 첫 메일 발송 실패 시 요청 event를 rate limit 기준으로 남기지 않아 즉시 재시도할 수 있다.
- 같은 lead mail1 idempotency key로 중복 발송하지 않는다.

### Worker

- 메일 1에 "네 시작할게요"라고 답하면 메일 2가 간다.
- 메일 1에 바로 링크드인 URL을 보내면 메일 2를 건너뛰고 메일 3이 간다.
- 메일 2에 링크드인과 Github를 보내면 profile material로 인식한다.
- 자료가 없는 답장은 다시 자료를 요청한다.
- "그만 보내주세요"는 paused 처리한다.
- profile review claim은 메일 4를 한 번만 보낸다.
- `In-Reply-To`, `References`, `Reply-To`가 유지된다.

### Claim

- 이메일 온보딩으로 만들어진 임시 profile이 있다.
- 유저가 같은 이메일로 `career_login?mail={email}`을 통해 가입한다.
- `talent_users`, `talent_messages`, `talent_conversations`, `email_reply_aliases`, `career_email_onboarding_leads`가 실제 auth user id로 이전된다.

## 16. MVP 범위

반드시 포함:

- 랜딩 A/B 분기
- 이메일 입력 모달
- 첫 메일 발송
- reply alias 기반 reply 수신
- start -> profile request -> profile received -> calendar CTA 흐름
- 링크 기반 profile ingestion
- funnel event 저장
- claim RPC 보강

가능하면 포함:

- PDF resume attachment parsing
- Admin funnel dashboard
- 2분 delayed second email의 정확한 scheduling

다음 iteration:

- DOCX attachment parsing
- bounce/complaint webhook 기반 suppression
- LLM 기반 subject line variant test
- calendar booking webhook까지 연결해 `call_booked` event 기록

## 17. 구현상 주의점

- 이메일 본문은 너무 길게 쓰지 않는다. 첫 테스트에서는 짧은 메일이 답장률을 보기 좋다.
- 첫 메일에서 많은 정보를 요구하지 않는다. "시작해볼까요?"만 묻는다.
- 유저가 바로 자료를 보내면 state machine은 단계를 건너뛰어야 한다.
- 이메일 local-part로 이름을 만들 때 확신이 없으면 이름을 부르지 않는다.
- 랜딩 실험은 로그인 유저에게 적용하지 않는다.
- `landing_logs.type`에는 이메일 원문을 넣지 않는다. 세부 funnel에는 email hash만 저장한다.
- profile ingestion 실패 시에도 유저에게 내부 오류를 말하지 않는다. "자료는 받았고, 몇 가지를 더 확인한 뒤 다시 연락드리겠다"는 식으로 fallback한다.
- worker에서 긴 작업을 webhook handler 안에서 하지 않는다. webhook은 계속 queue insert만 담당한다.
