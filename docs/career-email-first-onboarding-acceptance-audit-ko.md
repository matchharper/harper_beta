# Career Email-First Onboarding 구현 판정 기준 및 감사 결과

작성일: 2026-07-16

이 문서는 `회원가입 전 이메일 수집 -> 이메일 답장 기반 정보 파싱 -> 회원가입 후 임시 user 데이터 claim -> Harper와 통화/채팅 선택` 흐름이 제대로 구현되었는지 객관적으로 판단하기 위한 기준이다. 구현이 이 기준을 만족하지 못하면 A/B test에 올리면 안 된다.

## 판정 원칙

- 지원 locale은 `ko`, `en` 두 개뿐이며, 사용자에게 보이는 신규 안내는 locale에 따라 한글 또는 영어로 나가야 한다.
- 기존 control 흐름은 깨지면 안 된다. control은 CTA 클릭 후 `/career_login?next=/career/onboarding...`으로 간다.
- treatment는 Supabase Auth 가입 전에 이메일만 받고, 이메일 답장 정보를 임시 talent user에 저장해야 한다.
- 사용자가 최종 CTA 링크로 가입/로그인하면 임시 `talent_id` 데이터가 실제 Auth `user.id`로 이전되어야 한다.
- A/B test 집계는 variant를 구분 가능한 `abtest_type`으로 남겨야 하며, email capture 이벤트가 admin에서 보이는 수치로 집계되어야 한다.
- complete reply 처리 후 worker가 generic LLM reply를 추가로 보내면 실패로 본다.

## 합격 기준

| 영역 | 합격 기준 | 현재 판정 | 코드 근거 |
| --- | --- | --- | --- |
| 실험 배정 | `career_signup_flow_v1_control`, `career_signup_flow_v1_email_first`가 별도 `abtest_type`으로 저장된다. `?signup_flow=web/email` override가 동작한다. | Pass | `src/lib/careerEmailOnboarding/constants.ts`, `src/lib/careerEmailOnboarding/experiment.ts`, `src/hooks/useCareerSignupFlowExperiment.ts` |
| 랜딩 entry 로그 | 실험 배정이 끝나기 전에는 랜딩 로그를 남기지 않고, 같은 local id로 entry/capture/login 로그가 이어진다. | Pass | `src/hooks/useCareerSignupFlowExperiment.ts`, `src/hooks/useCareerLandingStart.ts` |
| treatment UI | CTA 자리에 inline email input과 `Talk to Harper`/`Harper와 이야기하기` 버튼이 나온다. 제출 성공 후 spam 안내가 locale별로 나온다. | Pass | `src/components/landing/career/CareerLandingEmailCaptureForm.tsx`, `src/pages/index.tsx` |
| control UI | control variant에서는 기존 CTA 버튼과 login/onboarding 흐름이 유지된다. | Pass | `src/pages/index.tsx`, `src/hooks/useCareerLandingStart.ts` |
| locale 전달 | landing form request body에 `locale`, `countryLang`이 포함되고 서버가 `ko/en`으로 normalize한다. | Pass | `src/components/landing/career/CareerLandingEmailCaptureForm.tsx`, `src/lib/careerEmailOnboarding/server.ts`, `src/app/api/talent/email-onboarding/request/route.ts` |
| 첫 이메일 | 첫 이메일은 locale별 제목/본문을 사용하고, 필수 정보 4개를 요청한다. fallback login URL도 포함한다. | Pass | `src/lib/careerEmailOnboarding/server.ts` |
| 기존 가입자 이메일 | 이미 Harper 계정이 있는 이메일이면 화면은 같은 성공 상태를 보여주되, 프로필 요청 대신 로그인 링크 안내 메일을 locale별로 발송한다. | Pass | `src/lib/careerEmailOnboarding/server.ts` |
| 중복 제출 | 가입하지 않은 사용자의 같은 이메일에 이미 첫 메일이 발송된 경우에도 명시적인 재요청이면 같은 첫 안내 메일을 다시 발송한다. 기존 리드의 진행 `step`은 되돌리지 않는다. | Pass | `src/lib/careerEmailOnboarding/server.ts` |
| 답장 파싱 | grok JSON extractor가 이름, 현재 지역, opportunity type, LinkedIn/이력서/첨부, reply draft를 파싱해 임시 profile에 저장한다. | Pass | `harper_worker/email_reply/onboarding.py`, `harper_worker/tests/test_email_onboarding.py` |
| 부족 정보 요청 | 필수 정보가 부족하면 LLM reply draft로 부족한 항목만 다시 요청하고, 실패 시 locale별 fallback copy를 사용한다. | Pass | `harper_worker/email_reply/onboarding.py`, `harper_worker/localized_copy.py` |
| complete 처리 | 필수 정보가 모두 있으면 `profile_review_pending`으로 넘기고 generic LLM reply를 보내지 않는다. | Pass | `harper_worker/email_reply/onboarding.py`, `harper_worker/email_reply/worker.py` |
| review CTA 이메일 | profile ingestion 성공 시 저장된 reply draft의 `*LINK*`를 signed bridge URL로 치환해 보내고, ingestion 실패 시 fallback copy를 보낸 뒤 `awaiting_profile`로 되돌린다. | Pass | `harper_worker/email_reply/onboarding.py`, `harper_worker/localized_copy.py` |
| 로그인 보호 | email onboarding token이 있으면 메일을 받은 주소와 다른 이메일로 가입/로그인할 수 없다. | Pass | `src/pages/career_login.tsx`, `src/app/api/talent/auth/bootstrap/route.ts` |
| bridge page | 로그인 후 token claim을 호출하고, 성공 시 `Harper와 통화하기`/`채팅으로 이어가기` 또는 영어 버튼만 보여준다. | Pass | `src/pages/career/email-onboarding.tsx`, `src/app/api/talent/auth/bootstrap/route.ts` |
| 임시 user claim | 임시 `talent_id`의 profile, conversation, messages, email messages, recommendation/ops/progress 관련 참조가 실제 `user.id`로 이전된다. | Pass | `supabase/migrations/20260716143000_email_onboarding_claim_profile_and_email_tables.sql` |
| admin 집계 | admin A/B table이 signup flow variant와 email submit/sent를 집계한다. | Fixed | `src/app/api/admin/career/route.ts`, `src/components/admin/career/AdminCareerAbtestPanel.tsx`, `src/lib/adminCareerAnalytics/types.ts` |
| 렌더링 안정성 | locale별 copy array 길이가 달라도 hero title에 `undefined`가 보이면 안 된다. | Fixed | `src/pages/index.tsx` |

## 감사 중 발견해 수정한 문제

1. 영어 hero title이 한 줄인데 `copy.hero.title[1]`을 고정 렌더링하고 있어 `undefined`가 화면에 노출될 수 있었다. `Lines` 컴포넌트로 배열 길이에 맞게 렌더링하도록 수정했다.
2. admin API가 email capture 집계 로직은 갖고 있었지만 `landing_logs` 조회 필터에 `email_capture_*` 이벤트가 빠져 있었다. 조회 필터에 `email_capture_submit`, `email_capture_sent`, `email_capture_error`와 source suffix 버전을 추가했다.
3. claim SQL이 신규 Auth user 생성 시 이메일 답장에서 파싱한 이름보다 Auth display name fallback을 우선할 수 있었다. 이메일/프로필 사진은 Auth 값을 쓰되, 이름은 답장으로 파싱된 `source_row.name`을 우선하도록 수정했다.

## 남은 리스크

- 답장 파싱은 grok JSON extractor 기반이다. 모델 실패나 malformed JSON에 대비해 fallback copy는 남아 있지만, 실제 Resend inbound와 GROK_API_KEY가 설정된 staging에서 별도 smoke test가 필요하다.
- 이미 첫 이메일이 발송된 lead에 대한 재제출은 중복 발송 방지를 위해 lead metadata를 다시 갱신하지 않는다. 재방문 source/locale 분석은 `landing_logs`에 남는 capture log를 기준으로 봐야 한다.
- 실제 Resend 발송, Supabase RPC 적용, inbound webhook은 로컬 단위 테스트가 아니라 staging/production 환경 변수와 DB migration 적용 상태에서 별도 smoke test가 필요하다.

## 구현 전 최종 체크리스트

- `pnpm exec tsc --noEmit --pretty false`가 통과해야 한다.
- 관련 TS/TSX 파일 ESLint가 통과해야 한다.
- `harper_worker`의 `tests.test_email_onboarding`, `tests.test_localized_copy`가 통과해야 한다.
- migration SQL은 임시 Postgres/PGlite에서 `claim_career_email_onboarding_lead(...)`를 호출해 source temp user가 target Auth user로 이전되는지 확인해야 한다.
- `/ko?signup_flow=email`, `/en?signup_flow=email`, `/ko?signup_flow=web`, `/en?signup_flow=web`에서 UI와 CTA가 기대대로 보이는지 브라우저로 확인해야 한다.
- staging DB에 `20260716143000_email_onboarding_claim_profile_and_email_tables.sql` migration이 적용되어야 한다.
- staging에서 실제 이메일 제출 1건, 답장 complete 1건, 부족 정보 답장 1건, 회원가입 claim 1건을 smoke test해야 한다.
