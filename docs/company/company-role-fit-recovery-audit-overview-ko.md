# Company Role Fit Recovery Audit: 목적과 구현 계약

- 문서 기준: 2026-09-02
- 상태: 로컬 read-only helper 구현 및 파일럿 운영
- 반복 실행 절차: [Company Role Fit Recovery Audit Codex 런북](./company-role-fit-recovery-audit-codex-runbook-ko.md)
- 평가·검색 변경 기록: [Company Role Fit Recovery Audit Calibration](./company-role-fit-recovery-audit-calibration-ko.md)
- 관련 운영 흐름: [Company Context Run 개요](./company-context-run-overview-ko.md)

## 1. 한 문장으로 설명

`Company Role Fit Recovery Audit`은 특정 회사의 활성 internal role에 대해, 아직 fit 평가가 없거나 현재 effective label이 fit이 아닌 talent 중 우선순위가 높은 소수만 Codex가 직접 다시 읽고, 기존 자동 평가가 놓친 추천 가능 후보를 찾는 제한된 반복 감사다.

이 감사의 핵심은 전체 talent를 매번 재평가하는 것이 아니다. 한 번 실행할 때 정해진 수의 unique talent만 검토하고, 이미 검토한 사람과 입력이 그대로인 사람을 반복해서 소비하지 않으며, 실제 후보·회사 반응을 이용해 다음 검색과 평가 품질을 점진적으로 개선하는 것이다.

## 2. 기존 흐름과의 경계

### 2.1 Company Context Run

기존 `Company Context Run`은 role별 회사 행동 context를 갱신하고, 해당 role의 fit row가 아직 없는 신규 후보를 찾는 production workflow다. 현재 자동 실행에서는 기존 fit row를 시간 경과나 일반적인 입력 변경만으로 재평가하지 않는다.

Recovery Audit은 이 production workflow를 대체하지 않는다. 이미 non-fit row가 존재하는 후보를 다시 볼 필요가 있는지 제한된 예산 안에서 점검하는 별도 audit이다.

### 2.2 Worker internal fit

Worker가 생성한 `talent_opportunity_fit`은 넓은 후보군에 대한 기존 평가 evidence다. Recovery Audit은 기존 label과 score를 최종 진실로 취급하지 않지만, 누구부터 다시 읽을지를 정하는 retrieval signal로는 사용할 수 있다.

기존 Worker 결과가 `unfit`이라는 사실만으로 영구 제외하지 않는다. 반대로 기존 점수가 높다는 사실만으로 Codex가 전문을 읽지 않고 `fit`으로 바꾸지도 않는다.

### 2.3 수동 matching과 추천 발송

Recovery Audit의 기본 결과는 “다시 검토했을 때 이 pair가 어떤 label인가”이다. 후보자 추천 생성, 메시지 발송, 회사 공유, 연결 대기 이동은 이 감사의 책임이 아니다.

`fit`과 `recommend`도 분리한다.

- `fit`: 이 role을 후보에게 보여 줄 가치가 있고 회사가 검토할 근거가 충분한가
- `recommend`: 같은 회사의 다른 role, 현재 timing, 기존 추천 이력을 고려했을 때 지금 먼저 제안할 role인가

로컬 read-only 단계에서는 둘 다 제안값일 뿐 production 상태를 바꾸지 않는다.

## 3. 첫 운영 범위: Wonderful

첫 운영 대상은 Wonderful의 활성·미만료·비테스트 internal role이다.

2026-09-02 확인 시점에는 다음 상태였다.

- 활성·비테스트 Wonderful internal role: 14개
- `company_internal_roles.is_auto=true`: 12개
- `is_auto=false`: Deployment Strategist, Head of Partnerships APAC 2개
- 전체 talent: 5,365명
- 활성 Wonderful role의 `talent_opportunity_fit`: 57,752 pair, 4,328 unique talent
- `company_context_fit_refresh`가 기록된 Codex 평가: 432 pair

이 숫자는 설계 근거를 남기기 위한 시점 snapshot이며 runtime 상수로 사용하지 않는다.

자동 반복 감사는 기본적으로 `is_auto=true` role만 다룬다. `is_auto=false` role은 사용자가 그 role을 명시적으로 포함한 manual audit에서만 읽는다. Wonderful이라는 이름을 코드에 hardcode하지 않고 company workspace 또는 명시된 role ID 목록을 입력으로 받는다.

## 4. 목표와 비목표

### 4.1 목표

- 기존 자동 평가의 false negative 또는 누락 후보를 제한된 비용으로 발견한다.
- 한 실행에서 50~150명의 unique talent만 깊게 검토한다.
- 같은 사람과 같은 입력을 반복 평가하지 않는다.
- 국가별 sibling role과 공통 JD를 compact하게 표현해 context 낭비를 줄인다.
- 같은 회사의 다른 role에서 발생한 실제 추천·후보 반응·현재 진행 상태를 현재 판단에 반영한다.
- 평가 결과와 실제 downstream outcome을 연결해 검색과 판단을 개선한다.
- human override, test-only 격리, privacy와 추천 이력을 보존한다.

### 4.2 비목표

- 전체 talent 또는 전체 pair의 정기 재계산
- 기존 Worker를 대체하는 새 production matcher
- 대화 상황별 상태 머신이나 scenario별 prompt branch
- 감사 결과만으로 추천·발송·회사 공유를 실행하는 것
- 몇 가지 성공·실패 사례를 즉시 hard filter로 바꾸는 것
- runtime이 스스로 prompt나 retrieval rule을 수정하는 것

## 5. 실행 예산

예산의 단위는 pair가 아니라 unique talent다.

초기 운영값은 다음과 같다.

| 단계 | unique talent 상한 | 용도 |
| --- | ---: | --- |
| 첫 로컬 dry-run | 50 | 데이터 모양, packet 크기, 판단 품질 확인 |
| 일반 반복 실행 | 100 | 기본 운영값 |
| 한 실행의 절대 상한 | 150 | 명시적 확대 시에도 넘지 않는 상한 |

한 talent가 여러 Wonderful role과 관련될 수 있어 실제 pair 평가 수는 talent 수보다 많을 수 있다. 하지만 모든 활성 role의 전체 JD를 모든 talent에게 주지 않는다. 먼저 compact role index를 읽고, 가능성이 있는 소수의 role 또는 role family만 상세 평가한다.

시간 또는 안전 제한에 도달하면 이미 완료한 talent까지만 checkpoint하고 정상적인 partial run으로 끝낼 수 있다. 평가하지 않은 후보를 평가한 것으로 기록하거나 negative label로 채우지 않는다.

## 6. 대상 pair

### 6.1 포함 가능 대상

다음 중 하나에 해당하는 pair가 retrieval pool에 들어갈 수 있다.

1. 해당 role의 `talent_opportunity_fit` row가 없음
2. Effective label이 `hold`, `ambiguous`, `dissatisfied`, `unfit` 중 하나임
3. 과거 Codex audit 이후 candidate, role 또는 company context의 matching-relevant fingerprint가 달라짐
4. 실제 hold 질문 답변처럼 기존 판단을 바꿀 새 정보가 생김

Effective label은 human override가 있으면 human label, 없으면 model label이다. 다만 자동 Recovery Audit은 human override가 존재하는 pair를 writeback 대상으로 삼지 않는다. 필요하면 별도 read-only 예외 보고서에서만 표시한다.

### 6.2 기본 제외

- inactive, ended, expired role
- `company_roles.information.testOnly=true` role
- 자동 실행에서 `is_auto=false` role
- `profile_visibility='dont_share'`
- 명시적으로 차단한 회사
- 같은 role이 이미 추천됐거나 진행·종료 상태가 있는 pair
- effective `fit`
- human override가 있는 pair의 자동 변경
- 동일 candidate·role·context·evaluator fingerprint로 최근 audit이 완료된 pair

`talent_setting.status='stopped'`는 외부 주기 추천 상태이며 privacy opt-out이 아니다. 이 값 하나만으로 internal audit에서 제외하지 않는다.

같은 회사의 **다른** role에 추천·수락·거절·진행 이력이 있다는 사실은 audit 전체의 일괄 제외 조건이 아니다. 그 이력은 현재 pair의 독립적인 fit과 지금 먼저 제안할 role인지를 판단하는 evidence로 읽는다. 특정 운영자 지시가 있는 exact-pair writeback에서만 더 강한 별도 guard를 적용할 수 있다.

## 7. 우선순위 선정

SQL과 deterministic code는 누구부터 자세히 읽을지만 정한다. 최종 label과 reason은 Codex가 candidate packet 전체를 읽고 판단한다.

### 7.1 우선순위 tier

1. Role 관련성이 높고 Recovery Audit에서 한 번도 검토하지 않은 talent
2. 기존 non-fit이지만 matching-relevant 입력이 달라진 talent
3. 새 정보가 생긴 `hold` 또는 근거가 혼재했던 `ambiguous`
4. 기존 retrieval의 상위권 밖에 계속 남아 있던 미검토 talent의 순환 표본

기존 label 종류나 오래된 순서만으로 우선순위를 정하지 않는다. Role 수행 근거, location·근무 조건의 명시적 evidence, 최근 profile·행동 정보, 기존 same-company history를 함께 사용한다.

### 7.2 기본 exploitation과 exploration

일반 실행 N=100의 초기 배분은 다음과 같다.

- 80명: 현재 role-specific retrieval 상위 미검토 또는 입력 변경 talent
- 20명: 다음 priority 구간의 미검토 talent를 deterministic rotation으로 선택

이 비율은 초기값일 뿐 runtime 불변식이 아니다. 여러 실행의 yield와 coverage를 보고 calibration 문서에서 변경한다. Random selection 대신 run cycle과 stable talent identifier를 이용한 deterministic bucket을 사용해 실행을 재현할 수 있게 한다.

### 7.3 Role coverage

한두 role이 전체 N명을 독점하지 않도록 active role 또는 role family별 최소 검토 기회를 둔다. 이것은 label quota가 아니라 retrieval coverage다.

Role에 실제 후보가 부족하면 수를 채우기 위해 relevance 기준을 낮추지 않는다. 남는 예산은 다른 role의 다음 후보에게 배분한다.

## 8. Wonderful multi-role context 구성

Wonderful에는 공통 JD를 공유하면서 국가, location, work authorization, onsite 조건이 다른 role variant가 있다. `company_roles.information.sourceRoleId`가 있는 경우에만 authoritative family로 묶는다. 제목이 비슷하다는 이유만으로 임의 병합하지 않는다.

Candidate에게 제공하는 context는 두 단계다.

1. 회사 설명과 active role/family의 compact index
2. Codex가 자세히 볼 가치가 있다고 판단한 role/family의 full role card

Variant마다 다음 정보는 유지한다.

- 실제 `roleId`
- location과 country
- work mode와 onsite 조건
- compensation이 있으면 그 정보
- `company_internal_roles.request`
- role criteria
- role별 company behavior context

### 8.1 근로권 판단 규칙 — 모든 국가 Role에 필수 적용

> **핵심 운영 규칙:** 후보의 **현재 profile location이 target 국가에 있고**, 동시에 **같은 국가의 학교 이력 또는 실제 회사 근무 이력 중 하나 이상**이 있으면, Recovery Audit에서는 그 국가의 현지 근로권이 있는 것으로 판단한다.

이 규칙은 Wonderful의 국가별 Field CTO, Site CTO, FDE를 포함한 모든 Recovery Audit role에 동일하게 적용한다. 현재 위치만으로는 충분하지 않지만, 현재 위치와 독립적인 장기 정착 evidence인 현지 교육 또는 현지 근무 이력이 함께 있으면 work authorization 미확인을 이유로 `hold`나 `unfit`을 주지 않는다.

적용 순서는 다음과 같다.

1. Target role의 국가를 확정한다.
2. Candidate의 최신 profile location이 그 국가인지 확인한다.
3. Education의 학교 소재 국가 또는 experience의 실제 근무 소재 국가 중 하나가 같은 국가인지 확인한다.
4. 2와 3이 모두 맞으면 `inferred local work authorization`으로 기록하고 근로권 blocker를 해소한다.
5. 후보가 해당 국가에서 sponsorship이 필요하다고 명시했거나 permit 만료·근무 불가처럼 더 직접적이고 최신인 반대 evidence가 있으면 그 명시적 evidence를 우선한다.

학교명, 회사명 또는 도시의 국가가 자료에서 명확하게 식별되는 경우에만 사용한다. 이름, 언어, 민족, 추정 국적은 evidence로 사용하지 않는다. `Remote`, 여러 국가를 포괄하는 region 표기, 여행·출장·단기 방문은 현지 학교 또는 근무 이력으로 계산하지 않는다.

이 규칙은 **근로권**만 판단한다. 특정 도시 relocation, 오피스·고객사 onsite 의향, 고용 형태와 일정은 별도 candidate-side 조건이다. 다만 후보의 현재 위치가 target 도시이고 같은 국가의 현지 학교·근무 이력도 있으면, 반대 evidence가 없는 한 그 도시에서의 기본적인 onsite feasibility도 positive evidence로 사용할 수 있다.

## 9. Candidate packet

가능하면 `harper_worker/opp/utils/internal_fit.py`가 사용하는 canonical profile projection과 normalization을 재사용한다. 별도의 축약 프로필 규격을 만들지 않는다.

최소 포함 정보:

- profile, resume, experience, education, skill
- matching preference와 명시적 constraint
- Talent Behavior Context와 current interaction delta
- 최근 추천 수락·거절·무응답 등 관련 행동
- target role의 현재 fit·추천·progress·tag
- 같은 회사의 다른 role에 대한 아래 계약의 짧은 추천·반응·진행 history
- 최신 회사·role 정보, request, criteria, company behavior context

Packet에는 raw contact detail을 넣지 않는다. Run artifact에는 평가에 필요한 private profile이 포함될 수 있으므로 git에 넣지 않고 retention 정책을 적용한다.

### 9.1 같은 회사의 다른 Role 이력 계약

Recovery Audit은 현재 Worker internal-fit 평가가 사용하는 것과 같은 의미의 `same-company history`를 필수 판단 입력으로 사용한다. 정확한 `company_workspace_id`가 같은 internal, non-test sibling role 중 실제 추천이 있었던 role의 최신 이력을 읽고, 현재 평가하는 target role은 이 목록에서 제외한다. 단순히 sibling `talent_opportunity_fit` row가 있다는 사실만으로 추천 이력을 만들지 않는다.

각 sibling role 이력에는 필요한 범위에서 다음을 포함한다.

- role ID와 이름, 추천 시각
- 후보의 수락·거절·보류·무응답 등 명시적 반응과 그 이유
- 최신 authoritative process stage: 추천, 연결 대기, 연결됨, 회사 측 거절·종료, 최종 오퍼, 보류, 프로세스 중단, 아카이브, custom stage
- 다른 role로 이동했다면 이동한 target role
- 프로세스 중단 사유가 있으면 그 요약

최신 stage/tag를 현재 회사 pipeline 상태의 정본으로 사용한다. 오래된 recommendation column, 대화 요약 또는 behavior context가 같은 건을 accepted·connected·pending이라고 표현하더라도 최신 authoritative stage가 회사 측 거절·종료 또는 프로세스 중단이면 active 상태로 재해석하지 않는다.

입력은 현재 판단에 필요한 최신 role별 사건만 시간 역순으로 compact하게 제공하며 기본 상한은 Worker와 같은 2,000자다. 원문 메시지와 회사 private note를 그대로 복제하지 않는다. 이력이 없다는 것은 negative evidence가 아니라 관측된 sibling 추천 이력이 없다는 뜻이다.

적용 원칙은 다음과 같다.

- 현재 role의 `label`과 `score`에는 evidence가 role 경계를 넘어 실제로 적용될 때만 반영한다. 예: 후보의 명시적인 회사 전체 거절, 현재도 유효한 회사 단위 선호, 회사의 명시적인 candidate-level 거절.
- 특정 sibling role의 직무·레벨·지역 조건 때문에 생긴 거절·중단은 자동으로 현재 role의 부정 판단으로 옮기지 않는다.
- 더 강한 sibling role이 있다는 이유만으로 독립적으로 성립한 현재 role의 `fit`을 낮추지 않는다.
- `recommend`에는 같은 회사에서 이미 제안·수락·진행 중인 role, 더 적합한 sibling role, terminal outcome을 반영해 중복되거나 부적절한 선제 제안을 피한다.
- 과거 sibling 추천이 무응답이었다는 사실만으로 materially better하거나 의미 있게 다른 새 role의 `recommend`를 자동 차단하지 않는다.
- 이력이 판단을 바꿨다면 어떤 sibling outcome이 `label`, `score` 또는 `recommend`에 영향을 줬는지 `reason`에 짧게 설명하되 private 회사 문구를 그대로 노출하지 않는다.

## 10. Pair 평가 계약

Codex는 각 pair를 독립적으로 평가한다. SQL rank, 기존 score, 다른 후보와의 상대 순위는 label 근거가 아니다.

같은 회사 이력을 읽은 뒤에도 role별 fit 판단과 첫 제안 선택을 분리한다. 먼저 각 role의 `label`과 `score`를 독립적으로 정하고, 그 다음 sibling role의 추천·반응·진행 상태를 포함한 전체 회사 문맥으로 `recommend`를 정한다.

| Label | Score | 의미 |
| --- | ---: | --- |
| `fit` | 80~100 | 회사-side bar를 통과하고 명시적 blocker 없이 지금 보여 줄 가치가 있음 |
| `hold` | 60~79 | 결과를 바꿀 구체적 candidate-side 정보 하나가 빠짐 |
| `ambiguous` | 60~79 | blocker는 없지만 수행 또는 상호 적합 근거가 불완전·혼재됨 |
| `dissatisfied` | 40~59 | 한쪽이 의미 있게 불만족할 가능성이 높은 soft mismatch |
| `unfit` | 0~39 | 명시 조건이나 핵심 역량 등의 hard mismatch |

후보자가 이 정확한 role을 사전에 알지 못했다는 사실은 `hold`나 `ambiguous`의 근거가 아니다. 후보의 일반적인 직무·레벨·지역·근무형태 선호와 충돌하지 않고 회사가 인터뷰할 충분한 이유가 있으면 새로운 기회도 `fit`이 될 수 있다.

최소 machine-consumed 출력은 다음뿐이다.

```json
{
  "talentId": "uuid",
  "evaluations": [
    {
      "roleId": "uuid",
      "label": "fit|hold|ambiguous|dissatisfied|unfit",
      "score": 0,
      "recommend": false,
      "reason": "판단에 실제로 사용한 candidate·company 양쪽 근거와 중요한 차이",
      "reevaluationCriteria": null
    }
  ]
}
```

`reevaluationCriteria`는 `hold`에서만 사용한다. Qualitative judgment를 여러 confidence·plan·intent field로 분해하지 않고 `reason`에 간결하게 남긴다.

## 11. 로컬 cache와 실행 artifact

새 production table을 만들지 않는다. Pair의 durable 평가 상태는 기존 `talent_opportunity_fit`과 `company_side_evaluation_metadata`로 충분하다.

로컬 cache는 반복 실행의 rotation과 checkpoint만 담당한다.

```text
harper_beta/output/company_role_fit_audit/
  state/
    rotation.json
  runs/
    <run_id>/
      manifest.json
      role_index.json
      candidate_index.json
      candidates/<talent_id>.md
      evaluations.jsonl
      validation.json
      metrics.json
      summary.md
      review-report.md
```

`rotation.json`에는 다음 최소 정보만 둔다.

- talent ID
- 마지막 선정 시각
- 평가한 role ID
- candidate·role·context fingerprint
- 같은 회사 sibling history fingerprint
- 마지막 성공 run ID

프로필 원문, 대화 전문, resume, 판단 reason은 rotation cache에 복제하지 않는다. Pair별 평가 내용은 run artifact와 writeback 이후의 기존 fit row에서 확인한다.

`summary.md`는 장기 비교 가능한 집계만 담는다. 후보별 가입일, 최근 사용일, 온보딩 완료 여부, 기존 label·reason, 이번 audit label·score·reason은 private `review-report.md`에 모든 완료 후보를 빠짐없이 기록한다. 이 상세 보고서는 candidate packet과 같은 접근·보존 정책을 적용하며 git에 넣지 않는다.

Cache는 평가 결과 checkpoint가 성공한 뒤에만 전진한다. 중간 실패 talent는 완료로 표시하지 않는다. Cache가 없어지면 DB evaluation metadata와 보존된 run manifest로 다시 만들 수 있어야 한다.

새 sibling 추천, 후보 반응, role 이동, 회사 stage 변경 또는 프로세스 종료가 생기면 같은 회사 history fingerprint가 바뀌어야 한다. Candidate와 target role이 그대로여도 이 fingerprint가 달라지면 이전 cache를 재사용하지 않고 다시 평가한다.

Evaluator contract 또는 근로권 추정 규칙의 version이 바뀌어도 candidate·role 원문과 same-company history가 같더라도 이전 cache를 재사용하지 않고 다시 평가한다.

## 12. 보존과 cleanup

- Candidate packet과 raw private input: 기본 30일 뒤 삭제
- Rotation index: role이 active인 동안 유지하되 private 원문은 저장하지 않음
- Aggregate metrics와 run summary: 장기 비교를 위해 유지 가능
- 종료·삭제된 role의 rotation state: 다음 cleanup에서 제거

Cleanup은 실행 중인 run을 건드리지 않고, exact audit output root 아래에서만 수행한다.

## 13. Writeback 단계

첫 2~3회는 local read-only로만 실행한다. Writeback은 별도 검토 후 활성화한다.

Writeback이 활성화되면 다음 원칙을 지킨다.

- Codex가 full candidate packet을 실제로 읽은 pair만 upsert
- `human_label`과 관련 human review field 보존
- `kind='codex'`
- `score`, `label`, `reason`, 필요한 `reevaluation_criteria`
- `last_evaluated_at`
- audit workflow, run ID, evaluator version, candidate·role·context fingerprint metadata
- dry-run에서는 DB write 0건

초기 writeback은 `recommend=false`로 둔다. 발견한 fit을 실제 추천 대상으로 승격하는 일은 downstream 소비자와 pending capacity를 확인한 별도 명시적 commit 단계로 분리한다.

Writeback 전에 현재 production consumer가 `label`, `kind`, `recommend`를 어떻게 사용하는지 다시 trace한다. Audit 결과가 의도치 않게 추천이나 delivery를 시작할 가능성이 있으면 writeback을 활성화하지 않는다.

## 14. 개선 loop

시스템은 실행 중 스스로 prompt나 SQL 규칙을 수정하지 않는다. 개선은 관찰된 결과를 calibration 문서에 남기고, 검토된 변경을 다음 version에 반영하는 방식이다.

매 run에서 다음을 측정한다.

- unique talent 검토 수
- pair 평가 수
- 최근 run과의 talent 반복률
- role/family별 coverage
- 기존 non-fit에서 `fit`으로 바뀐 수와 비율
- label별 yield
- human review와의 일치·불일치
- 후보자 수락·거절
- 회사 수락·다음 단계 진행
- 사람당 처리 시간과 전체 실행 시간

해석 원칙:

- fit yield가 낮으면 fit 기준을 낮추기 전에 retrieval recall과 candidate packet을 먼저 점검한다.
- fit은 많지만 회사 진행률이 낮으면 company-side interview case와 reason 근거를 점검한다.
- 후보 거절이 많으면 location, seniority, compensation, 직무 선호 evidence를 점검한다.
- 한두 사례만으로 hard filter나 prompt branch를 추가하지 않는다.
- 변경 전후를 같은 정의의 metric으로 비교할 수 없으면 개선이라고 단정하지 않는다.

## 15. 운영 단계

### Phase 0: 문서와 계약 정리

- Company Context Run의 신규 평가와 Recovery Audit의 재발견 범위를 분리한다.
- 기존 문서와 Codex automation prompt의 상충을 제거한다.
- Wonderful `is_auto=true` role을 첫 범위로 고정한다.

### Phase 1: 로컬 read-only, N=50

- Candidate selection과 packet 크기를 확인한다.
- 50명의 개별 판단을 checkpoint한다.
- DB, recommendation, delivery write가 0건인지 확인한다.

### Phase 2: 반복 calibration

- N을 100까지 확대한다.
- 2~3회 run의 yield, repeat rate, role coverage를 비교한다.
- 명백한 false positive와 false negative를 사람이 표본 검토한다.

### Phase 3: 제한적 writeback

- Human override 없는 full-review pair만 기존 fit row에 반영한다.
- 추천·발송은 계속 분리한다.
- Idempotency와 downstream consumer를 검증한다.

### Phase 4: 주기 자동화

- 별도 Codex scheduled task로 주 1회부터 시작한다.
- Automation prompt는 이 문서의 판단 규칙을 복사하지 않고 canonical runbook을 읽도록 한다.
- 실패한 run은 running 상태나 half-written cache를 남기지 않는다.

## 16. 완료 기준

다음 조건이 충족돼야 한 run이 완료된 것이다.

- 명시된 company와 role scope만 읽음
- N 이하의 unique talent만 선정함
- 선정 talent 전원의 full candidate packet 평가 또는 명시적 partial 종료가 기록됨
- 평가하지 않은 pair에 label을 쓰지 않음
- Cache와 evaluation checkpoint가 일치함
- Dry-run DB write가 0건임
- Human override, test-only, privacy, recommendation history 보호가 확인됨
- 완료한 모든 candidate에서 같은 회사 sibling 추천·반응·진행 이력을 조회했고, 없으면 없음으로 확인함
- Run summary와 metric이 남음
- 완료한 모든 후보의 온보딩 상태와 기존·이번 판정 근거가 상세 보고서에 남음

## 17. 변경 이력

| 날짜 | 주요 변경 |
| --- | --- |
| 2026-09-02 | 현재 target 국가 location과 같은 국가의 학교 또는 실제 근무 이력이 함께 있으면 현지 근로권을 인정하는 필수 판단 규칙과 evaluator-version cache 무효화를 추가함 |
| 2026-09-02 | Worker internal-fit과 같이 동일 회사 sibling role의 추천·후보 반응·authoritative 진행 상태를 label·score·recommend 및 cache 무효화에 반영하는 계약을 추가함 |
| 2026-09-02 | 모든 완료 후보의 가입·최근 사용·온보딩·기존 판정·dry-run 판정을 담는 private 상세 보고서 계약을 추가함 |
| 2026-09-02 | Wonderful을 첫 범위로 하는 bounded Codex fit recovery audit의 목적, cache, 평가, 개선 계약을 작성함 |
