# External opportunity value evaluation

현재 상태: isolated runner, `pilot-v1`, `selection-random-v1` model run과 selector architecture development 완료. 첫 treatment의 pointwise `candidateFit=fit` hard gate는 폐기했고, `roleFit`만 조기 gate로 쓰며 candidateFit은 final setwise 판단의 provisional evidence로 남기는 구조를 선택했다. Human gold는 아직 동결되지 않았다. 결과는 [첫 E1](RESULTS-2026-09-12.md)과 [selector architecture 결론](RESULTS-2026-09-13.md)에 있다.

## 목적과 결론 경계

이 평가는 external 공고 추천에서 현재의 단일 score·company weight·회사당 한 역할 중심 선택보다, `roleFit`과 후보자 관점의 opportunity value를 분리하고 마지막에 slate로 비교하는 방식이 더 나은지를 검증한다.

평가가 직접 답하는 것은 다음과 같다.

- 같은 GLM 5.3 Flash High와 같은 후보군에서 새 판단 계약이 더 나은 추천 묶음을 만드는가.
- 최초 출력 coverage, repair, token, 비용과 latency가 허용 범위인가.
- 현재 방식의 company bonus, recent-company penalty, same-company cap에서 어떤 후보가 사라지는가.

이 평가는 full corpus의 절대 recall, 실제 사용자 반응 상승, 지원·면접·채용 상승을 단독으로 증명하지 않는다. Human blind review 전 모델 출력만으로 새 방식의 품질 승패를 선언하지 않는다.

## 평가 단위와 population

평가 단위는 다음이다.

```text
한 periodic external-eligible talent snapshot
+ 같은 version의 Profile / 전체 Search Brief / Behavior Context
+ current retrieval에서 rank-stratified로 고정한 external role 30개
+ current/new evaluator와 selector가 만든 두 slate
```

Capture는 최근 `periodic_refresh_due` completed V2 external attempt가 있는 현재 eligible talent를 stable hash 순서로 뽑는다. 최종 추천이 0개였던 run도 포함한다. 한 talent는 한 case만 사용한다.

E1 candidate pool은 current retrieval 안의 selection 실험이다.

- rank 1–15 전부
- rank 16–100 seeded random 10개
- rank 101–200 seeded random 5개
- 구간이 부족하면 남은 higher-rank role에서 without-replacement로 채움

따라서 이 dataset은 새 retrieval recall을 평가하지 않는다.

## Dataset과 gold version

| Version | 용도 | 크기 | 상태 |
|---|---|---:|---|
| `pilot-v1` | GLM cost·coverage·contract P0 | 6 talents × 30 roles | frozen; P0 완료 |
| `selection-random-v1` | E1 representative logic comparison | 48 talents × 30 roles | frozen; pilot talent 중복 0, model run 완료, human gold pending |
| `selection-challenge-v1` | E1-C challenge regression | 12 talents × 30 roles | 별도 수동 selection 필요 |

Raw fixture는 `private/<dataset>.json`에, raw model output은 `runs/<run-id>/`에 저장한다. Frozen fixture와 gold는 덮어쓰지 않는다. 입력·label이 달라지면 새 version을 만든다.

Gold는 아직 pending이다. `review` 명령이 만드는 local-only blind artifact에서 48개 전체 slate preference를 먼저 세 명이 arm/model/rationale을 보지 않고 독립 비교하고 동결한다. 그 뒤 stable-hash로 미리 고른 12개 case의 30개 role을 최소 두 명이 독립 작성하고 adjudication한다. 12-case candidate audit 추출은 model output과 무관하다. Model output을 본 뒤 gold를 바꾸지 않는다. Scorer는 dataset/run 일치, 세 slate vote, 두 candidate label, adjudication, `goldVersion`, review history가 모두 있어야 실행된다.

Candidate gold contract:

- `send_judgment`: `send_now | reserve | do_not_send | insufficient_context`
- `blocking_issue`: `none | explicit_constraint | factual_support | role_feasibility | inactive_or_invalid`
- `omission_regret`: `yes | no | uncertain`
- `reason`: 짧은 자유형 판단

Primary slate preference는 세 reviewer 중 최소 두 명이 같은 arm을 고를 때만 그 arm의 win으로 확정한다. 나머지는 tie/cannot-judge다.

## Prompt와 input contract

Control은 production의 다음 함수를 직접 import한다.

- `deepseek_fit_system_prompt`
- `deepseek_fit_input`
- `normalize_deepseek_evaluations`
- `ranked_fit_roles`
- `deepseek_rerank_system_prompt`
- `deepseek_rerank_input`
- `validate_rerank_output`

Treatment prompt는 canonical runner에 versioned constant로 둔다. 두 arm은 같은 candidate order와 같은 production-built pointwise payload를 받는다. Treatment structured output은 machine이 실제 소비하는 `roleId`, `roleFit`, `candidateFit`, `reason`과 selector의 `decision`, `selectedRoleIds`, `reason`만 사용한다.

첫 E1 결과 뒤의 selector development는 [`selector_lab.py`](../../../../harper_worker/llm_evals/external_opportunity_value/selector_lab.py)에서 별도 run으로 수행한다. Frozen fixture와 base pointwise output을 덮어쓰지 않는다.

| Variant | 조기 판단 | 최종 판단 | 확인하려는 질문 |
|---|---|---|---|
| `hard-dual` | `roleFit in {fit, plausible}`와 `candidateFit=fit` | 작은 pool setwise | pointwise candidate value를 hard gate로 써도 되는가 |
| `feasibility-setwise` | `roleFit in {fit, plausible}`만 사용 | candidate value를 전체 feasible pool에서 비교 | candidate value는 상대 비교 단계에 맡기는 편이 나은가 |
| `feasibility-setwise-clean` | 같은 roleFit gate | selector에는 roleFit evidence만 전달 | pointwise candidateFit hypothesis가 setwise 판단을 anchoring하는가 |
| `direct-listwise` | 없음 | 30개를 한 번에 0–3개로 선택 | 두 pointwise label 없이도 더 단순하고 좋은 판단이 가능한가 |
| `batch-tournament` | 10개씩 recall-oriented challenger | challenger union을 0–3개로 선택 | 전체 후보를 보되 150개까지 확장 가능한 계층형 비교가 나은가 |

Development judge는 모든 30개 role과 익명 proposal만 보고 독립 reference slate와 proposal verdict를 만든다. Arm 이름, generator reason, current score, company score, pointwise label은 숨기며 role/proposal order를 replicate마다 바꾼다. GLM 5.3 Flash High 3회 반복의 일관성과 current 대비 paired 결과를 보고 configuration을 고른다. 이는 prompt/model 선택용 proxy일 뿐 human gold나 user outcome을 대체하지 않는다. 같은 모델 family가 생성과 평가를 모두 맡는 self-preference 위험을 결과에 명시한다.

Production module, worker 설정, DB schema, application row는 변경하지 않는다.

## Canonical runner

[`harper_worker/llm_evals/external_opportunity_value/eval.py`](../../../../harper_worker/llm_evals/external_opportunity_value/eval.py)

```bash
cd /Users/gimhojin/Desktop/harper
source ./worker.env

# Read-only fresh fixture capture.
./myenv/bin/python harper_worker/llm_evals/external_opportunity_value/eval.py capture \
  --dataset pilot-v1 --case-count 6 --candidate-count 30

# E1 holdout: development pilot talents are excluded.
./myenv/bin/python harper_worker/llm_evals/external_opportunity_value/eval.py capture \
  --dataset selection-random-v1 --case-count 48 --candidate-count 30 \
  --exclude-dataset pilot-v1

# Same-model current/new P0. No DB access or writes during model execution.
./myenv/bin/python harper_worker/llm_evals/external_opportunity_value/eval.py run \
  --dataset pilot-v1 --experiment p0 --model glm-5.3-flash \
  --reasoning-effort high --max-cost-usd 0.30 --max-parallel 4

# Local-only candidate and blind-slate review artifacts.
./myenv/bin/python harper_worker/llm_evals/external_opportunity_value/eval.py review \
  --dataset selection-random-v1 --run-id <run-id> --candidate-audit-cases 12

# Reviewers가 gold-completed.json을 완성하고 version을 부여한 뒤에만 실행한다.
./myenv/bin/python harper_worker/llm_evals/external_opportunity_value/eval.py score \
  --run-id <run-id>

# Opened E1 development set에서 selector 구조별 별도 run.
./myenv/bin/python harper_worker/llm_evals/external_opportunity_value/selector_lab.py run \
  --dataset selection-random-v1 --base-run-id <base-run-id> \
  --variant feasibility-setwise --run-id <variant-run-id> \
  --model glm-5.3-flash --reasoning-effort high --max-cost-usd 0.60

# 모든 variant가 끝난 뒤 anonymous 3-repeat development judge.
./myenv/bin/python harper_worker/llm_evals/external_opportunity_value/selector_lab.py judge \
  --dataset selection-random-v1 --base-run-id <base-run-id> \
  --variant-run-id <variant-run-id> --run-id <judge-run-id> \
  --model glm-5.3-flash --reasoning-effort high --replicates 3 \
  --max-cost-usd 2.50
```

Capture만 canonical `opp.utils.new_runtime.connect_read_only()`를 사용한다. `run`과 `review`는 frozen local fixture만 읽는다.
`run --resume`은 완료 case를 재호출하지 않고 private checkpoint의 비용과 결과를 승계한다. 각 model call은 별도 child process에서 실행되며 기본 180초 hard wall-clock timeout을 가진다.

## Model/run configuration

기본 실험 모델:

```text
model: z-ai/glm-5.3-flash
provider: OpenRouter
reasoning_effort: high
response_format: json_object
provider.only: [z-ai]
provider.allow_fallbacks: false
provider.data_collection: deny
```

다른 provider/model로 자동 fallback하지 않는다. Output이 구조적으로 불완전하면 같은 모델로 최대 한 번 repair한다. Raw coverage와 repair 후 coverage를 따로 보고한다.

각 run에는 hard cost cap을 지정한다. 성공·retry·repair·selector와 billable failure를 모두 합산한다. Provider `usage.cost`를 우선하며, 없으면 실행 시점 catalog price와 token으로 계산한다.

2026-09-12 추가 selector suite는 각 logical experiment를 별도 cost ledger로 분리한다. 개별 hard cap은 모두 $3 미만이며, 기존 E1 이후 추가 suite 전체의 승인 상한은 $15다. Planned cap은 feasibility $0.60, direct $0.75, tournament $2.50, development judge $2.50, 선택된 configuration의 fresh holdout generation+judge 각 $3 미만이다. 결과가 충분하면 남은 예산을 쓰기 위해 실험을 추가하지 않는다.

## Metrics와 gate

P0는 품질 승패를 내리지 않는다.

- 최초 batch full-role coverage ≥ 98%
- repair 후 case coverage 100%
- 최종 evaluator/selector 결과의 허용되지 않은 role ID 0. Raw hallucination은 별도 진단하고 deterministic validator가 폐기한다.
- 실제 비용 ≤ $0.30
- observed p95 call cost로 E1 예상 비용 + 20% reserve 산정

E1 quality gate는 gold가 완성된 뒤에만 계산한다.

- 최소 36 non-tie cases
- treatment win rate ≥ 60%
- one-sided exact sign test `p < 0.05`
- critical blocking issue 선택 0
- stable-hash 12-case candidate audit의 gold slate micro-recall이 control보다 낮지 않음
- recovered case coverage 100%
- treatment의 동일 30-role case당 비용이 control의 1.25배 이하
- benchmark actual total cost < $2.25; 실행 hard cap은 uncached P0 projection에 20%를 더하되 $2.25 이하

Pass는 evaluator/selector prototype과 shadow trace 구현 근거다. Production 교체나 rollout 근거가 아니다.

## Data provenance와 privacy

- Production capture는 전용 read-only connection만 사용한다.
- Raw talent ID, run ID, Profile, Brief, Behavior Context, role/company card와 model raw output은 ignored `private/` 또는 `runs/`에만 둔다.
- 두 디렉터리는 `0700`, 파일은 `0600`이다.
- Commit 가능한 manifest/report에는 opaque case/role alias, count, hash, aggregate cost/coverage만 둔다.
- Raw fixture는 OpenRouter Z.AI endpoint로 전송된다. `data_collection=deny`, provider pin, fallback off를 기록한다.
- 추천, fit cache, discovery run, email/message, application table에 어떤 write도 하지 않는다.

## 알려진 제한

- E1은 current retrieval에 최소 30개가 있는 population의 conditional selection 평가다.
- 최근 periodic run의 saved search plan을 현재 snapshot에 적용하므로 완전한 fresh planner evaluation은 아니다.
- Current retrieval에서 나온 후보만 보므로 두 방식이 함께 놓친 corpus opportunity는 보이지 않는다.
- Human review가 완료되기 전에는 schema/coverage/cost와 두 arm의 차이만 말할 수 있다.
- `selection-random-v1`은 30개 후보를 만들 수 없는 talent 32명을 제외했다. 캡처된 48명 중 24명은 retrieval pool이 100개 이하라 101–200 tail 대신 16–100 구간으로 채웠다.
- Dirty working tree의 production import가 결과에 반영될 수 있으므로 source revision과 diff fingerprint를 manifest에 남긴다.
- GLM 가격과 endpoint behavior는 바뀔 수 있으므로 response actual cost와 route를 run마다 보존한다.
- E1 최초 실행은 40/48 뒤 장시간 SSL read에 정체되어 강제 종료 후 resume했다. 종료 시점의 in-flight 청구액은 복원할 수 없어 기록 비용은 lower bound다.
- Selector development는 이미 결과를 본 `selection-random-v1`에서 configuration을 고르는 model-selection 단계다. 여기서 가장 좋은 variant의 수치를 최종 holdout 성능으로 보고하지 않는다.
- Blind development judge는 같은 GLM model family를 사용하므로 생성기 고유 표현이나 판단 습관을 선호할 수 있다. 익명화·순서 교환·반복은 order bias를 진단하지만 독립 human validity를 만들지는 않는다.

## 변경 이력

| 날짜 | 주요 변경 |
|---|---|
| 2026-09-13 | Anonymous repeated judge 결과로 candidateFit hard gate를 폐기하고 role-feasible setwise 구조를 선택했다. |
| 2026-09-12 | E1의 hard candidateFit gate 축소 신호를 반영해 feasibility-setwise, direct-listwise, batch-tournament와 anonymous repeated model-judge development suite를 등록했다. |
| 2026-09-12 | Pilot과 48-case E1 model run을 완료하고 checkpoint/resume, hard call timeout, blind human review와 scorer를 추가했다. |
| 2026-09-11 | External opportunity value 평가 계약과 isolated runner 위치를 등록했다. |
