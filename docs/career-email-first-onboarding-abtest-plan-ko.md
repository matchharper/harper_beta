# Career Email-First Onboarding A/B Test 구현 문서

작성일: 2026-07-16  
점검/개정일: 2026-07-16

## 결론

이전 초안의 제품 방향은 맞지만, 그대로 바로 구현하면 안 된다. 구현 전에 아래 항목을 반드시 반영해야 한다.

- `ko/en` locale 계약이 빠져 있었다. 랜딩, request API, 첫 메일, 부족 정보 요청, 최종 CTA 메일, 로그인/bridge page의 모든 안내 문구는 같은 locale resolver를 통해 나가야 한다.
- `landing_logs`에는 variant용 metadata 컬럼이 없다. `abtest_type = career_landing_signup_flow_v1` 하나만 쓰면 control/treatment 로그를 분리하기 어렵다. variant별 `abtest_type` 값을 써야 한다.
- `src/lib/landingLogTypes.ts`는 현재 `new_visit`, `new_session`, `first_scroll_down`, `click_start`, `login_email:*`만 source-aware로 처리한다. email capture 이벤트에 `:source`를 붙이려면 이 파일과 admin 집계를 같이 수정해야 한다.
- `useCareerLandingStart()`는 현재 `careerStartHref`, `handleCareerStartClick`만 반환한다. inline email form이 필요한 `localId`, `countryLang`, `source`, `isMobile`, `addLandingLog`를 노출하거나 별도 capture hook을 만들어야 한다.
- worker에서 complete reply를 review task로 넘길 때 generic LLM fallback으로 떨어지면 원치 않는 답장이 추가로 나간다. `defer_review` 또는 `skip_reply` 경로를 명시적으로 만들어 inbound job을 완료 처리해야 한다.
- 현재 locale fallback이 파일마다 다르다. `src/i18n/localeResolution.ts`의 기본값은 `ko`, `resolveLocaleFromCountryLang(undefined)`는 `en`, `harper_worker/localized_copy.py`의 기본값은 `ko`, `normalizeCareerPromptLocale(...)`의 기본값은 `en`이다. 새 flow에서는 fallback에 의존하지 말고 landing에서 `locale`을 명시적으로 전달하고 DB에 저장된 locale을 계속 사용해야 한다.
- 임시 `talent_id`를 실제 Supabase Auth `user.id`로 옮기는 RPC는 최신 `talent_id` 참조 테이블을 모두 포함하는지 감사해야 한다.

## 목표

현재 랜딩 페이지의 primary CTA는 `Meet your Agent` 버튼이고, 클릭하면 `/career_login`에서 Supabase Auth 회원가입/로그인을 먼저 시킨 뒤 `/career/onboarding`으로 보낸다.

새 실험군은 랜딩 첫 CTA에서 회원가입을 요구하지 않고 이메일만 받는다. 이메일 제출 후 Harper가 먼저 메일을 보내고, 사용자가 답장으로 기본 프로필 정보를 보내면 Harper가 이를 파싱해 임시 `talent_users` 프로필에 저장한다.

이후 사용자가 메일 링크로 들어와 Supabase Auth 회원가입을 완료하면, 임시 `user_id`로 쌓인 프로필/메시지/이력 데이터를 실제 Auth `user.id`로 이전한다. 그 다음 “Harper와 통화하기” 또는 “채팅으로 이어가기”만 있는 bridge page를 거쳐 `/career/onboarding` 또는 `/career`에서 이어간다.

## 현재 코드에서 재사용할 수 있는 것

### 랜딩/로그인

- 랜딩 페이지: `src/pages/index.tsx`
  - 현재 `useCareerLandingStart()`를 통해 `careerStartHref`, `handleCareerStartClick`을 만들고, hero/app bar/final CTA/opportunity card에 전달한다.
  - `MessagesProvider locale={landingLocale}`가 이미 있으므로, landing copy는 `landingLocale` 기준으로 렌더링할 수 있다.
- CTA helper: `src/hooks/useCareerLandingStart.ts`
  - `new_visit`, `new_session`, `first_scroll_down`, `click_start`, `login_email:<email>[:source]` 로깅을 처리한다.
  - 로그인 전 사용자는 `/career_login?next=/career/onboarding&source=...&lid=...&ab=...`로 이동한다.
- 로그인 페이지: `src/pages/career_login.tsx`
  - `next`, `mail`, `source`, `lid`, `ab`, `email_onboarding` query를 유지해서 auth callback과 다음 페이지로 넘긴다.
- auth bootstrap: `src/app/api/talent/auth/bootstrap/route.ts`
  - `emailOnboardingToken`이 있으면 `claim_career_email_onboarding_lead(...)` RPC를 호출해 임시 리드 데이터를 실제 auth user로 claim한다.

### 이메일 온보딩 API

- 요청 API: `src/app/api/talent/email-onboarding/request/route.ts`
  - invalid email, rate limit, send failed error copy는 이미 `careerT(locale, ...)`로 localize한다.
- 서버 로직: `src/lib/careerEmailOnboarding/server.ts`
  - 이메일 정규화/레이트리밋
  - `career_email_onboarding_leads` upsert
  - 임시 `talent_users` 생성
  - `talent_conversations` 생성
  - reply alias 생성
  - Resend 발송
  - outbound mail을 `talent_messages`, `career_email_messages`에 기록
  - 로그인 token 생성: `email_onboarding=<signed-token>`
  - `resolveCareerEmailOnboardingLocale(body)`와 `withLocaleMetadata(...)`가 이미 있다.
- 토큰: `src/lib/careerEmailOnboarding/token.ts`
  - `leadId`, `email`, `purpose`, `iat`, `exp`를 HMAC 서명한다.

### 이메일 수신/답장 워커

- Resend inbound webhook: `src/app/api/internal/email/resend/route.ts`
- inbound 저장/queue: `src/lib/email/inbound.ts`
  - `email_inbound_events`
  - `email_reply_jobs`
- Python worker entrypoint: `harper_worker/email_reply_worker.py`
- worker identity resolve: `harper_worker/email_reply/worker.py`
  - reply alias가 `career_email_onboarding_leads.reply_alias`와 매칭되면 email onboarding lead로 처리한다.
  - 현재 onboarding reply 처리 후 `assistant_text`가 비어 있으면 generic LLM reply로 fallthrough할 수 있으므로, 새 complete path에서는 이 경로를 막아야 한다.
- email onboarding state machine: `harper_worker/email_reply/onboarding.py`
  - 현재 `awaiting_start`, `awaiting_profile`, `profile_review_pending`, `calendar_cta_sent`, `converted`, `paused` 같은 step을 쓴다.
  - 프로필 링크/이력서 텍스트/첨부파일을 저장하고, `profile_review_pending` lead를 review task가 처리한다.
- worker localized copy: `harper_worker/localized_copy.py`
  - `normalize_locale`, `locale_from_context`, `t(...)`와 `language.prompt_output_instruction`이 있다.
  - 새 email-first copy도 이 catalog에 `ko/en`으로 추가한다.
- 프로필 ingest API: `src/app/api/internal/career/email-onboarding/ingest-profile/route.ts`
  - LinkedIn/resume/첨부 파일을 저장하고 `ingestTalentProfileFromLinkedin(...)`로 구조화한다.
- review CTA 발송: `harper_worker/email_reply/onboarding.py`
  - `claim_career_email_onboarding_reviews(...)`로 `profile_review_pending` lead를 claim한다.
  - 프로필 ingest 후 onboarding CTA 메일을 보낸다.

### 임시 user claim

- RPC: `claim_career_email_onboarding_lead(...)`
  - 임시 `lead.talent_id`에서 실제 `target_user_id`로 데이터를 옮긴다.
  - 구현 전에 최신 `talent_id` 참조 테이블이 모두 포함되어 있는지 한 번 더 감사해야 한다.

## Locale/i18n 계약

지원 locale은 `ko`, `en` 두 개뿐이다. 그 외 입력은 반드시 둘 중 하나로 normalize한다.

### Resolver 우선순위

랜딩/API에서 이메일 요청을 만들 때:

1. `body.locale`이 `ko` 또는 `en`이면 그것을 사용한다.
2. 없으면 `body.countryLang`을 `resolveLocaleFromCountryLang(...)`로 해석한다.
3. landing form은 항상 현재 `landingLocale`을 `body.locale`로 보내야 한다. 이 값이 없으면 `countryLang` fallback에 의존하게 되어 QA가 어려워진다.

worker에서 답장을 만들 때:

1. `career_email_onboarding_leads.metadata.preferred_locale`
2. `career_email_onboarding_leads.metadata.locale`
3. `talent_setting.preferred_locale`
4. worker context의 `settings.preferred_locale` 또는 `profile.locale`
5. fallback `ko`, 단 새 treatment lead에서는 fallback을 타면 버그로 본다.

worker는 사용자가 답장을 영어로 썼는지 한국어로 썼는지에 따라 임의로 언어를 바꾸지 않는다. 최초 lead에 저장된 locale을 기준으로 일관된 안내를 보낸다. 사용자가 명시적으로 언어 변경을 요청하는 기능은 이번 범위 밖이다.

### 저장 위치

이메일 요청 시 아래 위치에 같은 locale을 저장한다.

- `career_email_onboarding_leads.metadata.locale`
- `career_email_onboarding_leads.metadata.preferred_locale`
- `career_email_onboarding_leads.metadata.settings.preferred_locale`
- `talent_setting.preferred_locale`
- `career_email_messages.metadata.locale`
- `career_email_onboarding_events.metadata.locale`

### 구현 규칙

- TS/TSX에서 사용자에게 보이는 새 문구는 `landingLocale`, `careerT(...)`, 또는 locale별 copy map을 통해 렌더링한다.
- Python worker에서 사용자에게 보이는 새 문구는 `harper_worker/localized_copy.py`에 key를 추가하고 `t(key, locale, ...)`로 가져온다.
- prompt에는 `language.prompt_output_instruction` 또는 같은 성격의 locale rule을 넣어 LLM 출력 언어를 강제한다.
- fallback copy도 반드시 `ko/en` 둘 다 둔다.
- 로그, DB enum, event type, internal reason은 영어 snake_case를 유지한다.

## 최종 사용자 흐름

### A군: 기존 control

1. 사용자가 랜딩 페이지에 들어온다.
2. 기존 CTA를 클릭한다.
3. `/career_login?next=/career/onboarding...`으로 이동한다.
4. Supabase Auth 회원가입/로그인 후 `/career/onboarding`에서 프로필 제출과 5분 대화를 시작한다.

### B군: email-first treatment

1. 사용자가 랜딩 페이지에 들어온다.
2. CTA 버튼 자리에 이메일 입력창과 CTA 버튼이 보인다.
   - `ko`: `Harper와 이야기하기`
   - `en`: `Talk to Harper`
3. 이메일을 입력하고 제출한다.
4. 화면에는 locale에 맞는 성공 안내를 보여준다.
5. Harper가 해당 이메일로 첫 메일을 보낸다.
6. 사용자가 메일에 답장으로 이름, 현재 지역, 열려있는 기회 타입, LinkedIn 또는 이력서, 기타 링크를 보낸다.
7. worker가 답장 내용을 파싱해 임시 `talent_users.user_id`에 저장한다.
8. 부족한 필드가 있으면 부족한 것만 locale에 맞춰 다시 묻는다.
9. 필수 정보가 충족되면 Harper가 프로필을 ingest/review하고 locale에 맞는 CTA 메일을 보낸다.
10. CTA 링크는 `/career_login`으로 들어가며, 회원가입/로그인 후 bridge page로 이동한다.
11. bridge page에서 사용자는 두 버튼 중 하나를 누른다.
    - `ko`: `Harper와 통화하기`, `채팅으로 이어가기`
    - `en`: `Talk to Harper`, `Continue by chat`
12. auth bootstrap에서 `email_onboarding` token을 claim하고 임시 user 데이터를 실제 Auth user로 이전한다.

## A/B Test 설계

기존 hero copy A/B test와 섞지 않기 위해 별도 experiment를 둔다.

`landing_logs`에는 variant metadata가 없으므로, 집계 가능한 값은 `abtest_type` 자체에 variant를 포함해야 한다.

- experiment id: `career_signup_flow_v1`
- control `abtest_type`: `career_signup_flow_v1_control`
- treatment `abtest_type`: `career_signup_flow_v1_email_first`
- lead/event metadata variant:
  - `web_signup_control`
  - `email_first`
- query override:
  - `?signup_flow=web`
  - `?signup_flow=email`
- local assignment:
  - 기존 `CAREER_LANDING_LOCAL_ID_STORAGE_KEY`의 local id를 salt로 50/50 bucket
  - local id가 없으면 id 생성 후 bucket을 계산한다.

현재 `src/lib/career/utm.ts`의 hero copy A/B helper는 `career_landing_v1`과 hero label에 묶여 있다. signup flow 실험은 별도 helper로 분리한다. admin UI의 “Hero Copy A/B Test” 라벨을 그대로 재사용하면 안 된다.

### 로깅 이벤트

기존 `landing_logs`를 계속 사용하되, treatment 전용 이벤트를 추가한다.

공통:

- `new_visit[:source]`
- `new_session[:source]`
- `first_scroll_down[:source]`

control:

- `click_start[:source]`
- `login_email:<email>[:source]`
- `career_signup_completed`

treatment:

- `email_capture_submit[:source]`
- `email_capture_sent[:source]`
- `email_capture_error[:source]`
- `email_reply_received`는 `career_email_onboarding_events`에 기록
- `email_profile_complete`는 `career_email_onboarding_events`에 기록
- `converted_signup`은 기존 event/RPC 사용

`src/lib/landingLogTypes.ts` 수정이 필요하다.

- `SOURCE_AWARE_EVENT_TYPES`에 `email_capture_submit`, `email_capture_sent`, `email_capture_error`를 추가한다.
- `withLandingLogSource(...)`, `getLandingLogBaseType(...)`, `getLandingLogSource(...)`가 새 이벤트를 같은 방식으로 처리하는지 테스트한다.
- admin funnel에서 `getLandingLogBaseType(...)` 기준으로 source suffix가 붙은 이벤트까지 집계한다.

관리자 지표는 `src/app/api/admin/career/route.ts`와 `AdminCareerAbtestPanel`에 signup flow funnel을 별도로 추가한다.

- Entry
- Email submit
- Email sent
- First reply received
- Required profile complete
- Signup converted
- Onboarding started
- Onboarding completed

## 프론트엔드 구현

### 1. 랜딩 hero에 inline email capture form 추가

새 컴포넌트를 만든다.

- 제안 파일: `src/components/landing/career/CareerLandingEmailCaptureForm.tsx`
- props:
  - `locale: "ko" | "en"`
  - `abtestType`
  - `variant`
  - `localId`
  - `countryLang`
  - `isMobile`
  - `source`
  - `pagePath`
  - `onSubmitted`
  - `onFallbackWebStart`
- UI:
  - email input
  - locale별 CTA button
  - pending/error/success state

Landing form copy:

| key | ko | en |
| --- | --- | --- |
| placeholder | 이메일 주소 | Email address |
| submit | Harper와 이야기하기 | Talk to Harper |
| pending | 보내는 중... | Sending... |
| success title | 감사합니다. 이메일로 계속 이어나가요! | Thanks. We will continue over email. |
| success body | 스팸함 혹은 다른 메일함으로 들어갈 수 있으니 확인 부탁드려요. | If you do not see Harper's email, please check spam or other inbox folders. |
| invalid email | 올바른 이메일 주소를 입력해 주세요. | Please enter a valid email address. |
| send failed | 메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요. | Failed to send the email. Please try again shortly. |

기존 `CareerEmailOnboardingModal`은 “모달로 이메일 시작하기”에는 쓸 수 있지만, 이번 요구사항은 CTA 자리에 inline form을 두는 것이므로 새 inline 컴포넌트가 더 적합하다. 내부 submit 로직은 기존 `/api/talent/email-onboarding/request` 호출을 재사용한다.

request body에는 반드시 아래 값을 보낸다.

```json
{
  "email": "user@example.com",
  "locale": "ko",
  "countryLang": "KR_ko",
  "abtestType": "career_signup_flow_v1_email_first",
  "variant": "email_first",
  "localId": "...",
  "source": "landing_hero",
  "pagePath": "/",
  "isMobile": false
}
```

### 2. 랜딩 variant wiring

`src/pages/index.tsx`에서 `useCareerEmailFirstExperiment()` 같은 hook을 추가한다.

- control이면 현재 CTA 그대로 렌더링한다.
- treatment이면 hero primary CTA 자리에 email form을 렌더링한다.
- final CTA도 같은 email form으로 맞춘다.
- app bar의 작은 `Join` 버튼은 treatment에서는 `/career_login` 이동 대신 hero form으로 scroll/focus시키는 편이 좋다.
- opportunity cards의 `Connect via Agent`는 실험 순도를 높이려면 email-first로 통일한다. 다만 card별 intent가 다르면 별도 `source`만 다르게 기록한다.

`useCareerLandingStart()`는 현재 form에 필요한 값을 충분히 노출하지 않는다. 두 가지 중 하나로 정리한다.

- 기존 hook 반환값 확장:
  - `landingId`
  - `localId`
  - `countryLang`
  - `isMobile`
  - `marketingSource`
  - `addLandingLog`
- 또는 별도 `useCareerLandingEmailCapture(...)` hook 생성:
  - 기존 local id/session 로직을 재사용
  - submit/sent/error landing log까지 캡슐화

### 3. 로그인 페이지 prefill

`/career_login?mail=<email>`로 들어온 경우:

- email input이 비어있으면 `mail` query로 prefill한다.
- `email_onboarding` token이 있는 경우, 가입 이메일과 token 이메일이 다르면 현재 bootstrap이 400을 반환한다. 로그인 페이지에서 locale별 안내를 미리 보여주면 전환 손실을 줄일 수 있다.

Login mismatch copy:

| key | ko | en |
| --- | --- | --- |
| email mismatch | 메일을 받은 이메일 주소로 가입해야 이어서 진행할 수 있어요. | Please sign up with the email address that received Harper's email. |

## 첫 메일 구현

수정 파일: `src/lib/careerEmailOnboarding/server.ts`

현재 `buildFirstEmail(...)`은 이미 `locale`을 받지만 “좋아요/Sounds good으로 답장해 시작”하는 이전 흐름이다. 이번 flow에서는 첫 메일에서 필요한 기본 정보를 바로 요청한다.

구현 세부사항:

- `buildFirstEmail({ displayName, locale, loginUrl })` 형태는 유지한다.
- 내부 copy를 locale별 map으로 분리한다.
- `replyTo`는 기존처럼 `career_email_onboarding_leads.reply_alias`를 사용한다.
- fallback 링크는 plain `matchharper.com/career_login`보다 signed token이 포함된 URL을 쓴다.
  - 예: `https://matchharper.com/career_login?next=/career/onboarding&source=email_onboarding&mail=<email>&email_onboarding=<token>`
  - 본문 표시는 짧게 `matchharper.com/career_login`로 두고 실제 HTML 링크 href에는 token URL을 넣는다.
- 명시적인 랜딩 제출마다 고유 idempotency key를 사용해 실제 메일 발송을 다시 요청한다.
- 가입하지 않은 사용자의 기존 리드가 있어도 `alreadySent`로 스킵하지 않는다. 같은 이메일로 다시 요청하면 같은 첫 안내 메일을 한 번 더 보내되, 기존 리드의 진행 `step`은 되돌리지 않는다.
- `career_email_messages.metadata.locale`도 저장한다.

### 첫 메일 copy

Subject:

- `ko`: `Harper에서 먼저 인사드려요`
- `en`: `A quick hello from Harper`

Korean body:

```text
안녕하세요. 이메일을 알려주셔서 감사합니다ㅎㅎ

저에 대해 간단하게 소개드리면, 저는 인재분들의 커리어를 함께 고민하고, 좋은 기회를 알아서 찾아와 연결해드리는 AI Agent Harper입니다. 공개 채용으로 올라온 역할뿐 아니라, 회원님의 배경과 선호에 맞는 기회를 찾아보고 연결까지 도와드려요.

시작 방법은 간단해요. 현재 메일로 아래의 내용을 답장으로 알려주시면 제가 회원님에 대해서 이해도를 높이고, 그 다음 간단하게 어떤걸 선호하시는지 제가 어떤 기회를 연결해드리는걸 원하시는지 5분 동안 가볍게 대화 나눠봐요.

우선 이것들을 알려주실 수 있나요?

- 이름
- 현재 계신 지역
- 어떤 기회에 열려있으신지 (풀타임, 파트타임, 돈이 되는 단건 작업 등)
- 이력서 혹은 링크드인 (둘 중 하나 필수), 추가적인 개인을 설명할 수 있는 링크들(GitHub, Scholar, 웹사이트 등)

언제든 편하게 답장주셔도 좋습니다.

감사합니다.

Harper 드림

혹시 메일 답장이 힘드시다면 여기 접속하셔서 이어나가셔도 좋아요.
matchharper.com/career_login
```

English body:

```text
Hi, thanks for sharing your email.

I'm Harper, an AI career agent that helps people think through their career direction, find strong opportunities, and get connected when there is a fit. I learn your background and preferences first, then bring fewer but better opportunities.

Getting started is simple. Reply to this email with the details below so I can understand you better. After that, we can continue with a light 5-minute call or chat about what you prefer and what kinds of opportunities you want me to bring.

Could you share these first?

- Name
- Current location
- What types of opportunities you are open to (full-time, part-time, paid project work, advisory, etc.)
- Resume or LinkedIn (one required), plus any helpful links such as GitHub, Scholar, personal website, portfolio, etc.

Feel free to reply whenever convenient.

Best,

Harper

If replying by email is inconvenient, you can continue here.
matchharper.com/career_login
```

## 답장 파싱 및 저장

수정 파일:

- `harper_worker/email_reply/onboarding.py`
- `harper_worker/email_reply/worker.py`
- `harper_worker/localized_copy.py`

### 필수 정보 정의

필수:

- 이름
- 현재 계신 지역
- 열려있는 기회 타입
  - `full_time`
  - `fractional` 또는 project/part-time/contract
  - `advisor`
- LinkedIn 또는 이력서
  - LinkedIn URL: `linkedin.com/in/...`
  - resume/CV attachment
  - 충분히 긴 resume-like text

선택:

- GitHub
- Google Scholar
- 개인 웹사이트
- Hugging Face/Kaggle 등 기타 링크

profile visibility는 이메일 필수 정보에서 제외한다. 실제 회사 소개/프로필 공유 방식은 bridge 이후 5분 대화에서 묻는다.

### 저장 위치

가능하면 새 컬럼을 늘리지 않고 기존 저장 위치를 쓴다.

- `talent_users.name`
- `talent_users.current_location`
- `talent_users.location`
- `talent_users.resume_links`
- `talent_users.resume_file_name`
- `talent_users.resume_text`
- `talent_setting.engagement_types`
- `career_email_onboarding_leads.profile_links`
- `career_email_onboarding_leads.resume_text`
- `career_email_onboarding_leads.metadata.emailFirstProfile`
- `career_email_onboarding_leads.metadata.emailFirstReplyDraft`

`metadata.emailFirstProfile` 예시:

```json
{
  "name": "홍길동",
  "currentLocation": "Seoul, Korea",
  "engagementTypes": ["full_time", "fractional"],
  "profileLinks": ["https://www.linkedin.com/in/example"],
  "extraLinks": ["https://github.com/example"],
  "missingFields": [],
  "lastParsedAt": "2026-07-16T00:00:00.000Z",
  "locale": "ko"
}
```

`metadata.emailFirstReplyDraft`에는 LLM이 생성한 답장 본문을 저장한다. 필수 정보가 모두 있으면 본문 안에 `*LINK*` placeholder가 포함되어야 하며, review task에서 profile ingestion 성공 후 실제 bridge URL로 치환해 보낸다.

### 파싱 방식

현재 email-first 답장 파싱은 grok 기반 JSON LLM extraction으로 처리한다. 이름/지역/기회 타입/링크/답장 문안을 한 번에 뽑고, 이름/지역/기회 타입 regex parser는 사용하지 않는다.

새 helper 제안:

- `extract_email_first_profile_fields(cfg, lead, body_text, attachments, existing_profile, locale) -> dict`

`process_onboarding_reply(...)`는 현재 `cfg`를 받지 않는 구조라면 시그니처를 바꿔야 한다. `worker.py`에서 이미 가지고 있는 `cfg`를 onboarding 함수로 전달한다.

출력:

```json
{
  "name": "string|null",
  "currentLocation": "string|null",
  "engagementTypes": ["full_time", "fractional", "advisor"],
  "profileLinks": ["string"],
  "extraLinks": ["string"],
  "hasResumeOrLinkedIn": true,
  "missingFields": ["name", "currentLocation", "engagementTypes", "profileMaterial"],
  "reply": "string"
}
```

규칙:

- 최신 inbound 본문과 첨부파일 정보에서 명시된 사실만 추출한다.
- LinkedIn/resume 여부는 LLM이 추출한 `links`와 attachment metadata로 판단한다.
- 기회 타입은 `full_time`, `fractional`, `advisor`만 저장한다.
- “아무거나 괜찮다”, “전부 열려있다”, “open to anything”은 세 타입 모두 저장한다.
- “풀타임은 아니고 파트타임/자문만”, “not full-time, only advisory” 같은 negation을 테스트 케이스에 포함한다.
- model은 `grok-4.3`을 사용한다.
- LLM output shape는 `{"links":[],"location":null,"name":null,"engagementType":[],"reply":""}`를 기준으로 한다.

### 부족한 정보가 있을 때 답장

LLM output의 `reply`를 사용해 부족한 필드만 묻는다. LLM이 빈 reply를 반환하거나 실패했을 때만 locale별 fallback key를 사용한다.

- `email_onboarding.email_first_missing_fields_intro`
- `email_onboarding.email_first_missing_fields_outro`
- `email_onboarding.email_first_missing_field.name`
- `email_onboarding.email_first_missing_field.current_location`
- `email_onboarding.email_first_missing_field.engagement_types`
- `email_onboarding.email_first_missing_field.profile_material`

Korean template:

```text
안녕하세요! 보내주신 내용 확인했어요ㅎㅎ

시작하려면 아래 정보가 조금 더 필요해요.

{missing_list}

이 메일에 그대로 답장으로 보내주시면 이어서 확인할게요.
```

English template:

```text
Hi, I reviewed what you sent.

I just need a little more information to get started.

{missing_list}

You can reply directly to this email and I will continue from there.
```

Missing field labels:

| field | ko | en |
| --- | --- | --- |
| `name` | 이름 | Name |
| `currentLocation` | 현재 계신 지역 | Current location |
| `engagementTypes` | 어떤 기회에 열려있으신지 | What types of opportunities you are open to |
| `profileMaterial` | 이력서 또는 LinkedIn URL | Resume or LinkedIn URL |

### 필수 정보가 충족되었을 때

현재 worker는 프로필 자료를 받으면 즉시 “자료 받았고 검토하겠다”는 답장을 보내고, 별도 review task가 나중에 CTA 메일을 보낼 수 있다. 새 요구사항에서는 모든 정보 충족 시 최종 CTA 메일 하나만 나가는 것이 더 적합하다.

중복 메일을 피하기 위해 worker return type을 바꾼다.

- 현재: `process_onboarding_reply(...) -> Optional[str]`
- 제안: `process_onboarding_reply(...) -> OnboardingReplyResult`

```python
{
    "reply_text": "string|None",
    "defer_review": True,
    "skip_generic_reply": True,
    "lead_id": "...",
    "reason": "profile_complete"
}
```

처리 방식:

1. 필수 정보가 부족하면 `reply_text`를 반환하고 worker가 즉시 답장한다.
2. 필수 정보가 충족되면:
   - fields를 저장한다.
   - `career_email_onboarding_leads.step = 'profile_review_pending'`
   - `profile_received_at`, `first_inbound_at` 업데이트
   - `email_profile_complete` event 기록
   - `defer_review = true`, `skip_generic_reply = true` 반환
3. `email_reply/worker.py`는 `skip_generic_reply = true`일 때 generic LLM으로 fallthrough하지 않는다.
4. inbound job은 “보류”가 아니라 성공 처리되어야 한다. 예: `mark_job_processed(..., status='deferred_to_review')` 또는 기존 완료 함수에 reason metadata 추가.
5. 같은 `run_once()` 끝에서 기존 `run_review_tasks()`가 `profile_review_pending` lead를 claim해 review CTA 메일을 보낸다.

이렇게 하면 유저에게는 부족 정보 요청 또는 최종 CTA 메일 중 하나만 보인다.

## Review CTA 메일

수정 파일: `harper_worker/email_reply/onboarding.py`

현재 `_build_review_email(...)`은 call CTA 중심이다. 요구사항에 맞춰 bridge page로 보내는 CTA 메일로 바꾼다.

새 localized copy key:

- `review_onboarding.email_first_subject`
- `review_onboarding.email_first_fallback_body`

Subject:

- `ko`: `{name}님, 보내주신 정보 잘 확인했어요`
- `en`: `{name}, I reviewed your info`
- 이름이 없으면:
  - `ko`: `보내주신 정보 잘 확인했어요`
  - `en`: `I reviewed your info`

Korean body:

```text
안녕하세요 {name}님! 보내주신 정보 전부 잘 확인했어요ㅎㅎ

제가 {name}님의 커리어에 도움이 될 수 있는 기회들을 많이 찾아올게요.

그걸 위해서 앞서 말씀드린 것처럼 어떤걸 선호하시는지 제가 어떤 기회를 연결해드리는걸 원하시는지 가볍게 5분 동안 대화를 나눠본 뒤 시작할게요. 당장 하실 필요는 없고, 편하실 때 이어나가주세요.

평가가 아니라 {name}님을 위해 필요한 정보를 여쭤보는 자리라 부담없이 참여해주셔도 좋습니다!

아래 링크로 접속하셔서 회원가입 후 이어나가시죠.

{continue_url}

감사합니다.
```

English body:

```text
Hi {name}, I reviewed everything you sent.

I will use that context to look for opportunities that can actually help your career.

Before I start, as I mentioned earlier, I would like to spend about 5 minutes understanding what you prefer and what kinds of opportunities you want me to bring. You do not have to do it right away. Continue whenever convenient.

This is not an evaluation. I am asking only so I can work for you with better context.

Open the link below, sign up, and continue from there.

{continue_url}

Best,
Harper
```

구현 세부사항:

- 필수 정보가 충분한 경우 LLM extractor가 만든 `reply`에는 `*LINK*` placeholder가 들어간다.
- review task는 profile ingestion을 먼저 실행하고, 성공하면 `metadata.emailFirstReplyDraft`의 `*LINK*`를 실제 signed bridge URL로 치환해 보낸다.
- profile ingestion이 충분한 profile signal을 저장하지 못하면 CTA 대신 `review_onboarding.profile_ingestion_failed_*` fallback 메일을 보내고 lead step을 `awaiting_profile`로 되돌린다.
- ingestion 실패 fallback과 성공 CTA는 Resend idempotency key를 분리해, 이후 유저가 자료를 다시 보내도 최종 CTA를 다시 발송할 수 있게 한다.
- 저장된 draft가 없을 때만 최종 CTA 메일을 grok으로 다시 작성한다. 이때 LLM payload에는 `displayName`, `continueUrl`, `engagementTypesContext`만 넣는다.
- `fallbackPoint`, `profileVisibilityContext`, `requiredCTA`, 그리고 raw `profile`, `experiences`, `educations`, `extras`는 만들지도 않고 넣지도 않는다.
- LLM이 링크를 빼먹지 않도록 JSON 필드가 아니라 system prompt에서 `continueUrl`을 정확히 포함하도록 지시한다.
- LLM 실패 시 fallback body도 위 구조의 locale별 copy를 사용한다.
- CTA URL은 바로 `/career/onboarding?start=call`이 아니라 bridge page로 보낸다.
- `career_email_messages.metadata.locale`와 event metadata에 locale을 남긴다.

## 회원가입 후 bridge page

새 페이지 제안:

- `src/pages/career/email-onboarding.tsx`
- URL:
  - `/career/email-onboarding?email_onboarding=<token>&mail=<email>&source=email_onboarding_review`

링크 생성 위치:

- `src/lib/careerEmailOnboarding/server.ts`
- `harper_worker/email_reply/onboarding.py`의 `_build_call_start_url(...)`를 `_build_continue_url(...)`로 바꾸거나 새 helper를 추가한다.

로그인 전이면:

- `/career_login?next=/career/email-onboarding?...&mail=<email>&source=email_onboarding_review&email_onboarding=<token>`로 보낸다.

로그인 후 bridge page는:

1. `useCareerAuth()`로 auth 상태 확인
2. 비로그인 상태면 `/career_login`으로 redirect
3. 로그인 상태면 `/api/talent/auth/bootstrap`을 호출해 `emailOnboardingToken` claim
4. claim 성공 또는 이미 같은 user로 claim된 상태면 두 버튼 표시

`claim_career_email_onboarding_lead(...)`가 `claimed=false`를 반환하는 경우를 무조건 성공으로 보면 안 된다. 이미 converted인 lead라면 현재 auth user가 `converted_user_id`와 같은지 확인해야 한다. 지금 bootstrap 응답만으로 그 판단이 어렵다면 RPC 또는 bootstrap route가 `status`, `converted_user_id`, `leadId`를 반환하도록 확장한다. 다르면 token/email mismatch 안내를 보여준다.

Bridge page copy:

| key | ko | en |
| --- | --- | --- |
| loading | 이어서 준비하고 있어요. | Preparing your next step. |
| title | 이어서 시작할 방법을 선택해주세요. | Choose how you would like to continue. |
| call button | Harper와 통화하기 | Talk to Harper |
| chat button | 채팅으로 이어가기 | Continue by chat |
| auth required | 회원가입 후 이어서 진행할 수 있어요. | Sign up to continue. |
| claim failed | 메일 링크를 확인할 수 없어요. 받은 메일의 링크로 다시 접속해 주세요. | We could not verify this email link. Please open the link from Harper's email again. |
| email mismatch | 메일을 받은 이메일 주소로 가입해야 이어서 진행할 수 있어요. | Please sign up with the email address that received Harper's email. |

버튼:

- `Harper와 통화하기` / `Talk to Harper`
  - `/career/onboarding?start=call`
- `채팅으로 이어가기` / `Continue by chat`
  - `/career/onboarding?start=chat`

token query를 다음 페이지까지 넘길 수는 있지만, claim은 bridge에서 끝내는 것이 기본이다. 이후 페이지는 auth user 기준으로 동작해야 한다.

## 임시 user claim 검증

기존 `claim_career_email_onboarding_lead(...)` RPC는 대부분의 핵심 테이블을 옮긴다. 구현 전 아래를 확인한다.

1. `database.types.ts`에서 `talent_users.user_id` 또는 `talent_id`를 참조하는 모든 테이블을 추출한다.
2. RPC update 대상에 없는 테이블이 있는지 비교한다.
3. 빠진 테이블이 있으면 새 migration으로 RPC를 갱신한다.

특히 확인할 후보:

- `talent_opportunity_fit`
- `talent_opportunity_chat_preview`
- `internal_opportunity_call_requests`
- 최근 추가된 matching/opportunity 관련 테이블

claim 후에는 `career_email_onboarding_leads`가 아래처럼 업데이트되어야 한다.

- `talent_id = auth user.id`
- `converted_user_id = auth user.id`
- `converted_at = now`
- `status = converted`
- `step = converted`
- event: `converted_signup`

## 보안/운영 고려사항

- request API는 기존 레이트리밋을 유지한다.
  - 같은 email 10분 1회
  - 같은 email 하루 3회
  - 같은 IP 한 시간 20회
- 응답 링크는 signed token을 사용한다.
- token 이메일과 Supabase Auth 이메일이 다르면 claim하지 않는다.
- worker가 unmatched sender email을 임의로 새 user에 연결하지 않도록 기존 reply alias 우선 정책을 유지한다.
- 첨부파일은 기존 제한을 유지한다.
  - 최대 3개
  - 개당 최대 8MB
  - PDF/TXT/MD/DOCX만 프로필 자료로 처리
- 첫 메일의 `Reply-To`가 누락되면 답장 수신이 깨지므로 `EMAIL_REPLY_DOMAIN`, `EMAIL_REPLY_TOKEN_SECRET`, Resend receiving MX 설정을 배포 전 확인한다.
- locale이 저장되지 않은 과거 lead는 worker fallback `ko`로 처리한다. 새 treatment lead는 반드시 `locale`을 저장하므로 fallback에 의존하면 안 된다.

## 구현 순서

1. Signup flow experiment 상수/hook 추가
   - `career_signup_flow_v1_control`
   - `career_signup_flow_v1_email_first`
   - `web_signup_control`, `email_first`
   - query override 지원

2. landing log source-aware 이벤트 확장
   - `email_capture_*` 이벤트를 `src/lib/landingLogTypes.ts`에 추가
   - admin 집계에서 suffix 포함 이벤트를 base type으로 집계

3. 랜딩 inline email form 추가
   - hero CTA 교체
   - final CTA/app bar/opportunity card 정책 적용
   - locale별 submit/success/error copy
   - submit/success/error 로깅

4. request API locale 저장 보강
   - landing form에서 `locale` 필수 전송
   - `career_email_messages.metadata.locale`
   - `career_email_onboarding_events.metadata.locale`

5. 첫 메일 copy 교체
   - `buildFirstEmail(...)`
   - `ko/en` copy map
   - token URL은 HTML href에 넣고 본문 표시는 짧게 유지

6. worker 파싱 강화
   - `cfg` 전달
   - 이름/지역/기회 타입/profile material JSON extraction
   - grok JSON extractor
   - `talent_users`, `talent_setting`, lead metadata 저장
   - LLM reply draft 저장 및 fallback missing-fields localized reply 추가

7. complete path를 review task로 defer
   - `process_onboarding_reply` return type 변경
   - `worker.py` generic LLM fallthrough 방지
   - inbound job 완료 reason 기록
   - `email_profile_complete` event 기록

8. review CTA 메일 copy와 링크 변경
   - locale별 subject/body/fallback
   - bridge URL 생성
   - LLM prompt에 locale rule과 required CTA 강제

9. bridge page 추가
   - auth/bootstrap claim
   - 이미 claim된 token의 current user 검증
   - `Harper와 통화하기` / `Talk to Harper`
   - `채팅으로 이어가기` / `Continue by chat`
   - `/career/onboarding?start=call|chat` 이동

10. claim RPC 감사 및 필요 시 migration
    - 최신 talent 참조 테이블 누락 확인

11. admin analytics 확장
    - signup flow funnel 추가
    - variant별 conversion 비교

12. 테스트 및 릴리즈

## 테스트 계획

### Unit/로컬 테스트

- locale resolver
  - `body.locale=ko`이면 모든 UI/API/email copy가 Korean
  - `body.locale=en`이면 모든 UI/API/email copy가 English
  - unsupported locale은 `ko/en` 중 정책 fallback으로 normalize
- `buildCareerEmailOnboardingToken` / `parseCareerEmailOnboardingToken`
  - 정상
  - 만료
  - purpose mismatch
  - 이메일 mismatch
- `/api/talent/email-onboarding/request`
  - valid email
  - invalid email localized error
  - same email repeated request resends the email
  - rate limit localized error
  - `career_email_messages.metadata.locale` 저장
- landing logs
  - `email_capture_submit:<source>`
  - `email_capture_sent:<source>`
  - `email_capture_error:<source>`
  - admin 집계에서 suffix 제거 후 base type으로 집계
- worker extraction
  - 모든 필드가 한 번에 있는 한국어 답장
  - 모든 필드가 한 번에 있는 영어 답장
  - 이름만 있고 LinkedIn 없음
  - 첨부파일만 있는 답장
  - “풀타임은 아니고 파트타임/자문만” 같은 negation
  - “not full-time, advisory only” 같은 negation
  - GitHub만 있고 LinkedIn/resume 없음
  - complete reply draft에 `*LINK*` placeholder 포함
- missing-fields reply
  - 부족한 필드만 묻는지 확인
  - stored locale이 `ko`면 한국어
  - stored locale이 `en`이면 영어
  - 답장 본문 언어가 stored locale과 달라도 stored locale 유지
- defer review
  - complete reply에서 generic LLM으로 떨어지지 않는지 확인
  - inbound job이 재시도 큐에 남지 않는지 확인
- review CTA
  - `ko/en` subject/body/fallback
  - signed bridge URL 포함
  - ingestion 성공 시 저장된 draft의 `*LINK*` 치환
  - ingestion 실패 시 profile ingestion fallback email
  - LLM 실패 시 fallback도 locale 유지
- bridge page
  - 비로그인 redirect
  - 신규 signup 후 claim 성공
  - 이미 같은 user로 claim된 token 처리
  - 다른 email/user로 접근 시 localized mismatch 안내

### 시뮬레이션

worker simulate 예시:

```bash
cd /Users/gimhojin/Desktop/harper/harper_worker
PYTHONPATH=. ../myenv/bin/python email_reply_worker.py simulate \
  --user-id <temporary_talent_user_id> \
  --from-email user@example.com \
  --subject "Re: Harper" \
  --body "이름은 홍길동이고 서울에 있습니다. 풀타임과 파트타임 모두 열려있고 LinkedIn은 https://www.linkedin.com/in/example 입니다." \
  --print-prompt
```

### E2E 수동 테스트

1. `/ko?signup_flow=email`로 Korean treatment 강제
2. `/en?signup_flow=email`로 English treatment 강제
3. 이메일 제출
4. locale별 success copy 확인
5. Resend 발송/Reply-To/메일 언어 확인
6. 답장 수신 webhook -> `email_reply_jobs` queued 확인
7. worker 처리 후 lead metadata/profile/locale 저장 확인
8. 부족 정보 답장 케이스 확인
9. complete 케이스에서 review CTA 메일 확인
10. CTA 링크로 `/career_login` 진입
11. 새 Supabase Auth 계정으로 회원가입
12. `/career/email-onboarding` bridge page 표시
13. 버튼 클릭 후 `/career/onboarding?start=call|chat` 시작
14. 임시 user 데이터가 실제 auth user로 이전됐는지 확인

## 릴리즈/롤백

- 처음에는 query override로만 QA한다.
- 이후 10% treatment, 50% treatment 순서로 올린다.
- 문제가 생기면 experiment resolver를 control로 고정하면 된다.
- 이미 발송된 이메일 링크는 `/career_login` fallback을 포함하므로 랜딩 실험을 꺼도 유저가 계속 진행할 수 있다.
- locale copy 이슈가 발견되면 실험을 control로 내리고, 이미 발송된 메일 링크는 유지한다.

## 남은 결정사항

- treatment에서 app bar `Join`, final CTA, opportunity card CTA까지 모두 email form으로 통일할지 결정해야 한다. 권장안은 primary CTA surfaces를 모두 email-first로 맞추는 것이다.
- Korean CTA 버튼을 제품명 일관성 때문에 `Talk to Harper`로 유지할지, locale 일관성을 위해 `Harper와 이야기하기`로 번역할지 결정해야 한다. 이 문서의 권장안은 `Harper와 이야기하기`다.
- 첫 메일 하단 링크의 표시 텍스트를 `matchharper.com/career_login`로 둘지, 실제 bridge/login URL을 그대로 노출할지 결정해야 한다. 권장안은 표시 텍스트는 짧게, HTML href는 signed URL이다.
- complete reply 직후 최종 CTA 메일만 보낼지, “검토 중” ack와 CTA 메일을 둘 다 보낼지 결정해야 한다. 권장안은 중복 메일을 피하기 위해 최종 CTA 메일만 보낸다.
