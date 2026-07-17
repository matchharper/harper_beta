# Harper 서비스 상태 일일 점검 접근안

## 목적

매일 "특이사항 없는지 보고해"라는 요청에 답할 때 목표는 단순히 서버가 살아 있는지 확인하는 것이 아니다. Harper는 career agent 서비스이므로 아래 질문에 답해야 한다.

1. 사용자가 정상적으로 들어오고 있는가?
2. 가입, 제출, 온보딩 완료, 추천 생성까지 흐름이 막히지 않는가?
3. 추천과 연결이 사용자에게 실제 가치로 이어지는가?
4. 채팅, 통화, 메일 답장 등에서 새로운 신호가 잘 수집되는가?
5. 워커, LLM tool, 이메일 발송, 추천 생성 파이프라인이 실패하거나 지연되지 않는가?
6. 비용, 데이터 품질, 운영 리스크가 갑자기 나빠지지 않았는가?

따라서 일일 리포트는 "장애 감시 + 제품 건강도 + 유저 메시지 직접 판독"을 합친 형태가 되어야 한다.

## 현재 코드에서 바로 쓸 수 있는 데이터 원천

- `talent_users`: 누적 talent, 신규 가입, 마지막 로그인, resume 보유 여부.
- `talent_setting`: 온보딩 완료 여부, 추천 수신 설정, internal/external 추천 toggle, profile visibility.
- `landing_logs`: 신규 방문, 세션, job landing view, login email, UTM/source 기반 top funnel.
- `logs`: 로그인, 가입/제출 이벤트, tool call, tool failure, 기타 client event.
- `talent_messages`: 유저/assistant 채팅, 통화 transcript, profile submit 등 conversation surface.
- `talent_activity_events`: 온보딩 완료, 추천 피드백, 프로필/설정 변경 등 durable activity signal.
- `opportunity_discovery_run`: 추천 생성 run의 queued/running/completed/failed/partial 상태, 에러 메시지, coverage.
- `opportunity_scheduler_checks`: periodic refresh가 왜 실행/스킵됐는지, scheduler가 정상적으로 판단했는지.
- `opportunity_ingestion_run`: 외부 role/source ingestion의 성공/실패/partial 상태.
- `talent_opportunity_recommendation`: 추천 생성, view/click/feedback/saved stage, internal/external opportunity 타입.
- `talent_opportunity_fit`: 내부 기회 fit/hold/unfit 분포, human override, reevaluation 상태.
- `talent_opportunity_delivery`: 추천 이메일/채널 delivery 상태와 실패 메시지.
- `career_email_messages`: inbound/outbound email, auto reply, recommendation mail, failed/skipped 상태.
- `email_reply_jobs`: inbound email 처리 job의 queued/running/processed/failed/skipped 상태와 retry/last_error.
- `llm_logs`: workflow/source/model별 estimated cost, token usage, LLM usage meta.
- `official_jobs`: job landing별 view/signup funnel 해석에 필요.

이미 구현된 참고 지점:

- `src/lib/dailyUserStats.ts`: daily/weekly Slack stats의 핵심 집계.
- `src/app/api/internal/daily-user-stats/route.ts`: cron 기반 일일 Slack 발송.
- `src/app/api/admin/metrics/route.ts`: 기존 admin metrics 집계.
- `src/app/api/admin/user-analytics/route.ts`: 유저별 search/profile/chat/recommendation activity 확인.

## 재점검 결과

초안의 방향은 맞지만, 매일 실제 보고에 쓰기에는 네 가지가 부족했다.

1. **실행 순서가 약했다.** 어떤 지표를 어떤 순서로 보고, 어디서 멈춰 조사할지 더 명확해야 한다.
2. **현재 가능한 집계와 추가 계측이 섞여 있었다.** 이미 `llm_logs`, `email_reply_jobs`, `opportunity_scheduler_checks`가 있으므로 비용/메일/scheduler는 "추가 필요"가 아니라 바로 볼 수 있는 영역이다.
3. **코호트 지표와 이벤트 지표가 섞일 위험이 있었다.** 추천 생성일 기준 반응률과 반응 발생일 기준 활동량은 따로 읽어야 한다.
4. **이상 발견 후 첫 액션이 부족했다.** "문제다"에서 끝나지 않고 어느 테이블/샘플/worker를 먼저 볼지 정해야 한다.

이 문서는 위 네 가지를 보강한 운영용 기준이다.

## 일일 판단의 큰 구조

나는 매일 아래 순서로 판단한다.

1. **시스템이 일을 끝냈는지 본다.**
   queued/running이 쌓였는지, failed/partial이 늘었는지, tool failure가 튀었는지 확인한다.

2. **유저가 정상적으로 흐름을 통과했는지 본다.**
   신규 방문에서 가입, 제출, 온보딩 완료, 추천 생성까지 단계별 전환율을 본다.

3. **추천이 실제로 소비되고 반응을 얻었는지 본다.**
   추천 수만 보지 않고 view, click, positive/negative feedback, saved/connected stage를 본다.

4. **정량 지표가 설명하지 못하는 이상을 유저 메시지와 메일 원문으로 확인한다.**
   유저가 직접 불만, 혼란, 실패, 추천 품질 문제, 연결 요청을 말했는지 읽는다.

5. **어제와 최근 7일 기준선 대비로 판단한다.**
   절대값이 작을 수 있으므로 단일 일자 수치만으로 결론내리지 않는다. 특히 early-stage 서비스에서는 "전일 대비", "7일 평균 대비", "동일 요일 대비"가 더 중요하다.

## 매일 실행 Runbook

매일 리포트는 아래 순서로 만든다. 앞 단계에서 조사 필요 신호가 나오면 다음 단계로 넘어가더라도 "액션 필요"로 표시한다.

1. **기간을 고정한다.**
   기본은 전일 KST 00:00:00 이상, 오늘 KST 00:00:00 미만이다. 현재 날짜가 2026-07-16이면 기본 점검일은 2026-07-15 KST다.

2. **기존 daily stats를 먼저 본다.**
   `buildDailyUserStatsReport(date)` 또는 `/api/internal/daily-user-stats?dryRun=1&date=YYYY-MM-DD` 결과를 기준값으로 삼는다.

3. **하드 블로커를 먼저 찾는다.**
   `opportunity_discovery_run` failed/stale, 온보딩 완료 후 추천 0명, 핵심 tool failure, email delivery failure, inbound reply 미처리 job을 먼저 확인한다.

4. **funnel을 본다.**
   신규 방문, 가입, 제출, 온보딩 완료, 추천 생성, 추천 조회/클릭/피드백을 전일 및 최근 7일 평균과 비교한다.

5. **유저 메시지를 직접 읽는다.**
   high-risk conversation과 inbound email을 3~10건 직접 읽는다. 단어 포함 여부가 아니라 사용자가 좋아했는지, 문제를 느꼈는지, 기대한 가치를 받았는지 판단한다. 수치가 모두 정상이어도 최소 negative feedback, 추천 0명, tool failure 주변 대화는 확인한다.

6. **원인을 분류한다.**
   이슈가 있으면 `pipeline_failure`, `delivery_failure`, `recommendation_quality`, `conversation_quality`, `handoff_missing`, `tracking_gap`, `inventory_gap`, `cost_efficiency` 중 하나로 분류한다.

7. **보고 등급과 첫 액션을 정한다.**
   정상/주의/조사 필요/장애 후보 중 하나를 고르고, 사용자 영향이 있는 경우 affected user/run/conversation id를 남긴다.

## 계산 원칙

- 모든 daily 수치는 KST 기준으로 자른다.
- 내부 계정, 테스트 계정, `@matchharper.com` 등 제외 대상은 빼고 본다.
- event-day 지표와 cohort 지표를 섞지 않는다.
- 추천 생성 수는 `created_at` 기준 event-day 지표다.
- 추천 반응률은 가능하면 recommendation cohort 기준으로 본다. 예를 들어 2026-07-15에 생성된 추천이 D0/D1/D3 안에 view/click/feedback을 받았는지를 따로 본다.
- 당일 추천은 아직 반응 시간이 부족하므로, 당일 positive가 낮다는 이유만으로 품질 저하라고 단정하지 않는다.
- 모수가 5명/5개 미만이면 비율보다 실제 유저/추천 사례를 더 신뢰한다.
- count가 0인 지표는 두 가지로 해석한다: 실제로 아무 일도 없었거나, 계측/호출이 깨졌거나. 직전 7일 평균이 있던 지표가 갑자기 0이면 tracking gap도 의심한다.

## 핵심 지표와 판단 기준

### 1. Top Funnel

볼 지표:

- 신규 방문자 수: `landing_logs`의 `new_visit`, `new_session` unique `local_id`.
- 시작 클릭 수: landing start CTA event.
- 가입 수: `career_signup_completed` 또는 `talent_users.created_at`.
- 제출 수: `career_onboarding_submitted` 또는 `talent_messages.message_type = 'profile_submit'`.
- 온보딩 완료 수: `talent_activity_events.event_type = 'onboarding_completed'`.
- 신규 방문자 대비 가입 전환율.
- 가입 대비 제출 전환율.
- 가입 대비 온보딩 완료 전환율.
- 채팅 4번 이상 했지만 온보딩 미완료한 신규 가입자 수.

판단:

- 방문자는 정상인데 가입이 급락하면 landing, auth, CTA, copy, tracking 문제를 의심한다.
- 가입은 정상인데 제출/온보딩 완료가 급락하면 onboarding UX, 채팅 응답 품질, profile submit flow, recommendation queue 진입 문제를 의심한다.
- 채팅 4번 이상 후 이탈이 늘면 대화가 길어지지만 완료로 못 끌고 가는 상태다. 이 경우 실제 채팅을 읽어야 한다.
- 방문/가입이 모두 급락하면 유입 채널, 배포, SEO/job page, tracking 누락을 먼저 확인한다.

주의:

- 작은 모수에서는 전환율보다 실제 유저 단위 사례를 같이 봐야 한다.
- 내부 테스트 계정과 `@matchharper.com` 등 제외 대상은 빼고 본다.

### 2. Active Talent와 Engagement

볼 지표:

- Active talents: 로그인, 가입, 메시지, 메일 답장, 추천 조회/클릭/피드백/저장 중 하나라도 한 unique talent.
- High intent talents: 메시지, inbound email, 추천 클릭, 피드백, 저장/상태 변경.
- 유저 메시지 수와 unique sender 수.
- 채팅 메시지 수와 통화 transcript 수.
- inbound email 수, Harper auto reply 수.
- 재방문 유저 수: 첫 추천 이후 로그인/메시지/추천 반응이 있는 유저.

판단:

- 가입은 있는데 active/high intent가 없으면 초기 activation이 약하다.
- 메시지 unique는 비슷한데 메시지 수가 급증하면 특정 유저가 막혀서 반복 질문했을 가능성이 있다.
- inbound email이 있는데 Harper auto reply가 없거나 failed/skipped가 늘면 이메일 worker를 확인한다.
- 추천 조회/클릭이 있는데 피드백이 없으면 feedback UI, follow-up timing, 추천 카드 copy가 약할 수 있다.

### 3. Recommendation Funnel

볼 지표:

- 추천 생성 수: `talent_opportunity_recommendation.created_at`.
- 추천 생성 unique talent 수.
- 온보딩 완료 후 1시간 이상 지났는데 추천 0개인 유저 수.
- 추천 view rate: `viewed_at / recommendationCount`.
- 추천 click rate: `clicked_at / recommendationCount`.
- positive feedback rate: positive feedback / recommendationCount.
- negative feedback rate: negative feedback / recommendationCount.
- negative 후 JD click 비율: 사용자가 자세히 본 뒤 거절했는지, 카드만 보고 거절했는지 판단.
- saved/connected/applied/interviewing 등 `saved_stage` 이동.
- internal vs external 추천 비율과 반응률.

판단:

- 온보딩 완료 후 추천 0명이 1명 이상 나오면 우선 확인 대상이다. 신규 유저가 기대한 핵심 가치를 못 받은 것이다.
- 추천 수는 정상인데 view가 낮으면 delivery/UI exposure 문제다.
- view는 정상인데 click/positive가 낮으면 추천 품질 또는 카드 설명 문제가 크다.
- click은 높은데 negative가 높으면 role detail/JD에서 mismatch가 드러난 것이다. 추천 prefilter나 fit summary를 봐야 한다.
- positive가 높지만 connected/saved stage가 안 움직이면 후속 연결 액션, 이메일, ops handoff가 막힌 것이다.
- internal 추천의 거절률이 최근 7일 평균보다 크게 오르면 내부 fit 기준 또는 특정 회사/역할 mismatch를 확인한다.

초기 임계치 제안:

- `onboardingCompletedNoRecommendationUserCount >= 1`: 반드시 원인 확인.
- `opportunityDiscoveryFailedRunCount >= 1`: run별 error 확인.
- 추천 view rate가 최근 7일 평균 대비 50% 이상 하락: UI/delivery 확인.
- negative feedback rate가 최근 7일 평균 대비 2배 이상 상승: 유저 메시지와 추천 샘플 직접 판독.
- positive feedback이 0이고 추천 수가 5개 이상: 추천 품질 또는 피드백 수집 문제 확인.

### 4. Opportunity Discovery Worker 상태

볼 지표:

- `opportunity_discovery_run` status 분포: queued, running, completed, partial, failed.
- failed ratio: `failed / (completed + partial + failed)`.
- partial ratio.
- queued/running stale count: 일정 시간 이상 같은 상태인 run.
- trigger별 실패: `conversation_completed`, `immediate_opportunity_requested`, `periodic_refresh_due`.
- run_mode별 실패: initial, immediate, refresh, refine.
- error_message 상위 패턴.
- coverage에서 source별 후보 수/추천 수가 갑자기 비는지.
- `opportunity_scheduler_checks` status/skip_reasons: refresh가 의도대로 실행되거나 스킵됐는지.

판단:

- failed ratio가 높으면 서비스가 "돌아가는 척"만 하는 상태일 수 있다. 추천이 생성되지 않아도 UI는 멀쩡해 보일 수 있다.
- stale queued/running은 worker down, lock 만료, cron 누락, DB unique/dedupe 문제를 의심한다.
- partial이 늘면 완전 장애는 아니지만 추천 품질/coverage가 낮아질 수 있다.
- 특정 trigger만 실패하면 해당 진입점 또는 payload schema 문제일 가능성이 높다.
- 특정 error_message가 반복되면 개별 유저 문제가 아니라 시스템 결함으로 봐야 한다.
- scheduler check가 계속 skipped면 장애가 아니라 정책상 미실행일 수 있다. 단, skip reason이 없거나 비정상적으로 반복되면 scheduler 판단 로직을 봐야 한다.

초기 임계치 제안:

- failed run 1개 이상: 확인.
- failed ratio 5% 이상 또는 전일 대비 급증: 조사.
- running 30분 이상, queued 10분 이상: worker 상태 확인.
- initial run 실패: immediate/refresh 실패보다 더 심각하게 본다.
- scheduler check가 24시간 동안 0개: cron/scheduler 미동작 가능성 확인.

### 5. Tool / LLM 호출 상태

볼 지표:

- `logs.type LIKE 'career_tool_call:%'` tool별 call count.
- `logs.type LIKE 'career_tool_call_failed:%'` tool별 failed count.
- tool failure rate: failed / (success + failed).
- 실패 tool의 affected unique user 수.
- `llm_logs`의 source/model별 estimated cost.
- `llm_logs.meta.usage`의 input/output/total token.
- `llm_logs.meta.label`, `source`, `model` 기준 workflow별 비용 분포.
- 추천/채팅 응답에서 timeout, fallback 사용, retry 발생 여부.

판단:

- 실패율만 보지 말고 어떤 tool이 실패했는지 본다. 예를 들어 `recommend_job_postings` 실패는 추천 품질/수량에 직접 영향이 있다.
- call count가 갑자기 0이면 tool이 안정적인 게 아니라 호출 자체가 안 된 것일 수 있다.
- 특정 유저에게 failure가 집중되면 데이터 shape 문제, 전체적으로 퍼지면 provider/API/배포 문제일 가능성이 크다.
- 실패율은 낮아도 핵심 tool 하나가 실패하면 사용자 경험은 크게 망가질 수 있다.
- LLM 비용은 `estimated_cost_usd / active talent`, `estimated_cost_usd / recommendation`, `estimated_cost_usd / positive feedback`처럼 가치 지표와 같이 본다.

초기 임계치 제안:

- 전체 tool failure rate 3% 이상: watch.
- 전체 tool failure rate 10% 이상: incident 후보.
- 핵심 tool failure 1건 이상: 해당 유저의 전후 메시지를 직접 읽고 영향 확인.
- 특정 tool call count가 최근 7일 평균 대비 70% 이상 감소: 호출 경로/계측 누락 확인.
- 일 비용이 최근 7일 평균 대비 2배 이상인데 active/recommendation/positive가 같이 늘지 않음: 비용 회귀 확인.

### 6. User Message 직접 판독

정량 지표만으로는 "서비스가 잘 돌아가는지" 판단하기 어렵다. Harper는 대화형 career agent라서 매일 일부 유저 메시지와 assistant 응답을 직접 읽어야 한다. 여기서 목표는 키워드 탐지가 아니라 대화를 읽고 사용자의 상태를 해석하는 것이다.

우선 읽을 대화:

- 전일 신규 가입 후 온보딩 미완료 유저 중 메시지 4개 이상.
- 온보딩 완료 후 추천 0개인 유저.
- 추천에 negative feedback을 남긴 유저의 전후 메시지.
- tool failure가 있었던 유저의 전후 메시지.
- inbound email 또는 연결 요청을 보낸 유저.
- 메시지 수가 유난히 많은 유저.

읽고 판단할 항목:

- 유저가 Harper의 답변이나 추천을 좋아하는가, 신뢰하는가, 계속 진행하고 싶어 하는가?
- 유저가 문제를 느끼는가? 문제라면 추천 품질, 대화 품질, 정보 부족, 연결/메일, UI 이해 중 어디에 가까운가?
- 유저가 기대한 핵심 가치가 무엇인가? 좋은 회사 추천, 현재 상황 상담, 이직 방향 정리, 연결, 프로필 정리 중 무엇인가?
- Harper가 그 기대에 직접 답했는가, 아니면 일반적인 조언이나 안심성 답변으로 비껴갔는가?
- 유저가 더 말하고 싶어 하는 신호가 있는가, 아니면 피로감/부담/반복 질문을 느끼는가?
- 유저가 추천이나 회사/역할에 긍정 반응을 보였는데 후속 액션이 이어졌는가?
- 사용자가 명확히 원하는 것을 말했는데 Harper가 놓쳤는가?
- Harper가 너무 안심형 답변으로 닫아서 좋은 신호를 못 모았는가?
- 추천이 유저 선호/제약과 충돌했는가?
- 사용자가 연결 의사를 밝혔는데 follow-up이 안 됐는가?
- 유저가 "이미 말한 정보"를 다시 요구받았는가?
- 답변이 너무 길거나 질문지처럼 느껴지는가?
- assistant message에 내부 용어, score, implementation detail이 노출됐는가?
- 대화는 좋았지만 DB에 activity/preference/profile로 저장되지 않은 신호가 있는가?

판정 라벨:

- `positive_signal`: 유저가 추천/대화/연결에 긍정적이고 다음 행동 의사가 보인다.
- `neutral_progress`: 큰 문제는 없고 대화가 자연스럽게 진행 중이다.
- `confused`: 유저가 다음 단계, 추천 위치, Harper가 해주는 일을 헷갈려 한다.
- `dissatisfied`: 유저가 추천 품질, 답변, 흐름에 불만을 느낀다.
- `blocked`: 유저가 원하는 일을 하려 했지만 시스템/운영/답변이 막았다.
- `missed_opportunity`: 유저가 중요한 신호를 줬는데 Harper가 저장/추가 질문/후속 액션으로 연결하지 못했다.
- `handoff_needed`: 사람이 개입하거나 연결/메일/ops 액션이 필요하다.

운영 방식:

- Slack 일일 리포트에는 원문 전문을 붙이지 않는다.
- 내부 확인용으로는 유저 ID, conversation ID, message ID, 짧은 발췌, 판단, 액션을 남긴다.
- 개인정보/민감정보는 필요 이상으로 복사하지 않는다.
- "문제 있음"으로 판단한 대화는 원인 범주를 붙인다: `answer_quality`, `missing_context`, `tool_failure`, `recommendation_mismatch`, `handoff_missing`, `ux_confusion`, `tracking_gap`.

### 7. Email / Connection 운영 상태

볼 지표:

- `career_email_messages` outbound sent/failed/skipped.
- inbound reply count.
- auto_reply count와 failed/skipped.
- `email_reply_jobs` status, attempts, last_error, skip_reason, processed_at.
- `talent_opportunity_delivery` email status: sent/failed/pending.
- recommendation mail을 받은 unique user 수.
- internal connection recommendation의 accepted/rejected/no response.
- accepted 후 `saved_stage = connected` 등 후속 상태 반영 여부.

판단:

- inbound가 있는데 auto_reply가 없으면 메일 reply worker 또는 routing을 봐야 한다.
- `email_reply_jobs`가 queued/locked 상태로 오래 남아 있으면 worker lock 또는 provider 문제가 우선이다.
- outbound failed가 1건 이상이면 provider/recipient/domain/retry 상태를 확인한다.
- accepted가 있는데 connected stage가 안 바뀌면 ops handoff 누락 가능성이 있다.
- recommendation mail 발송 수가 0인데 추천은 생성됐다면 delivery layer 문제다.
- skipped는 항상 장애가 아니다. 단, skip_reason 없이 skipped가 늘거나 특정 kind에서 반복되면 처리 정책/분기 문제를 본다.

### 8. Internal Opportunity Fit / Ops Review

볼 지표:

- `talent_opportunity_fit` label 분포: fit, hold, ambiguous, dissatisfied, unfit.
- human_label override 수와 방향.
- hold row 수와 오래된 hold.
- role/company별 fit/hold/negative 분포.
- reevaluation 대상인데 `reevaluation_checked_at`이 오래된 row.
- internal recommendation의 positive/negative/no response.

판단:

- hold가 계속 쌓이면 Harper가 질문해야 할 missing signal을 충분히 회수하지 못하는 상태다.
- fit 비율이 갑자기 높아지면 기준이 느슨해졌을 수 있고, negative가 같이 오르면 실제 품질 문제다.
- 특정 role에서 negative가 집중되면 role 설명, fit rubric, company expectation을 재검토한다.
- human override가 잦은 회사/역할은 모델 기준과 ops 기준이 어긋난 것이다.

### 9. Data Freshness / Inventory

볼 지표:

- active company_roles 수.
- expired role이 추천 후보에 섞이는지.
- `opportunity_ingestion_run` status, failed/partial/stale run.
- `opportunity_source_document` provider/source_type/status/fetched_at/expires_at.
- company_data confidence, stale company data.
- official_jobs published 수와 job landing별 view/signup.
- 외부 추천 후보 source coverage.

판단:

- 추천 품질 저하는 LLM 문제가 아니라 inventory 문제일 수 있다.
- active role 수가 줄거나 특정 source ingestion이 실패하면 추천 다양성이 줄어든다.
- 회사/역할 데이터가 오래되면 카드 설명은 그럴듯해도 실제 연결 품질이 낮아진다.
- source document가 오래됐거나 expired인데 계속 쓰이면 추천 근거가 낡았을 수 있다.

### 10. Cost / Usage

볼 지표:

- `llm_logs` source/model별 호출 수, input/output token, estimated cost.
- worker run당 평균/상위 p95 비용.
- provider별 fallback/timeout/retry.

판단:

- 비용은 active user나 recommendation 수로 정규화해서 본다.
- 비용이 늘었는데 추천/positive가 늘지 않으면 비효율이다.
- `llm_logs`는 best-effort insert이므로 0건이면 실제 호출이 없었는지, 로깅이 누락됐는지 같이 확인한다.

## "특이사항 없음" 판단 조건

아래를 모두 만족하면 "큰 특이사항 없음"으로 보고한다.

- failed/partial/stale run이 없거나, 있어도 원인이 확인됐고 영향이 작다.
- tool failure rate가 최근 기준선 안에 있고 핵심 tool 실패가 없다.
- 온보딩 완료 후 추천 0명인 유저가 없다.
- 가입, 제출, 온보딩 완료, 추천 view/click/feedback 전환율이 최근 7일 범위에서 크게 벗어나지 않는다.
- negative feedback이 급증하지 않는다.
- inbound email/연결 요청이 누락되지 않았다.
- 직접 읽은 유저 메시지에서 명백한 product failure, hallucination, handoff 누락, 내부 정보 노출이 없다.
- 비용이 전일 또는 7일 평균 대비 비정상적으로 튀지 않는다.

## 결론 작성 원칙

일일 보고의 첫 줄은 반드시 강한 판정이어야 한다. 수치를 먼저 늘어놓지 않는다.

허용되는 첫 문장:

- **문제 없습니다.** 핵심 경로가 정상이고 유저 메시지에서도 부정 신호가 없습니다.
- **문제 있습니다.** 무엇이 깨졌고 누구/어떤 흐름에 영향이 있었는지 바로 말합니다.
- **장애 후보입니다.** 여러 유저 또는 핵심 경로에 반복 영향이 있어 즉시 확인이 필요합니다.
- **주의입니다.** 지금 당장 깨진 것은 아니지만, 특정 지표나 유저 반응이 나빠지고 있습니다.

첫 문장에 반드시 포함할 것:

- 문제 여부: 없다 / 있다 / 장애 후보 / 주의.
- 핵심 원인: 예를 들어 `refresh 실패`, `추천 0명`, `만료 공고`, `메일 미처리`.
- 사용자 영향: 예를 들어 `신규 온보딩 유저`, `추천 받은 유저`, `직접 연결 수락 유저`.

피해야 할 표현:

- "대체로 정상입니다"로 시작한 뒤 뒤에 큰 실패를 붙이는 것.
- "보입니다", "가능성이 있습니다"만 반복하고 판정을 흐리는 것.
- 수치만 나열하고 그래서 좋은 날인지 나쁜 날인지 말하지 않는 것.
- 문제가 없는데도 불필요하게 조심스러운 표현으로 불안하게 만드는 것.

문제가 없으면 아래처럼 강하게 쓴다.

```text
문제 없습니다. 어제 핵심 경로는 정상입니다: 온보딩 완료자는 모두 추천을 받았고, failed/stale run과 tool/email 실패가 없었습니다. 직접 읽은 유저 메시지도 positive_signal/neutral_progress 중심이고, 놓친 handoff는 없었습니다.
```

문제가 있으면 아래처럼 강하게 쓴다.

```text
문제 있습니다. refresh run 324건이 실패했고 원인은 provider 잔액 부족입니다. 신규 추천 생성 자체는 됐지만, 주기적 추천 갱신 흐름은 깨졌으므로 잔액 복구와 failed refresh 재처리가 필요합니다.
```

## 보고 등급

### 정상

지표가 최근 7일 기준선 안에 있고, 실패/누락/유저 메시지 판독 이슈가 없다. 이 경우 애매하게 말하지 말고 "문제 없습니다"라고 시작한다.

보고 예:

> 문제 없습니다. 전일 온보딩 완료자 모두 추천을 받았고, failed/stale run과 tool/email 실패가 없습니다. 직접 읽은 유저 메시지도 긍정 또는 자연 진행 중심이라 놓친 후속 액션은 없습니다.

### 주의

장애는 아니지만 추세가 나쁘거나 모수가 작아도 확인이 필요한 신호가 있다.

예:

- negative feedback 2건 이상 또는 최근 대비 상승.
- 채팅 4회 이상 후 이탈 유저 증가.
- tool failure가 핵심 기능에서 1건 발생했지만 retry/대체 경로로 복구됨.
- 추천 view rate 급락.

보고 예:

> 주의입니다. 핵심 경로는 깨지지 않았지만 negative feedback이 최근 기준보다 늘었습니다. 직접 읽은 메시지에서는 만료 공고와 조건 불일치 불만이 보여, 추천 품질 쪽 확인이 필요합니다.

### 조사 필요

사용자 가치 전달이 실제로 막혔거나 반복 가능성이 있다.

예:

- 온보딩 완료 후 추천 0명.
- failed opportunity run 발생.
- stale queued/running run 존재.
- inbound email/accepted response 후 follow-up 누락.
- 직접 읽은 채팅에서 명확한 답변 실패 또는 추천 mismatch 발견.

보고 예:

> 문제 있습니다. 온보딩 완료 후 추천을 받지 못한 유저가 발생했고, 직접 읽은 대화에서도 유저가 다음 추천을 기다리는 상태였습니다. 추천 run 생성/완료 여부와 affected user follow-up을 확인해야 합니다.

### 장애 후보

여러 유저에게 영향을 주거나 핵심 경로가 멈췄다.

예:

- failed ratio 10% 이상.
- 추천 생성이 전일 대비 거의 0으로 감소했는데 온보딩/요청은 있음.
- tool failure가 여러 유저에게 확산.
- email delivery 실패 다수.
- auth/signup/submit funnel이 갑자기 붕괴.

보고 예:

> 장애 후보입니다. 동일 원인의 failed run이 여러 유저에게 반복 발생했고 핵심 추천 갱신 흐름이 깨졌습니다. 즉시 원인 복구, failed run 재처리, affected user 범위 확인이 필요합니다.

## 이슈별 첫 확인 지점

| 신호 | 먼저 볼 것 | 판단 포인트 | 첫 액션 |
| --- | --- | --- | --- |
| 온보딩 완료 후 추천 0명 | `talent_activity_events`, `opportunity_discovery_run`, `talent_opportunity_recommendation` | run이 안 만들어졌는지, failed인지, completed인데 추천이 0인지 | affected user와 run id를 잡고 재처리/수동 follow-up 필요 여부 판단 |
| failed run 발생 | `opportunity_discovery_run.error_message`, `coverage`, worker log | 같은 에러가 반복되는지, 특정 trigger/run_mode인지 | 반복 에러면 worker/provider/schema 이슈로 분류 |
| queued/running stale | `opportunity_discovery_run.created_at/started_at`, worker process | worker가 claim하지 못했는지, lock이 남았는지 | worker 상태 확인, stale run 재처리 기준 판단 |
| tool failure 증가 | `logs`의 `career_tool_call_failed:%`, 해당 유저 대화 | 핵심 tool인지, 특정 유저 데이터 문제인지 | tool별 failure sample과 affected user 확인 |
| 추천 view 급락 | `talent_opportunity_recommendation.viewed_at`, `talent_opportunity_delivery`, UI 배포 | 추천은 생성됐는데 노출/메일이 안 됐는지 | delivery/UI exposure 확인 |
| negative 증가 | recommendation row, `feedback_reason`, 클릭 여부, 전후 채팅 | 카드 mismatch인지 JD mismatch인지, 특정 role/source인지 | 추천과 전후 유저 메시지 5건을 직접 읽고 role/source/rubric 분류 |
| inbound email 미처리 | `career_email_messages`, `email_reply_jobs` | job 미생성, queued/locked, failed/skipped 중 무엇인지 | reply worker와 last_error 확인 |
| 비용 급증 | `llm_logs.source/model/meta.usage` | 특정 workflow/model/source가 원인인지 | source별 cost diff 확인 |
| 유입 급락 | `landing_logs`, 배포, source/UTM | 실제 유입 감소인지 tracking 누락인지 | source별 local_id와 page별 event 비교 |
| 채팅 이탈 증가 | `talent_messages`, `talent_conversations.stage`, submit event | 답변 품질 문제인지 CTA/완료 조건 문제인지 | 대화 원문을 직접 읽고 prompt/UX 분류 |

## 일일 리포트 템플릿

```text
[Harper Daily Health] YYYY-MM-DD KST

결론:
- 문제 없습니다 / 주의입니다 / 문제 있습니다 / 장애 후보입니다
- 이유: 가장 중요한 원인 1개
- 사용자 영향: 없음 / 일부 유저 / 다수 유저 / 핵심 경로 영향
- 오늘 액션: 없음 / 확인 필요 / 즉시 조치

핵심 수치:
- 신규 방문 N, 가입 N, 제출 N, 온보딩 완료 N
- active talents N, high-intent talents N
- 유저 메시지 N개 / unique N명
- 추천 N개, view N%, click N%, positive N%, negative N%
- internal 추천 N개, 수락 N, 거절 N
- opportunity run failed N, stale queued/running N
- tool failure N건, failure rate N%
- 메일 발송 N, inbound reply N, Harper auto reply N
- LLM cost $N, 7일 평균 대비 N%

특이사항:
- 문제 없음이면: "없음"이라고 명확히 쓴다.
- 문제 있으면: `무엇이 깨짐 -> 사용자 영향 -> 필요한 액션` 순서로 쓴다.

유저 메시지 직접 판독:
- 대화 N건 직접 판독
- positive_signal / neutral_progress / confused / dissatisfied / blocked / missed_opportunity / handoff_needed
- 유저가 좋아했는지, 문제를 느꼈는지, 기대한 가치를 받았는지 한 문장으로 판정
- 문제 있으면 conversation/message id, 판단 근거, 액션

액션:
- 없으면 "오늘 액션 없음"이라고 쓴다.
- 있으면 owner/action/id를 쓴다.
```

## 유저 메시지 판독 기록 형식

채팅과 메일 원문을 읽은 뒤에는 아래 정도만 남긴다. Slack에는 개인정보나 긴 원문을 붙이지 않는다.

```text
- userId:
  conversationId:
  userReaction:
  valueReceived:
  problemFelt:
  evidence:
    - messageId:
      shortQuote:
  classification:
  judgment:
  action:
```

`classification`은 아래 중 하나를 쓴다.

- `answer_quality`: 답변이 부정확하거나 도움이 안 됨.
- `missing_context`: 필요한 커리어 신호를 못 물었거나 저장하지 못함.
- `tool_failure`: tool/API 실패가 대화 품질에 영향.
- `recommendation_mismatch`: 추천이 선호/제약/경력과 맞지 않음.
- `handoff_missing`: 연결/메일/ops follow-up이 빠짐.
- `ux_confusion`: 사용자가 다음 행동을 이해하지 못함.
- `tracking_gap`: 실제 행동과 로그/DB 상태가 맞지 않음.
- `inventory_gap`: 좋은 추천을 만들 role/source가 부족함.

## 자동화 개선 항목

현재 `dailyUserStats`가 이미 많은 것을 제공하지만, "특이사항 없는지"를 정확히 판단하려면 아래 항목을 daily report에 더 붙이는 편이 좋다. 여기서는 이미 DB에 있는 원천으로 바로 만들 수 있는 것과, 추가 계측이 필요한 것을 구분한다.

### 1. Stale run 집계

상태: 바로 구현 가능.

필요 데이터:

- `queued`가 10분 이상인 run.
- `running`이 30분 이상인 run.
- run별 `id`, `talent_id`, `trigger`, `run_mode`, `created_at`, `started_at`, `error_message`.

이유:

- failed로 끝나지 않은 장애를 잡기 위해 필요하다. queued/running에 오래 머무는 장애는 실패율만 보면 드러나지 않는다.

### 2. User message reader

상태: 대부분 바로 구현 가능. 단, 판독 판단을 LLM으로 자동 초안화하려면 별도 스크립트가 필요하다.

필요 데이터:

- 전일 high-risk conversation 목록 자동 생성.
- 각 conversation의 최근 user/assistant message 5~10개.
- 관련 recommendation/failed tool/run 정보 join.
- 판독 결과를 `output/daily_health/YYYY-MM-DD.md` 같은 로컬 파일로 저장.
- 각 conversation에 `userReaction`, `valueReceived`, `problemFelt`, `classification`, `action`을 기록.

이유:

- 정량 지표는 "왜"를 설명하지 못한다. 특히 추천 품질과 대화 품질은 유저 메시지를 읽고 판단해야 한다.

### 3. Recommendation cohort retention

상태: view/click/feedback은 바로 구현 가능. email open은 현재 명시적 open tracking이 없으면 추가 계측 필요.

필요 데이터:

- 추천 생성 cohort 기준 D0/D1/D3 view/click/feedback.
- 메일 발송 cohort 기준 sent/reply.
- open tracking이 있으면 open/click/reply, 없으면 sent/reply만 본다.

이유:

- 당일 생성 추천은 아직 반응 시간이 부족할 수 있다. 생성일과 반응일을 분리해야 한다.

### 4. Source/inventory health

상태: 대부분 바로 구현 가능.

필요 데이터:

- active role 수, 신규 role 수, expired role 수.
- `opportunity_ingestion_run` failed/partial/stale.
- `opportunity_source_document` stale/expired.
- external/internal source별 후보 수와 추천 수.

이유:

- 추천 품질 문제의 원인이 모델이 아니라 inventory 부족일 수 있다.

### 5. LLM cost by workflow

상태: 비용과 token은 `llm_logs`로 바로 구현 가능.

필요 데이터:

- chat, onboarding, opportunity discovery, internal fit, email reply별 호출 수/비용/token.
- timeout, retry, fallback 여부.

이유:

- 비용이 늘어도 가치 지표가 같이 늘지 않으면 개선이 필요하다.

## 매일 실제로 내가 내릴 판단 예시

### 예시 1: 실패율은 낮지만 좋지 않은 날

상황:

- tool failure rate 0%.
- opportunity failed run 0개.
- 신규 가입 8명, 온보딩 완료 5명.
- 추천 20개 생성.
- view 2개, positive 0개.
- 직접 읽은 채팅 2건에서 유저가 "추천이 생성됐는지/어디서 보는지"를 이해하지 못하고 기다리는 상태.

판단:

- 주의입니다. 시스템 장애는 아니지만 제품 가치 전달이 약하다.
- 추천이 생성됐는데 노출/전달이 안 됐거나, 유저가 추천 위치를 모른다.
- UI exposure, email delivery, completion message를 확인한다.

### 예시 2: 수치는 좋아 보이지만 품질 이슈가 있는 날

상황:

- 추천 30개, view 20개, click 12개.
- negative 6개, positive 0개.
- negative 중 4개가 JD click 이후 발생.

판단:

- 문제 있습니다. 노출은 잘 됐지만 추천 품질이 나쁘다.
- 카드에서 좋아 보였으나 JD를 열면 mismatch가 드러났다는 뜻이다.
- fit rubric, role freshness, preference constraints, external selector를 확인한다.

### 예시 3: 실패율이 높은 날

상황:

- opportunity run failed 3개.
- failed ratio 18%.
- error_message가 같은 provider timeout.
- 온보딩 완료 후 추천 0명 2명.

판단:

- 장애 후보입니다.
- worker/provider timeout이 추천 생성 실패로 사용자 가치 전달을 막았다.
- retry/fallback, failed run 재처리, affected user follow-up이 필요하다.

### 예시 4: 채팅이 많지만 완료가 낮은 날

상황:

- 신규 가입 6명.
- 신규 가입 중 채팅 4회 이상 이탈 3명.
- 직접 읽어보니 유저는 커리어 방향 정리를 원했지만, Harper가 질문만 이어가고 제출/완료 또는 추천 시작으로 안내하지 못함.

판단:

- 문제 있습니다. 대화 engagement는 있지만 onboarding completion UX가 약하다.
- assistant response policy 또는 submit CTA/timing 문제다.
- completion 조건, profile_submit flow, 대화 마무리 문구를 확인한다.

### 예시 5: 정말 문제가 없는 날

상황:

- failed/stale run 0개.
- tool/email 실패 0건.
- 온보딩 완료자 모두 추천 수신.
- 추천 반응률이 최근 7일 기준선 안.
- 직접 읽은 대화가 `positive_signal` 또는 `neutral_progress` 중심이고, handoff 누락 없음.

판단:

- 문제 없습니다. 핵심 경로가 정상이고 유저 메시지에서도 불만/혼란/후속 누락이 보이지 않는다.
- 이 경우 불필요한 추측을 덧붙이지 않고, 정상 근거만 짧게 보고한다.

## 우선순위

가장 먼저 자동화해야 할 순서:

1. 기존 `dailyUserStats`에 hard blocker를 추가한다: stale run, failed ratio, 온보딩 완료 후 추천 0명 상세, email reply job 미처리.
2. scheduler/ingestion 상태를 추가한다: scheduler check 0건, ingestion failed/partial/stale.
3. 전일 high-risk conversation reader를 만든다: 추천 0명, negative feedback, tool failure, 채팅 4회 이상 이탈, inbound email을 직접 읽을 수 있게 묶는다.
4. reader 결과에 `userReaction`, `valueReceived`, `problemFelt`, `classification`, `action`을 기록한다.
5. 추천 cohort별 view/click/feedback을 D0/D1/D3로 분리한다.
6. internal opportunity fit label/hold/override 분포와 오래된 hold를 daily report에 추가한다.
7. `llm_logs` 기반 source/model별 비용과 token을 붙인다.
8. 최종적으로 daily report가 "정상/주의/조사 필요/장애 후보"를 자동 제안하되, 유저 메시지 판독 판단은 사람이 검토할 수 있게 남긴다.

## 최종 운영 원칙

- "추천이 몇 개 생성됐다"보다 "적절한 유저에게 제때 도착했고 반응이 있었는가"를 본다.
- "failed가 없다"보다 "핵심 사용자 흐름이 끝까지 갔는가"를 본다.
- "평균"보다 "막힌 유저가 누구인지"를 본다.
- "모델이 답했다"보다 "다음 추천/연결 품질에 쓸 신호가 저장됐는가"를 본다.
- 숫자로 이상을 찾고, 채팅/메일 원문으로 원인을 확인한다.
