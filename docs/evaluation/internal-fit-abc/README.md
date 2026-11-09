# Internal fit A/B/C evaluation

최초 기준 시점: 2026-09-02 15:10 KST  
마지막 확장: 2026-09-02 15:45 KST  
최근 A/B/C gold adjudication: 2026-09-02 (`v3`)  
최근 recommendation gold adjudication: 2026-09-02 (`recommendation-v1`)  
최근 A/B/C 단독 실행: 2026-09-02 19:13 KST (`v3`, OpenRouter `z-ai/glm-5.3-flash`)  
최근 1·2차 recommendation 실행: 2026-09-03 00:41 KST (`recommendation-v1`, OpenRouter `z-ai/glm-5.3-flash`, max)  
Production data access: read-only  
Worker revision: `53448d179c1a73427688d6d89a923d7942ad37c4`

이 세트는 전체 모집단의 평균 성능을 추정하기 위한 random sample이 아니다. 새 A/B/C 판단이 실제로 분리되어야 하는 13개 production pair를 고른 outcome-anchored regression/challenge set이다.

실명, talent/role UUID, 이력 원문과 대화 원문은 gitignored `private/fixture-v3.json`에만 있고 파일 권한은 `0600`이다. 이 문서와 [gold-v3.json](gold-v3.json)에는 opaque talent alias만 둔다. 모든 anchor role은 capture 시점에 active이며 `information.testOnly != true`임을 확인했다.

v3의 C=`fit` 7건은 모두 **동일 후보×동일 role**이 production에서 명시적 `pending_connection`, custom company stage 또는 `final_offer`에 도달한 pair다. 후보 측 수락만 나타내는 `talent_opportunity_recommendation.saved_stage=connected`는 C positive 근거로 인정하지 않는다. C=`ambiguous|unfit` 6건은 v2에서 보존한 reviewer challenge case이며 observed negative의 대표 표본이라는 뜻은 아니다.

## 저장·재현 계약

| 파일 | 역할 | Git |
| --- | --- | --- |
| [gold-v3.json](gold-v3.json) | 현재 13쌍의 A/B/C·policy gold, C outcome provenance, 금지 오류, 비식별 input fingerprint | 추적 |
| [recommendation-gold-v1.json](recommendation-gold-v1.json) | 동일 13쌍의 fresh-decision 최종 `recommend` gold와 1차 anchor pass 기대값 | 추적 |
| [recommendation-gold-v1.md](recommendation-gold-v1.md) | 추천 9건·비추천 4건의 사람용 판정표, 지표와 lifecycle 격리 계약 | 추적 |
| [recommendation-manifest-v1.json](recommendation-manifest-v1.json) | recommendation gold provenance·hash·분포·adjudication | 추적 |
| [manifest-v3.json](manifest-v3.json) | 현재 provenance·artifact hash·분포·adjudication | 추적 |
| [prompt-v2.md](prompt-v2.md) | 현재 A/B/C first-pass system prompt | 추적 |
| [gold-v1.json](gold-v1.json), [gold-v2.json](gold-v2.json), 이전 manifest/prompt | 이전 기준과 run 재현용 | 추적·보존 |
| `private/fixture-v3.json`, `private/selection-v3.json` | production payload·UUID·outcome-anchored selection | local-only, `0600` |
| `runs/` | 모델별 raw response, 비용·latency와 run manifest | local-only |
| `reports/` | 모델별 비식별 metric과 사례별 label diff | 추적 가능 |

현재 private fixture의 SHA-256은 `b382e14e1a348fe8e9fee1a5441a37588dac3b49de5dc8fff5698e1d9063fe41`다. 새 모델/provider/reasoning은 v3 fixture를 바꾸지 않고 새 run으로 기록하며, 이후 사례·snapshot·label을 바꾸면 v4를 만들고 이전 버전을 보존한다.

최종 recommendation runner는 `harper_worker/llm_evals/internal_fit_abc/recommendation_eval.py`다. production의 1차·2차 prompt builder, payload builder, output normalizer, pass cap과 recommend guard를 직접 import한다. ABC01–07의 추천 이후 outcome leakage를 막기 위해 현재 fixture에서 conversation, recommendation, activity, feedback, behavior summary와 experience memo를 제외한 deterministic `fresh_decision` projection을 사용한다. 이는 정확한 역사 시점 DB snapshot은 아니므로 run limitation에 항상 함께 기록한다.

단일 case의 2차 모델만 바꿔 재현할 때는 `harper_worker/llm_evals/internal_fit_abc/second_stage_case_eval.py`를 사용한다. 이 runner는 완료된 full run에 저장된 2차 payload hash를 재검증하고 production 2차 prompt, direct provider client, normalization과 recommend guard를 재사용한다. 입력 role set이나 1차 결과를 다시 생성하지 않는다.

```bash
cd /Users/gimhojin/Desktop/harper/harper_worker
python3 llm_evals/internal_fit_abc/recommendation_eval.py --dry-run
python3 llm_evals/internal_fit_abc/recommendation_eval.py \
  --model glm-5.3-flash \
  --reasoning-effort high \
  --max-parallel 3

# 다른 조건은 고정하고 reasoning만 비교할 때
python3 llm_evals/internal_fit_abc/recommendation_eval.py \
  --model glm-5.3-flash \
  --reasoning-effort max \
  --max-parallel 3

# 완료된 run의 ABC12 2차 payload만 direct Claude로 재생
python3 llm_evals/internal_fit_abc/second_stage_case_eval.py \
  --case-id ABC12 \
  --model claude-sonnet-5
```

v3 positive fixture capture에는 `harper_worker/llm_evals/internal_fit_abc/capture_outcome_anchored_fixture.py`를 사용한다. 이 캡처는 read-only DB 연결에서 동일 pair의 stage evidence를 확인하고, C=`fit`인데 explicit pipeline evidence가 없으면 실패한다. A/B/C 실행 runner `harper_worker/llm_evals/internal_fit_abc/abc_prefilter_eval.py`도 같은 provenance invariant를 재검증한 뒤 기존 benchmark의 OpenRouter request path를 import해 실행한다. 평가 실행 자체는 application table을 쓰지 않으며 production worker가 평가 runner를 import하지 않는다.

```bash
cd /Users/gimhojin/Desktop/harper/harper_worker
python3 llm_evals/internal_fit_abc/abc_prefilter_eval.py --dry-run
python3 llm_evals/internal_fit_abc/abc_prefilter_eval.py \
  --model glm-5.3-flash \
  --max-parallel 3
```

Raw response와 hold criterion은 `runs/`에만 저장한다. `reports/`에는 opaque talent alias와 label/metric만 둔다. 기록된 v1-v3 evaluation prompt는 `recommend`, 후보 노출, 질문 발송, 2차 routing을 출력하지 않는다. `mustAskHoldQuestion` metric은 평가기에서 `A=hold`, `B/C!=unfit`, 유효 criterion 존재를 이용해 파생하며 실제 runtime policy로 확정된 규칙은 아니다. Hold criterion의 의미가 gold 질문과 같은지는 문자열 exact match가 아니라 사람이 검토한다.

현재 gold는 outcome-anchored positive와 reviewer challenge를 섞은 작은 regression set이며 아직 blocking 배포 gate가 아니다. C positive provenance는 검증됐지만 A/B와 negative challenge의 owner/domain adjudication을 마친 뒤에만 gate로 승격한다.

최종 추천 판단은 A/B/C의 기존 `gold.policy.recommendNow`와 분리해 [recommendation-gold-v1.md](recommendation-gold-v1.md)에서 관리한다. 이전 `recommendNow`는 이미 pipeline에 들어간 pair의 중복 발송 억제를 포함했기 때문에 ABC01–07도 모두 false였다. 새 recommendation gold는 추천 직전 `fresh_decision` 관점에서 9건을 positive, 4건을 negative로 두며, 추천 이후 outcome은 모델 입력이 아니라 label provenance로만 사용한다.

## Production 적용 계약 (로컬 구현, 미배포)

2026-09-02 현재 production worker의 로컬 구현은 평가에서 정한 A/B/C를 두 단계에 적용한다. 이 절은 배포 완료를 뜻하지 않으며 migration이나 production DB 적용도 아직 하지 않았다.

Production 공통 A/B/C prompt는 `prompt-v2.md`의 evidence boundary, location convention, adjacent-technology 판단, 적극 구직 가정, A/B/C 분리, hold 기준과 company-bar calibration을 보존한다. 평가 당시의 “ranking·routing을 하지 않는다”는 first-pass 전용 문장만 새 runtime 계약과 충돌하므로 아래 `pass` 선택 규칙으로 교체하고, score와 2차 `recommend` 계약을 추가했다.

1. 1차는 회사별 한 LLM call에서 모든 role의 `roleFit`, `candidateFit`, `companyFit`, `score`, `pass`를 반환한다.
2. `pass=true`여도 A/B/C 중 하나가 `unfit`이면 application guard가 false로 바꾼다.
3. 회사별 `pass=true`는 최대 6개다. 모델이 6개를 초과하면 application이 정규화된 score 내림차순, 입력 순서 tie-break로 상위 6개만 남긴다.
4. 최종적으로 A/B/C가 모두 `unfit`이 아니고 effective `pass=true`인 role만 2차로 간다.
5. 2차는 A/B/C를 다시 판단하고 별도 `recommend`를 반환한다. `recommend=true`는 A=`fit`, B=`fit|middle`, C=`fit|ambiguous`일 때만 허용하며 application이 hard veto를 다시 적용한다.
6. 기존 downstream 호환을 위해 A/B/C와 `recommend`에서 기존 `label`과 score band를 projection한다. 1차에서 hard veto는 없지만 `pass=false`인 role은 2차 완료 `fit`이나 질문 가능한 `hold`로 오해되지 않도록 호환 label을 `ambiguous`로 저장한다.
7. A/B/C는 전용 컬럼에 저장하고, 1차 `pass`와 2차 `recommend`는 같은 evaluation history entry에 기록한다.
8. OpenRouter의 GLM-5.3 Flash 호출은 `provider.only=["z-ai"]`, `allow_fallbacks=false`로 고정한다. Z.AI endpoint가 실패하면 Together 등 다른 upstream으로 우회하지 않고 기존 application-level fallback 또는 호출 실패 처리로 넘어간다.

이 provider 고정은 새 실행에만 적용한다. 아래 2026-09-02 과거 실행과 저장된 raw 결과는 당시 routing 조건을 그대로 보존하며 소급해서 수정하지 않는다.

## 실행 기록

| Run | 모델 | A | B | C | Joint | Hold P/R | Critical | 결론 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| [20260902T075402Z](reports/20260902T075402.670890Z_glm-5.3-flash.md) | OpenRouter `z-ai/glm-5.3-flash`, high | 7/13 | 7/13 | 8/13 | 3/13 | 0% / 0% | 10 | first-pass gate 부적합; prompt/gold calibration 필요 |
| [20260902T084205Z v2](reports/20260902T084205.364492Z_v2_glm-5.3-flash.md) | OpenRouter `z-ai/glm-5.3-flash`, high | 8/13 | 10/13 | 9/13 | 5/13 | 33% / 100% | 8 | 전 축 개선, false hold·C calibration은 미해결 |
| [20260902T092304Z v3](reports/20260902T092304.523551Z_v3_glm-5.3-flash.md) | OpenRouter `z-ai/glm-5.3-flash`, high | 7/13 | 8/13 | 5/13 | 5/13 | 0% / 0% | 4 | company outcome-anchored 재평가; 5건 출력 실패와 ABC13 치명 오류로 배포 부적합 |
| [20260902T101319Z v3 재실행](reports/20260902T101319.048709Z_v3_glm-5.3-flash.md) | OpenRouter `z-ai/glm-5.3-flash`, high | 10/13 | 11/13 | 10/13 | 6/13 | 50% / 100% | 6 | JSON 13/13 복구; 동일 조건 출력 변동과 ABC13 false hold 반복으로 배포 부적합 |

## 최종 recommendation 실행 기록

| Run | 모델 | 1차 full coverage | Positive pass | 2차 full coverage | Recommend P/R | Soft-positive recall | 치명 오류 | 결론 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| [20260902T113156Z recommendation-v1](reports/20260902T113156.123631Z_recommendation-v1_glm-5.3-flash.md) | OpenRouter `z-ai/glm-5.3-flash`, high | 13/13 | 9/9 | 11/12 | 85.7% / 66.7% | 2/2 | ABC12 false positive, ABC13 false hold, ABC05 output failure | 현재 release gate 부적합 |
| [20260902T115603Z recommendation-v1 max](reports/20260902T115603.897679Z_recommendation-v1_glm-5.3-flash_max.md) | OpenRouter `z-ai/glm-5.3-flash`, max | 11/13 | 7/9 | 9/10 | 80.0% / 44.4% | 0/2 | ABC12 false positive, ABC13 false hold, ABC04·05 empty output, ABC10 role 누락 | high보다 느리고 비싸며 품질도 낮아 채택 부적합 |

ABC05 단독 진단 재시도에서는 1차 JSON에 모든 role의 필수 `pass`가 누락됐다. 최초 전체 run의 수치는 교체하지 않았으며, 재시도 결과는 [별도 보고서](reports/20260902T114916.699296Z_recommendation-v1_glm-5.3-flash.md)에 보존한다.

`max` 비교에서는 fixture/gold/input projection/prompt/temperature/routing/guard를 고정하고 reasoning만 바꿨다. 전체 wall time은 병렬 3 기준 high 16분 9초에서 max 3시간 45분 32초로 약 14배 늘었고, 관측 비용은 약 1.63배였다. ABC01·03은 개선됐지만 ABC04·06·09·10이 회귀했고 ABC04·05·10은 최종 결정 불가였다. 핵심 hard-negative ABC12 false positive와 ABC13 false hold도 해결되지 않았다.

ABC04·05의 max 1차 empty output과 high ABC05의 2차 empty output은 모두 OpenRouter router metadata에서 selected provider가 `Together`, `strategy=direct`, `attempt=1`이었다. provider가 HTTP response object 안에 `finishReason=error`, 빈 content와 0 usage를 반환했고 benchmark `call_once`는 exception이 아니어서 재시도하지 않았다. 이는 raw GLM provider reliability 측정에는 실패로 남기지만, 실제 production 1차는 malformed output 시 direct DeepSeek fallback을 사용하고 실제 2차는 Claude Sonnet 5이므로 production availability와 동일시하지 않는다. 정확한 upstream 내부 원인은 generation ID/error detail을 저장하지 않아 이 run만으로는 복원할 수 없다.

### ABC12 Claude Sonnet 5 2차 단독 진단

[20260902T154837Z single-case 보고서](reports/20260902T154837.562421Z_second-stage_ABC12_claude-sonnet-5.md)는 GLM max full run에 저장된 ABC12 2차 payload를 그대로 direct `claude-sonnet-5`에 보냈다. Claude도 gold `fit/fit/unfit + recommend=false` 대신 `fit/fit/ambiguous + recommend=true`를 반환했다.

회사 caliber 기준은 누락되지 않았다. 별도 structured `companyRoleCriteria`는 0개였지만 anchor의 1,302자 `companyRoleRequest`에 최상위 학교·기술 조직, 독립된 강한 신호 2개, 대체 성취 기준이 포함됐고 Claude reason도 이를 명시적으로 인식했다. 다만 request는 신호가 부족하면 `hold 또는 mismatch`라고 쓰고, 공통 C prompt는 불완전·간접 증거를 `ambiguous`로 정의한다. C에는 `hold`가 없으므로 두 모델 모두 이를 ordinary uncertainty로 완화했다. Gold를 hard negative로 유지하려면 이 경계를 일반 규칙으로 명확히 한 다음 별도 prompt version에서 재평가해야 하며, 이번 진단에서는 prompt를 수정하지 않았다.

## 축 정의

- A — role fit: 객관적 직무 수행 가능성과 JD hard requirement. 결정적이며 후보가 답할 수 있는 사실 하나가 없을 때만 `hold`, 넓게 증거가 혼재하면 `ambiguous`, 명시적 충돌이면 `unfit`이다.
- B — candidate fit: 모든 후보를 적극 구직 중으로 가정하고, 명시적 선호와 역할 scope/level, 보상·위치·근무 방식에 비춘 만족 가능성을 본다. 현재 재직, search intensity, notice period, 일시적 availability/off-market 상태는 사용하지 않는다. `fit | middle | unfit`이다.
- C — company fit: 회사별 품질·선별성·선호 기준에 비춘 인터뷰 가능성. A와 별개로 `fit | ambiguous | unfit`이다.

`hold`는 낮은 confidence의 다른 이름이 아니다. 답 하나로 A가 `fit` 또는 `unfit`으로 바뀌는 후보 측 사실이 있어야 한다. C가 `unfit`이면 A가 `hold`여도 질문하지 않는다.

Location과 언어에는 v2 convention을 적용한다. 후보가 target country/location에 기반을 두고 그곳의 학교 또는 회사에서 학업·근무한 기록도 있으면, 명시적 반대 증거가 없는 한 일반적인 현지 언어와 근무 조건을 충족한 것으로 본다. 역할이 정확한 시민권·clearance·license를 요구하면 그 특수 요건은 별도로 확인한다.

## 13개 정답

| ID | Talent | Company / Role | 현재 단일 label | A | B | C | 지금 추천 | hold 질문 | 후보에게 언급 가능 |
|---|---|---|---|---|---|---|---:|---:|---:|
| ABC01 | T-1e71e3d78eec | Config / Head of Robotics Systems | fit | fit | fit | fit | 아니오 | 아니오 | 아니오 |
| ABC02 | T-3b4f1daa9797 | Config / Robotics Systems Engineer | fit | fit | fit | fit | 아니오 | 아니오 | 아니오 |
| ABC03 | T-0eadf128ce87 | Wonderful / Field CTO - Australia | fit | fit | fit | fit | 아니오 | 아니오 | 아니오 |
| ABC04 | T-402f53ded2cd | Wonderful / Forward Deployed Engineer (FDE) | fit | fit | fit | fit | 아니오 | 아니오 | 아니오 |
| ABC05 | T-83574ee151cc | Wonderful / Forward Deployed Engineer (FDE) - Australia | fit | fit | fit | fit | 아니오 | 아니오 | 아니오 |
| ABC06 | T-a816bff17fa2 | Wonderful / Forward Deployed Engineer (FDE) - Japan | fit | fit | fit | fit | 아니오 | 아니오 | 아니오 |
| ABC07 | T-0a368c9d7182 | Wonderful / Forward Deployed Engineer (FDE) - Singapore | fit | fit | fit | fit | 아니오 | 아니오 | 아니오 |
| ABC08 | T-d6dc1ba500ae | Config / Forward-Deployed Engineer | hold | hold | fit | ambiguous | 아니오 | 필수 | 예 |
| ABC09 | T-f4702bd979f3 | Mistral AI / Applied AI Engineer, Fullstack | hold | fit | fit | ambiguous | 아니오 | 아니오 | 아니오 |
| ABC10 | T-4cc195037ed0 | Wonderful / Head of Partnerships, APAC | dissatisfied | fit | middle | ambiguous | 아니오 | 아니오 | 아니오 |
| ABC11 | T-abf6c85b43d2 | Wonderful / Forward Deployed Engineer (FDE) - Thailand | unfit | unfit | unfit | unfit | 아니오 | 아니오 | 아니오 |
| ABC12 | T-47769c67fc2b | Sierra / Software Engineer, Agent | dissatisfied | fit | fit | unfit | 아니오 | 아니오 | 아니오 |
| ABC13 | T-0f1e66f570b3 | Config / Forward-Deployed Engineer | unfit | unfit | fit | unfit | 아니오 | 아니오 | 아니오 |

`후보에게 언급 가능`은 모델의 새 출력 필드가 아니라 A/B/C와 durable delivery state에서 evaluator가 계산하는 policy assertion이다.

## 각 사례의 판정 근거와 절대 금지

### ABC01–ABC07 — 실제 company-pipeline positive control

이 7건은 reviewer가 프로필만 보고 C를 추정한 사례가 아니다. 동일 후보×동일 role에서 다음 명시적 production stage가 확인됐다.

| ID | 역할 | 관측 outcome | 핵심 profile 근거 |
| --- | --- | --- | --- |
| ABC01 | Config Head of Robotics Systems | 연결 대기 | robot delivery·autonomous driving·sensor fusion과 대규모 robotics 조직 리딩 |
| ABC02 | Config Robotics Systems Engineer | 연결 대기 | humanoid middleware·500Hz control·ROS2·VLA/teleop·AMR 300대 운영 |
| ABC03 | Wonderful Field CTO Australia | 연결 대기 | enterprise data/AI architecture·technical sales·POC·대형 deal, Sydney/호주 PR |
| ABC04 | Wonderful FDE Korea | custom company stage | embedded부터 AI/RAG/tool-calling healthcare product까지 end-to-end ownership |
| ABC05 | Wonderful FDE Australia | final offer | Google Tech Lead·Azure Container Apps·production LLM 평가, Sydney/호주 PR |
| ABC06 | Wonderful FDE Japan | custom company stage | CashApp·distributed systems·ML integration, 일본어/영어와 Tokyo/FDE 선호 |
| ABC07 | Wonderful FDE Singapore | custom company stage | enterprise platform·full-stack/cloud·RAG/agent workflow, Singapore PR/FDE 선호 |

- Gold: 모두 `A=fit, B=fit, C=fit`
- 절대 금지: C를 profile 추정만으로 낮추기, 이미 pipeline에 있는 pair를 다시 추천하거나 질문하기
- provenance invariant: C=`fit`이면 `companyFitGroundTruth.source=production_pipeline_stage`와 `strictPositive=true`가 반드시 있어야 한다.

### ABC08 — role-ready이나 한국어 한 가지가 비어 있는 hold

Google AI Foundry와 Morgan Stanley에서 production AI와 customer workflow를 직접 구축했고 FDE 선호도 명시적이다. 한국어 기술 협업 근거 한 가지만 비어 있어 A는 `hold`다. 동일 pair의 실제 company outcome은 없어 C를 hard positive로 두지 않고 `ambiguous`로 둔다.

- 필수 질문: “한국 고객이나 동료와 기술 요구사항, 설계 결정, 장애 대응을 한국어로 진행할 수 있는 업무 수준인가요?”
- 절대 금지: 이름·국적으로 한국어를 추정하거나 C를 관측 positive처럼 취급

### ABC09 — exact tool보다 transferable ownership

Python 자동화와 React·JavaScript·Node.js로 end-to-end 제품을 만들고 고객 adoption까지 책임졌다. TypeScript라는 exact 단어가 없더라도 A는 `fit`이고 후보도 FDE를 원해 B=`fit`이다. 동일 pair의 company outcome은 없어 C=`ambiguous`다.

- 절대 금지: TypeScript 사용 여부만 다시 묻는 A=`hold`, outcome 없이 C를 hard positive로 고정

### ABC10 — 현재 재직·search 상태는 B에서 제외

30년 이상 APAC enterprise sales·partner ecosystem·GTM·CEO/P&L·major deal ownership이 있어 A=`fit`이다. 모든 후보를 구직 중으로 가정하므로 일시적 off-market 상태는 제외하고, 직접 역할 선호가 약한 점만 반영해 B=`middle`이다. 동일 pair의 company outcome이 없어 C=`ambiguous`다.

- 절대 금지: 현재 재직·search intensity·availability로 B=`unfit`, outcome 없이 C=`fit`

### ABC11 — obvious function mismatch

communications/editorial 경력이고 software engineering·production AI·systems integration 근거와 Thailand FDE 전환 선호가 없다.

- Gold: `unfit / unfit / unfit`
- 절대 금지: work authorization 같은 부차적 누락을 물으며 A=`hold`

### ABC12 — A/B fit, C만 unfit

영어·한국어 professional bilingual이고 실제 FDE로 의료 고객 AI agent, Python backend와 대규모 pipeline을 운영했다. A/B는 `fit`이지만 Sierra의 별도 최상위 caliber bar는 충족하지 못해 C=`unfit`이다.

- 절대 금지: 회사 bar 문제를 A나 B로 이동, C=`fit|ambiguous`

### ABC13 — 산업 자동화 FDE와 robotics FDE의 경계

AbbVie에서 MES·SAP·Dataiku·agentic AI와 산업 자동화·IT–OT 시스템을 production에 배포했고 FDE를 원하므로 B=`fit`이다. RFID·autonomous warehouse는 인접 근거지만 robot control·ROS·sensor/calibration ownership은 확인되지 않는다. 한국어 한 가지만 확인해 해결될 문제가 아니므로 A/C=`unfit`이다.

- 절대 금지: 산업 IT–OT 경험을 없다고 표현하기, robotics core gap을 한국어 질문 하나로 바꿔 A=`hold`, C=`fit|ambiguous`

## 평가 계약

각 run에서는 다음을 별도로 본다.

1. A/B/C exact accuracy: 축별 정확도와 세 축이 동시에 맞은 pair 정확도.
2. Policy accuracy: `recommendNow`, `mustAskHoldQuestion`, `candidateMentionable` 세 boolean의 exact match.
3. Critical forbidden violations: `gold-v3.json`의 `criticalForbidden`에 들어 있는 label/action은 한 번도 나오면 안 된다.
4. Hold question quality: v3에서는 ABC08만 질문 대상이다. 문자열 exact match가 아니라 같은 결정 사실을 묻는지 평가한다.
5. C provenance: C=`fit`인 모든 case가 동일 pair의 `production_pipeline_stage` strict positive인지 캡처와 실행 시작 시 모두 검증한다.

13개뿐이므로 이 결과를 “전체 성능이 몇 % 개선됐다”는 통계로 해석하면 안 된다. 이 세트의 용도는 배포 전 치명적 회귀를 잡고 기존 방식과 새 방식의 사례별 diff를 읽는 것이다.
