# 결합 검색 순위의 실제 경로 구현과 검증

앞선 작업은 실험과 권장안이었다. 사용자 승인 후 실제 회사 단위 검색의 기본 순위를 **SQL + 길이 보정 가중 FTS + Profile 벡터의 RRF(k=60)**로 구현했다. 코드와 격리 DB 검증을 완료했으며 운영 배포·DB 변경·추천·발송은 하지 않았다. 초기 순위 품질이 모든 역할에서 개선됐다는 결론은 아니다.

## 실제 코드의 동작

1. 기존 읽기 좋은 Company/Role 문서를 한 번 준비해 planner에 준다. 한 planner 호출에서 Role별 SQL, `lexicalGroups`, `capabilityQueries`를 함께 받는다. 구조 위반 시 한 번의 기존 계약 수정은 유지한다.
2. 현재 공개/추천 권한과 회사 차단 등 hard guard, 미평가/갱신 pair 조건을 평가 예산 전에 적용한다. 새 pair 100/150/200개, 갱신 최대 50개는 별도 예산이다.
3. 역할 관련 SQL 순서의 최대 5,000명 안에서 전체 canonical Profile과 전체 active Brief의 FTS를 따로 계산한다. 외부 역할 검색과 같은 weighted `ts_rank_cd` helper를 사용하며 문서 길이 normalization은 2다. SQL pool을 정렬하는 작업이므로 permanent FTS table/GIN index를 추가하지 않았다.
4. 후보자의 이름을 익명화한 canonical Profile 첫 8,000자를 `text-embedding-3-small` 1,536차원으로 비교한다. 직접 수행·전이 가능 경험·요구 scope/result를 설명한 보통 3개 검색문의 cosine 순위를 RRF로 합친다. Profile 벡터는 모든 역할이 같은 worker-only cache를 사용하며 model/문서 content hash가 같을 때 재사용한다. Brief·Memory·Behavior는 능력 벡터에 섞지 않는다.
5. SQL 순위, FTS 순위, 합쳐진 의미 순위를 다시 동일 가중 RRF(k=60)로 합친 뒤 기존 평가 예산과 약 5% 넓은 탐색을 적용한다. FTS 0점은 그 순위에만 기여하지 않으며 후보를 탈락시키지 않는다. SQL 상위 인원의 별도 고정 몫은 없다.
6. 유효한 기존 fit 합치기, 공통 1·2차 fit, 최종 추천 판단과 전달은 유지한다. 검색 plan 전체는 원본 작성일부터 최대 7일 재사용하고 Role/Hiring Brief/회사 Behavior/model/prompt 변경은 즉시 새 plan을 만들게 한다. v14 prompt는 이전 plan과 fingerprint가 다르다.

기존 설정 key `semantic_ordering_enabled`를 유지했다. 누락 시 기본 true, 명시적 false는 SQL 순서를 유지한다. cache/provider/FTS 오류는 기존 SQL 순서로 복귀하며 run의 `orderingByRole`에 mode와 이유를 기록한다. hard guard를 완화하는 fallback은 없다.

## 확인한 결과

| 확인 | 결과 |
| --- | --- |
| 실제 PostgreSQL을 포함한 관련 검사 | 93개 통과; 마지막 Profile projection 수정 뒤 관련 16개 재확인 통과 |
| 추천한 실험 순위와 실제 코드의 일치 | frozen v3 13역할·18개 순서 모두 정확히 일치; provider 호출 없이 확인 |
| 최종 v14 planner 실제 실행 | Wonderful FDE, SBVA 투자, Sierra Agent Engineer, Gaudio 재무, NARWHAL Junior, Aeolo Co-founder 6역할 |
| 호출 구조 | 역할별 한 logical planner 호출에서 SQL/가중 개념/의미 검색문을 모두 생성 |
| v14 계약 수정 / SQL 수정 / SQL fallback | 6역할 모두 0건 |
| v14 성공 평가 원장 6회 재생 | 6역할 모두 600명 unique, repeated slot 0; 실제 fit·추천 6회가 아님 |
| 운영 데이터 변경 / 메시지 발송 / 배포 | 없음 |

완료 run: `20261008-hybrid-runtime-v14-plans-r1/r2`, `...replay-r1/r2`, `...parity-r1`, `...quality-r1`. canonical runner는 `harper_worker/llm_evals/role_scoring_list_retrieval/hybrid_runtime.py`이며 입력/gold는 바꾸지 않은 v3다. 원본·프롬프트·ID·vector·모델 판단은 ignored owner-only runs에 보관한다.

초기 v13은 13역할을 실행했지만 7건의 계약 수정, 2건의 planner SQL fallback, 1건의 실행 SQL fallback이 있었다. 특히 출력 예시가 SQL만 보여 검색 표현을 빠뜨리거나 중간 SELECT-star가 나왔다. v14는 하나의 완전한 출력 예시와 중간 SQL의 명시적 column 계약으로 수정했다. 실패한 v13은 삭제하거나 성공으로 바꾸지 않았다. 전체 13역할의 새 v14 query generation을 확인한 것은 아니며, 13역할 exact-order 검증은 이전 frozen 계획을 재사용했다.

v14 planner는 71.6~292.6초, SQL 조회는 2.3~13.4초였다. 3역할의 전체 corpus 벡터를 재사용한 결합 정렬은 6회 합계 11.3~18.8초, 회당 평균 약 1.9~3.1초였다. query embedding 호출은 약 0.2~2.2초였다. cold Profile cache 구축 시간은 이 재생에서 측정하지 않았다. planner가 여전히 큰 시간 항목이며 plan/벡터의 재사용이 필요하다.

## 새 계획의 품질은 혼재함

새 v14 계획으로도 SQL과 결합 순위를 비교했다. 각 첫 100명 중 방식과 순위를 숨긴 hash 표본 20명을 기존 GPT-6 Luna high/0.1 rubric으로 판단했다. 전체 Profile/Brief를 주고 Behavior는 제외했으며 동일 frozen 입력의 기존 판단은 재사용했다. 새 판단 33쌍, 표본 membership 120건에 missing/error는 0이다. 아래는 모델이 **공통 fit 평가 비용을 써볼 가치가 있다**고 본 수이며, 실제 fit/회사 긍정/추천 수락률이 아니다.

| 역할 | 같은 새 SQL 순서 | 결합 순서 |
| --- | ---: | ---: |
| Wonderful FDE | 11/20 | 10/20 |
| SBVA 투자 | 6/20 | 13/20 |
| Sierra Agent Engineer | 8/20 | 4/20 |
| 동일 가중 3역할 평균 | 41.7% | 45.0% |

새 query generation에 따라 순위 품질이 달라진다. 이번 표본은 작고 independent human gold가 없으므로 전체 13역할의 이전 22.9%→38.1% 결과를 이 새 계획의 결과로 옮겨 적지 않는다. SBVA 개선과 Sierra 악화가 함께 관찰됐고, Wonderful의 알려진 긍정 사례 누적 발견도 SQL 4명 대 결합 1명(600슬롯)으로 낮아졌다. SBVA는 600슬롯에서 양쪽 모두 알려진 4명을 찾았고 첫 100명은 SQL 1명 대 결합 2명이었다. Sierra 및 추가 세 역할에는 이런 긍정 gold가 없어 0명을 정확도 0%로 해석하지 않는다.

이전에 선언한 첫 발견/누적 recall gate는 **미통과 상태**다. 사용자 승인에 따른 구조 구현과 평가 실행을 완료했지만 모든 역할의 성능 개선, 독립 품질 검증 또는 실제 추천 대비 피드백 개선을 주장하지 않는다. 회사별 예외 branch나 gold 인물·직함 목록으로 런타임을 튜닝하지 않았다.

## 운영 적용 전 상태

Profile cache migration `20261008062900_talent_profile_search_embeddings.sql`은 source와 disposable PostgreSQL 검증만 완료했으며 운영 DB에는 적용하지 않았다. 이 cache가 준비되지 않은 환경은 SQL 순서로 복귀한다. Worker도 미배포다. 실제 운영 변경은 별도의 명시적 배포/DB 적용 요청이 필요하며, 추천·메일·Slack·criteria·온보딩 전달 계약은 이번 변경의 대상이 아니다.
