# Internal recommendation binary evaluation

최초 선택·gold 기준 시점: 2026-09-07 17:41:22 KST  
현재 dataset/gold: `v4`  
Production data access: read-only  
현재 상태: IRB006을 제거하고 IRB011의 anchor를 Config FDE로 바꾼 41개 pair와 pair별 cutoff·전체 cutoff-safe fixture 동결 완료, v4는 아직 모델 미실행

## 목적과 범위

이 평가는 A/B/C 축을 각각 채점하지 않고, 주어진 Talent × internal Role 한 쌍을 지금 후보자에게 추천할지에 대한 최종 `recommend` boolean만 본다. 전체 모집단을 대표하는 random sample이 아니라 추천·비추천의 명확한 사례와 경계 사례를 섞은 regression/challenge set이다.

- 진짜 추천: 12개, `expectedRecommend=true`
- 애매: 10개, binary precision/recall에서는 제외하고 별도 관찰
- 비추천: 19개, `expectedRecommend=false`
- 평가 단위: Talent 1명 × internal Role 1개
- 모든 41개 pair와 talent는 서로 중복되지 않는다.
- Role의 `paused_by_request` 같은 현재 운영상 전달 스위치는 이 모델 판단 평가의 입력과 gold에 사용하지 않는다.

## 저장 파일

| 파일 | 역할 | Git |
| --- | --- | --- |
| [gold-v4.json](gold-v4.json) | 41개 case의 비식별 bucket과 binary gold | 추적 |
| [manifest-v4.json](manifest-v4.json) | 버전, 분포, provenance, artifact hash와 제한 | 추적 |
| `private/selection-v4.json` | 실명, talent/role UUID, `/ops/career` 경로, pair별 `snapshotCutoffAt` | local-only, `0600` |
| `private/fixture-v4-full-41.json` | v3 fixture에서 IRB006을 제거하고 IRB011 anchor를 Config FDE로 교체한 41개 cutoff-safe 후보 context와 capture 시점 company role batch | local-only, `0600` |
| `private/fixture-v3-full-42.json` | IRB006을 포함한 직전 v3 전체 fixture | local-only, `0600` |
| `private/fixture-v3-irb024-025-027-028.json` | 최초 네 challenge case의 이전 동결 fixture | local-only, `0600` |
| `runs/` | 모델 raw output·입력·비용·latency·사람용 보고서 | local-only, `0600` |

Selection 검증기는 `harper_worker/llm_evals/internal_recommendation_binary/validate_selection.py`다. Production table을 쓰지 않고 구조와 cutoff provenance만 확인한다. 검증기와 fixture capture는 canonical read-only connection을 사용해 transaction pool을 피하고, 매 transaction의 read-only 상태를 적용·검증한다.
Fixture capture와 모델 실행의 canonical runner는 `harper_worker/llm_evals/internal_recommendation_binary/eval.py`다.

```bash
cd /Users/gimhojin/Desktop/harper
source ./worker.env
./myenv/bin/python harper_worker/llm_evals/internal_recommendation_binary/validate_selection.py

# 전체 selection을 read-only capture; 기존 frozen fixture는 덮어쓰지 않는다.
./myenv/bin/python harper_worker/llm_evals/internal_recommendation_binary/eval.py capture \
  --output harper_beta/docs/evaluation/internal-recommendation-binary/private/fixture-v4-full-41.json

# 같은 fixture에 모델·reasoning·prompt만 바꿔 병렬 재실행한다.
./myenv/bin/python harper_worker/llm_evals/internal_recommendation_binary/eval.py run \
  --fixture harper_beta/docs/evaluation/internal-recommendation-binary/private/fixture-v4-full-41.json \
  --prefilter-model glm-5.3-flash \
  --prefilter-reasoning-effort high \
  --second-stage-model glm-5.3-flash \
  --second-stage-reasoning-effort high \
  --second-stage-repair-model glm-5.3-flash \
  --second-stage-repair-reasoning-effort high \
  --max-parallel 5
```

`--prefilter-prompt`, `--second-stage-prompt`, `--second-stage-repair-prompt`에 파일을 넘기면 frozen data를 바꾸지 않고 prompt만 교체한다. `--prefilter-fallback-model none` 또는 `--second-stage-repair-model none`으로 recovery 없는 순수 모델 출력도 측정할 수 있다. 모델은 stage별로 독립 설정하며 OpenRouter의 명시적 `openrouter:<author>/<slug>`도 받는다.

## Snapshot cutoff 계약

`snapshotCutoffAt`은 모든 case에 반드시 있으며 후보자 evidence와 lifecycle 입력의 **exclusive upper bound**다. 후보자 쪽 입력에는 source timestamp가 `snapshotCutoffAt`보다 엄격히 이른(`<`) 사실만 사용할 수 있다. 평가 대상 role/JD는 “현재 역할을 당시의 안전한 후보 상태에 추천할지”를 묻기 위해 fixture capture 시점의 현재 active company batch를 사용하고 그 사실을 audit에 기록한다.

1. 같은 Talent × Role에서 다음 구조화 이벤트 중 가장 이른 시각을 찾는다: recommendation 생성, progress, opportunity tag, role activity, contact queue, company talent request.
2. 이벤트가 있으면 그 최초 이벤트 시각 자체를 `snapshotCutoffAt`으로 저장하고 그 이벤트부터 전부 제외한다.
3. 이벤트가 없으면 selection capture 시각인 `2026-09-07T08:41:22.230037Z`를 cutoff로 저장한다.
4. target pair의 기존 fit, recommendation, 질문, 후보자 연결 요청, 수락, 연결 대기, 인터뷰, 거절, 아카이브, 최종 오퍼와 이들로부터 파생된 summary·memo는 모델 입력에 넣지 않는다.
5. profile insight나 memory가 cutoff 이후 수정되었고 당시 값을 재구성할 version history가 없다면 현재 값을 대신 넣지 않고 해당 필드를 생략한다.
6. 이후 인터뷰 탈락이나 아카이브는 true 추천을 내리는 근거가 아니며, positive/negative label을 바꾸지 않는다.
7. 현재 worker가 사용하는 같은 회사의 이전 role 이력은 target role을 제외하고 cutoff 이전의 sibling-role 사실만 재구성해 넣는다.

현재 41개 중 14개는 최초 pair event를 cutoff로 사용하고 26개는 selection capture 시각을 사용한다. IRB011은 Head 추천·수락 정보가 FDE 판단에 섞이지 않도록 기존의 더 이른 clean cutoff를 그대로 보존한 1개 manual historical cutoff다. 특히 recommendation보다 candidate request나 internal fit question이 먼저 발생한 pair는 더 이른 이벤트를 cutoff로 삼았다.

## 입력·출력 계약

Runner는 production의 일반 internal recommendation prompt, role card builder, user-context builder, 1차 pass cap, 2차 recommend guard와 output normalization을 직접 import한다. 1차 invalid/coverage 실패에는 production의 direct DeepSeek fallback 1회를, 2차 invalid/coverage 실패에는 production recovery prompt와 설정 가능한 repair model 1회를 적용한다. 어떤 경로도 application persistence helper를 호출하지 않는다.

Capture는 source discovery run의 behavior-context version이 현재 저장본과 같고 cutoff 이전에 저장됐을 때만 그 text를 사용한다. 버전이 덮인 경우 현재 text를 섞지 않고 cutoff 이전 경력·학력·메시지·activity의 legacy projection으로 전환한다. 전체 v4 fixture는 exact stored behavior version 15건과 cutoff-safe legacy fallback 26건으로 구성된다. 운영 전달 상태는 gold에서 제외하므로 capture 시점에 `ended`였던 IRB001 anchor는 평가 runner에서만 active sibling batch에 추가했고, production 추천 경로는 바꾸지 않았다.

GLM 5.3 Flash의 Z.AI endpoint는 OpenRouter strict structured output을 지원하지 않는다. Provider를 우회하지 않는 원칙에 따라 이 실행은 기존 `json_object` 모드와 deterministic type·필수 필드·role coverage 검증, 1회 recovery를 사용했다.

모델 출력에서 채점하는 값은 anchor role의 최종 `recommend` 하나다. 진짜 추천 12개와 비추천 19개만 binary metric에 포함한다. 애매 10개는 false positive/false negative로 강제 환산하지 않고 사례별 출력과 rationale을 검토한다.

## Metrics와 release gate

fixture와 runner가 만들어지면 다음을 기록한다.

- 31개 scored case의 recommend precision, recall, accuracy
- 12개 true recall과 19개 no specificity
- 애매 10개에서 recommend 비율과 사례별 판단 근거
- lifecycle leakage 0건
- 누락 role, malformed output, normalization failure 0건

현재 challenge set에는 별도의 release threshold를 아직 확정하지 않았다. v4는 IRB006을 제거해 입력과 gold가 바뀐 새 버전이므로 v3 실행 지표를 v4 지표로 재사용하지 않는다. 모델 run 결과를 본 뒤 gold를 바꾸지 않고, label이나 pair가 바뀌면 새 dataset version을 만든다.

## 직전 v3 전체 42개 실행

아래 결과는 IRB006을 포함한 v3 기록이다. 현재 v4의 성능으로 간주하지 않는다.

| Run | 1차 / 2차 / repair | 판정 가능 | scored 일치 | Precision | Recall | Specificity | 애매 추천 | 비용 | 시간 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `20260907T105717.686288Z` | GLM 5.3 Flash high / high / high | 42/42 | 26/32 | 88.9% | 61.5% | 94.7% | 3/10 | $0.159827 | 20분 27초 |

- 추천 13개 중 8개 추천, 5개 누락: IRB005·006·009·011·012
- 비추천 19개 중 18개 비추천, 1개 과추천: IRB024
- 애매 10개 중 3개 추천: IRB016·018·020
- 1차 full coverage 42/42, direct DeepSeek fallback 2회(IRB003·041)
- 2차 호출 34건의 full coverage 34/34, GLM repair 1회(IRB007), 최종 `None` 0건
- 1차 primary 오류는 boolean `pass` 타입 1건과 role 누락 1건이었고 모두 fallback으로 복구됐다. 2차 primary 오류는 role 누락 1건이었고 repair로 복구됐다.
- 새 `reason` 계약은 1~5개의 문장으로 출력을 제한했지만 문장 자체는 여전히 긴 사례가 있어, 간결성은 별도 정성 검토가 필요하다.

## v1 첫 5개 실행

| Run | 1차 / 2차 | 판정 가능 | gold 일치 | FP | 출력 recovery | 비용 |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| `20260907T091117.096606Z` | GLM 5.3 Flash high / GLM 5.3 Flash high | 4/5 | 2/5 | 2 | 2차 repair 2회, 그중 1회 최종 실패 | $0.024629 |

- IRB024 May × Deployment Strategist: `recommend=true` — gold false와 불일치
- IRB025 정지우 × FDE Singapore: `recommend=false` — gold와 일치, 2차 repair로 완전한 출력 복구
- IRB026 Sangchual Cha × FDE Korea: `recommend=true` — gold false와 불일치
- IRB027 Daisuke Narita × FDE Japan: `recommend=false` — gold와 일치
- IRB028 Adam A. × Field CTO Australia: anchor raw 판단은 두 번 모두 false였으나 sibling role의 필수 `recommend` 누락이 repair 후에도 남아 production batch contract상 최종 `None`

이 5개는 모두 negative challenge subset이므로 이 run의 `precision=0`은 전체 dataset precision이 아니다. positive case가 없어서 recall도 계산하지 않는다.

이 실행은 동결된 v1 결과로 그대로 보존한다. 현재 v4에서는 IRB026 Sangchual pair와 IRB006 Jeonghoon pair를 데이터셋에서 완전히 제거했다. IRB024 May를 포함한 나머지 label은 v3 그대로다. 이 변경을 새 모델 실행으로 기록하지 않는다.

## 데이터 provenance와 privacy

- 2026-09-07 production DB를 read-only transaction으로 조회해 v3 42개 pair의 실체, role 상태, `testOnly != true`, 최초 same-pair lifecycle event를 확인했다. v4는 검증된 v3에서 IRB006만 제거했다.
- 실명과 UUID는 gitignored `private/selection-v4.json`에만 저장하며 디렉터리는 `0700`, 파일은 `0600`이다.
- `gold-v4.json`과 `manifest-v4.json`에는 후보자 식별자나 원문 profile을 넣지 않는다.
- 전체 42개 cutoff-safe fixture를 OpenRouter Z.AI GLM 5.3 Flash에 전송했다. OpenRouter `data_collection=deny`, `provider.only=["z-ai"]`, `allow_fallbacks=false`로 실행했다. 1차 fallback 두 건만 direct DeepSeek API를 사용했다.
- v4 fixture는 아직 어떤 모델 provider에도 새로 전송하지 않았다.

## 알려진 제한

- 일부 profile/insight table은 완전한 version history가 없어 과거 값을 검증할 수 없는 필드는 제외됐다. 전체 41개 중 26개는 원래 behavior-context payload의 exact replay가 아니라 cutoff-safe legacy fallback이다.
- Role/JD/company card는 현재 역할 판단을 위해 capture 시점의 current active batch를 쓴다. 과거 추천 당시 role card의 exact replay가 아니다.
- IRB001의 target role은 capture 시점에 `ended`여서 평가 목적상 현재 role card를 active sibling batch에 추가했다. 이 예외는 model-decision 평가에만 있으며 production 추천 가능 상태를 뜻하지 않는다.
- 애매 10개는 binary gold가 아니므로 전체 41개를 하나의 accuracy로 보고하면 안 된다.
- 41개는 의도적으로 구성한 challenge set이며 production 평균 추천 성능을 추정하지 않는다.

## 변경 이력

| 날짜 | 주요 변경 |
| --- | --- |
| 2026-09-07 | 아직 미실행인 v4 작업본에서 IRB011 Byoungoh Kim의 anchor를 Head of Robotics Systems에서 Forward-Deployed Engineer로 교체했다. 후보 입력은 기존 Head 추천 전 cutoff를 그대로 보존했다. |
| 2026-09-07 | v4에서 잘못된 positive gold로 판단된 IRB006 Jeonghoon Lee × Blockit AI Agents를 완전히 제거해 12 true·10 ambiguous·19 no, 총 41개로 조정했다. v3와 그 실행 결과는 변경하지 않았다. |
| 2026-09-07 | 전체 42개 cutoff-safe fixture를 동결하고 현재 prompt의 GLM 5.3 Flash high 1·2차/repair를 병렬 5개로 실행했다. 판정 42/42, precision 88.9%, recall 61.5%, specificity 94.7%였다. |
| 2026-09-07 | v3에서 Sangchual Cha × Wonderful FDE Korea를 데이터셋에서 완전히 제거해 13 true·10 ambiguous·19 no, 총 42개로 조정했다. May × Wonderful DS는 기존 no label을 유지한다. |
| 2026-09-07 | v2는 Sangchual 처리 의도를 잘못 해석한 중간 버전으로 보존하고 현재 버전에서 사용하지 않는다. |
| 2026-09-07 | stage별 모델·reasoning·prompt 교체와 병렬 실행, 1차 fallback·2차 repair를 지원하는 공용 runner를 만들고 IRB024–028을 GLM 5.3 Flash high로 실행했다. |
| 2026-09-07 | 13 true·10 ambiguous·20 no의 43개 selection을 동결하고 모든 pair에 exclusive `snapshotCutoffAt`을 저장했다. 비추천 5개는 owner 지정 challenge case로 교체했다. |
