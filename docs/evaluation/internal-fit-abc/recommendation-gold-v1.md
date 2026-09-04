# Internal fit 최종 추천 gold v1

기준일: 2026-09-02  
기반 데이터: `gold-v3.json`의 13개 후보자×Role  
평가 출력: 2차의 `recommend: true | false`

이 gold는 A/B/C가 정확한지를 다시 평가하는 세트가 아니라, 그 판단을 바탕으로 **Harper가 후보자에게 실제로 제안할 가치가 있는 기회를 고르는지** 평가한다. 추천은 완벽한 fit이나 회사 합격 보장이 아니다. 후보자가 진지하게 검토할 가치가 충분하면 B=`middle` 또는 C=`ambiguous`여도 추천할 수 있다.

## 중요한 입력 시점

주 평가 관점은 `fresh_decision`이다. 즉, 동일 후보×Role이 아직 추천·진행되지 않은 시점에 추천할지를 묻는다.

ABC01–07은 이후 실제로 연결 대기, custom company stage 또는 final offer까지 진행했기 때문에 강한 positive label 근거가 된다. 다만 그 미래 outcome이나 “이미 추천됨” 상태를 모델 입력에 넣으면 안 된다. 그 상태를 입력에 포함한 현재 시점 replay에서는 중복 추천을 막기 위해 `recommend=false`가 맞다.

따라서 다음 두 질문을 섞지 않는다.

| 질문 | ABC01–07 정답 |
| --- | --- |
| 처음 봤을 때 추천할 가치가 있었는가? | `true` |
| 이미 pipeline에 들어간 현재 시점에 다시 추천할 것인가? | `false` |

## 추천되어야 하는 9건

| ID | 회사 / Role | A/B/C | 추천 | 유형 | 핵심 이유 |
| --- | --- | --- | ---: | --- | --- |
| ABC01 | Config / Head of Robotics Systems | `fit/fit/fit` | 예 | 실제 outcome positive | robotics production ownership, hands-on 조직 리딩과 Physical AI 선호가 맞고 실제 연결 대기까지 진행 |
| ABC02 | Config / Robotics Systems Engineer | `fit/fit/fit` | 예 | 실제 outcome positive | humanoid middleware·실시간 제어·ROS2·teleoperation·AMR 운영이 역할 핵심과 직접 일치 |
| ABC03 | Wonderful / Field CTO - Australia | `fit/fit/fit` | 예 | 실제 outcome positive | enterprise AI architecture·technical sales·대형 deal과 호주·Site CTO 선호가 일치 |
| ABC04 | Wonderful / FDE Korea | `fit/fit/fit` | 예 | 실제 outcome positive | embedded부터 AI agent까지 end-to-end product ownership이 FDE에 적합 |
| ABC05 | Wonderful / FDE Australia | `fit/fit/fit` | 예 | 실제 outcome positive | Google·Azure production ownership, AI/LLM 경험과 Sydney·FDE 선호가 일치; final offer 도달 |
| ABC06 | Wonderful / FDE Japan | `fit/fit/fit` | 예 | 실제 outcome positive | distributed production systems·ML integration과 일본어·Tokyo FDE 선호가 일치 |
| ABC07 | Wonderful / FDE Singapore | `fit/fit/fit` | 예 | 실제 outcome positive | enterprise delivery·full-stack/cloud·GenAI workflow와 Singapore FDE 선호가 일치 |
| ABC09 | Mistral AI / Applied AI Engineer, Fullstack | `fit/fit/ambiguous` | 예 | soft positive | transferable full-stack ownership은 강하고 C 불확실성은 명시적 반대가 아닌 outcome 부재 |
| ABC10 | Wonderful / Head of Partnerships, APAC | `fit/middle/ambiguous` | 예 | soft positive | 매우 직접적인 APAC partnerships·GTM·P&L·major deal 경력이 B/C의 보통 수준 불확실성보다 큼 |

ABC09와 ABC10이 중요하다. 이 둘까지 전부 `false`라면 새 `recommend` 판단이 사실상 “A/B/C 모두 fit” 규칙과 다르지 않다. 추천을 조금 넉넉하게 하기로 한 제품 결정이 실제로 작동하는지 이 두 건으로 확인한다.

## 추천되면 안 되는 4건

| ID | 회사 / Role | A/B/C | 추천 | 비추천 유형 | 올바른 다음 처리 |
| --- | --- | --- | ---: | --- | --- |
| ABC08 | Config / Forward-Deployed Engineer | `hold/fit/ambiguous` | 아니오 | 질문 전 보류 | 한국어 기술 협업 가능 여부를 묻고 A 재평가 |
| ABC11 | Wonderful / FDE Thailand | `unfit/unfit/unfit` | 아니오 | hard veto | suppress |
| ABC12 | Sierra / Software Engineer, Agent | `fit/fit/unfit` | 아니오 | hard veto | 회사 caliber bar 미충족으로 suppress |
| ABC13 | Config / Forward-Deployed Engineer | `unfit/fit/unfit` | 아니오 | hard veto | robotics core mismatch로 suppress |

ABC08은 negative precision 사례지만 탈락 사례는 아니다. 1차에서는 `pass=true`로 2차에 들어갈 수 있고, 2차에서 `recommend=false`와 유효한 hold 질문이 함께 나와야 한다. ABC11–13은 1차에서 `pass=false`가 기대되는 hard-veto 사례다.

## 기대되는 end-to-end 결과

| 구간 | Case | 기대 결과 |
| --- | --- | --- |
| 추천 positive | ABC01–07, ABC09, ABC10 | 1차 anchor `pass=true`, 2차 `recommend=true` |
| 질문 보류 | ABC08 | 1차 `pass=true`, 2차 `recommend=false`, A=`hold`, 유효 질문 유지 |
| hard negative | ABC11–13 | 1차 `pass=false`; 2차에 들어가더라도 guard 결과 `recommend=false` |

각 case는 별개의 talent×company call에서 평가하는 anchor Role이다. 13개를 한 회사 call에 함께 넣고 6개 cap을 적용하는 데이터셋이 아니다.

## 지표와 release gate

전체 accuracy만 보면 안 되고 다음을 별도로 기록한다.

| 지표 | 정의 | 초기 gate |
| --- | --- | ---: |
| Recommend recall | positive 9건 중 `recommend=true` | 9/9 |
| Recommend precision | 모델이 추천한 case 중 gold positive | 100% |
| Hard-negative false positive | ABC11–13 중 `recommend=true` | 0건 |
| Hold false recommendation | ABC08에서 `recommend=true` | 0건 |
| Soft-positive recall | ABC09·10 중 `recommend=true` | 2/2 |
| Positive prefilter survival | positive 9건의 anchor가 `pass=true` | 9/9 |

13건뿐인 의도적 challenge set이므로 이 수치를 production 전체 추천 precision이나 recall로 일반화하지 않는다. 초기 gate는 작은 regression set에서의 치명 오류 방지를 위한 기준이다.

## 파일과 재현 제한

- 기계 판독 gold: `recommendation-gold-v1.json`
- provenance manifest: `recommendation-manifest-v1.json`
- A/B/C 원본: `gold-v3.json`
- PII 원문: gitignored `private/fixture-v3.json`

현재 `private/fixture-v3.json`은 capture 이후 lifecycle을 포함할 수 있어 ABC01–07의 fresh-decision 실행에 그대로 사용할 수 없다. 실제 2차 모델 비교를 실행하기 전에 추천 직전 snapshot을 복원하거나, reviewer가 검증한 lifecycle-neutral fixture를 별도 버전으로 만들어야 한다. 미래 outcome을 단순히 prompt로 무시하라고 지시하는 방식은 label leakage이므로 허용하지 않는다.
