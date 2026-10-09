# Company-first talent selection calibration

## 후보자 선추천 수량 challenge: volume-v1 (2026-10-08, 로컬 미배포)

- 목적/단위: 동일 합성 회사·역할·후보 25명의 실제 rerank에서 낮은 수락률과 비어 있는 진행 현황을 보고 3명보다 넓게 선추천할 수 있는지, 대기 상한에서 후보자 선추천만 막는지 확인한다. 실제 수락률 개선이나 전체 검색 recall 평가는 아니다.
- Frozen input/gold: `cases-volume-v1.json`. 첫 호출 전에 합성 경력·전체 Brief·fit 근거·100건 중 10건 수락 집계와 두 시나리오의 기대 범위를 작성했다. 낮은 수락률/빈 파이프라인은 후보자 10~20명, 상한 도달은 0명; 회사 선추천은 두 경우 최대 3명. Codex가 작성한 challenge이며 독립 human gold는 미확정이다. 과거 fixture/gold는 변경하지 않는다.
- Canonical runner: `harper_worker/llm_evals/company_first_talent_selection/run_volume.py --run-id=<새 이름>`. 운영 `rerank_input`, `rerank`, 허용 경로·parser·repair와 실제 모델 설정을 직접 사용한다. DB 연결·추천 저장·연락 발송은 없다. Fit/scoring/retrieval/shortlist·최종 이메일은 포함하지 않는다.
- Prompt/input: 현재 회사·Role, 후보별 Brief/Behavior·fit 양측 이유, 전달 대비 14일 반응·표본 수·현재 pipeline, 독립 후보자 최대 20명/회사 최대 3명 계약을 읽기용 텍스트로 제공한다. Criteria는 이 호출에서 작성하지 않으며 후보자만 선추천한 경우 후속 회사 presentation 호출도 없다.
- 지표/gate: 기대 수량 범위 2/2, 구조·허용 route·인원 상한 오류 0, 전체 reason의 근거·회사 불확실성 처리 수동 검토. 숫자 통과만으로 품질·반응률 개선을 선언하지 않는다.
- 실행/provenance/privacy: API provider/model/reasoning/sampling/fallback, source revision·dirty 소스 hash, fixture hash, 입력·출력·usage를 매 새 run의 ignored `runs/`에 0700/0600으로 저장한다. 모든 사례는 합성이다. 숫자·경력·회사명으로 운영 분기를 추가하지 않는다.
- 한계: 한 직군의 작은 challenge, 구현자 검토, 독립 평가·온라인 반응 없음. 14일은 피드백 관찰 기간이며 자동 dislike 정책은 변경하지 않는다.
- 결과: [2026-10-08 집계 보고서](reports/2026-10-08-candidate-first-volume.md). `20261008-volume-v1-r1`은 낮은 수락률/빈 진행 현황에서 후보자 20명·회사 3명, 연결 대기 상한에서 후보자 0명·회사 3명을 선정해 두 수량 challenge를 통과했다. 실제 반응률 개선을 검증한 결과는 아니다.

2026-10-08 rerank v12는 각 선정 후보의 기존 `reason`을 오전9시 auto-intro의 Harper Note 계약에 맞춰 근거 있는 해석1–2개로 쓰도록 보완했다. 원문 이력·수치 반복이나 회사에 요청할 확인 목록을 쓰지 않는다. no_action은 핵심 부족/충돌/미확인을 짧게 설명하며 선택 수량·route 계약은 유지한다. reason은 내부 matching review에 그대로 저장되고 회사 공개 writer로 전달하지 않는다. 공개 Note는 공유 가능한 Profile/Role만 받는 presentation writer가 별도로 생성한다.

## Harper Note 문체 재검증: volume-v2 (2026-10-08, 로컬 미배포)

- Frozen input/gold: [cases-volume-v2.json](cases-volume-v2.json), [manifest-volume-v2.json](manifest-volume-v2.json). volume-v1의 후보 원문·수락 집계·두 수량 기대값은 그대로 보존하고 Role의 `matching_slot_type=paid`를 명시했다. 기존 v1은 변경하지 않는다.
- 변경 근거: `20261008-volume-v1-harper-note-v12`는 두 시나리오 모두 0명을 반환했다. 당시 fixture가 entitlement를 생략해 현재 runtime에서 모든 pair가 `no_action`만 허용된 것이 원인이다. 이 결과는 문체 변경의 수량 회귀 근거로 사용하지 않는다. 운영 guard는 변경하지 않는다.
- 목적/단위·지표/gate·privacy·한계는 위 volume-v1과 같다. 추가로 모든 선정 reason을 읽어 Harper Note의 짧고 근거 있는 해석, 사실·수치의 단순 반복 방지, 불필요한 면접 조언 방지를 확인한다. 내부 reason을 회사 공개 내용으로 옮기지 않는다.
- Canonical runner: `harper_worker/llm_evals/company_first_talent_selection/run_volume.py --dataset v2 --run-id=<새 이름>`. 실제 rerank/input/parser·현재 모델 설정을 쓰며 DB·저장·연락 없이 ignored owner-only `runs/`에 입력·출력·model/config/source/fixture hash와 usage를 남긴다.
- Provenance/label history: Codex가 첫 v2 모델 호출 전에 구조 입력 보완을 검토했다. 수량 gold는 변경하지 않았고 독립 팀원 gold 검토는 아직 없다. 실행 결과는 아래에 별도로 기록한다.

volume-v2 실행 `20261008-volume-v2-harper-note-v12`는 두 경우 회사 3명·후보자 0명을 골랐다. 실제 입력이 목요일이어서 후보자 선추천 허용일(월/수/금)이 아니었다. 원문 selected reason은 간결한 근거 기반 해석으로 작성됐지만 이 run으로 후보자 수량 gate를 판정하지 않는다.

## 현재 route 계약 재현: volume-v3 (2026-10-08, 로컬 미배포)

[cases-volume-v3.json](cases-volume-v3.json)과 [manifest-volume-v3.json](manifest-volume-v3.json)은 첫 호출 전에 동결했다. v1/v2의 원문·수락 집계·기대 수량은 그대로 두고, paid entitlement와 명시적인 수요일 기준 시각·회사 검색 요일로 두 경로를 허용한다. 이전 version은 수정하지 않는다. 목적/단위·지표·privacy·모델 기록·한계·gold 검토 경계는 위와 같으며 canonical runner의 `--dataset v3`를 사용한다. 기대값이 양수인 후보자 경로를 실제 입력이 허용하는지 모델 호출 전에 확인한다. 이는 평가의 구조 입력 검증이며 운영 guard를 완화하지 않는다.

## 통합 fit 실행을 확인하는 현재 경로

새 `opp.matching` 공통 1·2차 fit까지 포함해서 확인할 때는
[unified-talent-role-fit의 inspection-v1](../unified-talent-role-fit/README.md)을 사용한다.
`harper_worker/llm_evals/unified_talent_role_fit/inspect_matching.py`가 실제
`run_claimed`와 `score_company_pairs`를 호출하며, 검색·캐시·일반/우선 검토 rerank·live guard 원문을 보존한다.
아래 기존 `run_shadow.py`의 과거 scorer 경로는 통합 fit 실행의 증거로 사용하지 않는다.
2026-10-07 연결 DB에 새 통합 fit 컬럼이 없어 이번 실제 입력 검사는 마이그레이션을 적용한
로컬 전용 DB에서 수행한다. 운영 DB schema 변경이나 추천·발송은 하지 않는다.

## 2026-09-28 OpenAI production read-only pilot

사용자 지정 한국 FDE 역할의 현행 데이터로 서로 다른 후보 117명을 평가했다. 수정 SQL의 최종 후보 83명 중 8명을 rerank에 넣었고, 동일 입력 두 번에서 5명/6명(공통 5명)을 선택했다. SQL scope·JSON 타입 안내·필수 fit enum 및 실패 호출 비용/오류 기록 문제를 수정했다. 기록된 비용은 $0.70587515이며, 수정 전 실패 호출 일부 usage 누락으로 완전한 청구 총액은 아니다.

실행 단위·모델·provider·canonical runner·입력 재사용·privacy·한계는 [비식별 보고서](reports/2026-09-28-openai-production-shadow.md)에 기록했다. 원문과 source/입력/출력 manifest는 owner-only ignored `runs/`에만 둔다. DB write·발송·배포는 없으며, 경계 후보의 판단과 이력 전달에 변동이 남아 전체 품질 gate 통과로 해석하지 않는다. 기존 frozen gold는 변경하지 않았다.

## 2026-09-28 추천 이력·과거 fit challenge: history-v1

- 목적: 이전 추천·거절을 무조건 제외하지 않으면서, 현재 명시적 충돌과 개인정보 경계를 지키는지 확인한다.
- 단위: 합성 회사 1곳·역할 1개·후보 pair 4개. 실제 scorer → 한 pair의 과거 fit 재사용 → bounded rerank → 회사 writer.
- Frozen input/gold: [cases-history-v1.json](cases-history-v1.json), [gold-history-v1.json](gold-history-v1.json), [manifest-history-v1.json](manifest-history-v1.json). 최초 호출 전에 동결했으며 기존 v1을 대체하지 않는다.
- Canonical runner: `harper_worker/llm_evals/company_first_talent_selection/run_history.py`. Worker에서 `python3 llm_evals/company_first_talent_selection/run_history.py --run-id=<새 이름>`으로 실행한다. 매 실행 input/gold hash를 확인한다.
- 입력 계약: production scorer/reranker/writer의 실제 prompt·input builder·parser를 사용한다. Profile + 전체 Brief + Behavior + 해당 pair의 추천 사실과 현재 Role을 제공한다. 한 cached-fit 사례만 고정 과거 score로 교체한다. Query planner·DB executor는 이 평가의 대상이 아니다.
- 모델 설정: scorer `openrouter:z-ai/glm-5.3-flash` high/0.3, reranker `gpt-5.6-terra` xhigh/0.25, writer `gpt-5.6-terra` high/0.4. 실제 provider usage·source hash·dirty revision·prompt/input은 각 run manifest와 snapshot에 보존한다.
- 지표: frozen route 일치율과 별도의 의미 검토(현재 사실, 거절 의미, 공유 범위, 회사 설명). Critical 오류 0과 positive 선정 근거가 필요하다. Route 일치만으로 품질 통과를 선언하지 않는다.
- Provenance/privacy: 승인 제품 계약으로 작성한 합성 사례만 사용한다. DB 연결·저장·외부 연락은 없다. API는 설정된 production LLM provider를 사용하며 raw output은 ignored `runs/`의 0600 파일·0700 디렉터리에만 저장한다.
- 결과: [집계 보고서](reports/2026-09-28-history-reuse.md). 첫 run은 4/4, 현재 Role context를 보강한 마지막 run은 3/4 일치. 미응답 후보에 대한 no-action 차이를 숨기거나 frozen gold를 바꾸지 않았다. 전체 release gate 통과로 해석하지 않는다.
- 한계: 작은 synthetic challenge이며 독립 팀원 gold 검토, production 분포/recall, 실제 회사 반응, transport, candidate final-delivery 생성 평가는 포함하지 않는다.

## 기존 calibration

- 최초 adjudication: 2026-09-11
- 현재 dataset/gold: `v1`
- 상태: v1 수동 guard calibration 유지 + production pipeline v2-pilot positive read-only shadow 1건 완료.
  2026-09-21 route-aware runtime은 구현됐지만 v2-pilot은 아직 frozen dataset/gold가 아님

## 목적과 평가 단위

회사 단위 matching에서 적합한 후보만 고른 뒤 candidate-first/company-first/no-action을 정확히 구분하고,
이미 진행 중인 route를 가로채거나 세 자리를 채우기 위해 약한 후보를 넣지 않는지 평가한다. 평가 단위는
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

Canonical runner의 기본값은 정기 run의 mixed-route 계약이다. 명시적 `Run Search` 계약을 평가할 때만
`--company-first-only`를 사용하며, 이 모드에서는 reranker가 `company_first | no_action`만 반환하고 Role별
최대 6명을 허용한다. 두 모드의 결과를 같은 run configuration으로 취급하지 않고 manifest의
`evaluationOverrides.companyFirstOnly`로 구분한다.

다음 frozen version은 route-aware contract로 새로 만든다. 같은 candidate pool에서 candidate-first가 맞는
strong anchor, 회사의 선판단이 실제로 불확실성을 푸는 company-first, 충분하지 않은 no-action을 모두
포함해야 한다. 저장된 canonical `talent_opportunity_fit`이 현재 입력과 일치해 재사용되는 사례와 최신
Profile·Brief·Behavior·Role 사실 때문에 달라지는 사례, scorer criteria evaluations가 final review에 그대로
이어지는 사례도 포함한다. 기존 v1 input과 gold는 수정하지 않는다.

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
- `route_accuracy`: actionable 후보가 candidate-first/company-first 중 더 자연스러운 순서로 배정됐는가
- `saved_fit_use`: 호환되는 canonical fit을 무시하고 불필요하게 재판단하거나, 충돌하는 fit을 맹종하지 않았는가
- `criteria_handoff`: scorer의 validated criteria evaluations가 대표 Role review에 변형 없이 이어졌는가
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

## General-role accepted candidate review: accepted-v1 (로컬 미배포)

[cases-accepted-v1.json](cases-accepted-v1.json)과 [manifest-accepted-v1.json](manifest-accepted-v1.json)은 첫 모델 호출 전에 동결했다. 현재 유효한 수락이 있는 일반 역할 후보를 `connect/reject/defer`로 재검토하고 일반 후보의 경로를 유지하는 4쌍을 정기·회사 요청 두 실행 모드에서 검증한다. 운영 rerank/input/parser/repair를 직접 실행하는 canonical runner는 `harper_worker/llm_evals/company_first_talent_selection/run_accepted.py --run-id=<새 ID>`다. 현재 모델·reasoning·sampling 및 source/prompt/input/output/fixture hash·usage는 owner-only ignored runs에 기록한다. Gold는 Codex가 사전 작성한 synthetic challenge이며 독립 팀원 검토는 미완료다. 결정 일치와 이유의 사실성·부족/미확인 구분·상태 오표현을 함께 검토하며 critical 오류 0이 gate다. DB/저장/연락은 없고 실제 조회·원자적 상태 전환·Slack 전달은 별도 로컬 계약 테스트 대상이다. 상세 objective/input/provenance/privacy/known limitations는 manifest에 기록했다. 기존 frozen gold는 변경하지 않는다.

## Accepted presentation + Slack: accepted-v2 (로컬 미배포)

[cases-accepted-v2.json](cases-accepted-v2.json)과 [manifest-accepted-v2.json](manifest-accepted-v2.json)을 첫 호출 전에 동결했다. v1의 네 결정 gold는 보존하고, 동일 synthetic 후보에 회사 기준·합류 시점·문화 선호·보상 및 민감 맥락 challenge와 한국 회사 언어를 추가했다. `run_accepted.py --dataset=v2 --run-id=<새 ID>`는 실제 rerank → connect만 presentation → 별도 accepted Slack writer → 카드 bundle까지 생성하며 DB·실제 Slack 발송은 하지 않는다. 결정 8쌍 일치, 기준 coverage와 4필드 출력, 원문에 없는 책임·선호 창작, 보상 수치·다른 회사·사생활 노출, 후보자 수락과 회사 수락 상태 혼동을 분리 검토한다. 모델 설정·전체 input/output와 source hash는 owner-only ignored runs에 남기고 정성 검토는 Codex가 수행한다. 독립 팀원 검토·운영 표본 정확도·실제 Slack 화면 확인은 이 평가 범위 밖이다.

실제 실행 결과와 실패·수정·최종 검토는 [2026-10-08 검증 기록](reports/2026-10-08-accepted-candidate-role-review.md)에 있다. 최종 v2 r8는 결정 8/8, 공개 presentation/Slack 각각 2건을 생성·검토했다. Rerank reason은 내부 결정 근거이며 Harper Note 양식의 작성 책임은 공개 presentation writer에만 있다. 아래 local replay를 운영 E2E나 전체 품질 보장으로 확대 해석하지 않는다.

### Local storage and Harper-only Slack replay

`scripts/evalAcceptedCandidateSlack.ts prepare|send|verify <새 model run ID>`는 동결 accepted-v2의 완료 run을 그대로 읽어 로컬 DB 저장부터 실제 Harper `#qa`의 카드 표시·상세 열기까지 확인한다. Worker의 `llm_evals/company_first_talent_selection/replay_accepted_local.py`가 실제 원자적 commit과 source fingerprint를 재사용한다. Fixture eligibility만 exact testOnly·testFixture·allowlisted talent 범위로 adapter를 사용하며 production RPC를 변경하거나 fit 행을 만들지 않는다. Role·후보·추천은 loopback의 marked local DB에만 생성하고, 모델 입력/gold는 수정하지 않는다. 기존 Harper Local Socket Mode와 localhost:3017 앱을 사용하며 발송 직전 team ID·채널 ID·비공유 채널을 검증한다. 외부 Slack·운영 DB·후보 연락은 허용하지 않는다.

평가 단위는 frozen run의 결정 → 공개 보고서 → 로컬 pipeline → Slack channel/card/detail다. Gate는 connect만 pending, reject/defer의 기존 수락 유지, 보고서 저장·read 동일성, source scope·privacy·채널 본문 카드 표시·재시도 중복 없음, 실제 표시한 전체 문구의 의미 검토다. `runs/<run>/`에 owner-only fixture mapping·receipt·visible post·source/model/prompt manifest를 보존하고 공유 문서에는 집계만 기록한다. 실제 API·운영 provider 결과는 원 model run의 manifest를 따른다. 이 replay는 retrieval/scorer·운영 guard의 전체 production E2E나 운영 정확도를 증명하지 않는다. canonical testOnly exclusion과 guard는 별도 disposable Postgres 테스트로 검증한다.

`scopes`는 실제 설치 권한을 읽는다. `native`는 정상 sender 발송 후 같은 Harper QA 채널 본문에 production entity builder로 독립 카드 메시지를 보내 렌더링·상세 요청을 검증하는 visual probe이며, 정상 sender의 권한 guard를 변경하지 않는다. 기존 스레드 probe 원문은 과거 실패 기록으로 보존한다. 설치 권한 때문에 `verify`의 private-thread API read가 막히면 그 제한을 기록하고 실제 Slack 화면에서 문구·카드·상세를 직접 검토한다. 현재 표시 gate는 수락 카드가 채널 본문에 보이고, 부분 재시도에도 중복되지 않는 것이다. Bot API의 성공만으로 UI gate를 통과시키지 않는다.
