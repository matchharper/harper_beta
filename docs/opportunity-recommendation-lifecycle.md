# Opportunity Recommendation Lifecycle

Last updated: 2026-06-10

이 문서는 Harper가 talent에게 외부 공고 추천 메일을 계속 보낼지, 줄일지, 멈출지를 판단하는 방식을 설명한다.

## 목적

기존 periodic scheduler는 완료 유저에게도 per-talent periodic run cap을 하드코딩해서 제한했다. 이제 완료 유저의 외부 추천 중단 여부는 발송 횟수 cap이 아니라 reaction 기반 lifecycle로 판단한다.

- `active`: 일반 periodic 추천 상태. 외부/내부 추천을 기존 설정대로 보낸다.
- `passive`: 오랫동안 반응이 없어 발송 빈도와 외부 추천 개수를 줄인 상태.
- `stopped`: 외부 public JD 추천을 멈춘 상태. `get_external_recommendation`이 true여도 외부 추천은 하지 않고, Harper가 연결 가능한 내부 기회만 추천할 수 있다.

상태의 source of truth는 `public.talent_setting.status`다.

## DB Migration

Migration:

`harper_beta/supabase/migrations/20260610150000_talent_setting_recommendation_lifecycle.sql`

목적:

- `talent_setting.status` 컬럼 추가. 기본값은 `active`.
- `talent_setting.status_updated_at` 컬럼 추가. passive/stopped 이후 무반응 카운트의 기준 시점으로 쓴다.
- null/invalid status를 `active`로 backfill.
- status가 `active`, `passive`, `stopped` 중 하나만 되도록 check constraint 추가.
- periodic scheduler 조회를 위해 `(status, status_updated_at, periodic_interval_days)` index 추가.

## Reaction 기준

periodic scheduler는 `harper_worker/opp/worker.py`의 `fetch_due_periodic_discovery_targets()`에서 `latest_reaction_at`을 계산한다.

현재 reaction으로 인정하는 신호:

- Career 페이지 접속: `public.logs.type = 'career_app_opened'`.
- 이메일 답장: `public.career_email_messages.direction = 'inbound'`.
- 추천 공고 반응: `public.talent_opportunity_recommendation`의 feedback, click, view, saved stage, dismiss timestamp.
- 채팅/voice 입력: `public.talent_messages.role = 'user'`, 단 `message_type = 'profile_submit'`은 제외.

agent 실행 시점에도 user-triggered discovery run이면 passive/stopped 유저를 즉시 `active`로 되돌린다. 허용되는 trigger:

- `conversation_completed`
- `immediate_opportunity_requested`
- `all_batch_feedback_submitted`

ops/manual run은 같은 trigger 이름을 재사용해도 reactivation으로 보지 않는다. 예를 들어 ops 수동 internal 추천 payload에 `manualInternalRecommendation`이 있으면 active로 돌리지 않는다.

reaction으로 세지 않는 것:

- generic `talent_users.last_logined_at`
- broad `logs.type LIKE 'career_%'`
- 단순 이메일 open

## Active → Passive

매 periodic scheduling pass 시작 시 active 유저를 확인한다.

아래 두 조건이 모두 만족되면 `active`에서 `passive`로 바꾼다.

- 최신 reaction 이후 보낸 periodic email이 최소 `OPP_ACTIVE_NO_REACTION_MIN_PERIODIC_EMAILS`개. 기본값은 `15`.
- 그 no-reaction periodic email 중 첫 번째 발송 시점이 최소 `OPP_ACTIVE_NO_REACTION_MIN_DAYS`일 전. 기본값은 `28`.

전환이 일어나면:

- `create_periodic_discovery_run()`이 `talent_setting.status = 'passive'`로 업데이트한다.
- `status_updated_at`을 현재 UTC 시각으로 업데이트한다.
- active→passive 전환 run 자체의 due 여부는 기존 active periodic interval로 판단한다.
- 큐잉되는 run의 `settings_snapshot`은 passive 설정으로 바뀐다.
- `opportunity_discovery_run.settings_snapshot`과 `trigger_payload`에 아래 값이 들어간다.
  - `talentSettingStatus: "passive"`
  - `talentSettingStatusTransition: "active_to_passive"`
  - `lifecycleDeliveryRequirement`
  - `lifecycleNotice` (legacy alias)

안내가 실제로 들어가는 방식:

- scheduler가 `trigger_payload.lifecycleDeliveryRequirement`와 `settings_snapshot.lifecycleDeliveryRequirement`에 최종 문장이 아니라 hidden 작성 요구사항을 넣어 run을 만든다. 기존 run 호환을 위해 `lifecycleNotice` alias도 함께 남긴다.
- `new_harper_agent.lifecycle_communication_from_discovery_run()`이 이 요구사항을 `lifecycleCommunication` 객체로 바꾼다.
- final delivery LLM input에 `lifecycleCommunication`을 포함한다.
- final delivery prompt는 `emailSubject`, `emailBody`, `chatMessage`에 모두 이 안내를 자연스럽게 반영하도록 강제한다.
- lifecycleCommunication이 있는 run은 일반 email refine flag가 꺼져 있어도 refiner를 한 번 통과한다. refiner prompt도 subject/body/chat에 lifecycle 변경 안내가 약하면 반드시 다시 쓰도록 되어 있다.
- active→passive에서는 subject에 발송 빈도 조정이 드러나야 한다.
- agent가 원래는 발송을 skip하려던 상황이어도 lifecycleCommunication이 있으면 final delivery LLM을 호출해서 notice-only email/chat을 작성한다.

## Passive 상태의 주기와 개수

passive periodic run에서는 유저의 기존 설정과 별개로 아래 값이 적용된다.

- `periodicIntervalDays`: `OPP_PASSIVE_PERIODIC_INTERVAL_DAYS`, 기본값 `7`.
- `recommendationBatchSize`: `OPP_PASSIVE_RECOMMENDATION_BATCH_SIZE`, 기본값 `3`.

이 값은 `opportunity_discovery_run.settings_snapshot`에 저장된다.

new Harper retrieval은 DB의 현재 `talent_setting`보다 run의 `settings_snapshot`을 먼저 읽는다. 그래서 해당 run 안에서는 passive용 7일/3개 설정이 확실히 적용된다.

`normalize_decision()`도 `talentSettingStatus = "passive"`이면 external `maxExternalCount`를 `recommendationBatchSize`와 같은 값으로 닫는다. 즉 passive run에서 LLM이 target+1 여유 범위로 외부 기회를 4개까지 고르는 일이 없다.

## Passive → Stopped

passive 상태에서 무반응이 계속되면, 세 번째 passive-period email을 보내려는 시점에 `stopped`로 전환한다.

구현 기준:

- passive no-reaction count는 `greatest(latest_reaction_at, status_updated_at)` 이후 발송된 periodic email을 센다.
- 기본 `OPP_PASSIVE_MAX_NO_REACTION_PERIODIC_EMAILS = 3`일 때, scheduler는 `count >= 2`에서 전환한다.
- 따라서 큐잉되는 이번 run이 세 번째 passive-period email이다.

전환이 일어나면:

- `create_periodic_discovery_run()`이 `talent_setting.status = 'stopped'`로 업데이트한다.
- `settings_snapshot.getExternalRecommendation`을 강제로 `false`로 저장한다.
- 내부 추천이 켜져 있고 후보가 있으면 내부 기회를 포함할 수 있다.
- 후보가 없어도 lifecycle notice-only email/chat을 보낼 수 있다.

passive→stopped 안내도 고정 문장을 append하지 않는다. final delivery LLM이 `lifecycleCommunication`을 보고 아래 내용을 subject/body/chat에 자연스럽게 작성한다.

- 앞으로 Harper 외부에서 발견한 공개 기회는 따로 보내지 않는다.
- Harper가 직접 연결할 수 있는 기회 위주로 안내한다.
- 이메일 답장이나 career 페이지 접속 같은 반응이 있으면 다시 외부 기회를 받을 수 있다.
- subject에는 외부 기회 안내 중단 또는 내부 연결 기회 중심 전환이 드러나야 한다.

## Stopped 외부 추천 차단

stopped status는 두 군데에서 외부 추천을 막는다.

- Scheduler: stopped row는 내부 추천이 가능하거나 passive→stopped notice run일 때만 큐잉한다.
- Retrieval: `external_recommendations_enabled()`가 `talentSettingStatus = "stopped"`이면 `get_external_recommendation`이 true여도 false를 반환한다.

즉 stopped 유저에게는 new Harper agent가 외부 public JD를 추천하지 않는다.

## Reactivation

passive/stopped 유저가 `status_updated_at` 이후 reaction을 남기면 다시 active로 돌아간다.

경로는 두 가지다.

- Scheduler path: periodic target selection에서 `latest_reaction_at > status_updated_at`이면 effective status를 `active`로 계산하고, 다음 run 생성 시 `talent_setting.status`를 active로 업데이트한다.
- Agent path: user-triggered discovery run을 처리할 때 context loading 전에 `talent_setting.status = 'active'`로 업데이트한다.

ops/manual internal recommendation run은 reactivation으로 보지 않는다.

## Concurrency Guard

periodic run 생성은 `create_periodic_discovery_run()`에서 talent별 advisory transaction lock을 잡고 수행한다.

lock을 잡은 뒤 다시 확인하는 것:

- 같은 talent의 queued/running run이 이미 있는지.
- target 조회 시점의 `talent_setting.status`와 lock 이후 status가 같은지.
- target 조회 시점의 `latest_reaction_at`과 lock 이후 latest reaction이 같은지.
- profile visibility, recommendation toggle, onboarding/profile-row 조건, incomplete onboarding cap이 여전히 scheduling을 허용하는지.

status나 reaction이 target 조회와 run 생성 사이에 바뀌었으면 rollback하고 이번 큐잉을 건너뛴다. 다음 scheduler pass에서 최신 데이터로 다시 계산한다.

## Tuning

환경변수:

- `OPP_ACTIVE_NO_REACTION_MIN_DAYS`, 기본값 `28`.
- `OPP_ACTIVE_NO_REACTION_MIN_PERIODIC_EMAILS`, 기본값 `15`.
- `OPP_PASSIVE_PERIODIC_INTERVAL_DAYS`, 기본값 `7`.
- `OPP_PASSIVE_RECOMMENDATION_BATCH_SIZE`, 기본값 `3`.
- `OPP_PASSIVE_MAX_NO_REACTION_PERIODIC_EMAILS`, 기본값 `3`.

완료 유저에게 적용되던 legacy 50회 cap은 더 이상 쓰지 않는다. 온보딩 미완료 유저 cap은 별도 보호장치로 유지한다.
