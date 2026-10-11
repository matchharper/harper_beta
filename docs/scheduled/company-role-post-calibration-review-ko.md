# Calibration 후 12시간 Company Matching 1회 실행 계약

- 문서 기준: 2026-09-23
- 대상: 새 internal Role의 최초 profile calibration이 Slack에 전달된 뒤 한 번 실행하는 작업
- 시간 기준: calibration payload의 최초 `delivery.sentAt + 12 hours`
- 실행 주체: 월요일 오전 9시 정기 실행과 같은 `harper_worker` Company Matching Worker
- 실행 단위: company workspace 하나. Calibration 대상 Role을 이번 run의 requested Role로 포함
- 상위 작업 지도: [Company-side Codex 작업 지도](./codex-work.md)
- Worker 정본: [Company-scoped Talent Matching Worker 구현 계획](../company/company-first-talent-search-worker-implementation-plan-ko.md)

## 1. 결론

Profile calibration 생성·전달·feedback 반영은 기존 흐름을 그대로 유지한다. 바뀌는 것은 전달 12시간
뒤의 탐색 실행 주체뿐이다.

```text
Role 등록·채용 시작
  → 기존 Codex profile calibration 생성·Slack 전달
  → 최초 Slack sentAt + 12시간
  → company_first_search_runs에 post_calibration run 1회 enqueue
  → 월요일 정기 실행과 같은 Company Matching Worker가 claim
  → 같은 planner → retrieval → scoring → company-wide reranking
  → candidate_first | company_first | no_action 결정과 기존 route별 전달
```

이 후속 단계에서는 local calibration listener가 Codex를 새로 실행하지 않는다.
`company_context_runs.trigger_reason=post_calibration_12h`의 별도 Role-first direct review, fit write,
진행 안내도 새로 만들지 않는다.

## 2. 월요일 정기 실행과 같다는 의미

Post-calibration run은 다음 계약을 정기 run과 공유한다.

- `company_matching_run_contract_v3`
- 회사 단위 source snapshot과 모든 실행 가능한 Role의 company-wide 비교
- query planner의 실행/skip 판단
- 동적 retrieval, deterministic hard guard, pointwise scoring과 reranking
- `candidate_first | company_first | no_action` mixed-route 판단
- 정기 run과 같은 Role별 actionable 최대 3명, 0명 허용, 회사 내 Talent 중복 금지
- candidate-first는 기존 Opportunity Worker forced single Role delivery
- company-first는 기존 `company_intro_candidates/ready`와 Slack outbox
- test-only, privacy, route uniqueness, pending capacity, ready backlog와 제외 workspace guard

이 run은 회사 사용자가 누른 명시적 `Run Search`가 아니다. 따라서 `trigger_reason=company_requested`의
company-first-only·Role별 최대 6명 계약을 사용하지 않는다.

Calibration 대상 Role id는 `requested_role_ids`에 넣는다. 그래서 정기 실행 opt-in인
`is_company_first_search`가 아직 켜지지 않았더라도 이 한 번의 run에는 대상 Role을 포함한다. 같은 회사의
다른 Role 중 정기 실행 자격을 만족하는 Role은 기존 Worker 계약대로 함께 비교할 수 있다.

## 3. 시간과 idempotency

Due 시각은 calibration profile 생성 시각이 아니라 Slack delivery가 처음 성공한 `sentAt`의 정확히
12시간 뒤다. Slack 재전송은 최초 `sentAt`을 바꾸지 않는다.

`company_first_search_runs.source_calibration_id`가 한 calibration과 run을 연결하고 unique index가 중복
enqueue를 막는다. Calibration payload의 `postCalibrationSearch`에는 run id, due 시각과 queue 상태를
남긴다. `available_at`이 정확한 12시간 gate이며 Worker는 그 전에는 claim하지 않는다.

Slack delivery가 성공하지 않은 calibration은 후속 run을 예약하지 않는다. Calibration delivery retry와
12시간 search는 서로 다른 책임이다.

## 4. Enqueue gate와 실행 시점 재검증

Enqueue 시 다음을 모두 확인한다.

- internal, active, unexpired Role
- 비어 있지 않은 current Hiring Brief
- `company_roles.information.testOnly != true`
- active Company Slack integration과 Role에 전달 가능한 enabled channel

Worker는 실제 claim과 final commit에서 더 강한 최신 guard를 다시 적용한다. Role·Talent·privacy·route가
바뀌었으면 stale 결과를 쓰지 않는다. 회사별 제외 workspace는 Worker runtime의 exact ID denylist로
재검증한다.

## 5. 결과와 회사 전달

별도 “인재풀 검토를 시작했다” 진행 안내를 만들지 않는다. 정기 Company Matching Worker와 같은 실제
route 결과만 전달한다.

- candidate-first: 기존 후보자 추천·follow-up 경로가 시작된다.
- company-first: 회사에 `먼저 제안 가능한 후보`가 생성되고 기존 Slack outbox가 전달된다.
- no-action 또는 planner skip: 후보·회사 메시지를 억지로 만들지 않는다.

0명은 정상 결과다. 숫자를 채우기 위한 padding, 별도 Codex 판단, 별도 fit-only write나 deterministic
안내 문구를 추가하지 않는다.

## 6. 기존 queue 전환

Corrective migration은 아직 claim되지 않은 legacy `post_calibration_12h` row를 새 company matching
queue로 옮기고 old row를 `superseded_by_company_matching_worker`로 종료한다. Old waiting/notify trigger의
side effect를 없애 local calibration listener가 이 후속 작업으로 다시 깨어나지 않게 한다. Rolling rollout
동안 이전 listener의 preflight가 calibration까지 막지 않도록 trigger 이름과 function은 무동작 shim으로
남길 수 있다.

Migration 적용 전에 이미 `running`으로 claim된 legacy run은 중간에서 강제 종료하지 않는다. 이미
성공한 legacy run도 다시 enqueue하지 않는다.

## 7. 검증 체크리스트

- [ ] Calibration 생성, profile set, Slack 문구와 feedback 반영 경로가 바뀌지 않았다.
- [ ] 최초 Slack `sentAt`이 생긴 transaction에서 후속 run이 한 번만 예약된다.
- [ ] `available_at = sentAt + 12 hours`이며 그 전에는 claim되지 않는다.
- [ ] Run의 `trigger_reason=post_calibration`, `requested_role_ids=[calibration Role]`이다.
- [ ] Worker가 post-calibration을 explicit `company_requested`가 아닌 regular mixed-route run으로 처리한다.
- [ ] candidate-first/company-first/no-action과 수량·privacy·route guard가 월요일 정기 run과 같다.
- [ ] Local calibration listener가 `company_context_runs`나 post-calibration prompt를 읽지 않는다.
- [ ] Queued legacy run은 새 queue로 옮겨지고 old notify/waiting trigger는 side effect 없는 shim이다.
- [ ] Test-only, inactive, expired, auto-disabled Role은 enqueue되지 않는다.
- [ ] 정상 0명·skip에 별도 진행 메시지나 후보 contact가 생기지 않는다.
