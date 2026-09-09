# Calibration 후 12시간 초기 후보 검토 실행 계약

- 문서 기준: 2026-09-09
- 대상: 새 internal Role의 최초 profile calibration이 Slack에 전달된 뒤 한 번 실행하는 작업
- 기동 기준: calibration payload의 최초 `delivery.sentAt + 12 hours`
- 실행 단위: `role_id` 하나
- 결과: 추천 가능한 `talent × role` fit 저장 + 회사 진행 안내 1회
- 상위 작업 지도: [Company-side Codex 작업 지도](./codex-work.md)

## 1. 목적

이 작업은 세 목적을 동시에 만족한다.

1. 회사의 calibration feedback을 기다리느라 초기 추천 후보 탐색이 오래 지연되지 않게 한다.
2. 현재 문서만으로도 후보를 직접 검토하고, 추가로 알면 matching이 좋아질 질문을 발견한다.
3. 회사에 Harper가 실제 검토를 시작했다는 중간 상태를 알리고 다음 연락 시점을 분명하게 한다.

12시간 동안 feedback이 없었다는 사실은 실패가 아니다. 최신 Role 정보와 Hiring Brief로 작업을
진행한다. Feedback이 있으면 적용이 끝난 canonical Hiring Brief와 profile review reason을 함께
읽는다.

## 2. 반드시 읽을 정본

다음 순서로 처음부터 끝까지 읽는다.

1. repository root와 `harper_beta/AGENTS.md`
2. [Company-side Codex 작업 지도](./codex-work.md)
3. [특정 Internal Role 추천 후보 직접 탐색·평가 기준](./internal-role-talent-direct-review-ko.md)
4. [Company Context Run Codex 런북](../company/company-context-run-codex-runbook-ko.md)
5. [Company Context Run 개요](../company/company-context-run-overview-ko.md)
6. [Company-side UX Writing Guide](../company-side-ux-writing-guide-ko.md)
7. 필요하면 [Company-side 데이터 기반 Role Request 갱신 기준](./company-side-data-request-calibration-ko.md)

문서와 runtime 구현이 다르면 실행 중 임의로 migration이나 source를 고치지 않는다. 안전한 단계까지만
끝내고 run receipt에 정확한 mismatch를 남긴다.

## 3. 기동과 idempotency

### 3.1 시간 anchor

Due 시각은 calibration profile이 생성된 시각이나 웹에 표시된 시각이 아니라, Slack delivery가
최초 성공해 payload에 저장된 `sentAt`의 12시간 뒤다. 재전송은 최초 `sentAt`을 바꾸지 않는다.

Slack channel이 없어 `ready`로만 남은 calibration은 이 작업을 자동 예약하지 않는다. 이는 회사가
feedback 요청을 실제로 받았다는 전제를 지키기 위한 것이다. 향후 `/org` 노출을 delivery로 인정할
때는 별도 receipt와 제품 결정을 먼저 추가한다.

### 3.2 durable run

목표 구현은 기존 `company_context_runs`에 다음 의미의 row 하나를 둔다.

```json
{
  "trigger_reason": "post_calibration_12h",
  "available_at": "<delivery.sentAt + 12h>",
  "result": {
    "calibrationId": "<uuid>",
    "queuedAt": "<timestamp>"
  }
}
```

기존 one-open-run 제약을 그대로 사용한다. 신규 Role activation 때 즉시 생성되던 `role_created`
context run과 이 run을 둘 다 만들지 않는다. 최초 context/matching run은
`post_calibration_12h` 하나로 통합한다.

Listener wake notification은 실행 권한이 아니다. Helper가 due row를 atomic claim하고 Role의 현재
eligibility를 다시 검증한다. Listener가 꺼져 있던 동안 due가 지나도 재시작 후 queue에서 복구한다.

## 4. 시작 전 gate

다음 조건을 모두 만족해야 한다.

- Role이 internal, active, unexpired다.
- `company_internal_roles.is_auto = true`다.
- `company_roles.information.testOnly`가 true가 아니다.
- 연결 가능한 실제 company workspace가 있다.
- 연결된 calibration과 최초 Slack delivery receipt가 존재한다.
- 같은 calibration의 성공한 `post_calibration_12h` run 또는 성공한 회사 진행 안내 receipt가 없다.

하나라도 맞지 않으면 fit과 회사 메시지를 쓰지 않고 명시적 terminal reason으로 cancel한다.
Role이 일시적으로 paused인 경우 자동 재시도 여부를 코드로 추측하지 않는다. 현재 계약은 cancel이며,
향후 active 전환은 별도 reactivation 계약을 따른다.

## 5. 입력 snapshot

한 Role의 다음 데이터를 snapshot하고 hash를 남긴다.

- Role name, description/JD, location, work mode, employment type, compensation 구조화 field
- 전체 canonical `company_internal_roles.request`
- current `company_behavior_contexts` 또는 현재 구현의 동등한 Role behavior context
- calibration profile set과 회사가 남긴 Good/Bad, reason, Hiring Brief feedback
- company workspace의 matching에 필요한 정보
- 후보 평가에 사용할 evaluator/prompt/input-builder revision
- source row들의 `updated_at`

후보 packet은 `internal-role-talent-direct-review-ko.md`의 계약을 따른다. 각 talent에 profile,
resume/experience/education/skills, 명시적 preference, 전체 Search Brief와 같은 builder version의
Behavior Context를 제공한다. Raw Memory row나 전체 과거 대화·추천 이력을 별도 기본 입력으로 다시
주입하지 않는다.

## 6. 후보 retrieval과 직접 평가

### 6.1 범위

Role-first read-only SQL로 아직 같은 Role의 fit이 없는 후보를 찾는다. 최대 150명의 unique talent를
scan하고 안전 제외를 통과한 최대 100명의 full packet을 평가하는 현재 Company Context Run 상한을
따른다. 더 작은 임의 표본만 읽고 전체 pool을 검토했다고 말하지 않는다.

다음 후보는 제외한다.

- profile sharing을 허용하지 않은 talent
- blocked company와 일치하는 talent
- onboarding/profile이 평가 불가능한 상태인 talent
- 같은 Role에 이미 recommendation이나 active/closed pipeline history가 있는 pair
- test fixture 또는 synthetic talent
- 문서가 정의한 중복 identity와 기타 hard safety 제외 대상

### 6.2 판단

Codex 자신이 helper가 만든 모든 candidate document를 끝까지 읽고 `roleFit`, `candidateFit`,
`companyFit`, 최종 label/score/reason/recommend를 판단한다. 다음을 금지한다.

- SQL rank 또는 keyword hit를 fit score로 복사
- 몇 개 예시를 scenario별 branch나 heuristic으로 구현
- 이름, 성별, 사진, 국적 proxy 또는 학교·회사 prestige만으로 능력을 추론
- 정보가 적다는 이유만으로 자동 `unfit`
- 실제 회사 feedback보다 Codex의 이전 fit reason을 ground truth로 사용

평가 계약, output shape, label 의미, candidate preference와 same-company history 처리는 직접 검토
문서를 그대로 따른다.

## 7. 저장과 검증

추천 가치가 있다고 판단한 pair를 포함해 평가한 모든 유효 pair의 `talent_opportunity_fit`을 canonical
helper로 upsert한다. 이 실행의 source/kind와 evaluator version을 구분 가능하게 남긴다.

저장 후 다음을 검증한다.

- packet의 evaluated candidate 수와 valid result 수가 일치한다.
- excluded/skipped 수와 이유가 manifest에 있다.
- write 대상의 `role_id`, `talent_id`가 packet 안에 있다.
- 저장된 label, score, reason, recommend가 output과 일치한다.
- source snapshot이 중간에 바뀌지 않았다. 바뀌었으면 최신 packet으로 다시 평가하거나 write를
  중단한다.
- recommendation, delivery, candidate contact, tag와 pipeline row는 이 단계에서 새로 생기지 않았다.

후보가 0명 또는 추천 가능한 fit이 0개인 것은 정상 성공이다. 이 수치를 회사 안내에 넣지 않는다.

## 8. 회사 진행 안내

### 8.1 전달 시점과 채널

Fit write와 coverage 검증이 끝난 뒤 한 번만 전달한다.

- 회사 Slack의 해당 Role channel/thread
- 같은 workspace의 `/org` 대화에서 볼 수 있는 assistant/system message

한 채널의 실패가 다른 채널의 성공 receipt를 지우지 않는다. Retry는 실패한 채널만 대상으로 하며
동일한 idempotency key `post_calibration_review:<calibration_id>`를 사용한다.

### 8.2 메시지 계약

기본 의미는 아래와 같다. 실제 문장은 최신 Role 맥락과 writing guide에 맞게 LLM이 자연스럽게
작성하며 deterministic template로 덮어쓰지 않는다.

```text
<Role 이름>에 맞는 인재풀 검토를 시작했어요. 앞으로는 회사에 연결을 제안드릴 후보가 준비됐을 때
다시 연락드릴게요.

추가로 알려주시면 탐색에 도움이 되는 내용
• <지금 답할 수 있는 구체적인 질문 또는 선택지>
• <확장 가능한 기준을 긍정적으로 묻는 제안>
```

Bullet은 0~3개다. 실제로 답이 판단을 바꾸는 경우에만 넣고, 없으면 heading과 bullet을 모두
생략한다. 좋은 bullet 예시는 다음과 같다.

- 특정 산업 경험 대신 같은 문제를 end-to-end로 해결한 경험도 인정하는지
- 필수 기술과 입사 후 익힐 수 있는 기술의 경계
- 근무지, 출근 빈도, 시작 시점에서 허용 가능한 범위
- 더 폭넓게 만나볼 때 hard requirement를 preferred로 볼 수 있는 지점

다음은 금지한다.

- 검토한 후보 수, 통과/탈락 수, 후보가 없다는 결론
- `연봉이 낮다`, `기준이 높다`, `현실적이지 않다` 같은 평가
- 내부 score, fit label, query 범위, worker/queue/model/prompt 언급
- 실제로 후보자에게 연락하지 않았는데 연락 중이라고 말하는 표현
- fit 저장만 했는데 곧 후보를 소개할 것처럼 확정하는 표현
- 회사가 답해야만 작업을 계속한다는 압박

보상 또는 범위를 물어야 할 때도 결핍을 지적하지 않고 선택 가능한 범위를 묻는다. 예:

> 역할 범위나 보상 구성에서 열어둘 수 있는 선택지가 있다면 함께 알려주시면 탐색 범위를 더
> 정확하게 잡는 데 도움이 됩니다.

### 8.3 회사 안내와 내부 결과 분리

내부 run receipt에는 evaluated/fit/recommend 수와 no-result reason을 정확히 남긴다. 회사-visible
메시지는 운영 투명성을 위한 진행 안내이지 내부 감사 보고가 아니다. 내부 사실을 숨기기 위해
거짓말하지 않되, 아직 회사가 행동할 필요가 없는 부정적 탐색 결과를 전달하지 않는다.

## 9. 종료 상태

성공 result에는 최소한 다음이 있다.

```json
{
  "resultReason": "completed|no_eligible_unseen_candidate|no_recommendable_fit|pending_limit_reached",
  "calibrationId": "<uuid>",
  "sourceFingerprint": "<hash>",
  "counts": {
    "retrieved": 0,
    "evaluated": 0,
    "written": 0,
    "recommendable": 0
  },
  "companyNotice": {
    "idempotencyKey": "post_calibration_review:<calibration_id>",
    "companyMessageId": null,
    "slackMessageTs": null,
    "status": "sent|partial|not_configured|failed",
    "sentAt": null
  }
}
```

`not_configured`나 `partial`이면 fit run 자체는 성공할 수 있지만 delivery retry work는 남긴다.
Candidate private data와 Slack payload 전문은 result에 넣지 않는다.

## 10. 구현·검증 체크리스트

- [ ] Calibration delivery 성공 transaction이 최초 `sentAt + 12h` run을 한 번만 예약한다.
- [ ] 기존 immediate `role_created` context run과 중복되지 않는다.
- [ ] Listener가 calibration queue와 +12시간 queue의 가장 이른 due 시각을 보고 잠든다.
- [ ] Due notification을 놓쳐도 queue scan으로 복구한다.
- [ ] 같은 Role의 run을 동시에 claim하지 않는다.
- [ ] Test-only Role은 enqueue와 claim 양쪽에서 차단된다.
- [ ] 최신 calibration feedback과 Hiring Brief가 candidate packet에 반영된다.
- [ ] Candidate packet 밖의 talent를 쓰지 않는다.
- [ ] 모든 packet을 직접 평가했고 coverage mismatch가 있으면 write하지 않는다.
- [ ] Fit write 뒤 recommendation/contact/pipeline count가 의도치 않게 바뀌지 않는다.
- [ ] Slack과 `/org` 안내가 idempotent하며 각각 receipt가 있다.
- [ ] 안내 문구가 내부 수치, 부정적 결론과 구현 용어를 노출하지 않는다.
- [ ] Listener restart, Slack partial failure, role pause, concurrent request update를 재현한다.

