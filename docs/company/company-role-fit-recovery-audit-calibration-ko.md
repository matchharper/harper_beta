# Company Role Fit Recovery Audit: Calibration과 변경 기록

- 문서 기준: 2026-09-03
- 상태: local read-only baseline 및 운영자 승인 수동 실행 calibration 기록
- 기능 계약: [Company Role Fit Recovery Audit 개요](./company-role-fit-recovery-audit-overview-ko.md)
- 실행 절차: [Company Role Fit Recovery Audit Codex 런북](./company-role-fit-recovery-audit-codex-runbook-ko.md)

## 1. 목적

이 문서는 Recovery Audit의 retrieval, candidate packet, evaluator contract가 실제 결과를 바탕으로 어떻게 바뀌었는지 기록한다.

Runtime이 이 문서를 자동으로 수정하거나 과거 결과를 보고 스스로 prompt를 다시 쓰지 않는다. 사람 또는 Codex가 여러 run의 evidence를 검토하고, 변경 가설과 기대 효과를 명시한 뒤 repository change로 반영한다.

## 2. 무엇을 개선하는가

개선 대상은 세 층으로 구분한다.

### 2.1 Retrieval

- 추천 가능 후보가 상위 N명 안에 들어오는가
- 특정 role, 학교, 회사, title, location에 과도하게 편중되는가
- Missing-fit과 existing-non-fit이 적절히 섞이는가
- Rotation 표본이 기존 검색의 사각지대를 발견하는가

### 2.2 Candidate packet

- 최종 판단을 바꿀 profile·preference·behavior evidence가 포함되는가
- 모든 과거 사건과 모든 role JD를 불필요하게 복제하지 않는가
- Same-company history가 현재 판단에 필요한 만큼만 들어오는가
- 실제 추천이 있었던 sibling role의 후보 반응과 authoritative 진행 상태가 빠짐없이 정규화되는가
- 새 sibling 추천·반응·stage 변경이 history fingerprint를 바꾸고 cache 재평가를 일으키는가
- 국가 variant의 공통 정보와 role-specific 조건이 올바르게 분리되는가

### 2.3 Evaluation

- 회사가 인터뷰할 구체적 근거가 있는가
- 후보가 고려할 현실적 이유와 blocker를 구분하는가
- 결측을 hard mismatch로 잘못 쓰지 않는가
- `fit`과 `recommend`를 구분하는가
- Sibling role outcome 중 role 경계를 넘어 적용되는 evidence만 label·score에 반영하는가
- 이미 진행 중인 sibling과 더 나은 첫 제안을 `recommend`에 반영하되 독립적인 role fit을 훼손하지 않는가
- 현재 target 국가 location과 같은 국가의 학교 또는 실제 근무 이력 조합으로 근로권을 일관되게 인정하고, 명시적 반대 evidence를 우선하는가
- 후보마다 최소 5문장 reason으로 기술·고객/사업·리더십·candidate-side 조건·same-company/결론을 각각 설명하는가

## 3. 개선하지 않는 방식

- Fit 수를 늘리기 위해 score band나 bar를 임의로 낮추지 않는다.
- 한 회사의 몇 사례를 title별 hardcoded branch로 만들지 않는다.
- 한 번의 수락·거절을 회사 공통 선호로 일반화하지 않는다.
- Retrieval keyword hit를 최종 positive evidence로 승격하지 않는다.
- Human override와 회사 outcome을 무조건 정답으로 간주하지 않는다.
- 서로 다른 기간과 다른 cohort의 수치를 같은 metric인 것처럼 비교하지 않는다.

## 4. Version identity

각 run은 다음 version identity를 남겨야 한다.

```json
{
  "retrievalVersion": "...",
  "candidatePacketVersion": "...",
  "evaluatorVersion": "...",
  "sameCompanyHistoryContractVersion": "...",
  "roleInventoryFingerprint": "...",
  "companyContextFingerprint": "...",
  "cacheVersion": "..."
}
```

Version 문자열만 올리고 실제 변경 내용을 남기지 않는 것은 허용하지 않는다. 변경 row에는 어떤 input이나 판단이 달라졌는지 적는다.

## 5. Run metric

### 5.1 Coverage

| Metric | 정의 |
| --- | --- |
| selected unique talents | Candidate index에 들어간 unique talent 수 |
| completed unique talents | 모든 target pair 평가와 checkpoint가 끝난 talent 수 |
| evaluated pairs | 실제 label과 reason을 작성한 pair 수 |
| repeat rate | 직전 비교 run에서도 완료됐던 talent / 이번 완료 talent |
| role coverage | Role 또는 authoritative role family별 완료 talent 수 |
| source-state mix | `missing_fit`, `existing_non_fit` 각각의 완료 수 |

### 5.2 Discovery quality

| Metric | 정의 |
| --- | --- |
| recovered fit yield | 기존 effective non-fit 중 Codex가 fit으로 판단한 pair / 검토한 existing-non-fit pair |
| missing fit yield | 기존 row가 없던 pair 중 Codex fit / 검토한 missing-fit pair |
| recommend yield | `recommend=true` pair / 평가 pair. Local 단계에서는 제안값 |
| hold yield | 구체적인 candidate-side 질문 하나로 결과가 바뀔 수 있는 hold 비율 |
| unsupported positive rate | 사람 표본 검토에서 company-side 근거가 부족하다고 판정된 fit 비율 |
| same-company history impact | Sibling 추천·반응·진행 이력이 label, score 또는 recommend에 영향을 준 pair 수와 영향 종류 |

### 5.3 Downstream outcome

Writeback과 실제 추천이 시작된 뒤에만 계산한다.

| Metric | 정의 |
| --- | --- |
| candidate consideration | 후보가 제안을 검토·수락한 비율 |
| candidate rejection reason mix | 명시된 거절 이유의 안정된 category 분포 |
| company acceptance | 회사가 후보를 명시적으로 수락한 비율 |
| meaningful progress | 인터뷰 등 다음 단계로 진행한 비율 |
| human agreement | 독립 human review와 label이 일치한 비율 |

무응답을 수락이나 거절로 추론하지 않는다. Candidate 수락은 회사 공유나 회사 수락을 의미하지 않는다.

### 5.4 Resource

- 실행 wall time
- talent당 평균 검토 시간
- candidate packet의 대략적 크기
- partial 종료 수와 stage
- cache 또는 packet 재생성 수

## 6. 표본 검토

각 calibration cycle은 최소한 다음 표본을 본다.

- 새로 recovered fit으로 판단한 pair
- `fit`과 `ambiguous` 경계 사례
- 높은 retrieval rank였지만 `unfit`인 사례
- Rotation lane에서 발견한 fit 또는 strong ambiguous
- Human override나 실제 outcome과 충돌한 사례

표본은 runtime에 그대로 넣는 few-shot fixture가 아니다. 어떤 evidence가 누락됐고 어떤 일반 원칙을 고쳐야 하는지 평가하는 용도다.

## 7. 변경 승인 기준

변경마다 다음을 적는다.

1. 관찰한 문제
2. 근거 run과 cohort
3. 가장 이른 실패 단계: retrieval, packet, evaluation 중 하나
4. 변경 내용
5. 유지해야 할 safety contract
6. 기대 metric 변화
7. 회귀 가능성
8. 확인할 다음 run 범위

한 run의 anecdote만 있으면 기본적으로 `관찰`로 남기고 runtime 변경은 보류한다. 명확한 safety 또는 data-integrity defect는 한 건이어도 즉시 고칠 수 있다.

## 8. Run 기록 template

새 실행마다 아래 형식으로 최신 row를 위에 추가한다.

### YYYY-MM-DD · `<run_id>`

- Mode:
- Company / role scope:
- Evaluator identity:
- N / completed:
- Source-state mix:
- Label counts:
- Recovered fit yield:
- Repeat rate:
- Role coverage:
- Resource:
- Human sample review:
- Observed failure stage:
- 다음 가설:
- Runtime 변경 여부: 없음 또는 change reference

Private profile 원문, resume, message, email과 candidate 이름을 이 문서에 복제하지 않는다. 필요한 경우 run artifact의 opaque reference만 남긴다.

### 2026-09-02 · `708d6f41-260a-4ae7-8259-dd683b3ee774`

- Mode: `local_read_only`
- Company / role scope: Wonderful Field CTO Australia·Japan, Site CTO Indonesia·Thailand. 직전 50명은 유지하고 rotation cache로 제외한 추가 cohort
- Evaluator identity: `company-role-fit-recovery-codex-v2-work-authorization-inference`
- N / completed: 100 / 100. 모든 후보 reason 최소 5문장 validation 통과
- Source-state mix: `existing_non_fit=91`, `missing_fit=9`
- Label counts: `fit=3`, `hold=7`, `ambiguous=18`, `dissatisfied=32`, `unfit=40`
- Recovered fit yield: 1 / 91. Missing-fit 중 fit은 2 / 9
- Repeat rate: 직전 CTO 50명과 중복 0명, run 내부 중복 0명
- Role coverage: Australia 32, Japan 32, Indonesia 30, Thailand 6
- Resource: 온보딩 완료 74, 미완료 26, 외부 LLM API 호출 없음, DB write 0, 실행 중 외부 DB drift 없음
- Human sample review: 미실시. Codex가 100개 candidate packet을 각각 읽고 기술·고객/사업·리더십·근로권/onsite·same-company history·결론을 분리한 최소 5문장 reason을 작성함
- Observed failure stage: evaluation checkpoint에서 `hold` score·recommend·reevaluationCriteria schema를 처음 잘못 작성했으나 final validation 전에 수정했으며 판정 reason은 유지함. 완성 artifact는 canonical validation을 통과함
- 다음 가설: fit 3명과 hold 7명을 사람이 우선 검토하고, Indonesia에서 높은 fit yield가 실제 인터뷰 전환으로 이어지는지와 Thailand 후보 pool이 6명에 그친 원인을 다음 retrieval에서 분리 확인
- Runtime 변경 여부: production matching·DB 변경 없음. 성공한 100개 pair만 rotation cache에 추가됨

### 2026-09-02 · `dd1f4098-df28-4900-8fc7-8e3358c22aeb`

- Mode: `local_read_only`
- Company / role scope: Wonderful Field CTO Japan·Australia, Site CTO Indonesia·Thailand. 직전 CTO run과 동일한 50명 고정 cohort
- Evaluator identity: `company-role-fit-recovery-codex-v2-work-authorization-inference`
- N / completed: 50 / 50. 모든 후보 reason 최소 5문장 validation 통과
- Source-state mix: `existing_non_fit=39`, `missing_fit=11`
- Label counts: `fit=6`, `hold=1`, `ambiguous=7`, `dissatisfied=18`, `unfit=18`
- Recovered fit yield: 2 / 39. Missing-fit 중 fit은 4 / 11
- Repeat rate: 직전 CTO run과 50 / 50 동일하여 100%
- Role coverage: Japan 13, Australia 13, Indonesia 12, Thailand 12
- Resource: 온보딩 완료 39, 미완료 11, 외부 LLM API 호출 없음, DB write 0, 실행 중 외부 DB drift 없음
- Human sample review: 운영자 지시에 따라 이전의 얕은 reason을 폐기하고 기술·고객/사업·리더십·근로권/onsite·same-company history·결론을 후보별로 다시 검토함. 현지 location과 현지 학교 또는 실제 근무 이력이 결합된 후보는 명시적 반대 evidence가 없는 한 근로권을 인정함
- Observed failure stage: 이전 evaluator의 evaluation depth와 work-authorization inference. 근로권 미확인만으로 생긴 hold가 크게 줄었고, 남은 hold 1건은 target 국가의 현지 학교·근무 evidence가 모두 없는 실제 candidate-side 결측임
- 다음 가설: 이번 fit 6명과 fit 경계 ambiguous를 사람이 표본 검토해 front-seat enterprise sales evidence의 bar가 국가별로 일관적인지 확인
- Runtime 변경 여부: local evaluator version을 v2로 올려 이전 cache를 무효화했고 최소 5문장 reason validation을 canonical runner에 추가함. Production matching·DB는 변경하지 않음

### 2026-09-02 · `a81127ab-4f1c-468c-885d-8dc81505864e`

- Mode: `local_read_only`
- Company / role scope: Wonderful Field CTO Japan·Australia, Site CTO Indonesia·Thailand
- Evaluator identity: `company-role-fit-recovery-codex-v1`
- N / completed: 50 / 50
- Source-state mix: `existing_non_fit=39`, `missing_fit=11`
- Label counts: `fit=1`, `hold=9`, `ambiguous=4`, `dissatisfied=19`, `unfit=17`
- Recovered fit yield: 1 / 39
- Repeat rate: 같은 날 완료한 FDE cohort 60명과 중복 0명, run 내부 중복 0명
- Role coverage: Japan 13, Australia 13, Indonesia 12, Thailand 12
- Resource: 온보딩 완료 39, 미완료 11, 외부 LLM API 호출 없음, DB write 0. 실행 중 target role fit row 8건의 외부 drift를 관찰함
- Human sample review: 미실시. Same-company active process가 있는 recovered fit은 role fit을 유지하고 `recommend=false`로 분리했으며, 명시적 근로권 미확인을 0점 unfit으로 처리한 기존 사례는 role 계약에 맞춰 hold로 교정함
- Observed failure stage: evaluation과 report. 미확인 work authorization을 hard conflict로 오판한 기존 fit reason 1건과, packet의 same-company history가 상세 보고서에 렌더링되지 않는 누락을 발견함
- 다음 가설: Indonesia·Thailand의 strong hold가 실제 무스폰서 근로권·onsite 확인 뒤 fit으로 전환되는 비율을 추적하고, 다른 role의 company-side rejection이 유사 CTO role outcome과 상관있는지 분리 측정
- Runtime 변경 여부: production logic 변경 없음. Local audit 상세 보고서가 모든 후보에 same-company history 또는 `없음`을 출력하도록 보완

### 2026-09-02 · `99bb6173-470c-4184-a96b-5dc27723e044`

- Mode: `local_read_only`
- Company / role scope: Wonderful FDE Vietnam, Indonesia
- Evaluator identity: `company-role-fit-recovery-codex-v1`
- N / completed: 20 / 20
- Source-state mix: `missing_fit=8`, `existing_non_fit=12`
- Label counts: `hold=7`, `dissatisfied=6`, `unfit=6`, `ambiguous=1`
- Recovered fit yield: 0 / 12
- Repeat rate: 첫 유효 baseline이라 계산하지 않음
- Role coverage: Vietnam 5, Indonesia 15
- Resource: 온보딩 완료 16, 미완료 4
- Human sample review: 미실시
- Observed failure stage: 없음. 직전 retrieval defect를 고친 cohort
- 다음 가설: 명시적 local work authorization이 profile에 충분히 수집되지 않아 strong company-side candidate가 hold에 집중되는지 확인
- Runtime 변경 여부: current profile location과 명시적 citizenship/work-authorization evidence만 국가 recall에 사용하는 SQL로 수정

### 2026-09-02 · `68bd82c0-1c7c-4476-bfa4-b61d6fb1e575`

- Mode: `local_read_only`, partial
- Company / role scope: Wonderful FDE Korea, Japan, Hong Kong의 유효 완료 30명. 초기 Vietnam cohort는 retrieval defect 때문에 baseline에서 제외
- Evaluator identity: `company-role-fit-recovery-codex-v1`
- N / completed: 최초 선정 50 / 전체 완료 41 / 유효 baseline 30
- Source-state mix: 유효 범위 `missing_fit=2`, `existing_non_fit=28`
- Label counts: 유효 범위 `fit=4`, `hold=4`, `dissatisfied=9`, `unfit=13`
- Recovered fit yield: 3 / 28
- Repeat rate: 첫 run이라 계산하지 않음
- Role coverage: Korea 12, Japan 12, Hong Kong 6
- Resource: 유효 범위 온보딩 완료 30
- Human sample review: 미실시
- Observed failure stage: retrieval. Candidate 문서 어디에든 국가명이 등장하면 해당 국가 후보로 회수되는 과잉 recall 발견
- 다음 가설: 국가 recall을 현재 profile location과 명시적 자격 evidence로 제한하면 상위 N의 잘못된 국가 후보를 줄일 수 있음
- Runtime 변경 여부: 다음 run의 SQL에서 수정하고 Vietnam·Indonesia 20명을 다시 회수함

## 9. 변경 기록 template

| 날짜 | Version | 변경 대상 | Evidence | 변경 | 기대 효과 | 확인 결과 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-02 | `work-authorization-inference-v2` | evaluator/cache/report | 운영자 명시 지시와 `a81127ab-4f1c-468c-885d-8dc81505864e`의 work-authorization hold 집중 | 현재 target 국가 location과 같은 국가의 학교 또는 실제 근무 이력이 함께 있으면 현지 근로권을 인정하고, 명시적 sponsorship·permit 반대 evidence만 우선함. 모든 후보 reason은 최소 5문장으로 다시 작성 | 근로권 정보가 구조화되지 않았다는 이유만으로 현지 장기 거주·학업·근무 후보가 hold에 묶이는 false negative 감소 | `dd1f4098-df28-4900-8fc7-8e3358c22aeb`에서 동일 50명을 재평가함. Hold가 9명에서 1명으로 감소했고 fit이 1명에서 6명으로 증가했으며, 50명 전원의 5문장 validation과 DB write 0을 확인함 |
| 2026-09-02 | `same-company-history-v1` | packet/evaluator/cache/report | production internal-fit의 sibling history 조회·prompt 계약과 `a81127ab-4f1c-468c-885d-8dc81505864e` | 실제 추천이 있었던 동일 회사 sibling role의 후보 반응과 authoritative stage를 compact하게 넣고, role 간 evidence 전이 범위와 recommend 적용 원칙 및 fingerprint 무효화를 명시 | 중복 제안과 stale stage 해석을 줄이면서 role별 독립 fit을 보존 | Active sibling CTO process가 있는 recovered fit을 `fit/recommend=false`로 분리했고, 상세 보고서의 history 렌더링을 확인함 |
| YYYY-MM-DD | `...` | retrieval/packet/evaluator | run IDs와 metric | 일반화된 변경 설명 | 같은 정의의 기대 metric | 다음 run 뒤 기록 |

## 10. 초기 baseline

2026-09-02 두 local artifact에서 retrieval defect가 있는 초기 Vietnam 11건을 제외하고, 보정된 5개국 50명의 첫 baseline을 만들었다.

- Role coverage: Korea 12, Japan 12, Hong Kong 6, Vietnam 5, Indonesia 15
- Source-state mix: `existing_non_fit=40`, `missing_fit=10`
- Label counts: `fit=4`, `hold=11`, `ambiguous=1`, `dissatisfied=15`, `unfit=19`
- Recovered fit: 3
- Recommend 제안: 4
- Onboarding: 완료 46, 미완료 4
- DB write: 두 run 모두 0
- 초기 writeback과 delivery: 비활성

이 수치는 retrieval과 evaluator의 첫 비교 기준일 뿐 production 추천 결과가 아니다. 실제 수락·진행 outcome이 없으므로 downstream quality를 추정하지 않는다.

## 11. 수동 writeback 및 추천 실행 기록

### 2026-09-02 · `99bb6173-470c-4184-a96b-5dc27723e044`

- Mode: 운영자 명시 승인에 따른 exact-pair manual writeback
- 범위: Wonderful Indonesia FDE 2명
- Guard: 같은 Wonderful workspace의 Role 추천 이력이 하나라도 있는 talent는 제외
- 결과: 2명 eligible, 2명 commit, 0명 skip
- 저장값: effective `fit`, `recommend=true`, `kind=codex`
- Human override: 대상 2명 모두 없었고 관련 field를 변경하지 않음
- 예외: dry-run `hold` 2명을 운영자 지시로 fit 최저 구간에 승격하되, 미확인 근로권·Jakarta onsite 조건을 reason과 metadata에 유지
- Side effect: fit row만 upsert했으며 recommendation, delivery, progress, tag는 직접 생성하지 않음
- Artifact: `output/company_role_fit_audit/runs/99bb6173-470c-4184-a96b-5dc27723e044/manual-writeback-20260902.json`
- 운영 상태: recurring audit의 일반 자동 writeback과 delivery는 계속 비활성. 이번 승격은 이 두 pair에만 적용한 수동 예외

### 2026-09-02 · `68bd82c0-1c7c-4476-bfa4-b61d6fb1e575`

- Mode: 운영자 명시 승인에 따른 exact-pair manual writeback
- 범위: Wonderful Korea FDE 2명, Hong Kong FDE 2명
- Guard: 같은 Wonderful workspace의 다른 Role 추천 이력이 있는 talent는 제외
- 결과: 4명 eligible, 4명 commit, 0명 skip
- 저장값: effective `fit`, `recommend=true`, `kind=codex`
- Human override: 대상 4명 모두 없었고 관련 field를 변경하지 않음
- 예외: dry-run `hold` 1명은 운영자 지시로 fit 최저 구간에 승격하되, 미확인 근로권·onsite 조건을 reason과 metadata에 유지
- Side effect: fit row만 upsert했으며 recommendation, delivery, progress, tag는 직접 생성하지 않음
- Artifact: `output/company_role_fit_audit/runs/68bd82c0-1c7c-4476-bfa4-b61d6fb1e575/manual-writeback-20260902.json`
- 운영 상태: recurring audit의 일반 자동 writeback과 delivery는 계속 비활성. 이번 승격은 이 네 pair에만 적용한 수동 예외

### 2026-09-03 · `dd1f4098-df28-4900-8fc7-8e3358c22aeb` + `708d6f41-260a-4ae7-8259-dd683b3ee774`

- Mode: 운영자 명시 승인에 따른 exact-pair `/ops` manual internal recommendation 실행
- 범위: Wonderful Thailand Site CTO 2명, Indonesia Site CTO 5명, Australia Field CTO 1명
- Source: 첫 run의 `fit/recommend=true` 5명과, 직전 추가 100명 run의 `fit/recommend=true` 3명
- Preflight: Role 3개가 모두 active·미만료·internal·`testOnly=false`임을 확인하고, Wonderful 차단·기존 Wonderful 추천·최근 동일 pair 수동 run이 없는 8명만 실행
- 실행 경로: `/ops` Recommendations 탭과 동일한 `queueManualInternalRecommendationRun` service를 사용해 후보별 discovery run, Ops progress/activity, 정식 internal recommendation 및 전달을 생성
- 결과: 8 run 전부 `completed`, exact recommendation 8건, wrong-role 0건, pair 중복 0건, chat 8건과 email 8건 모두 `sent`, delivery error 0건
- 설정 해석: 온보딩 미완료 또는 `talent_setting.status=stopped`는 명시적으로 선택한 internal opportunity를 차단하지 않는 현재 제품 계약을 따름. `get_internal_recommendation=false`, 회사 차단, `dont_share` 같은 명시적 금지는 별도로 존중해야 함
- Fit writeback: 이 실행은 `talent_opportunity_fit`을 직접 변경하지 않음. 평가 reason은 후보에게 그대로 노출하지 않고 manual run의 hidden Ops guidance로 전달
- Private artifact: `output/company_role_fit_audit/private/wonderful-cto-manual-recommendations-20260903.json`, `output/company_role_fit_audit/private/wonderful-cto-manual-recommendations-20260903-final.json`
- 운영 상태: recurring audit의 일반 자동 writeback과 delivery는 계속 비활성. 이 8개 exact pair만 사용자의 현재 지시로 실제 추천·전달함

이 기록은 writeback과 실제 추천·전달 품질을 평가할 calibration 근거다. 대상 talent 이름과 상세 reason은 30일 보존 private artifact에만 두고 이 장기 문서에는 복제하지 않는다.

### 2026-09-03 · `bc2529a2-ade7-4f9d-8365-3c6fc660b0ba` SBVA Communications writeback

- Mode: 운영자 명시 승인에 따른 exact-pair `commit_fit`
- 범위: SBVA `Communications Team Assistant Manager (대리)` 2명
- Source: 같은 run에서 deep review로 회복한 `fit` 2명
- Preflight: Role이 active·미만료·internal·`testOnly=false`이고 두 후보 모두 internal 추천 허용, human override 없음, SBVA 추천·같은 Role progress·tag 없음임을 serializable transaction 안에서 확인
- 결과: 2명 eligible, 2명 commit, 0명 skip
- 저장값: `kind=codex`, effective `fit`, `recommend=true`, score 86·83, candidate별 company-facing reason
- Side effect: fit row 2건만 갱신했으며 recommendation, progress, tag, chat, email은 생성하지 않음
- 운영 상태: Role의 `is_auto=false`와 `recommendationState=paused_by_request`는 그대로 유지했으므로 두 row는 proposal-ready지만 자동 전달은 시작되지 않음
- Artifact: `output/company_role_fit_audit/runs/bc2529a2-ade7-4f9d-8365-3c6fc660b0ba/manual-writeback-20260903.json`

## 12. 변경 이력

| 날짜 | 주요 변경 |
| --- | --- |
| 2026-09-03 | SBVA Communications 후보 2명을 exact-pair `commit_fit`으로 저장해 proposal-ready 상태로 만들고 Role pause와 무발송 상태를 보존함 |
| 2026-09-03 | 두 CTO dry-run에서 선택한 exact 8 pair를 `/ops` 수동 internal 추천 경로로 실행해 추천 8건과 chat/email 전달 16건의 성공을 검증함 |
| 2026-09-02 | 직전 CTO cohort와 중복 없는 Wonderful CTO 추가 100명 dry-run을 완료하고 3 fit·7 hold 결과와 evaluator checkpoint 교정을 기록함 |
| 2026-09-02 | 현지 location과 같은 국가의 학교·근무 이력 조합을 근로권 evidence로 인정하고 후보별 최소 5문장 reason을 요구하는 evaluator v2 계약을 추가함 |
| 2026-09-02 | Wonderful 4개 CTO role의 신규 50명 dry-run과 same-company history 적용 결과를 calibration 기록에 추가함 |
| 2026-09-02 | Production internal-fit과 맞춘 same-company sibling 추천·반응·진행 history의 packet·evaluation·cache·metric 계약을 추가함 |
| 2026-09-02 | Wonderful Indonesia FDE 두 pair를 추천 이력 guard 뒤 수동 writeback하고 미확인 근로권·onsite 조건을 보존함 |
| 2026-09-02 | 운영자 승인으로 Wonderful Korea·Hong Kong FDE 네 pair를 수동 writeback하고 자동 writeback은 계속 비활성임을 기록함 |
| 2026-09-02 | 5개국 유효 50명 local dry-run baseline과 국가 retrieval defect 및 보정 결과를 기록함 |
| 2026-09-02 | Retrieval, packet, evaluation을 분리한 calibration metric과 변경 기록 형식을 처음 정의함 |
