# 추천 피드백 평가용 데이터 현황

조회일: 2026-10-07 KST. Production 읽기 전용 SQL로 metadata와 집계만 확인했다. 원본 사용자 대화·프로필·식별자·이메일은 이 보고서에 포함하지 않았다. 평가 모델 호출, 데이터 수정, 실제 연락은 하지 않았다.

이 보고서는 **데이터 확보 가능성과 오염 요인 점검**이다. 확정 baseline, 동결 gold, 신규 정책 성능 결과가 아니다. [평가 계획](../README.md)의 1차 입력으로 사용한다.

## 집계 범위

- 내부 역할: `company_roles.source_type='internal'`.
- 현재 `company_roles.information.testOnly=true`인 역할 제외.
- 추천 시각 `recommended_at < 2026-10-07T00:00:00Z`인 원장 행.
- 14일 경과 원장은 `recommended_at < 2026-09-23T00:00:00Z`.
- 최근 비교 모집단은 `2026-08-10T00:00:00Z <= recommended_at < 2026-09-23T00:00:00Z`.
- 날짜 범위는 UTC다. 조회일의 현재 행을 읽었으며 해당 시각으로 되돌린 DB snapshot이 아니다. `recommended_at`은 아직 검증된 실제 전달 시각이 아니다.
- 알려진 fixture 계정의 추가 제외, proxy 노출 구분, 중복 episode 합치기, 사용자/팀원/시스템 반응 구분 전이다.

## 추천 기록 규모

| 추천 월 UTC | 원장 행 | 후보자 수 | 역할 수 | 추천 후 14일 경과 행 |
| --- | ---: | ---: | ---: | ---: |
| 2026-05 | 25 | 20 | 10 | 25 |
| 2026-06 | 189 | 141 | 18 | 189 |
| 2026-07 | 642 | 616 | 25 | 642 |
| 2026-08 | 1,072 | 771 | 27 | 1,072 |
| 2026-09 | 708 | 563 | 38 | 536 |
| 2026-10 | 453 | 424 | 23 | 0 |
| 합계 | **3,089** | **고유 2,016** | **고유 55** | **2,464** |

고유 후보자·역할은 월별 합이 아니다. 같은 후보자·역할 쌍에 원장 행이 여러 개 있는 pair는 2개였다. Email/chat/follow-up의 중복 노출은 별도로 해결해야 한다.

최근 44일 비교 모집단은 1,519행, 고유 후보자 1,060명, 역할 34개, workspace 10개다. 연결된 trigger는 periodic refresh 1,148행, conversation completed 347행, immediate opportunity requested 16행, 연결되지 않은 8행이다. Trigger만으로 온보딩 첫 추천인지 확정하지 않고 첫 추천 시각·원본 run을 함께 확인한다.

## 전달과 반응 연결

| 확인 항목 | 건수 | 의미와 한계 |
| --- | ---: | --- |
| 원장에 discovery run ID 있음 | 3,065 | 실제 메시지와 연결할 출발점 |
| 같은 talent/run에 성공 email 기록 있음 | 3,064 | 역할별 최종 포함 여부는 추가 확인 필요 |
| 같은 talent/run에 성공 chat 기록 있음 | 2,853 | 단순 run join 기준 |
| 성공 chat payload recommendationIds에 ID 직접 포함 | 2,846 | 실제 추천 membership의 더 강한 근거 |
| viewed_at 있음 | 1,295 | 열람자는 부분 집합. 이들만을 분모로 사용하면 안 됨 |
| feedback은 있는데 feedback_at 없음 | 3 | horizon 판정에 다른 사건 원본 필요 |
| feedback_at이 recommended_at보다 빠름 | 0 | 이 검사만으로 timestamp 전체 정합성이 증명되지는 않음 |
| dislike이며 코드의 자동 종료 고정 사유와 일치 | 70 | 시스템이 무응답을 부정 값으로 쓰는 경로가 실제 기록에 존재 |

자동 종료 고정 사유는 `opp/new_harper_agent.py`의 `AUTO_DISLIKE_INTERNAL_FEEDBACK_REASON`과 정확히 비교했다. 사용자 자연어의 키워드를 보고 거절/무응답을 추론한 것이 아니다. 다른 버전의 자동 종료나 대리 입력까지 모두 판별한 수치는 아니다.

## 정제 전 최근 피드백 값

최근 1,519행 중 현재 feedback이 positive/like이고 feedback_at이 recommended_at 이후 14일 이내인 행은 478, negative/dislike는 138이다. 나머지는 903이다.

| 단순 원장 기준 | 건수 | 비율 |
| --- | ---: | ---: |
| 현재 긍정 값, 기록된 feedback 시각이 14일 이내 | 478 | 31.47% |
| 현재 부정 값, 기록된 feedback 시각이 14일 이내 | 138 | 9.08% |
| 위 두 조건에 해당하지 않음 | 903 | 59.45% |

**31.47 / 9.08 / 59.45를 정제된 긍정·부정·무시율로 발표하지 않는다.** 903에는 늦은 반응·데이터 누락 등이 포함될 수 있다. 현재 상태가 최초 반응을 덮어썼는지, 역할이 실제 전달됐는지, 사용자의 명시 행동인지 검증하지 않았다. 이 비율은 표본 수 계산의 대략적인 가정에만 사용한다.

같은 모집단에서 현재 positive인 행의 기록된 응답 지연은 1일 미만 311, 1–7일 125, 7–14일 42, 14–28일 32, 28일 이상 14였다. 뒤의 구간에는 아직 관찰 시간이 충분하지 않은 최근 추천이 있으므로 이 분포를 완성된 응답 시간 곡선으로 해석하지 않는다. 최종 평가는 horizon별 성숙 cohort를 다시 구성한다.

## 과거 입력 복원 가능성

- 최근 모집단에 연결된 고유 discovery run은 1,511개다.
- 1,511개 모두 `user_brief`가 NULL은 아니지만 **빈 객체 `{}`**였다.
- 1,511개 모두 `query_plan.llmRawOutputs`에 `finalDelivery` key가 있었으나, 이는 당시 입력 전체 보존의 증거가 아니다.
- 273개에 `talentContext` metadata가 있었다. 확인된 key는 fingerprint, briefChars, briefCount, status, memoryProjection, behaviorContext다. 원문 보존 여부·과거 버전 복구 가능성은 별도 확인해야 한다.
- Profile·Brief·Behavior·Role의 전체 as-of 복원 가능 건수는 아직 확정하지 않았다.

따라서 **1,519개 outcome 후보 = 1,519개 replay 가능 사례**라고 주장할 수 없다. 현재 Profile/Brief를 끌어오면 추천 후 답변이 입력에 들어갈 수 있다.

## 회사와 외부 데이터

현재 testOnly 역할을 제외한 company Intro 원장은 19행이었다. 대부분 ready이며 실제 후보자 발송 시각이 남은 행은 매우 적다. 이 원장만으로 회사 반응의 개선 효과나 Intro 후보자 반응률을 안정적으로 비교할 수 없다. 현재 원장 이전의 별도 회사 진행 이력이 모두 없다는 뜻은 아니다.

별도 전체 규모 조회에서는 external_jd 원장이 약 14.6만 행으로 내부 추천보다 훨씬 많았다. 그러나 external like와 내부 역할 수락의 의미, 유입·발송 방식이 다르므로 내부 성과 분모를 확대하는 데 섞지 않는다. 후보자의 추천 이전 접촉·반응 이력을 복원하거나 연결기 검증에 사용한다.

## 재현 정보와 코드 근거

핵심 읽기 전용 집계는 [inventory.sql](../inventory.sql)에 보관한다. 동일 SQL을 나중에 실행하면 현재 행이 바뀌므로 이 보고서의 관측값과 달라질 수 있다. Frozen 평가 원본은 별도 capture가 필요하다.

| 확인한 코드 | 근거 |
| --- | --- |
| `harper_worker/opp/new_harper_agent.py` | 세 차례 follow-up 후 2개월 이상 무응답이면 dislike와 자동 종료 사유 기록 |
| `harper_worker/opp/utils/new_delivery_transport.py` | chat payload의 recommendationIds, 성공 delivery 로그와 발송 snapshot |
| `harper_worker/opp/utils/new_delivery.py` | 최종 추천 선택과 전달 guard, 사전 생성·실제 전달 구분 필요 |
| `harper_beta/src/lib/ops/internalMatchingAnalytics.ts` | 현재 진행 단계도 accepted/rejected 계산에 사용하므로 본 평가와 의미가 다름 |
| `harper_beta/src/lib/talentOpportunity.ts` | positive/negative normalizer, 내부/외부 처리 의미, effective view 사용 |
| `harper_beta/docs/evaluation/internal-recommendation-binary/README.md` | 41쌍은 추천 적절성 challenge이며 실제 반응 gold가 아님 |

조회 당시 local HEAD는 beta `e2e14ddd0dabbadad5ef8321e8a79e714e268012`, worker `773f1e37aa355799c9d30e53d1f1ddfc8325a4b5`였다. 두 checkout에는 진행 중인 변경이 있으며, 이 SHA를 deployed revision이라고 주장하지 않는다. 정식 평가 capture/run 때 관련 dirty diff·파일 hash를 추가로 동결한다.
