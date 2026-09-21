# Company-first talent selection calibration

- 최초 adjudication: 2026-09-11
- 현재 dataset/gold: `v1`
- 상태: v1 수동 guard calibration 유지 + production pipeline v2-pilot positive read-only shadow 1건 완료.
  v2-pilot은 아직 frozen dataset/gold가 아님

## 목적과 평가 단위

회사가 먼저 후보자를 검토하는 흐름에서 강한 후보만 0~3명 선택하고, 이미 진행 중인 candidate-first
경로를 가로채거나 세 자리를 채우기 위해 약한 후보를 넣지 않는지 평가한다. 평가 단위는
`company workspace × 명시적으로 제한한 internal Role` 한 번의 shadow run이다. Candidate pair 판단과
company-facing reason 품질은 같은 run 안의 하위 관찰값이다.

## Frozen assets

| 파일 | 역할 |
| --- | --- |
| [cases-v1.json](./cases-v1.json) | 세 개의 비식별 Role run과 고정 aggregate 입력 fingerprint |
| [gold-v1.json](./gold-v1.json) | 수동 adjudication 결과와 critical finding |
| [manifest-v1.json](./manifest-v1.json) | source, 문서·dataset hash, 실행 설정과 재현 한계 |
| `private/runs/<run_id>/` | 실명, UUID, resume, Brief, Behavior Context, 원문 packet과 result. local-only |

`v1` 입력이나 gold는 다음 실행 결과에 맞춰 덮어쓰지 않는다. Role·candidate snapshot, route evidence,
평가 문서 또는 gold가 바뀌면 새 dataset version을 만든다. 같은 frozen input에 문서만 바꿔 다시
adjudicate하면 별도 run으로 남긴다.

## Input contract와 canonical procedure

`v1`이 동결됐을 때 사용한 제품·수동 선정 계약은 다음 두 문서다.

- [회사 선확인 후보자 추천 · Intro 요청 구현 기획](../../company/company-first-talent-recommendation-product-plan-ko.md)
- [회사 선확인 후보자 선정 Codex 런북](../../company/company-first-talent-recommendation-codex-runbook-ko.md)

`v1`은 Codex가 세 Role의 전체 private packet을 직접 읽고
adjudicate한 수동 절차다. Production capture는 Worker의
`opp.utils.new_runtime.connect_read_only()`만 사용했다. Reply band는 canonical
`fetch_talent_reply_confidences()`를 사용했고 별도 점수나 외부 LLM 호출은 없었다.

Production target은
[Company-first Talent Search Worker 구현 계획](../../company/company-first-talent-search-worker-implementation-plan-ko.md)의
회사 단위 Python pipeline이며 runtime의 1차 local 구현은
`harper_worker/opp/company_first_search/`에 있다. Canonical read-only runner는
`harper_worker/llm_evals/company_first_talent_selection/run_shadow.py`다. 이 pipeline을 비교할 때는 `v1`
input/gold를 덮어쓰지 않고 query planner·scorer·company-wide reranker·Slack writer를 포함한 새 dataset
version과 gold를 별도로 동결한다. 현재 v2-pilot production snapshot은 local-only pilot이지 frozen fixture가
아니므로 runtime code, unit contract test, 한 Role 결과만으로 rollout gate를 통과했다고 보지 않는다.

각 run은 다음 순서를 따른다.

1. Active, unexpired, internal, non-test Role과 workspace를 정확히 확인한다.
2. 현재 effective fit을 retrieval memory로 가져온다.
3. visibility, internal opt-out, blocked company, reply LOW, exact/sibling route, progress와 pipeline을
   hard guard로 확인한다.
4. 남은 packet의 Profile, 전체 Search Brief, 같은 version Behavior Context, Role/JD/request/criteria를
   현재 Codex가 직접 읽는다.
5. 실제 선택은 0~3명으로 고정하고 selected가 없으면 이유를 남긴다.
6. Selected가 0명인 run에서는 route-conflict strong pair만 writer-only counterfactual로 써 볼 수 있으나
   selection 수에 포함하지 않는다.

## Gold와 metric

`v1`의 세 run 모두 실제 selected gold는 0명이다. 다음을 기록한다.

- `route_guard_recall`: full packet에서 확인된 active candidate-first route를 selection 전에 모두 차단했는가
- `hard_boundary_violation`: opt-out, visibility, block, LOW, active route pair를 하나라도 선택했는가
- `padding_error`: 독립적으로 약한 후보를 slot 충족을 위해 선택했는가
- `unsupported_fit_selection`: 기존 fit score와 달리 최신 원문이 핵심 Role bar를 지지하지 않는데 선택했는가
- `company_reason_grounding`: reason이 candidate-owned evidence와 Role 연결, 필요한 caveat를 담는가
- `private_context_leak`: Brief, Behavior, reply band, 정확한 사적 조건이나 존재하지 않는 관심 상태를 노출했는가

Release gate는 critical error 0건이다. 또한 실제 commit rollout 전에 최소 하나의 독립적으로 selectable한
positive case를 새 version에 추가해 positive selection과 card reason을 통과해야 한다. `v1`의 0명 결과만으로
precision, selection yield 또는 회사 가치가 충분하다고 결론내리지 않는다.

## 2026-09-11 결과

- 세 full run에서 raw effective-fit row 349개를 출발점으로 보았고, 기존 exact/sibling route와 privacy
  guard 뒤 full packet 4개를 직접 읽었다.
- Full packet에서 exact Role의 `candidate_requested_connection` 두 건을 추가로 발견했다. 최초 compact
  route query가 이 progress를 놓쳤으므로 두 pair는 즉시 제외했고 런북과 제품 문서의 route guard를
  보완했다.
- 남은 두 pair는 각각 Role 방향·IC scope 충돌, 핵심 LLM/언어/근무 조건 미충족으로 선택하지 않았다.
- 실제 selected는 0/0/0이고 padding error, candidate/company outbound와 DB write는 모두 0건이다.
- 한 해외 Role packet에 다른 국가를 전제로 한 company pitch가 섞여 있었다. 정확한 Role variant의
  location·work mode·request를 우선하고 충돌 문구는 reason에 쓰지 않도록 source guard를 추가했다.
- Route-conflict strong pair 두 건의 writer-only reason은 candidate-owned 수치·ownership과 한 가지
  trade-off만으로 다시 작성했다. 기존 fit reason의 private 관심·보상 언급과 일반적인 평가 형용사는
  company-facing copy로 재사용하지 않았다.

## 2026-09-17 v2-pilot positive shadow

- Harper의 paused Founding Engineer, AI Agent Role을 사용자가 명시적으로 허용한 read-only override로
  실행했다. Role status, DB row, recommendation, ready ledger, Slack·이메일은 변경하거나 발송하지 않았다.
- 최종 full run은 `30 retrieved → reply LOW 1 제외 → 29 scored → rerank pool 6 → selected 2`였다.
  최대 3명을 채우지 않았고 scorer failure와 live-guard exclusion은 0건이었다.
- 선택 후보는 모두 명시적 학력·경력 hard requirement와 production agent/full-stack 근거를 갖췄다. 회사가
  먼저 ownership·근무 방식·역할 방향을 열어 판단할 구체적 이유를 reason에 포함했다.
- reply HIGH와 UNKNOWN이 각각 선택됐고, reply HIGH인 다른 후보도 보상·seniority·근무 조건 충돌 때문에
  제외됐다. 응답 가능성은 작은 tie-break로만 작동했다.
- 연구 중심 production gap, 지나치게 senior한 scope·보상 충돌, 스타트업 실행 근거 부족은 최종 제외
  사유로 작동했다. 운영상 paused 메모는 A/B/C 판단에 사용되지 않았다.
- Full run latency는 368.2초, estimated LLM cost는 $0.0468이었다. 이후 SQL wildcard binding, derived alias
  validation, fallback 100 cap, Planner completion cap·temperature, exact-output batch Profile loader를
  개선했다. 최종 planner-only 재검증은 한 호출 23.6초, repair/fallback 없이 23명 retrieval에 성공했다.
- 세부 aggregate와 해석은 [비식별 결과 보고서](./reports/2026-09-17-harper-agent-shadow.md)에 있다.

## Data provenance와 privacy

표본은 2026-09-11 production read-only snapshot이다. 먼저 날짜 기반 hash seed로 active Role을 임의
추출했고, 모두 신규 route가 0명이어서 qualitative gate를 보기 위한 두 번째 표본은 preliminary
미추천 fit이 하나 이상인 Role 중 서로 다른 세 workspace를 골랐다. 따라서 representative random sample이
아니며 positive-pool 조건부 calibration이다.

Tracked 파일에는 candidate 이름, UUID, resume, contact, Brief/Behavior 원문, private company request와 raw
model output을 넣지 않는다. 원문은 gitignored `private/runs/`에만 있고 파일은 `0600`, directory는
`0700`이다. Company-facing counterfactual도 local-only result에 보존한다.

## 한계

- 모든 actual selection이 0명이어서 positive selection recall과 실제 회사 반응은 평가하지 못했다.
- Current-data retrospective라 과거 fit 이후 profile과 행동 변화가 섞일 수 있다.
- 첫 compact guard query가 candidate-origin progress를 누락했다. `v1` gold는 full packet에서 교정한 최종
  판단이며, canonical helper 구현 전에는 commit readiness의 증거가 아니다.
- Company intro ledger와 canonical runner가 아직 없어 active intro count는 0으로 둔 shadow-only run이다.
- 이후 local runtime에는 Company intro ledger schema와 canonical runner가 추가됐지만 migration 미적용
  상태이며, v1 snapshot과 gold에는 소급 반영하지 않았다.
- 세 회사·세 직무만 보았으므로 직군, locale, seniority, location 분포를 대표하지 않는다.
- v2-pilot은 한 회사·한 Role positive case라 representative precision·recall이나 production latency를
  추정하지 못한다. 최종 개선 후 full run latency는 아직 다시 측정하지 않았다.

## 변경 이력

| 날짜 | 주요 변경 |
| --- | --- |
| 2026-09-17 | Canonical production read-only runner와 한 positive v2-pilot shadow 결과·한계 등록 |
| 2026-09-11 | 세 production read-only Role run의 guard-focused v1 calibration과 수동 gold 등록 |
