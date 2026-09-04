# Company Role Fit Recovery Audit: Codex 반복 실행 런북

- 문서 기준: 2026-09-02
- 상태: local read-only 실행 계약 및 helper 구현 완료
- 기능·데이터 계약: [Company Role Fit Recovery Audit 개요](./company-role-fit-recovery-audit-overview-ko.md)
- 변경 판단 기록: [Company Role Fit Recovery Audit Calibration](./company-role-fit-recovery-audit-calibration-ko.md)

이 문서는 Codex가 제한된 수의 talent를 직접 읽고 local read-only audit을 수행하는 절차를 정의한다. 실행 helper는 `scripts/company_role_fit_recovery_audit.py`이며 DB 조회, safety exclusion, candidate packet 생성, evaluation 검증, local rotation cache 갱신만 담당한다. Candidate retrieval SQL과 모든 개별 평가는 Codex 자신이 수행한다. Helper에는 LLM 호출과 DB write 경로가 없다.

### 실제 명령 interface

정확한 workspace와 role ID를 반복해서 넘긴다.

```bash
python3 scripts/company_role_fit_recovery_audit.py preflight \
  --company-workspace-id <workspace_id> \
  --role-id <role_id> [--role-id <role_id> ...] \
  [--allow-non-auto-role]

python3 scripts/company_role_fit_recovery_audit.py prepare \
  --company-workspace-id <workspace_id> \
  --role-id <role_id> [--role-id <role_id> ...] \
  --sql-file <codex_authored_read_only_sql> \
  --limit 50 \
  [--allow-non-auto-role]

python3 scripts/company_role_fit_recovery_audit.py finish \
  --run-path <run_directory> \
  --evaluations <evaluations.jsonl>

python3 scripts/company_role_fit_recovery_audit.py report \
  --run-path <completed_run_directory> \
  [--role-id <role_id> ...] \
  [--output review-report.md]
```

시간 또는 context 한계로 일부만 완결한 경우에만 `finish`에 `--partial`을 붙인다. `prepare` 출력의 `candidate_index.json`에 든 사람만 평가하며, `finish`가 검증을 통과한 사람만 local rotation cache에 반영한다.

## 1. 실행 모드

지원 순서는 다음과 같다.

1. `local_read_only`: DB와 repository source를 변경하지 않고 local artifact만 생성
2. `commit_fit`: 검증이 끝난 뒤 full-review pair의 fit만 기존 table에 반영

현재 허용된 기본 모드는 `local_read_only`뿐이다. 이 모드에서 recommendation, delivery, progress, tag, company context, queue를 만들거나 변경하지 않는다.

## 2. 실행 전 읽을 문서

매 실행 전에 다음 문서를 전체 읽는다.

1. `/Users/gimhojin/Desktop/harper/AGENTS.md`
2. `/Users/gimhojin/Desktop/harper/harper_beta/AGENTS.md`
3. 이 런북
4. `company-role-fit-recovery-audit-overview-ko.md`
5. 판단 계약이나 prior change를 확인해야 하면 calibration 문서

Company Context Run 런북은 신규 fit workflow를 확인할 때만 참고한다. Recovery Audit에서 기존 fit을 다루는 절차의 정본은 이 문서다.

## 3. 기본 실행값

첫 Wonderful run의 기본값:

- Company: Wonderful의 정확한 company workspace
- Role scope: active, unexpired, internal, non-test, `is_auto=true`
- Mode: `local_read_only`
- Unique talent limit: 50
- Absolute unique talent limit: 150
- Default raw artifact retention: 30일
- Runner: Codex 자신
- Sub-agent 또는 다른 LLM API: 사용하지 않음

Company 이름의 부분 문자열만으로 workspace를 고르지 않는다. Exact workspace ID를 먼저 resolve하고 모든 role이 같은 workspace인지 확인한다.

사용자가 정확한 role을 지정한 manual audit에서만 `--allow-non-auto-role`을 사용할 수 있다. 이 flag는 `is_auto=false`만 예외로 허용하며 active·미만료·internal·non-test 검증은 그대로 유지한다. 자동·정기 실행이나 회사 전체 role 선택에는 사용하지 않는다.

## 4. Preflight

### 4.1 Repository

- Working directory가 `/Users/gimhojin/Desktop/harper/harper_beta`인지 확인한다.
- 관련 source와 문서의 dirty state를 확인한다.
- Routine audit 중 application source, migration, prompt, 문서를 수정하지 않는다.
- Output root가 `harper_beta/output/company_role_fit_audit` 아래인지 확인한다.

### 4.2 Database read-only

다음을 read-only transaction에서 확인한다.

- 필요한 relation과 column이 존재함
- Wonderful workspace가 정확히 하나 resolve됨
- 대상 role이 active, unexpired, internal, non-test임
- 자동 run이면 모두 `is_auto=true`
- `talent_opportunity_fit.company_side_evaluation_metadata`를 읽을 수 있음
- `talent_behavior_contexts`, recommendation, progress, tag를 읽을 수 있음
- 같은 workspace의 sibling role별 최신 recommendation, 후보 feedback, authoritative stage, role move와 process-stop evidence를 읽을 수 있음

Transaction 종료 시 rollback한다. Preflight 때문에 due run을 enqueue하거나 queue row를 claim하지 않는다.

### 4.3 기존 run lock

같은 output state를 쓰는 실행이 이미 진행 중이면 새 run을 시작하지 않는다. Lock에는 run ID, started time, process identity만 남긴다. 오래된 lock을 자동 삭제하기 전에 실제 실행이 없는지 확인한다.

## 5. Run directory

새 run은 UTC timestamp와 random UUID로 식별한다.

```text
output/company_role_fit_audit/runs/<run_id>/
```

시작 즉시 `manifest.json`을 만들고 다음을 기록한다.

- run ID
- mode
- company workspace ID
- role IDs
- evaluator version
- unique talent limit
- started time
- status=`running`
- source snapshot fingerprint
- cache version

Manifest에는 raw resume, message, email, company private request를 넣지 않는다.

## 6. Role scope 만들기

다음 조건을 모두 만족하는 role만 role index에 넣는다.

- target company workspace
- `source_type='internal'`
- `status='active'`
- `is_expired=false`
- `information.testOnly`이 true가 아님
- automatic run이면 `company_internal_roles.is_auto=true`

각 role에는 최소한 다음을 담는다.

- role ID와 name
- `sourceRoleId`
- location, country, work mode
- request와 criteria의 fingerprint
- role matching fingerprint
- current company behavior context hash
- 현재 pending count와 max pending

Pending limit은 audit 자체를 막지 않는다. 다만 이미 pipeline이 충분한 role의 새 `recommend` 승격 우선순위를 낮추는 운영 정보로만 사용한다. Local read-only audit은 recommendation을 만들지 않는다.

## 7. Retrieval SQL 작성

Codex는 최신 role index를 읽고 company·role family에 맞는 read-only SQL을 작성한다. 하나의 고정 keyword query를 모든 company에 재사용하지 않는다.

SQL은 다음을 만족해야 한다.

- 단일 `SELECT` 또는 `WITH ... SELECT`
- 결과에 `talent_id`, `role_id`, pair source 상태
- 명시적 `LIMIT`
- stable tie-breaker
- Experience와 education join으로 row가 중복 증폭되지 않음
- SQL rank는 candidate review 순서에만 사용
- protected characteristic 또는 그 대리변수를 사용하지 않음
- work authorization은 아래 `10.1 근로권 판단` 계약을 적용하며 nationality, name, language만으로 추론하지 않음

Retrieval pool은 다음 두 source를 구분한다.

### 7.1 `missing_fit`

- 해당 role의 fit row가 없음
- 같은 role recommendation 또는 진행 이력이 없음
- role-specific recall evidence가 있음

### 7.2 `existing_non_fit`

- effective label이 fit이 아님
- human override가 없음
- 아직 Recovery Audit이 보지 않았거나 matching-relevant fingerprint가 달라짐
- 같은 role recommendation 또는 진행 이력이 없음

기존 model score는 retrieval feature로 사용할 수 있지만 최종 판단 근거가 아니다.

## 8. Candidate selection

### 8.1 Unique talent dedupe

SQL의 pair 결과를 talent 단위로 합친다. Identity hash가 같은 duplicate account는 한 사람으로 취급한다. 한 run에서 같은 talent가 여러 role 때문에 N을 여러 번 소비하지 않는다.

### 8.2 Rotation cache 적용

`state/rotation.json`을 읽고 다음을 확인한다.

- 최근 동일 fingerprint로 완료된 talent인지
- 다른 role variant 때문에 최근 반복 선정됐는지
- 이전 run이 partial 또는 failed여서 완료되지 않았는지
- 같은 회사 sibling history fingerprint가 이전 완료 시점과 달라졌는지

동일 입력으로 최근 완료된 talent는 기본 pool 뒤로 보낸다. Candidate, role, company context 또는 same-company history fingerprint가 바뀌면 다시 우선순위에 들어갈 수 있다. 새 sibling 추천, 후보 반응, role 이동, stage 변경과 process stop은 재평가를 일으키는 matching-relevant 변경이다.

### 8.3 N명 확정

초기 N=50에서는 다음을 만족해야 한다.

- unique talent 50명 이하
- active role/family에 가능한 범위의 coverage
- high-priority와 rotation 표본 구분
- 각 talent의 source state가 `missing_fit` 또는 `existing_non_fit`

Eligible talent가 50명보다 적으면 남은 수를 무관한 후보로 채우지 않는다.

`candidate_index.json`에는 ID, target role/family, retrieval lane, rank, fingerprint, source state만 둔다. Profile text는 넣지 않는다.

## 9. Candidate packet 생성

선정 talent마다 canonical profile packet을 만든다. Packet 생성 뒤 source가 바뀌면 그 talent를 평가하지 않고 packet을 다시 만든다.

Packet은 다음 구조를 권장한다.

```json
{
  "schemaVersion": 1,
  "runId": "...",
  "talentId": "...",
  "candidateFingerprint": "...",
  "company": {},
  "roleIndex": [],
  "talent": {},
  "sameCompanyHistory": {
    "summary": "...",
    "fingerprint": "...",
    "sourceUpdatedAt": "..."
  },
  "safety": {}
}
```

Codex가 처음 읽는 문서에는 compact role index와 talent evidence를 넣는다. 특정 role/family를 자세히 평가할 필요가 생기면 그 full role card를 같은 run artifact에 추가한다.

모든 active role의 긴 JD와 모든 과거 사건을 모든 candidate packet에 복제하지 않는다.

### 9.1 Same-company history 조회와 정규화

각 candidate를 평가하기 전에 정확히 같은 `company_workspace_id`의 다른 internal, non-test role에서 실제 recommendation이 존재하는 role을 조회한다. 현재 평가할 target role ID들은 제외하고, sibling role마다 최신 recommendation과 현재 stage만 남긴다. 단순 fit row는 실제 추천 이력을 대신하지 않는다.

현재 production internal-fit의 의미 계약은 다음 코드를 정본으로 삼는다.

- 조회·요약: `harper_worker/opp/utils/internal_fit.py`의 `fetch_same_company_internal_fit_history_rows`, `format_same_company_internal_fit_history`
- authoritative stage 해석: `harper_worker/opp/utils/internal_stage_context.py`의 `internal_process_stage_for_llm`

최소 조회 필드는 role ID·이름, 추천 시각, 후보 feedback과 reason, saved/processed stage, 최신 internal tag 또는 custom stage, role 이동 target, process-stop reason이다. 이를 수락·거절·보류·연결 대기·연결됨·최종 오퍼·회사 종료·프로세스 중단·아카이브 등의 현재 의미로 정규화한다. 최신 authoritative stage가 terminal이면 오래된 profile·behavior 문맥의 accepted·connected·pending 표현으로 되돌리지 않는다.

History summary는 최신 role별 사건부터 기본 2,000자 안에서 compact하게 만들고 private 회사 원문을 복사하지 않는다. Summary와 함께 정규화된 source의 stable fingerprint를 packet에 기록한다. History가 없으면 `summary`는 비우되 조회를 생략한 것과 구분할 수 있도록 fingerprint와 확인 시각을 남긴다.

현재 helper가 이 구조를 자동 생성하지 않는 버전이라면 Codex가 read-only 조회로 packet을 보강한다. `sameCompanyHistory`를 조회했는지 확인할 수 없는 candidate는 평가를 시작하거나 완료 checkpoint로 기록하지 않는다.

## 10. Codex 개별 평가

Codex 자신이 candidate 문서를 한 사람씩 읽는다. Sub-agent, production company-side LLM, Worker의 JsonLlmClient, 별도 OpenAI·Anthropic·Gemini API를 평가자 대신 사용하지 않는다.

각 talent에서 다음 순서로 판단한다.

1. 회사가 실제로 인터뷰할 근거가 있는 role/family를 고른다.
2. 필요한 role detail을 읽는다.
3. Hard requirement와 candidate evidence를 대조한다.
4. 회사-side interview case를 판단한다.
5. 후보의 일반 선호와 명시적 blocker를 판단한다.
6. Label을 먼저 정한다.
7. 해당 label band 안에서 score를 정한다.
8. Same-company history에서 role 경계를 넘어 적용되는 evidence만 현재 role의 label·score에 반영한다.
9. Role별 label·score를 독립적으로 확정한 뒤 same-company history를 보고 `recommend`를 별도로 정한다.
10. 이력이 판단에 영향을 줬다면 그 상대적 판단을 포함해 짧고 재사용 가능한 `reason`을 쓴다.

다른 talent보다 좋아 보인다는 이유로 `fit`을 주지 않는다. 반대로 이번 N명 안에서 상대 순위가 낮다는 이유로 독립적으로 성립한 fit을 내리지 않는다.

Sibling role이 더 강하거나 이미 진행 중이라는 이유만으로 현재 role의 독립적인 fit을 낮추지 않는다. 특정 role의 거절·중단도 회사 전체에 적용되는 명시적 evidence가 아니면 전이하지 않는다. 반면 회사 전체에 대한 후보의 명시적 거절, 현재도 유효한 회사 단위 선호, 회사의 candidate-level terminal rejection은 현재 판단에 사용할 수 있다. 과거 무응답은 materially better하거나 의미 있게 다른 새 role을 자동 차단하지 않는다.

### 10.1 근로권 판단 — 매 후보마다 반드시 확인

> **필수 규칙:** `현재 profile location의 국가 = target role 국가`이고, `같은 국가의 학교 이력 또는 실제 회사 근무 이력`이 하나 이상 있으면 해당 국가의 현지 근로권이 있는 것으로 평가한다.

매 후보 평가에서 다음을 reason의 근거로 확인한다.

- 현재 location의 국가
- 같은 국가에 소재한 학교가 있는지
- 같은 국가에서 실제 근무한 company experience가 있는지
- 후보가 sponsorship 필요, permit 만료 또는 현지 근무 불가를 직접 말한 더 강한 반대 evidence가 있는지

앞의 positive 조합이 성립하고 명시적인 반대 evidence가 없으면 work authorization 미확인을 이유로 `hold`, `ambiguous`, `dissatisfied`, `unfit`을 주지 않는다. Candidate packet의 role request가 “명시적 증빙만 허용”한다고 쓰여 있어도 이 Recovery Audit에서는 운영자가 승인한 이 추정 규칙을 우선한다. 판단 reason에는 가능하면 `현재 location + 현지 학교` 또는 `현재 location + 현지 근무 이력` 중 실제 사용한 조합을 밝힌다.

현재 location만 있는 경우, 학교·근무 이력의 국가가 불명확한 경우, remote·출장·여행만 있는 경우에는 추정하지 않는다. 이름, 언어, 민족 또는 추정 국적도 사용하지 않는다. 반대로 후보가 해당 국가에서 sponsorship이 필요하다고 명시하면 current location과 학교·근무 조합보다 그 최신 명시 evidence가 우선한다.

Work authorization과 onsite는 별개다. 현재 target 도시에 실제 거주하면서 같은 국가의 학교·근무 이력이 있으면 반대 evidence가 없는 한 기본 onsite feasibility의 positive evidence로도 사용할 수 있지만, remote-only 선호, relocation 거절, 고객사 방문 불가처럼 명시된 제약은 따로 반영한다.

### 10.2 Reason 깊이 기준

각 pair의 `reason`은 **최소 5개의 완결된 문장**으로 작성한다. 다섯 문장은 형식적으로 같은 내용을 반복하는 것이 아니라 최소한 다음 판단을 구분해 설명해야 한다.

1. 역할과 직접 맞는 hands-on 기술 evidence
2. enterprise customer·sales·commercial ownership evidence
3. founder·team·executive leadership evidence
4. 근로권·location·onsite·후보 선호와 같은 candidate-side evidence
5. same-company history의 영향과 최종 label·score·recommend를 가른 결론

근거가 없는 축은 없다고 명시한다. 기존 reason을 문장 수만 늘려 바꾸어 쓰거나, 여러 후보에게 같은 문장 틀을 복사하지 않는다. Validation 단계에서 문장 수를 검사하고 5문장 미만이면 완료 checkpoint로 인정하지 않는다.

## 11. Evaluation checkpoint

한 talent의 모든 target pair 평가가 끝날 때마다 `evaluations.jsonl`에 한 line을 atomic append한다.

```json
{"talentId":"...","evaluations":[{"roleId":"...","label":"fit","score":86,"recommend":false,"reason":"...","reevaluationCriteria":null}]}
```

Checkpoint 전에 다음을 검증한다.

- Talent ID가 candidate index에 존재함
- Role ID가 role index에 존재함
- Label과 score band가 일치함
- `fit=false` 결과는 `recommend=false`
- `hold` 외에는 `reevaluationCriteria=null`
- Reason이 비어 있지 않음
- Reason이 후보별 실질 근거를 담은 5개 이상의 완결된 문장임
- Human override를 변경하려는 출력이 아님
- Candidate packet에 조회 완료된 same-company history summary와 fingerprint가 있음

Validation 실패 line은 저장하지 않고 오류를 수정한 뒤 다시 검증한다.

## 12. Cache 전진

Evaluation checkpoint가 성공한 talent만 rotation state에 완료로 반영한다.

State update는 temporary file에 전체 새 내용을 쓴 뒤 atomic rename하는 방식이어야 한다. Run 중간에 process가 종료돼도 valid한 이전 state 또는 valid한 새 state 중 하나가 남아야 한다.

State에 평가 label과 reason을 복제하지 않는다.

## 13. 종료 검증

`validation.json`에 다음을 기록한다.

- requested unique talent
- selected unique talent
- fully evaluated unique talent
- partial 또는 failed talent
- evaluated pair count
- source state별 count
- label별 count
- role/family별 count
- duplicate와 safety exclusion count
- previous run과의 repeat count
- cache update count
- database write count

`local_read_only`에서는 database write count가 정확히 0이어야 한다. Fit, recommendation, delivery, progress, tag, context, queue의 before/after count와 checksum을 가능한 범위에서 비교한다.

## 14. 정상 종료

정상 완료 시 manifest를 `succeeded`로 바꾸고 다음 파일을 만든다.

- `metrics.json`
- `summary.md`
- `review-report.md`
- `validation.json`

Summary에는 다음을 포함한다.

- company와 role scope
- N과 실제 unique talent 검토 수
- missing-fit과 existing-non-fit 수
- label별 결과
- 기존 non-fit에서 새로 발견한 fit 수
- recommend 후보 수
- role/family coverage
- repeat rate
- DB write 0건 확인
- 중요한 한계와 다음 calibration 질문

후보자의 긴 private reason을 summary에 모두 복제하지 않는다. `summary.md`에는 `review-report.md` 링크만 남기고, 상세 후보 정보는 raw packet과 같은 30일 보존 정책을 적용한다.

### 14.1 `review-report.md` 고정 형식

상세 보고서는 다음 순서와 필드를 매 run 동일하게 사용한다.

1. 실행 요약
   - Run ID, company, role scope, mode와 terminal status
   - 선정 unique talent 수, 완료 unique talent 수, 실제 평가 pair 수
   - `missing_fit`과 `existing_non_fit` 수
   - label 분포, recovered fit 수, recommend 제안 수
   - 온보딩 완료·미완료·확인 불가 수
   - DB write 0건과 실행 중 감지된 외부 DB 변화
2. Role별 검토 수
   - Role 이름과 완료한 candidate 수
3. 완료 후보 전체의 개별 판정
   - 이름과 Harper Ops 직링크
   - Role과 현재 profile location
   - 가입 시각과 최근 사용 시각을 KST로 표기
   - 온보딩 `완료`, `미완료`, `확인 불가` 중 하나
   - `missing_fit` 또는 `existing_non_fit`
   - 기존 label·score·reason. 기존 row가 없으면 `없음`으로 명시
   - 같은 회사 다른 role의 추천·후보 반응·현재 진행 상태 요약. 이력이 없으면 `없음`으로 명시
   - 이번 dry-run label·score·recommend·reason
   - `hold`이면 결과를 바꿀 확인 질문과 필요한 새 정보

Score만 제시하고 reason을 생략하지 않는다. 이번 reason에는 그 사람에게 실제로 적용한 회사-side positive evidence, candidate-side constraint, 최종 label을 가른 핵심 차이를 함께 적는다. Same-company history가 label·score·recommend 중 하나를 바꿨다면 그 영향도 명시한다. 기존 reason과 이번 reason을 섞거나 새 판정을 기존 DB 값처럼 표현하지 않는다.

`report` 명령은 완료된 run의 상세 보고서를 다시 만들 때 사용한다. `--role-id`는 잘못된 retrieval cohort를 제외하거나 특정 role view를 만들 때만 사용하며, 원 run의 평가 데이터나 rotation cache는 변경하지 않는다.

### 14.2 사용자에게 보고하는 고정 형식

채팅 응답도 다음 순서를 지킨다.

1. `검토 규모`: 선정 / 완료 unique talent, 평가 pair, 국가·Role별 수
2. `결과 분포`: label, source state, recovered fit, recommend 수
3. `안전 확인`: dry-run 여부, DB write 수, 외부 drift 구분
4. `후보 상세`: 기본적으로 `fit`, `hold`, `ambiguous` 전원
5. `나머지`: `dissatisfied`, `unfit` 수와 전체 상세 보고서 링크

채팅에 표시하는 모든 후보도 가입일, 최근 사용일, 온보딩 여부, 기존 label·reason, 이번 score·reason을 생략하지 않는다. 후보가 많아 응답을 나누더라도 첫 응답에서 전체 검토 수와 몇 명을 현재 표시하는지 먼저 밝힌다. 사용자가 전체 후보를 요청하면 label과 무관하게 완료 후보 전원을 같은 형식으로 보여 준다.

## 15. Partial 종료

시간, context 또는 안전 제한에 도달하면 새로운 talent를 시작하지 않는다.

- 완료된 checkpoint는 유지
- 현재 미완료 talent는 완료로 cache하지 않음
- manifest status는 `partial`
- 중단 이유와 남은 selected count 기록
- DB write 0건 검증

Partial run은 실패가 아니다. 다음 run이 미완료 talent를 다시 선택할 수 있다.

## 16. 실패 처리

다음 stage 중 하나를 기록한다.

- `preflight`
- `role_scope`
- `retrieval`
- `candidate_selection`
- `candidate_packet`
- `evaluation`
- `validation`
- `cache_write`

실패 시 manifest를 `failed`로 닫고 retryable 여부와 짧은 재현 가능한 error를 남긴다. Raw profile이나 secret을 error에 넣지 않는다.

Cache write 전에 실패했으면 이전 cache를 유지한다. Cache write 뒤 validation이 실패하면 자동으로 계속 진행하지 말고 cache와 checkpoint의 exact mismatch를 보고한다.

## 17. Cleanup

Cleanup은 별도 실행으로 수행한다.

- 30일이 지난 candidate packet과 private raw input 삭제
- 평가 summary, aggregate metrics, manifest는 유지 가능
- active run과 lock이 있는 directory는 건드리지 않음
- output root 밖의 path는 삭제하지 않음
- role이 종료되면 해당 role의 불필요한 rotation entry 정리

삭제 후 제거한 파일 수와 복구 가능 여부를 보고한다.

## 18. Writeback 전환 조건

다음 조건을 모두 만족하기 전에는 `commit_fit`을 구현하거나 사용하지 않는다.

- 최소 2회의 N=50 이상 local read-only run 완료
- Candidate packet과 output contract의 누락 없음
- 반복률과 role coverage 측정 가능
- Fit 전환 표본의 사람 검토 완료
- Human override 보존 테스트 완료
- Existing downstream consumer trace 완료
- Audit fit write가 recommendation이나 delivery를 자동 시작하지 않음이 확인됨
- Idempotent retry 테스트 완료

## 19. 종료 체크리스트

- [ ] 정확한 company workspace와 role scope만 사용했다.
- [ ] Automatic run에서 `is_auto=false` role을 포함하지 않았다.
- [ ] Test-only role과 privacy opt-out을 제외했다.
- [ ] N은 pair가 아니라 unique talent 상한이었다.
- [ ] 같은 사람의 duplicate identity를 제거했다.
- [ ] SQL rank로 label을 정하지 않았다.
- [ ] Codex가 각 완료 talent의 candidate packet을 직접 읽었다.
- [ ] 각 reason이 후보별 근거를 담은 5개 이상의 완결된 문장이다.
- [ ] 현재 국가와 같은 국가의 학교·실제 근무 이력 조합으로 근로권을 판단하고, 더 직접적인 반대 evidence가 있으면 우선했다.
- [ ] 같은 회사 다른 role의 실제 추천·후보 반응·authoritative 진행 상태를 조회하고 판단에 반영했다.
- [ ] Role-specific sibling outcome을 회사 전체 outcome처럼 잘못 전이하지 않았다.
- [ ] 평가하지 않은 pair에 결과를 만들지 않았다.
- [ ] Checkpoint 성공 뒤에만 cache를 전진했다.
- [ ] Human override를 변경하지 않았다.
- [ ] Recommendation, delivery, progress, tag를 만들지 않았다.
- [ ] Local read-only DB write가 0건이었다.
- [ ] Manifest가 terminal 상태로 끝났다.
- [ ] 모든 완료 후보의 온보딩 상태와 기존·이번 reason이 `review-report.md`에 기록됐다.
- [ ] 사용자 응답 첫 부분에 전체 검토 규모와 현재 표시 범위를 밝혔다.

## 20. 변경 이력

| 날짜 | 주요 변경 |
| --- | --- |
| 2026-09-02 | 현재 target 국가 location과 같은 국가의 학교 또는 실제 근무 이력이 함께 있으면 근로권을 인정하는 필수 규칙과 후보별 최소 5문장 reason 계약을 추가함 |
| 2026-09-02 | Same-company sibling role의 실제 추천·후보 반응·authoritative stage를 조회·정규화하고 label·score·recommend·cache·보고에 반영하는 필수 절차를 추가함 |
| 2026-09-02 | 집계와 후보별 가입·최근 사용·온보딩·기존/신규 reason을 빠짐없이 보여 주는 고정 보고 형식을 정의함 |
| 2026-09-02 | local read-only helper의 실제 preflight, prepare, finish 명령과 atomic rotation cache 계약을 확정함 |
| 2026-09-02 | N명 제한, unique-talent rotation, Codex 직접 평가, local read-only checkpoint 절차를 처음 정의함 |
