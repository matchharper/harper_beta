# Career Opportunity Recommendation Architecture

## 목표

대화 온보딩이 끝난 뒤 혹은 주기적으로 Harper가 사용자의 이력, 선호, 현재 상황을 바탕으로 좋아할 만한 회사와 채용공고를 찾아 추천한다. 추천은 단순 링크 목록이 아니라 다음을 포함해야 한다.

- 이 회사가 무엇을 하는지
- 이 Role이 실제로 어떤 일을 요구하는지
- 왜 이 사용자에게 맞을 가능성이 높은지
- 어떤 부분은 조심해야 하는지
- 어떤 근거를 보고 그렇게 판단했는지

핵심 방향은 모든 공고를 사전에 전부 크롤링할 수는 없다는 것이다. DB에 있는 공고와 회사 정보는 먼저 사용하되, 커버리지가 부족하면 사용자별로 필요한 검색을 즉시 실행하고, 발견한 결과를 DB에 저장해서 다음 추천에 재사용한다.

## 결론

가능하다. 다만 추천을 채팅 응답 안에서 동기적으로 끝내려 하면 느리고 불안정해진다. 별도의 `opportunity_discovery_run`을 만들고, 대화 종료 시점이나 추천 trigger가 발생한 시점에 비동기 작업으로 실행하는 구조가 맞다.

추천 시스템은 세 단계로 나누는 것이 좋다.

1. `DB-first`: 이미 알고 있는 회사, 내부 제안, 이전에 발견한 외부 공고를 먼저 조회한다.
2. `On-demand discovery`: DB 결과가 부족하거나 사용자의 직군/선호가 새로우면 웹 검색과 커리어 페이지 탐색을 실행한다.
3. `Persisted recommendation`: 발견한 회사/공고/근거/추천 설명을 정규화해서 DB에 저장하고 `/career/history` 또는 별도 기회 화면에 노출한다.

구현 경계는 분명하게 나눈다. `harper_beta` client는 추천 run 생성, 검색 중 UI, 입력 잠금, 결과 카드 렌더링만 담당한다. 공고 검색, 채용 사이트 fetch, ATS parsing, dedupe, LLM 요약/랭킹, DB upsert는 worker에서 처리한다. 검색 로직을 client request에 묶지 않는다.

이렇게 하면 개발자 공고만 미리 모아둔 상태에서 디자이너가 들어와도 대응할 수 있다. 디자이너에게 필요한 회사군과 키워드를 그 시점에 만들고, 검색 결과를 저장해 이후 유사 유저에게 재사용한다.

기본 추천 단위는 한 번에 10개로 둔다. 단, 이 값은 사용자별 설정으로 바꿀 수 있어야 한다. 주기 추천도 지원하되, 매번 무조건 새 공고를 밀어 넣는 것이 아니라 설정된 주기마다 추천 run을 만들고 품질 기준을 통과한 후보만 노출한다. 사용자가 대화 중 “요즘 적극적으로 보고 있으니 자주 찾아줘”, “한 번에 5개만 줘”, “2주에 한 번이면 돼”처럼 말하면 이 설정도 업데이트한다.

## 현재 코드와 맞물리는 지점

이미 다음 구조가 있다.

- `company_workspace`: 회사 단위 저장소
- `company_roles`: 내부/외부 Role 공통 저장소
- `talent_opportunity_recommendation`: 유저별 추천 히스토리
- `src/lib/talentOpportunity.ts`: 추천 히스토리 조회/피드백 업데이트
- `src/app/api/talent/opportunities/route.ts`: 추천 조회, 저장/거절/클릭/조회 상태 업데이트
- `CareerHistoryPanel`: 추천된 기회를 `new`, `saved`, `archived`로 보여주는 UI

`company_roles`에는 이미 `source_type`, `source_provider`, `source_job_id`, `external_jd_url`, `posted_at`, `expires_at`, `location_text`, `work_mode`가 있다. 따라서 외부 공고를 저장할 기본 틀은 존재한다.

초기 구현에서는 이 구조를 유지하고, 아래 레이어를 추가하는 것이 좋다.

- 발견 실행 단위: 어떤 유저를 위해 어떤 검색을 돌렸는지
- 원본 근거 단위: 어떤 URL과 텍스트를 보고 판단했는지
- 정규화된 회사/Role 정보: 중복 제거 후 기존 테이블에 반영
- 추천 설명 단위: 유저에게 보여줄 이유, 리스크, confidence

## Worker 분리 원칙

공고 추천 및 검색 로직은 worker로 분리한다. `harper_beta` 안의 API route는 run을 만들고 worker에 enqueue하는 얇은 orchestration layer로 둔다.

worker는 두 종류로 나눈다.

1. **Global ingestion worker**
   - 유저와 무관하게 주기적으로 공고 DB를 업데이트한다.
   - 회사 career URL, ATS, LinkedIn/Wanted/JobKorea/Saramin 같은 source를 돌며 새 공고를 넣고, 기존 공고가 닫혔으면 `ended` 처리한다.

2. **User recommendation worker**
   - 특정 유저의 대화/선호/피드백을 기준으로 추천 batch를 만든다.
   - DB에 이미 있는 공고를 먼저 쓰고, 부족하면 on-demand discovery를 수행한다.
   - on-demand에서 새로 넓어진 검색 범위는 global ingestion worker가 앞으로 계속 업데이트할 scope로 저장한다.

Client 책임:

- 대화 중 trigger 감지 결과를 서버에 전달
- `POST /api/talent/opportunity-runs` 호출
- active run이 있으면 입력/전화/음성 비활성화
- `[검색중...]` UI 표시
- 완료된 preview message와 `OpportunityCard` 렌더링
- 카드 feedback action 호출

API route 책임:

- 인증/권한 확인
- 중복 run 방지
- `opportunity_discovery_run` insert
- worker enqueue
- latest run status 응답

Worker 책임:

- global ingestion run 처리
- `user_brief` 생성
- `query_plan` 생성
- DB 후보 조회
- source registry 기반 on-demand discovery
- user-triggered discovery scope를 global update scope로 승격
- 채용 사이트/ATS/job board fetch
- parser 실행
- source document 저장
- company/role upsert
- dedupe/freshness check
- 추천 ranking
- 추천 이유 생성
- `talent_opportunity_recommendation` 저장
- chat preview message/card mapping 생성
- run status를 `completed`, `partial`, `failed`로 마무리

현재 구현에서는 worker 실행 코드를 Next.js repo 안에 두지 않는다. `harper_beta`는 run row 생성과 상태 조회만 담당하고, 실제 공고 검색, 페이지 fetch, parsing, DB upsert, 추천 생성은 `harper_worker/opportunity_worker.py`에서 Python으로 처리한다.

## 제안 데이터 모델

### `opportunity_discovery_run`

대화 종료 후 실행되는 추천 작업의 상태를 저장한다.

필드 예시:

- `id`
- `talent_id`
- `conversation_id`
- `status`: `queued`, `running`, `completed`, `failed`, `partial`
- `trigger`: `conversation_completed`, `immediate_opportunity_requested`, `all_batch_feedback_submitted`, `preference_became_more_active`, `periodic_refresh_due`
- `run_mode`: `initial`, `immediate`, `refine`, `refresh`
- `target_recommendation_count`: 해당 run에서 목표로 하는 추천 개수
- `chat_preview_count`: 추천 완료 후 대화창에 바로 보여줄 카드 개수, 기본 3
- `settings_snapshot`: run 생성 시점의 추천 개수/주기 설정
- `trigger_payload`: 대화 중 변경된 조건, 즉시 요청 문장, 피드백 요약 등
- `user_brief`: 추천에 사용할 유저 요약 JSON
- `query_plan`: 검색 계획 JSON
- `coverage`: DB 결과 수, 신규 검색 결과 수, 최종 추천 수
- `error_message`
- `started_at`
- `completed_at`
- `created_at`

이 테이블이 있어야 “지금 찾는 중”, “일부만 찾음”, “추천이 없었음”, “다시 찾기”를 제품에서 안정적으로 표현할 수 있다.

`target_recommendation_count`는 기본 10개다. 다만 품질 기준을 통과한 후보가 10개보다 적으면 낮은 품질의 공고로 억지로 채우지 않는다. 이 경우 run은 `partial`로 끝날 수 있고, `coverage.finalRecommendations`에 실제 추천 개수를 남긴다. 추천 완료 후 채팅창에는 전체 batch 중 상위 3개만 `OpportunityCard`로 먼저 보여준다. 나머지 추천은 `/career/history`나 기회 목록에서 확인하게 한다.

### `opportunity_ingestion_run`

유저 추천과 무관하게 공고 DB를 주기적으로 최신화하는 global run이다.

필드 예시:

- `id`
- `status`: `queued`, `running`, `completed`, `failed`, `partial`
- `trigger`: `scheduled_refresh`, `manual_admin_refresh`, `scope_expanded`
- `source_scope`: 실행 대상 provider/source/scope 요약
- `coverage`: checked sources, fetched pages, inserted roles, updated roles, expired roles
- `started_at`
- `completed_at`
- `error_message`
- `created_at`

이 run은 추천을 직접 만들지 않는다. 역할은 `company_roles`, `company_workspace`, `opportunity_source_document`, `opportunity_source_registry`를 최신 상태로 유지하는 것이다.

### `talent_recommendation_settings`

사용자별 추천 개수와 주기를 저장한다. 화면 설정에서도 바꿀 수 있고, 대화 중 사용자의 명시적 요청으로도 바뀔 수 있다.

필드 예시:

- `talent_id`
- `recommendation_batch_size`: 기본 10
- `periodic_enabled`: 기본 true
- `periodic_interval_days`: 기본 7
- `last_periodic_run_at`
- `updated_by`: `user_settings`, `conversation`, `admin`
- `source_conversation_id`
- `created_at`
- `updated_at`

권장 guardrail:

- `recommendation_batch_size`: 1-20
- `periodic_interval_days`: 1-30
- 대화 중 설정을 바꿀 때는 “추천 설정을 이렇게 바꿔둘게요”라고 짧게 확인 메시지를 남긴다.
- 모호한 말은 설정 변경으로 보지 않는다. 예를 들어 “좋은 거 있으면 알려줘”는 periodic 설정 변경이 아니라 일반 선호 신호다.

### `opportunity_source_document`

웹에서 찾은 원본 문서와 근거를 저장한다.

필드 예시:

- `id`
- `source_url`
- `source_type`: `job_posting`, `career_page`, `company_homepage`, `news`, `interview_article`
- `provider`: `search_api`, `greenhouse`, `lever`, `ashby`, `workable`, `greeting`, `ninehire`, `wanted`, `linkedin`, `jobkorea`, `saramin`, `jumpit`, `rallit`, `rocketpunch`, `company_career_page`, `manual`
- `content_hash`
- `raw_title`
- `raw_text_summary`
- `fetched_at`
- `expires_at`
- `status`: `fresh`, `stale`, `blocked`, `not_found`, `parse_failed`

원문 전체를 무조건 저장하기보다 요약, 구조화 결과, URL, hash를 저장하는 쪽이 안전하다. 필요할 때 다시 fetch할 수 있게 source URL과 fetch metadata는 남긴다.

### `opportunity_source_registry`

DB 밖의 채용 공고를 효율적으로 찾기 위한 source catalog다. 한국 채용 공고는 완전히 무작위 웹에 흩어져 있다기보다 Wanted, LinkedIn, JobKorea, Saramin, Jumpit, Rallit, RocketPunch, 각 회사 채용 페이지, 그리고 Greenhouse/Lever/Ashby/Greeting/Ninehire 같은 ATS에 많이 모인다. 이 특성을 이용해 “검색 API로 웹 전체를 매번 뒤지는 방식”을 fallback으로 낮춘다.

필드 예시:

- `id`
- `provider`: `wanted`, `linkedin`, `jobkorea`, `saramin`, `jumpit`, `rallit`, `rocketpunch`, `greenhouse`, `lever`, `ashby`, `greeting`, `ninehire`, `company_career_page`, `search_api`
- `company_workspace_id`
- `base_url`
- `search_url_template`
- `parser_type`
- `role_family_tags`
- `keyword_tags`
- `location_tags`
- `company_archetype_tags`
- `priority`
- `demand_score`
- `enabled`
- `allowed_access_mode`: `api`, `public_page`, `manual`, `blocked`
- `rate_limit_per_minute`
- `default_ttl_hours`
- `refresh_interval_hours`
- `next_refresh_at`
- `created_from_run_id`
- `last_checked_at`
- `last_success_at`
- `last_error`

MVP에서는 `docs/list.md`에 있는 회사명/LinkedIn/career URL을 seed로 registry를 만들 수 있다. 운영하면서 사용자가 클릭하거나 추천에 자주 등장하는 회사의 career URL을 registry에 추가한다.

### `opportunity_market_scan_scope`

job board나 검색 API처럼 “회사 하나의 career URL”이 아니라 “시장 범위 검색”이 필요한 source를 저장한다. 예를 들어 LinkedIn에서 `Engineer Korea`, Wanted에서 `GTM Seoul`, JobKorea에서 `AI Business Development`를 주기적으로 확인하는 단위다.

필드 예시:

- `id`
- `provider`: `linkedin`, `wanted`, `jobkorea`, `saramin`, `jumpit`, `rallit`, `rocketpunch`, `search_api`
- `query`
- `role_family`
- `excluded_role_family`
- `location`
- `company_archetype`
- `keyword_tags`
- `priority`
- `demand_score`
- `enabled`
- `allowed_access_mode`: `api`, `public_page`, `manual`, `blocked`
- `refresh_interval_hours`
- `next_refresh_at`
- `created_from`: `seed`, `admin`, `user_discovery_run`
- `created_from_run_id`
- `last_checked_at`
- `last_success_at`
- `last_error`

예:

- LinkedIn에서 `Engineer Korea`
- Wanted에서 `GTM AI startup`
- JobKorea에서 `Business Development 서울`
- Search API에서 `site:ashbyhq.com GTM Korea AI startup`

유저가 새로운 범위를 요청해서 on-demand discovery가 실행되면, 그 범위를 일회성으로만 쓰지 않는다. 좋은 후보가 발견되었거나 반복 수요가 예상되면 `opportunity_market_scan_scope`에 저장해서 이후 global ingestion worker가 계속 업데이트한다.

### `company_intelligence` 확장안

MVP 필수 테이블은 아니다. 회사 설명과 리스크, 최근 정보, 출처를 장기적으로 재사용하기 위한 확장안이다.

필드 예시:

- `id`
- `company_workspace_id`
- `summary`
- `product_summary`
- `team_summary`
- `funding_summary`
- `market_summary`
- `hiring_signal_summary`
- `risk_summary`
- `sources`
- `confidence`
- `last_refreshed_at`

MVP에서는 별도 `company_intelligence` 테이블을 만들지 않는다. 우선은 `company_workspace.company_description`, `company_workspace`에 추가할 수 있는 JSON 컬럼, 또는 `opportunity_source_document.raw_text_summary`를 사용한다. `회사 뒷조사 해줘` 기능이 본격화되고 회사 단위 dossier를 반복적으로 재사용해야 할 때 분리한다.

### `role_intelligence` 확장안

MVP 필수 테이블은 아니다. JD를 추천/면접준비/랭킹에 반복 재사용하기 위한 확장안이다.

필드 예시:

- `role_id`
- `responsibilities`
- `requirements`
- `nice_to_have`
- `seniority`
- `domain_keywords`
- `technical_keywords`
- `compensation_text`
- `application_process`
- `source_documents`
- `confidence`
- `last_refreshed_at`

MVP에서는 별도 `role_intelligence` 테이블을 만들지 않는다. 우선 `company_roles.information` JSON에 responsibilities, requirements, seniority, domain keywords, source document IDs, confidence, freshness 같은 구조화 결과를 넣는다. 이 정보가 커지고 여러 기능에서 독립적으로 조회해야 할 때 별도 테이블로 분리한다.

### `talent_opportunity_recommendation` 확장

기존 테이블을 추천 결과의 read model로 계속 사용한다. 다만 추천 설명을 더 구조적으로 담기 위해 아래 필드를 추가하는 편이 좋다.

- `discovery_run_id`
- `fit_summary`
- `fit_reasons`: 사용자 근거와 Role 근거가 짝지어진 배열
- `tradeoffs`: 맞지 않을 수 있는 이유
- `evidence`: 출처 URL, 문서 ID, 인용 가능한 짧은 근거
- `confidence`
- `ranking_notes`
- `status`: `ready`, `needs_review`, `stale`, `hidden`

현재 `recommendation_reasons`는 `string[]`이고 HTML로 렌더링된다. 단기적으로는 이 필드를 계속 채우되, 내부 생성은 구조화된 JSON으로 하고 마지막에 표시용 문장으로 변환하는 것이 좋다.

### `opportunity_recommendation_feedback`

지금은 `talent_opportunity_recommendation.feedback`에 positive/negative feedback을 저장한다. 추천 품질 개선까지 고려하면 별도 이벤트 로그가 필요하다.

필드 예시:

- `id`
- `recommendation_id`
- `talent_id`
- `event_type`: `view`, `click`, `save`, `apply`, `dismiss`, `question`, `interview_prep`
- `reason`
- `created_at`

기존 컬럼은 현재 상태를 빠르게 읽기 위한 값으로 유지하고, 학습/분석은 이벤트 로그를 본다.

### `talent_opportunity_chat_preview`

검색 완료 후 대화창에 `OpportunityCard`를 꽂기 위한 mapping table이다. 현재 `talent_messages`는 `content` 중심의 단순 메시지 구조이므로, 카드 목록은 별도 테이블로 묶는 쪽이 덜 침습적이다.

필드 예시:

- `id`
- `conversation_id`
- `assistant_message_id`
- `discovery_run_id`
- `recommendation_id`
- `rank`
- `created_at`

검색 완료 시 assistant 자연어 메시지를 `talent_messages.message_type = opportunity_recommendation_preview`로 저장하고, 그 메시지에 붙을 상위 3개 recommendation을 `talent_opportunity_chat_preview`에 저장한다. 세션 API는 해당 message type을 읽을 때 card preview를 함께 내려준다.

## 추천 Trigger

추천 run을 새로 만드는 trigger와, 다음 추천에만 반영되는 signal을 분리한다.

추천 trigger는 유저에게 보여줄 추천 batch를 만드는 조건이다. 공고 DB를 최신화하는 global ingestion trigger와는 다르다. 예를 들어 global ingestion worker가 매일 LinkedIn/Wanted/회사 career page를 갱신해도, 그 자체가 모든 유저에게 새 추천 batch를 만들지는 않는다.

### `conversation_completed`

최초 career 대화가 충분히 끝났을 때 실행한다.

- `run_mode`: `initial`
- 목표 추천 개수: `talent_recommendation_settings.recommendation_batch_size`, 기본 10
- 목적: 첫 추천 batch 생성

### `immediate_opportunity_requested`

사용자가 대화 중 “지금 바로 채용공고 찾아줘”, “지금 지원할 만한 곳 찾아봐줘”, “Engineer 말고 GTM으로 찾아줘”처럼 즉시 탐색을 요청했을 때 실행한다. 버튼 기반 “더 찾아줘”가 아니라 대화 intent 기반 trigger다.

- `run_mode`: `immediate`
- 목표 추천 개수: 설정값, 기본 10
- 목적: 현재 대화 맥락을 반영해서 즉시 추천 batch 생성
- 조건 변경 처리: 기존 브리프를 버리지 않고, 변경된 조건만 `trigger_payload.condition_change`로 저장한 뒤 새 브리프에 반영한다.
- 중복 방지: 최근 실행 중인 `immediate` run이 있으면 새 run을 만들지 않고 기존 run 상태를 안내한다.

### `all_batch_feedback_submitted`

기존 “모든 추천을 거절했을 때”가 아니라, 최신 추천 batch의 모든 추천에 대해 사용자가 피드백을 남겼을 때 실행한다. 피드백은 positive/negative 모두 포함한다.

- `run_mode`: `refine`
- 목표 추천 개수: 설정값, 기본 10
- 목적: 방금 받은 피드백 전체를 반영해서 다음 batch 생성
- 판단 기준: 최신 `discovery_run_id`로 생성된 추천 중 `feedback is null`인 항목이 0개가 되었을 때

positive feedback 자체는 trigger가 아니다. 예를 들어 추천 하나를 저장하거나 관심 표시했다고 바로 새 run을 만들지는 않는다. 대신 그 신호는 다음 `all_batch_feedback_submitted`, `periodic_refresh_due`, `immediate_opportunity_requested` run에서 랭킹에 반영한다.

### `preference_became_more_active`

선호가 바뀔 때마다 실행하지 않는다. 이직 의향이 더 적극적인 방향으로 바뀐 경우에만 실행한다.

예시 단계:

1. `not_looking`
2. `casually_open`
3. `actively_looking`
4. `urgent`

`not_looking -> casually_open`, `casually_open -> actively_looking`, `actively_looking -> urgent`처럼 단계가 올라갈 때만 trigger가 된다. 반대로 더 소극적으로 바뀌거나, 지역/근무 형태만 바뀐 경우에는 설정과 선호를 저장하되 추천 run은 즉시 만들지 않는다. 이런 변경은 다음 주기 추천이나 즉시 요청 run에 반영한다.

### `periodic_refresh_due`

주기 추천이다. cron이 사용자별 `talent_recommendation_settings`를 보고 실행한다.

- `run_mode`: `refresh`
- 목표 추천 개수: 설정값, 기본 10
- 기본 주기: 7일
- 실행 조건: `periodic_enabled = true`, 마지막 추천 run 이후 설정된 일수가 지남, 현재 실행 중인 run이 없음

주기 추천은 “정해진 날마다 무조건 10개를 보여준다”가 아니라 “정해진 날마다 좋은 추천을 찾는 run을 실행한다”에 가깝다. 품질 기준을 통과한 후보가 부족하면 fewer-than-target 결과를 허용한다.

## 추천 설정 변경

추천 개수와 주기는 두 경로로 바뀐다.

1. 설정 화면에서 사용자가 직접 변경
2. 대화 중 사용자가 명시적으로 변경 요청

대화에서 변경 가능한 예:

- “한 번에 5개만 추천해줘” -> `recommendation_batch_size = 5`
- “매일 찾아봐줘” -> `periodic_interval_days = 1`
- “2주에 한 번 정도면 돼” -> `periodic_interval_days = 14`
- “요즘 적극적으로 보고 있으니까 자주 알려줘” -> 더 적극적인 이직 의향과 짧은 주기로 업데이트 가능

대화에서 변경하면 `talent_recommendation_settings.updated_by = conversation`으로 남긴다. 설정 변경 자체와 추천 run 생성은 분리한다. 예를 들어 “앞으로 5개씩만 줘”는 설정만 바꾸고 즉시 추천을 만들지 않는다. “지금 5개 찾아줘”는 설정 변경과 `immediate_opportunity_requested` trigger를 함께 실행할 수 있다.

## 대화 중 조건 변경 시나리오

예시 입력:

> 아 근데 Engineer 말고 GTM으로 찾아줘.

이 경우 Harper는 일반 답변을 이어가지 않고 즉시 검색 모드로 전환한다.

### 1. Intent와 조건 변경 추출

사용자 메시지에서 두 가지를 추출한다.

- intent: `immediate_opportunity_requested`
- condition change: `target_role_family`를 `Engineer`에서 `GTM`으로 변경

추출 예시:

```json
{
  "intent": "immediate_opportunity_requested",
  "conditionChange": {
    "previousRoleFamily": "Engineer",
    "nextRoleFamily": "GTM",
    "confidence": 0.92
  }
}
```

조건 변경이 명확하면 추가 질문 없이 진행한다. “GTM이 정확히 어떤 범위인가요?”처럼 되묻는 것은 GTM 범위가 불명확하거나 사용자의 기존 선호와 강하게 충돌할 때만 한다.

### 2. 진행 안내 메시지

assistant는 먼저 짧게 안내한다.

> 변경된 조건으로 최적의 기회를 찾아보겠습니다. 검색에는 시간이 소요될 수 있는데, 끝나면 알려드리겠습니다.

이 메시지를 저장한 뒤 `opportunity_discovery_run`을 만든다.

run payload 예시:

```json
{
  "trigger": "immediate_opportunity_requested",
  "runMode": "immediate",
  "targetRecommendationCount": 10,
  "chatPreviewCount": 3,
  "triggerPayload": {
    "conditionChange": {
      "previousRoleFamily": "Engineer",
      "nextRoleFamily": "GTM"
    },
    "sourceMessage": "아 근데 Engineer 말고 GTM으로 찾아줘."
  }
}
```

### 3. 검색 중 UI와 대화 잠금

run이 `queued` 또는 `running` 상태가 되면 채팅 화면은 검색 중 상태로 전환한다.

별도 lock 테이블은 만들지 않는다. 대화 잠금 여부는 현재 conversation에 active `opportunity_discovery_run`이 있는지로 파생한다.

```ts
const inputLocked = latestRun?.status === "queued" || latestRun?.status === "running";
```

UI 요구사항:

- 채팅 입력창 disabled
- 음성 입력 disabled
- 새 메시지 전송 불가
- 대화 영역에 `[검색중...]` 로딩 UI 표시
- 진행 문구는 짧게 유지

전화 중이었다면 자동으로 종료한다.

- active call session을 종료한다.
- 종료 사유는 `opportunity_search_started`로 남긴다.
- 통화 transcript가 있으면 저장한다.
- 이후 검색 완료 전까지 call 재시작 버튼은 비활성화한다.

이 단계에서는 사용자가 다른 메시지를 보낼 수 없어야 한다. 검색 중 새 대화가 들어오면 브리프와 검색 조건이 흔들리고, 추천 품질이 낮아진다.

채팅 API도 같은 기준을 확인한다. active run이 있으면 새 user message를 저장하지 않고 `423 Locked` 또는 이에 준하는 에러를 반환한다.

### 4. 검색과 추천 생성

worker는 변경된 조건을 반영해 새 `user_brief`와 `query_plan`을 만든다.

GTM 예시:

```json
{
  "role_families": ["GTM", "Sales", "Business Development", "Solutions", "Partnerships"],
  "excluded_role_families": ["Engineer"],
  "search_queries": [
    "GTM role AI startup Seoul careers",
    "business development AI startup Korea careers",
    "solutions role developer tools startup remote"
  ]
}
```

이 run은 기본 10개 추천을 생성한다. 단, 채팅창에는 상위 3개만 즉시 보여준다.

### 5. 검색 완료 후 채팅 결과

검색이 완료되면 run status가 `completed` 또는 `partial`로 바뀌면서 대화 잠금이 자연스럽게 해제된다. 이후 assistant 메시지와 `OpportunityCard` 3개를 같은 대화 흐름 안에 표시한다.

assistant 메시지 예시:

> 말씀하신 대로 Engineer 쪽은 제외하고 GTM 중심으로 다시 찾아봤어요. 지금까지의 이력과 대화에서 나온 선호를 기준으로 보면, 아래 세 곳은 특히 확인해볼 만합니다. 나머지 추천도 저장해두었고, 마음에 드는 방향을 표시해주면 다음 추천에 바로 반영할게요.

채팅창 카드 표시:

- 상위 3개 추천만 표시
- 각 카드는 회사명, Role명, 짧은 회사 설명, 짧은 Role 설명, 추천 이유 1-2개를 포함
- 카드 아래에는 작은 feedback action을 둔다.
- action label은 opportunity type meta를 따른다.
  - 외부 JD: `저장하기` / `선호하지 않음`
  - Harper 추천: `관심 표시` / `선호하지 않음`
  - 직접 연결 요청: `연결 수락` / `거절하기`

채팅에 보이는 3개 카드도 모두 `talent_opportunity_recommendation`에 저장된 row를 바라봐야 한다. 카드 액션을 누르면 기존 `/api/talent/opportunities` feedback update를 재사용한다.

### 6. 실패 또는 결과 부족

검색이 실패하면 run status를 `failed`로 바꾸고 실패 메시지를 보낸다. active run이 없어졌으므로 대화 입력은 다시 가능해진다.

> 지금 조건으로 검색하는 중 문제가 생겼습니다. 방금 말씀하신 GTM 조건은 저장해두었고, 잠시 후 다시 시도해볼게요.

좋은 추천이 3개 미만이면 억지로 3개를 채우지 않는다.

> GTM 조건으로 찾아봤는데, 지금 바로 추천할 만한 건 2개 정도였습니다. 품질이 애매한 공고는 제외했고, 나머지는 조금 더 확인한 뒤 추가로 보여드릴게요.

## 추천 실행 흐름

### 1. Trigger 감지

대화가 충분히 끝났거나, 즉시 추천 요청/피드백 완료/적극 의향 변화/주기 도래가 감지되면 서버는 `opportunity_discovery_run`을 만든다. 대화 종료 trigger라면 assistant가 다음 메시지를 보낸다.

> 말씀해주신 내용을 바탕으로 잘 맞을 만한 회사와 Role을 찾아볼게요. 조금 걸릴 수 있지만, 단순 링크가 아니라 왜 맞는지까지 정리해서 보여드릴게요.

채팅 API 응답 안에서 추천까지 끝내지 않는다. 서버는 run을 `queued`로 만들고 worker가 처리한다. 각 run은 `target_recommendation_count`와 `settings_snapshot`을 가진다.

### 2. 유저 브리프 생성

추천에 사용할 입력을 하나의 JSON으로 정리한다.

포함할 정보:

- 이력 요약
- 최근 대화에서 드러난 상황
- 선호 직무, 산업, 회사 규모, 지역, 근무 형태
- 피하고 싶은 회사/산업
- 강한 신호: 반복적으로 말한 관심사, 성과, 역량
- 약한 신호: 아직 확인되지 않은 추정
- 추천에서 절대 과장하면 안 되는 부분

이 브리프는 검색과 랭킹 모두에서 공통으로 사용한다.

### 3. 검색 계획 생성

LLM이 바로 웹 검색을 난사하지 않고 먼저 `query_plan`을 만든다.

예시:

```json
{
  "role_families": ["Product Designer", "AI UX Designer"],
  "company_archetypes": ["AI product startup", "B2B SaaS", "developer tool"],
  "locations": ["Seoul", "Remote"],
  "must_have": ["senior IC role", "product strategy exposure"],
  "avoid": ["agency-only design work"],
  "search_queries": [
    "AI product designer Seoul startup careers",
    "B2B SaaS senior product designer Korea remote"
  ],
  "known_sources_to_check": ["company_roles", "docs/list.md companies", "ATS career pages"]
}
```

이 단계가 있어야 개발자, 디자이너, 리서처, BD, 운영 등 직군이 달라도 검색 범위를 유동적으로 만들 수 있다.

### 4. 후보 수집

후보는 두 갈래로 모은다.

DB 후보:

- `company_roles.status = active`
- `source_type = internal` 또는 최근 외부 공고
- 유저 선호와 role metadata가 맞는 항목
- 과거에 거절한 회사/유사 Role 제외

동적 후보는 worker가 source registry와 adapter를 통해 모은다.

우선순위:

1. `company_roles`의 기존 외부 공고 중 fresh한 항목
2. seed company의 career page와 ATS page
3. 한국 주요 job board/provider adapter
4. 검색 API fallback
5. 유저가 대화에서 언급한 특정 회사의 공식 career page

동적 후보는 최소한 `source_url`, `title`, `company`, `location`, `description`, `posted_at` 정도로 정규화한다.

### 4-1. On-demand Discovery 상세

On-demand discovery는 “Google 검색 한 번”이 아니다. 한국 채용 시장에서 자주 쓰이는 source를 adapter로 나누고, 필요한 source만 좁게 조회하는 방식이다.

#### Source Adapter 구조

각 source는 같은 interface를 가진 adapter로 구현한다.

```ts
type OpportunityDiscoveryContext = {
  talentId: string;
  runId: string;
  roleFamilies: string[];
  excludedRoleFamilies: string[];
  locations: string[];
  companyArchetypes: string[];
  keywords: string[];
  blockedCompanies: string[];
  targetCount: number;
};

type RawOpportunity = {
  provider: string;
  sourceUrl: string;
  sourceJobId?: string;
  companyName: string;
  title: string;
  locationText?: string;
  postedAt?: string;
  summaryText?: string;
};

type OpportunitySourceAdapter = {
  provider: string;
  discover: (context: OpportunityDiscoveryContext) => Promise<RawOpportunity[]>;
  fetchDetail: (raw: RawOpportunity) => Promise<OpportunitySourceDocument>;
  parse: (document: OpportunitySourceDocument) => Promise<NormalizedOpportunity>;
};
```

adapter는 provider별 차이를 숨긴다. worker는 provider가 Wanted인지, LinkedIn인지, Greenhouse인지 신경 쓰지 않고 normalized opportunity만 받는다.

#### Source 우선순위

MVP에서 효율적인 순서는 아래와 같다.

1. **Internal DB**
   - 이미 저장된 `company_roles`
   - 이전 run에서 발견한 외부 JD
   - freshness가 충분한 공고

2. **Company/ATS registry**
   - `docs/list.md` seed 회사
   - 운영 중 누적된 회사 career URL
   - Greenhouse, Lever, Ashby, Workable, Greeting, Ninehire 등 parser 재사용 가능 source
   - 공식 career page는 job board보다 중복이 적고, 공고가 닫혔는지 확인하기 좋다.

3. **Korea job board adapters**
   - Wanted, LinkedIn Jobs, JobKorea, Saramin, Jumpit, Rallit, RocketPunch 등
   - 각 provider의 공개 페이지/API/검색 접근 가능 범위는 별도 확인이 필요하다.
   - 접근 정책상 자동 수집이 어렵거나 불안정한 source는 `allowed_access_mode = manual` 또는 `blocked`로 둔다.

4. **Search API fallback**
   - search API는 마지막 fallback이다.
   - 목적은 “공고 자체를 대량 수집”이 아니라 “공식 career page나 ATS URL 발견”이다.
   - 예: `site:greenhouse.io GTM Seoul AI startup`, `회사명 careers GTM`, `회사명 채용 Business Development`

#### 한국 채용 시장 특성을 활용한 효율화

한국에서 채용 공고가 올라오는 source는 어느 정도 정해져 있으므로 source registry를 키우는 방식이 효율적이다.

- 회사별 공식 채용 페이지 URL을 저장한다.
- 회사가 쓰는 ATS provider를 저장한다.
- provider별 parser를 만든다.
- source별 TTL을 다르게 둔다.
- 자주 추천되는 회사는 더 자주 refresh한다.
- 한 번 발견한 `source_job_id`와 URL은 dedupe key로 재사용한다.

예시 TTL:

- 내부 DB 공고: 추천 직전 상태 확인
- 공식 career page/ATS: 12-24시간
- job board 검색 결과: 6-12시간
- 회사 설명/홈페이지 요약: 7-30일
- 사용자가 방금 클릭했는데 닫힌 공고: 즉시 stale 처리

이렇게 하면 모든 provider를 매번 검색하지 않아도 된다. “GTM, 서울, AI startup” 같은 요청이 들어오면 worker는 먼저 이 조건과 가까운 회사/ATS registry만 조회하고, 부족할 때 job board와 search fallback으로 확장한다.

#### Query Planning

LLM은 검색을 직접 수행하지 않고 query plan만 만든다.

예:

```json
{
  "role_families": ["GTM", "Business Development", "Sales", "Solutions"],
  "excluded_role_families": ["Engineer"],
  "locations": ["Seoul", "Remote"],
  "company_archetypes": ["AI startup", "developer tools", "B2B SaaS"],
  "source_strategy": [
    { "provider": "company_career_page", "limit": 30 },
    { "provider": "greeting", "limit": 20 },
    { "provider": "ninehire", "limit": 20 },
    { "provider": "wanted", "limit": 20 },
    { "provider": "linkedin", "limit": 20 },
    { "provider": "search_api", "limit": 10 }
  ]
}
```

worker는 이 plan을 그대로 믿지 않고 source registry의 enabled/access/rate limit 상태와 합쳐 실행한다.

#### Discovery 실행 순서

1. DB에서 fresh 후보를 찾는다.
2. 목표 개수의 2-4배 후보가 있으면 동적 검색을 생략하거나 최소화한다.
3. 부족하면 seed company/ATS registry를 role/location 조건으로 조회한다.
4. 그래도 부족하면 job board adapter를 실행한다.
5. 그래도 부족하면 search API로 공식 career page/ATS URL을 발견한다.
6. 발견한 URL을 source registry와 source document에 저장한다.
7. 새로 유효해진 검색 범위를 `opportunity_market_scan_scope`에 저장하거나 기존 scope의 `demand_score`를 올린다.
8. parser 결과를 `company_roles`에 upsert한다.
9. dedupe 후 rank 후보 pool을 만든다.

목표 추천이 10개라면 후보 pool은 보통 30-80개 정도면 충분하다. 처음부터 수백 개를 긁지 않는다.

### 4-2. Global Ingestion 상세

global ingestion은 유저 요청이 없어도 주기적으로 돈다. 목적은 추천을 바로 만드는 것이 아니라 공고 DB 자체를 최신화하는 것이다.

기본 루프:

1. `opportunity_source_registry.next_refresh_at <= now()`인 source를 고른다.
2. `opportunity_market_scan_scope.next_refresh_at <= now()`인 market search scope를 고른다.
3. provider별 adapter로 공고 목록을 fetch한다.
4. 각 공고 detail을 fetch/parse한다.
5. `company_workspace`, `company_roles`, `opportunity_source_document`에 upsert한다.
6. 기존 active 공고가 source에서 사라졌거나 detail URL이 닫혔으면 `company_roles.status = ended`로 바꾼다.
7. source별 success/stale/error rate를 기록한다.
8. `next_refresh_at`을 source별 TTL과 demand score에 따라 다시 계산한다.

예시:

- 회사 career URL 돌기
  - `opportunity_source_registry.provider in ('company_career_page', 'greenhouse', 'lever', 'ashby', 'greeting', 'ninehire')`
  - 각 회사의 board URL을 fetch
  - 새 공고 추가
  - 사라진 공고는 ended 처리

- LinkedIn에서 엔지니어 검색
  - `opportunity_market_scan_scope.provider = linkedin`
  - `query = Engineer Korea`
  - 허용된 접근 방식 안에서 검색 결과 수집
  - 가능한 경우 공식 회사/ATS URL로 되돌아가 detail 확인

- Wanted/JobKorea/Saramin 검색
  - `query = GTM`, `query = Business Development`, `query = Software Engineer` 같은 scope를 provider별로 실행
  - source policy와 안정성에 따라 detail parse 또는 공식 URL 발견만 수행

중요한 점은 user-triggered discovery가 global ingestion의 scope를 키운다는 것이다.

예:

1. 기존에는 `Engineer Korea` scope만 주기적으로 돌고 있었다.
2. 어떤 유저가 “Engineer 말고 GTM으로 찾아줘”라고 한다.
3. on-demand discovery가 `GTM`, `Business Development`, `Solutions`, `AI startup`, `Seoul/Remote` 범위를 검색한다.
4. 유효한 공고가 발견되면 worker가 `opportunity_market_scan_scope`에 `GTM AI startup Korea` 같은 scope를 추가한다.
5. 이후 주기 global ingestion이 이 scope도 계속 업데이트한다.
6. 다음 GTM 유저는 on-demand 검색을 덜 해도 DB에서 fresh 후보를 받을 수 있다.

즉 on-demand discovery는 “그 순간만 검색”이 아니라 “새로운 시장 범위를 발견하고 global crawler의 지도에 추가하는 작업”이기도 하다.

#### Provider Adapter 예시

**ATS adapter**

- Greenhouse/Lever/Ashby/Greeting/Ninehire/Workable 등
- 회사별 board URL이 있으면 직접 fetch
- 구조가 비교적 일정하므로 parser 재사용 가능
- `source_provider + source_job_id` dedupe가 쉽다.

**Company career page adapter**

- 공식 career page HTML을 fetch
- 채용 공고 링크를 추출
- detail page에서 title/description/location을 parse
- 구조가 제각각이므로 confidence를 낮게 시작하고, 자주 등장하는 회사만 custom parser를 추가한다.

**Job board adapter**

- Wanted, LinkedIn, JobKorea, Saramin, Jumpit, Rallit, RocketPunch 등
- provider 정책을 확인한 뒤 허용되는 방식만 사용한다.
- 가능하면 공식 API나 공개 검색 페이지를 사용한다.
- 자동 수집이 불안정하면 “검색 결과 URL 발견”까지만 하고, 상세 내용은 공식 회사/ATS URL에서 확인한다.

**Search API adapter**

- SerpAPI, Brave Search API, Bing Web Search API, Tavily, Exa 등 중 하나를 선택한다.
- 직접 Google HTML을 scrape하지 않는다.
- search API 결과는 후보 source discovery로만 사용하고, 추천의 사실 근거는 가급적 공식 career page/ATS/detail page에서 가져온다.

#### Cost와 Rate Limit

worker는 run당 budget을 가진다.

예:

- max source adapters: 4
- max search API queries: 5
- max fetched pages: 80
- max LLM normalization calls: 30
- max runtime: 2-5분

budget을 초과하면 `partial`로 마무리한다. 좋은 추천이 부족하면 억지로 채우지 않는다.

### 5. 정규화와 중복 제거

같은 공고가 여러 URL에 있을 수 있으므로 dedupe가 중요하다.

우선순위:

1. `source_provider + source_job_id`
2. canonical URL
3. 회사명 + Role명 + location + description hash
4. LLM 기반 fuzzy match

중복이라고 판단되면 기존 `company_roles`를 업데이트하고, 새 row를 만들지 않는다. `content_hash`가 바뀌면 MVP에서는 `company_roles.information`의 구조화 결과를 갱신한다.

### 6. 랭킹

랭킹은 deterministic filter와 LLM 판단을 섞는다.

먼저 제거할 것:

- 마감/비활성 공고
- 지역/근무 형태가 명백히 안 맞는 공고
- 사용자가 차단한 회사
- 경력 레벨이 크게 안 맞는 공고
- 근거가 너무 부족한 공고

그 다음 점수화할 것:

- 역할 적합도
- 회사/산업 관심도
- 커리어 타이밍 적합도
- 사용자가 말한 선호와의 일치
- 도전적이지만 가능한 stretch 정도
- 불확실성

최종 추천은 점수만 높은 순서가 아니라 다양성도 고려한다. 한 batch가 기본 10개여도 같은 종류의 회사 10개를 채우는 것은 피한다. 확실한 추천, 탐색 가치가 있는 추천, stretch 추천을 적절히 섞되 각 항목은 품질 기준을 통과해야 한다.

### 7. 추천 설명 생성

추천 카드에는 최소 네 가지가 있어야 한다.

- `role_summary`: 이 Role이 실제로 하는 일
- `company_summary`: 회사가 무엇을 하는지
- `fit_reasons`: 유저 근거와 Role 근거가 연결된 이유
- `tradeoffs`: 확인이 필요하거나 안 맞을 수 있는 부분

좋은 추천 이유 예시:

> 이전 프로젝트에서 B2B 고객의 복잡한 워크플로우를 제품화한 경험이 있고, 대화에서 “리서치와 제품 전략까지 같이 보는 역할”을 선호한다고 말했습니다. 이 Role은 단순 UI 제작보다 고객 문제 정의와 프로덕트 방향 설정을 함께 요구하고 있어 그 신호와 맞습니다.

나쁜 추천 이유 예시:

> 이력에 React가 있어서 프론트엔드 포지션을 추천합니다.

추천 문장은 반드시 사용자 근거와 공고 근거가 연결되어야 한다. 사실 주장에는 source URL 또는 source document ID가 있어야 한다.

### 8. 결과 저장과 노출

완성된 추천은 `talent_opportunity_recommendation`에 저장한다. 같은 run에서 나온 추천은 `discovery_run_id`로 하나의 batch처럼 묶는다. UI는 기존 `/career/history`를 그대로 써도 되고, 나중에 “추천받은 기회” 중심 화면으로 분리해도 된다.

추천이 아직 생성 중이면 화면에서는 run 상태를 보여준다.

- `찾는 중`
- `몇 개 찾았고, 설명을 정리하는 중`
- `추천 완료`
- `추천할 만큼 좋은 공고가 아직 없음`

중요한 점은 “추천 없음”도 결과로 저장하는 것이다. 그래야 사용자가 기다렸는데 아무 일도 안 일어난 것처럼 보이지 않는다.

## API 제안

### `POST /api/talent/opportunity-runs`

추천 탐색을 시작한다.

요청:

```json
{
  "trigger": "conversation_completed",
  "targetRecommendationCount": 10,
  "chatPreviewCount": 3
}
```

응답:

```json
{
  "ok": true,
  "runId": "..."
}
```

### `GET /api/talent/opportunity-runs/latest`

현재 유저의 최신 추천 작업 상태를 가져온다.

응답:

```json
{
  "ok": true,
  "run": {
    "id": "...",
    "status": "running",
    "trigger": "periodic_refresh_due",
    "targetRecommendationCount": 10,
    "chatPreviewCount": 3,
    "inputLocked": true,
    "coverage": {
      "dbCandidates": 12,
      "newCandidates": 7,
      "finalRecommendations": 0
    }
  }
}
```

`inputLocked`는 저장된 컬럼이 아니라 active run 상태에서 계산한 값이다.

### `POST /api/talent/opportunity-runs/:runId/complete-preview`

worker가 추천 저장을 마친 뒤 채팅창에 노출할 preview message와 card mapping을 생성한다. 실제 구현에서는 worker 내부 함수일 수 있고, 외부 API로 열 필요는 없다.

처리:

1. 최종 추천 batch에서 rank 상위 3개를 고른다.
2. 자연어 assistant message를 `message_type = opportunity_recommendation_preview`로 저장한다.
3. `talent_opportunity_chat_preview`에 `assistant_message_id`, `recommendation_id`, `rank`를 저장한다.
4. `opportunity_discovery_run.status`를 `completed` 또는 `partial`로 바꾼다. 이 상태 변경으로 채팅 입력 잠금이 해제된다.

### `GET /api/talent/recommendation-settings`

현재 유저의 추천 개수와 주기 설정을 가져온다.

응답:

```json
{
  "ok": true,
  "settings": {
    "recommendationBatchSize": 10,
    "periodicEnabled": true,
    "periodicIntervalDays": 7,
    "lastPeriodicRunAt": "..."
  }
}
```

### `PATCH /api/talent/recommendation-settings`

설정 화면 또는 대화 중 명시적 요청으로 추천 설정을 바꾼다.

요청:

```json
{
  "recommendationBatchSize": 10,
  "periodicEnabled": true,
  "periodicIntervalDays": 7,
  "updatedBy": "conversation"
}
```

### Worker entrypoint

Python worker process로 실행한다. 중요한 점은 `POST /api/talent/opportunity-runs` request 안에서 검색을 끝까지 기다리지 않는 것이다. API route는 run row를 만들고 바로 반환한다.

예시:

- `POST /api/internal/opportunity-ingestion/run`
- `python opportunity_worker.py poll`
- `python opportunity_worker.py discovery --run-id <run-id>`
- `python opportunity_worker.py ingestion --run-id <run-id> --limit 100`
- `python opportunity_worker.py create-ingestion --limit 100 --process`
- `python opportunity_worker.py poll --schedule-ingestion --ingestion-interval-hours 24 --ingestion-limit 100`

추천 탐색은 2분을 넘길 수 있으므로 일반 Next.js request 하나에 묶지 않는 편이 좋다.

현재 MVP에서는 전체 공고 업데이트를 주기 cron에 묶지 않고 수동 실행한다. 서버에 `OPPORTUNITY_CRON_SECRET` 또는 `CRON_SECRET`을 설정한 뒤 아래처럼 호출한다.

```bash
curl -X POST "$BASE_URL/api/internal/opportunity-ingestion/run" \
  -H "Authorization: Bearer $OPPORTUNITY_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit":100}'
```

이 endpoint는 `opportunity_ingestion_run`만 만들고 worker 실행 명령을 반환한다. 실제 처리는 아래처럼 worker에서 실행한다. `limit`은 1-200 사이로 제한한다.

```bash
cd harper_worker
python opportunity_worker.py ingestion --run-id <run-id> --limit 100
```

worker가 직접 수동 run을 만들고 바로 처리할 수도 있다.

```bash
cd harper_worker
python opportunity_worker.py create-ingestion --limit 100 --process
```

주기적으로 전체 공고 업데이트 run을 만들고 처리하려면 worker poll loop를 이렇게 실행한다.

```bash
cd harper_worker
python opportunity_worker.py poll --schedule-ingestion --ingestion-interval-hours 24 --ingestion-limit 100
```

cron은 두 가지를 enqueue한다.

1. global ingestion
   - due source registry와 market scan scope를 보고 `opportunity_ingestion_run`을 만든다.
   - 공고 DB 업데이트와 expired 처리만 담당한다.

2. user periodic recommendation
   - 각 유저의 `periodic_interval_days`와 마지막 완료 recommendation run 시점을 비교해서 `periodic_refresh_due` run을 만든다.
   - 이미 업데이트된 DB를 우선 사용하고, 필요할 때만 추가 discovery를 한다.

현재 worker module 구조:

```txt
harper_worker/
  opportunity_worker.py
  OPPORTUNITY_WORKER.md
```

처음부터 모든 adapter를 만들 필요는 없다. MVP는 public career page fetch, 자주 쓰는 ATS URL 패턴, `search_api` fallback으로 시작하고, 실제 추천 로그를 보면서 Wanted/LinkedIn/JobKorea/Saramin adapter를 worker 안에 추가한다.

## 제품 UX

대화 종료 또는 즉시 검색 요청 직후:

- assistant가 “찾아보겠다”고 말한다.
- 대화 입력을 잠그고 `[검색중...]` 로딩 UI를 표시한다.
- 전화 중이었다면 자동 종료한다.
- 검색이 완료되면 채팅창에 상위 3개 `OpportunityCard`를 표시한다.
- 전체 batch는 기본 10개이고, 나머지는 history/기회 목록에서 확인하게 한다.

추천 카드:

- 기본 batch당 10개
- 채팅 preview는 상위 3개
- 회사명, Role명, 위치/근무 형태
- 짧은 회사 설명
- 짧은 Role 설명
- 왜 추천하는지 2-4개
- 확인해야 할 점 1-2개
- `공고 열기`
- 외부 JD 액션: `저장하기` / `선호하지 않음`
- Harper 추천 액션: `관심 표시` / `선호하지 않음`
- 직접 연결 요청 액션: `연결 수락` / `거절하기`
- `인터뷰 준비하기`
- `회사 뒷조사 해줘`

`docs/beige-design-guidelines.md` 기준으로 구현할 때는 새 색상, 새 radius, 새 shadow를 만들지 않고 기존 `CareerInlinePanel`, `BeigeButton`, beige 컴포넌트를 먼저 써야 한다. 추천 작업의 내부 상태를 사용자에게 길게 설명하는 문구는 화면에 노출하지 않는다.

## 대처 가능한 케이스

### 직군이 예측 범위 밖인 경우

사전 크롤링이 아니라 query plan을 동적으로 만들기 때문에 대응 가능하다. 예를 들어 디자이너가 들어오면 `Product Designer`, `UX Research`, `AI UX`, `Design Engineer` 같은 축으로 검색을 만든다.

### DB에 이미 좋은 공고가 있는 경우

DB 후보를 먼저 추천한다. 단, 추천 직전 freshness를 확인한다. 오래된 외부 공고는 source URL을 다시 확인하고 `stale`이면 추천에서 제외한다.

### DB에 아무것도 없는 경우

동적 검색을 실행하고 결과를 저장한다. 다음 유사 유저에게는 DB 후보로 재사용된다.

### 유저 정보가 부족한 경우

추천을 무리하게 만들지 않는다. 부족한 정보가 무엇인지 저장하고, 대화에서 한두 가지를 더 물어본다.

예:

- 선호 지역이 없음
- 현재 이직 의향이 불명확함
- 직무 범위가 너무 넓음
- 포트폴리오/이력 근거가 부족함

### 좋은 추천이 없는 경우

빈 결과를 실패로 보지 않는다. “현재 조건으로는 추천할 만한 공고가 부족하다”는 상태를 만들고, 검색한 범위와 다음에 물어볼 질문을 남긴다.

## 예상 문제와 대응

### 검색이 느림

문제:

- 웹 검색, ATS 페이지 파싱, 회사 리서치가 한 번에 끝나지 않는다.

대응:

- 비동기 run으로 처리
- 첫 batch를 만든 뒤 필요한 경우 설명/회사 리서치를 계속 보강
- `partial` 상태 허용
- 이미 DB에 있는 공고는 즉시 보여주고 동적 검색 결과는 뒤따라 추가

### 공고가 닫혀 있음

문제:

- 외부 공고 URL은 빨리 stale해진다.

대응:

- 추천 직전 URL 상태 확인
- `expires_at`, `last_refreshed_at`, `status` 관리
- 사용자가 클릭했는데 닫혀 있으면 해당 role을 `ended`로 업데이트하고 다음 run에서 제외
- 공고가 닫힌 것만으로 별도 추천 trigger를 만들지는 않는다.

### 회사/공고 파싱 실패

문제:

- ATS, Notion, custom career page, LinkedIn 등 구조가 제각각이다.

대응:

- provider별 parser를 두되, 실패하면 일반 HTML text extraction으로 fallback
- 파싱 confidence 저장
- confidence가 낮은 공고는 자동 추천하지 않고 `needs_review`로 둔다

### 추천 이유가 얕아짐

문제:

- LLM이 키워드 매칭식 이유를 만들 수 있다.

대응:

- 추천 이유 스키마를 강제한다.
- 각 이유는 `user_signal`, `role_signal`, `why_it_matters`, `source`를 가져야 한다.
- 근거 없는 이유는 저장하지 않는다.
- 최종 문장 생성 전에 validation step을 둔다.

### 사실 오류와 환각

문제:

- 회사 설명, 투자, 제품, hiring signal을 LLM이 지어낼 수 있다.

대응:

- factual claim은 source document가 있을 때만 허용
- 출처가 약한 문장은 “확인이 필요합니다”로 표시
- 회사 설명과 추천 이유를 분리한다. 회사 설명은 근거 기반, 추천 이유는 사용자/공고 연결 기반으로 만든다.

### 비용과 rate limit

문제:

- 유저마다 검색을 많이 돌리면 비용이 커진다.

대응:

- DB 후보를 먼저 사용
- 동일 query/source URL cache
- 같은 회사 career page는 짧은 TTL 안에서 재사용
- run당 최대 검색 수, 최대 fetch 수, 최대 LLM call 수 제한

### 개인정보와 민감 선호

문제:

- 유저 이력과 선호가 외부 검색 query에 그대로 들어가면 안 된다.

대응:

- 검색 query에는 식별 가능한 개인정보를 넣지 않는다.
- 차단 회사, 비공개 선호는 DB/RLS로 보호한다.
- 외부 provider에 넘기는 텍스트는 직무/산업/지역 수준으로 최소화한다.

### 저작권과 원문 저장

문제:

- 외부 JD 원문을 그대로 대량 저장하면 위험할 수 있다.

대응:

- 원문 전체보다 구조화 요약, URL, hash, 짧은 근거 위주로 저장
- 필요한 경우 원문은 TTL이 있는 cache로만 둔다
- robots.txt와 사이트 정책을 존중한다

## 향후 기능 1: 인터뷰 준비하기

추천 카드의 `[인터뷰 준비하기]` 버튼은 새로운 run을 만든다.

제안 테이블:

- `interview_prep_run`
- `interview_question_bank`
- `mock_interview_session`
- `mock_interview_turn`

흐름:

1. 추천된 `role_id`와 `company_workspace_id`를 기준으로 회사/Role 정보를 불러온다.
2. 부족하면 추가 검색을 실행한다.
3. 기출 인터뷰, Glassdoor류 공개 후기, 블로그 후기, 회사 engineering/design blog, JD를 모은다.
4. 유저 이력에서 예상 질문을 만든다.
5. `/career` 채팅을 `interview_mode`로 전환한다.

인터뷰 모드는 일반 대화와 시각적으로 구분되어야 한다.

예:

- 상단에 `Mock interview` 상태 표시
- 질문 번호와 평가 기준 표시
- 답변 후 follow-up 질문
- 마지막에 `강점`, `보완할 점`, `다시 답해볼 질문` 요약

일반 career 대화와 같은 메시지 테이블을 써도 되지만, `message_type` 또는 `conversation_mode`를 분리해야 한다. 그렇지 않으면 일반 상담 기록과 mock interview 평가가 섞인다.

API 예시:

- `POST /api/talent/opportunities/:id/interview-prep`
- `POST /api/talent/mock-interviews/:sessionId/messages`

## 향후 기능 2: 회사 뒷조사 해줘

이 기능은 추천과 같은 evidence layer를 재사용한다.

제안 테이블:

- `company_research_run`
- `company_dossier`
- `company_research_source`

리서치 범위:

- 제품과 고객
- 팀과 창업자
- 투자/재무 신호
- 최근 뉴스
- 기술/디자인/제품 문화
- 채용 중인 Role의 의미
- 경쟁사와 시장
- 리스크와 확인 질문

출력은 자연어 설명을 기본으로 하되, UI에서는 구조화된 dossier를 렌더링하는 것이 좋다.

예:

- `한눈에 보기`
- `왜 지금 채용하는 것처럼 보이는지`
- `이 회사에서 잘 맞을 사람`
- `면접 전에 확인할 질문`
- `조심할 신호`
- `출처`

HTML을 LLM이 직접 생성하게 하는 것보다, JSON dossier를 만들고 React 컴포넌트가 렌더링하는 쪽이 안전하다. 이렇게 해야 beige 컴포넌트와 디자인 가이드를 유지할 수 있고, 출처/신뢰도/섹션 누락을 검증하기 쉽다.

API 예시:

- `POST /api/talent/companies/:companyId/research`
- `GET /api/talent/company-research-runs/:runId`

## 단계별 구현 제안

### Phase 1: 추천 run과 DB-first 추천

- `opportunity_discovery_run` 추가
- `talent_recommendation_settings` 추가
- 기존 `company_roles`와 `talent_opportunity_recommendation`만으로 추천 생성
- API route는 run 생성과 enqueue만 담당
- worker module에서 DB-first 추천 생성
- 기본 10개 batch 생성
- `conversation_completed`, `immediate_opportunity_requested`, `all_batch_feedback_submitted`, `preference_became_more_active` trigger 처리
- `/career/history`에 pending state 추가
- 추천 이유 스키마와 validation 추가

이 단계는 웹 검색 없이도 만들 수 있다. 내부 DB 기반 추천 품질과 UX를 먼저 확인한다.

### Phase 2: global ingestion 기반 공고 DB 업데이트

- `opportunity_ingestion_run` 추가
- `opportunity_source_registry` 추가
- `opportunity_market_scan_scope` 추가
- 회사 career URL/ATS 주기 refresh
- LinkedIn/Wanted/JobKorea/Saramin 등 provider별 market scan scope 실행
- 새 공고 upsert
- 사라진 공고 `ended` 처리
- source별 TTL, success rate, stale rate 기록

이 단계가 있어야 추천 worker가 매번 웹을 새로 뒤지지 않고 DB-first로 빠르게 동작한다.

### Phase 3: on-demand external discovery

- 검색 계획 생성
- source adapter interface 추가
- seed company/ATS registry 우선 조회
- 외부 URL fetch/parsing
- `opportunity_source_document` 저장
- 외부 공고를 `company_roles.source_type = external`로 upsert
- on-demand로 새로 발견한 검색 범위를 `opportunity_market_scan_scope`에 반영
- stale/freshness 체크
- 기본 10개 batch와 사용자별 추천 설정 반영
- cron 기반 `periodic_refresh_due` 처리
- search API는 공식 career/ATS URL 발견 fallback으로 사용

### Phase 4: 추천 품질 강화

- `company_roles.information`과 source evidence 품질 강화
- 필요해질 때만 `company_intelligence`, `role_intelligence` 분리
- 추천 이유를 evidence 기반으로 생성
- 부정 피드백을 다음 추천에 반영
- “추천 없음”과 “정보 부족” 상태를 제품화
- provider별 success rate, stale rate, cost를 기록해 source 우선순위 조정

### Phase 5: 인터뷰 준비와 회사 리서치

- 추천 카드 액션 추가
- mock interview mode 추가
- company dossier UI 추가
- research run과 prep run을 recommendation run과 같은 상태 모델로 통일

## 구현 시 중요한 원칙

1. DB를 유일한 후보 집합으로 보지 않는다. DB는 추천 품질을 높이는 기억장치이자 cache다.
2. 공고 검색/파싱/랭킹은 worker에서 처리한다. client는 run 생성, 상태 표시, 결과 렌더링만 담당한다.
3. global ingestion과 user recommendation을 분리한다. 주기 공고 업데이트는 추천 생성과 별개로 돈다.
4. 유저 on-demand discovery로 새로 넓어진 범위는 `opportunity_market_scan_scope`에 반영해 이후 global ingestion이 계속 업데이트하게 한다.
5. 웹 검색 결과를 그대로 사용자에게 보여주지 않는다. 정규화, 중복 제거, freshness 확인, 근거 검증을 거친다.
6. search API는 fallback이다. 먼저 source registry, 회사 채용 페이지, ATS, 주요 job board adapter를 활용한다.
7. 추천 이유는 사용자 신호와 Role 신호가 연결되어야 한다.
8. 출처 없는 회사/공고 사실은 쓰지 않는다.
9. 오래 걸리는 작업은 항상 run 상태로 관리한다.
10. 추천이 없거나 불확실한 것도 명시적인 결과로 다룬다.
11. future feature인 인터뷰 준비와 회사 리서치는 같은 evidence/run 구조를 재사용한다.
12. positive feedback은 즉시 새 추천을 만드는 trigger가 아니라 다음 추천 run의 랭킹 신호로만 사용한다.
