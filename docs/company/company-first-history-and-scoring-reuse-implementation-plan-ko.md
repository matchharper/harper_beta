# Company-first 재검토 정책과 기존 추천 이력 통합 구현 계획

- 작성일: 2026-09-28
- 상태: **로컬 구현·검증 및 운영 DB migration 적용 완료. 앱·Worker 배포는 미실행.**
- 범위: `harper_beta`의 DB·Career·회사 화면·회사 agent, `harper_worker`의 company-first search·추천 delivery·이메일 응답.
- 구현 기준: 이 요청에서 확정한 제품 동작을 우선하고, 같은 기능이면 기존 상태·도구·저장소를 재사용한다.
- 최초 계획 이후 사용자의 구현 요청에 따라 두 저장소의 코드·migration 파일·테스트를 구현했다. 구현 단계에서는 운영 DB와 서비스를 변경하지 않았으며, 후속 운영 DB 적용은 17절에 기록한다.

## 1. 결정 요약

검색 방식은 유지한다. LLM이 작성한 SQL에 잡힌 후보자만 검토하고, **같은 후보자–역할의 마지막 company-first scoring 결과**로 재평가 여부를 정한다.

| 마지막 scoring | 이번 SQL에 잡혔을 때 |
| --- | --- |
| 없음 | scoring 실행 → fit이면 reranking 후보 |
| fit | scoring 재실행 없이 기존 평가와 최신 context로 reranking 후보 |
| non-fit, 평가 후 30일 미만 | 이번 scoring·reranking에서 제외 |
| non-fit, 평가 후 30일 이상 | scoring 재실행 → fit이면 reranking 후보 |

과거에 후보자에게 이 역할을 추천했거나 후보자가 거절했다는 이유만으로 company-first 검토를 막지 않는다. 그 사실과 이유를 scorer와 reranker에게 알려주고, 회사에 다시 제안할 가치는 LLM이 판단한다.

이미 같은 역할로 회사에 제안한 후보자와, 해당 역할을 이미 수락한 후보자는 새 company-first 제안 대상에서 제외한다. 회사의 Intro 요청은 기존 Harper 추천보다 우선한다. 회사에 제안된 뒤 후보자가 기존 Harper 추천을 수락하면 해당 후보를 `먼저 제안 가능한 후보`에서 `연결 대기`로 옮긴다.

이 기능을 위해 별도 관계 판단 agent, intent classifier, 추천 경로 상태 머신, 거절 사유별 규칙, 신규 후보 할당 비율을 만들지 않는다.

## 2. 범위와 기존 문서와의 관계

### 2.1 이번 요청에서 바꾸는 것

1. 과거 company-first scoring의 재사용과 non-fit 30일 재검토 자격.
2. Harper가 먼저 추천한 후보자와 거절한 후보자의 company-first 검토 허용.
3. scoring·reranking·회사 설명·후보자 final delivery에서 필요한 추천 이력 인지.
4. 같은 역할의 Intro 요청이 기존 추천을 대체하는 Career history·행동 처리.
5. 회사 ready 후보의 기존 추천 수락 시 원자적인 `연결 대기` 전환.
6. 오래된 회사 카드·Slack 메시지·후보자 이메일에서 행동해도 현재 사실에 맞게 처리하는 것.

### 2.2 유지하는 것

- LLM SQL의 검색 조건과 관련도 순서.
- 회사 단위 unique Talent retrieval budget 100/150/200명, 기존 역할별 merge 방식, rerank 상한(역할당 12명·회사 run 전체 50명/72 pair).
- 현재 정기 run의 `candidate_first | company_first | no_action`, 명시적 회사 검색의 `company_first | no_action` 계약.
- 같은 run에서 동일 후보자를 회사에 중복 선정하지 않는 계약.
- 프로필 공유 설정, internal opt-out, blocked company, 기존 reply LOW 제외, 역할 가용성, test-only 격리, 명시적 동의와 권한 검사.
- 일반적인 후보자 수락 후 Harper의 최종 확인 절차. 아래 2.3의 좁은 예외만 추가한다.
- 다른 역할의 Intro와 진행 상태. 같은 회사의 다른 역할까지 일괄 취소하거나 차단하지 않는다.
- 주기적 company-first 검색 설정이 기존 제안·연결에 영향을 주지 않는 현재 작업 내용.
- Profile + Search Brief + Behavior Context의 기존 데이터 소유권. 추천 이력 의미를 Memory 사실로 다시 저장하지 않는다.

### 2.3 명시적으로 바뀌는 기존 불변 조건

기존 문서의 “후보자 수락만으로 회사에 공유되지 않고 Harper가 최종 확인한다”에는 이번 요청으로 다음 예외가 생긴다.

> 동일 후보자–역할이 이미 회사의 `먼저 제안 가능한 후보`에 있고, 후보자가 유효한 기존 Harper 추천을 수락했다면, 기존 회사 제안과 후보자 동의가 모두 있으므로 바로 `연결 대기`로 전환한다.

회사 ready 카드가 없는 일반 수락에는 이 예외를 적용하지 않는다. 이 전환은 회사의 수락, 인터뷰 확정, 연결 완료를 뜻하지 않는다. 회사가 다음 행동을 결정하는 기존 연결 대기 흐름으로 들어간다.

Intro 요청 자체를 후보자가 수락한 경우에는 회사가 이미 정해 둔 다음 단계와 수신자를 사용하는 기존 Intro 수락 흐름을 유지한다. 두 수락의 후속 효과를 섞지 않는다.

### 2.4 관련 문서

- [Company-first 제품 계획](company-first-talent-recommendation-product-plan-ko.md)
- [Company-first Worker 구현 계획](company-first-talent-search-worker-implementation-plan-ko.md)
- [Career Memory / Search Brief 목표 설계](../talent-unified-memory-implementation-plan-ko.md)
- [회사 agent engineering contract](../company-side-agent-engineering-contract-ko.md)
- [회사 UX writing guide](../company-side-ux-writing-guide-ko.md)
- [평가 registry](../evaluation/README.md)

이 문서는 위 문서 전체를 대체하지 않는다. 이전의 “기존 추천 pair 제외”, scoring 재사용, 두 경로의 중복 처리, 일반 수락의 회사 ready 예외에 관한 부분만 변경한다. 구현 완료 시 해당 운영 계약도 실제 변경 내용에 맞춰 함께 수정한다.

## 3. 구현 전 기준점과 변경 이유

다음 표는 계획 작성 당시 **로컬 작업 트리**를 읽고 확인한 기준점이다. 완료 상태는 16절에 기록한다.

| 영역 | 현재 구현 | 필요한 변경 |
| --- | --- | --- |
| SQL retrieval | `sql_safety.py`가 SQL을 검증하고 실행 wrapper에서 LIMIT 적용 | 재검토 불가 pair를 LIMIT 이전에 제외 |
| 기존 추천 제외 | `runner.py`·`repository.py`가 기존 recommendation pair를 제거 | 기존 추천 유무와 company-first 가능 여부를 분리 |
| rerank pool | `reranker.py`가 기존 추천 pair를 다시 제거 | 허용한 기존 추천 pair를 유지하고 이력 제공 |
| commit | 최종 transaction에서 같은 역할의 recommendation 존재를 다시 거절 | 수락·회사 제안 여부와 route별 중복만 검사 |
| 평가 저장 | `talent_opportunity_matching_review`는 최종 rerank review를 저장 | scorer에서 끝난 non-fit·pool 탈락 pair의 결과와 시각 저장 필요 |
| scorer | 한 후보자를 회사의 여러 역할과 비교 | 재평가가 필요한 역할만 새 결과 생성, 기존 fit 결과 병합 |
| reranker context | 기존 recommendation이 없다는 고정 설명 | 실제 추천·거절·수락·회사 제안 이력과 허용 경로 |
| 회사 설명 | 먼저 후보자를 제안하는 기존 전제 | 후보자가 이미 역할을 봤을 가능성과 회사에 필요한 설명 반영 |
| Career history | recommendation을 읽고 feedback·progress 등을 붙임 | Intro로 대체된 이전 추천을 count·pagination부터 제외 |
| Intro 요청 | RPC가 Intro delivery run을 만들고 Worker가 recommendation 생성 | 요청 transaction에서 Intro recommendation을 확보하고 Worker가 내용 완성 |
| 일반 수락 | `accept_talent_internal_role_recommendation_v1`가 수락 저장 | 같은 pair의 ready가 있을 때 연결 대기 전환까지 함께 수행 |
| 회사 Intro tool | ready/awaiting 등 Intro 중심의 결과 처리 | ready가 이미 일반 연결 대기로 전환된 사실도 반환 |
| delivery | `preFinalDelivery` recommendation 생성·finalize·재시도 지원 | 요청 시 만든 같은 recommendation을 재사용 |

### 3.1 작업 기준점

| 저장소 | 현재 branch | 확인 당시 HEAD |
| --- | --- | --- |
| `harper_beta` | `codex/company-agent-capabilities` | `bd5c847a25e836c49d9f7ca7bfee4c977e4ad4e6` |
| `harper_worker` | `main` | `bd98dd4ff6e16a66655f9a99e409d5d24b3907e5` |

두 저장소 모두 기존 미커밋 변경이 많다. 구현은 현재 작업을 보존하며 진행하고, 위 HEAD만을 구현 기준 전체로 간주하지 않는다.

특히 로컬의 `20260928013822_allow_company_intro_across_roles.sql`과 `20260928024416_company_first_search_setting_without_intro_side_effects.sql`을 고려한다. 앞선 migration의 회사 전체 배타 조건이나 검색 설정 변경 시 Intro 종료 조건을 복사하여 되살리지 않는다. 이 파일들의 존재만으로 운영 적용 여부를 단정하거나 DB에 다시 적용하지 않는다.

## 4. 후보자–역할 단위의 검토 계약

### 4.1 단위와 용어

- 판단 단위: `(talent_id, role_id)`.
- `이미 회사에 제안`: 해당 pair의 company-first 후보가 commit되어 회사에서 볼 수 있게 된 사실. Slack 전송 완료 여부와 구분한다.
- `이미 수락`: 해당 역할에 대한 현재 유효한 후보자 수락 또는 그 이후의 진행 상태. raw `feedback='like'` 하나만 보고 현재 상태를 오판하지 않는다.
- `fit`: 현재 `passes_structural_floor`를 통과한 scoring 결과.
- `non-fit`: 정상적으로 완료된 scoring 결과 중 위 하한을 통과하지 못한 결과. 모델 오류·timeout·미평가는 non-fit이 아니다.
- `reranking 후보`: 기존 pool 상한·정렬의 입력이 된다는 뜻이다. fit인 모든 pair를 무제한으로 LLM에 넣는다는 뜻은 아니다.

현재 fit 하한은 그대로 사용한다.

```text
role_fit == fit
AND candidate_fit IN (fit, middle)
AND company_fit IN (fit, ambiguous)
```

새 숫자 cutoff나 거절 사유별 fitness 보정을 추가하지 않는다. 숫자 score는 기존과 같이 pool 정렬에 사용한다.

### 4.2 추천 상태에 따른 자격

| 같은 역할의 현재 사실 | 새 company-first 검토 | 의미 |
| --- | --- | --- |
| 후보자에게 추천한 적 없음 | 가능 | 기존 검색·평가 계약 적용 |
| Harper 추천 후 무응답 | 가능 | 추천 날짜·무응답 사실을 context에 포함 |
| Harper 추천 후 거절 | 가능 | 거절 시점과 사유를 context에 포함, 의미는 LLM 판단 |
| 후보자가 이미 수락 | 제외 | 새 company-first 제안 대신 기존 수락 흐름 |
| 회사에 ready로 이미 제안 | 제외 | 기존 카드 사용 |
| Intro 요청·연결·회사 pass·종료 등 기존 company-first 제안 이력 | 제외 | 검색 run으로 같은 제안을 반복하지 않음 |
| 공유 금지·차단 회사·가용하지 않은 역할·허용되지 않은 test-only | 제외 | 기존 권한·안전 경계 |

`Harper 추천 거절`과 `회사의 Intro 요청 거절`은 구분한다. 후자는 이미 회사가 제안받아 요청까지 한 pair이므로 이번 “기존 Harper 추천 거절도 검토” 범위에 들어가지 않는다.

다른 역할의 이력은 같은 역할의 수락·제안 사실으로 바꾸어 해석하지 않는다. 기존 공유·연결 경계가 필요한 경우는 유지하되, 회사 전체 일괄 제외를 같은 pair의 이력 검사로 잘못 남겨 두지 않는다.

### 4.3 scoring 이력에 따른 처리

1. 이번 run의 실제 검토 기준 시각 `as_of`를 고정한다. 예약 슬롯 시각을 30일 계산의 대체값으로 쓰지 않는다.
2. 마지막 성공한 scoring이 없으면 새로 평가한다.
3. 마지막 성공한 scoring이 fit이면 결과를 재사용한다. 재사용 자체로 평가 시각을 갱신하지 않는다.
4. 마지막 성공한 scoring이 non-fit이고 `scored_at + 30 days > as_of`이면 건너뛴다.
5. `scored_at + 30 days <= as_of`이면 재평가할 자격이 있다. SQL에 잡히지 않으면 아무 작업도 하지 않는다.
6. 새 평가가 non-fit이면 새 성공 시각부터 다시 30일을 센다.

reranker가 `no_action`을 반환한 것은 scorer의 non-fit과 다르다. `no_action`, pool 상한으로 인한 탈락, 회사 선정 인원 부족, delivery 실패로 scoring 결과나 30일 기준을 덮어쓰지 않는다.

역할·프로필·prompt fingerprint가 달라졌다는 이유로 자동 재평가하지 않는다. 기존 run 재시도·commit의 입력 일관성 검증과 provenance 기록은 별개이며, 그 안전장치를 “fingerprint를 쓰지 않는다”는 이유로 제거하지 않는다.

## 5. 검색·scoring·reranking 구현

### 5.1 eligibility는 retrieval LIMIT보다 먼저 적용한다

다음 순서를 보장한다.

```text
LLM이 정한 검색 조건
→ 같은 pair의 검토 자격 필터
→ LLM이 정한 순서와 기존 retrieval budget
→ 새 scoring이 필요한 pair만 평가
→ 새 fit + 재사용한 fit
→ 기존 pool trim
→ 최신 context를 가진 reranking
```

먼저 150명을 잘라 놓고 최근 non-fit 150명을 버리는 구현은 하지 않는다. SQL 조건에 맞는 다음 후보자가 있다면 그 후보자가 budget에 들어올 수 있어야 한다.

구현 위치는 `sql_safety.validate_retrieval_sql` / `execute_validated_sql`이다.

- 기존 SQL AST 검증을 통과한 후 runtime이 소유한 eligibility 조건을 최종 SELECT에 결합한다.
- 최소 조건은 `최근 30일 non-fit 아님`, `같은 pair의 company-first 제안 이력 없음`, `같은 pair의 현재 수락·진행 없음`이다. 기존 hard guard는 후속 단계에서도 재확인한다.
- LLM에게 “이 조건을 SQL에 꼭 써 달라”고만 맡기지 않는다. repair SQL과 fallback SQL에도 같은 runtime 필터가 적용된다.
- 최종 `talent_id` projection은 검증 가능한 qualified ID column을 가리키게 한다. CTE·derived table 사용은 유지한다. 지원할 수 없는 projection 형태는 기존 repair 경로로 돌린다.
- AST에서 해당 ID expression을 사용해 조건을 추가하고 root의 ORDER BY를 보존한다. 문자열 치환으로 임의 SQL을 조립하지 않는다.
- runtime이 검증된 SQL의 순서대로 server cursor를 읽어 unique Talent budget에 도달하면 멈춘다. 중복 join 행은 budget을 쓰지 않는다. 모델 root LIMIT은 제거하고, 후보 집합을 먼저 잘라 eligibility를 무력화하는 하위 LIMIT/FETCH와 모든 OFFSET은 허용하지 않는다.
- unique Talent 계약과 기존 역할 간 round-robin merge를 유지한다. join 중복이 budget을 소진하지 않는지 검증한다.
- EXPLAIN 비용 검사·read-only 연결·statement timeout은 실제 eligibility가 추가된 실행 SQL에 적용한다.
- cache table 접근은 engine이 추가하는 SQL에 한정한다. 모델의 임의 테이블 접근 allowlist를 넓힐 필요가 없다.

이 필터는 재평가 자격을 집행할 뿐, 거절 사유를 해석하거나 새로운 관련도 점수를 계산하지 않는다.

### 5.2 여러 역할이 있는 회사

현재 구조처럼 후보자를 회사의 여러 역할과 비교할 수 있게 유지한다. 한 역할의 SQL에 잡힌 후보자가 다른 역할에도 더 적합할 수 있다.

- 회사 전체 retrieval 결과에 없는 후보자를 과거 fit cache에서 별도로 가져오지 않는다.
- retrieval에 들어온 후보자의 각 역할 pair를 `새 평가 필요 / fit 재사용 / 이번에는 제외`로 나눈다.
- 후보자가 역할 B로 검색되었더라도 역할 A의 최근 non-fit을 우회하여 A를 다시 score하지 않는다.
- 같은 후보자의 fit 재사용 역할과 신규 평가 역할을 하나의 rerank 입력으로 합친다.
- scorer는 회사의 전체 역할 context를 읽되, 결과로 반환해야 하는 role ID는 이번에 평가할 pair로 제한한다.
- 평가할 pair가 하나도 없고 재사용 가능한 fit만 있으면 scoring LLM 호출을 생략한다.

새로운 할당 비율, 신규 가입자 가산점, 별도 탐색 queue는 추가하지 않는다.

### 5.3 저장은 scorer 성공 직후 한다

유효한 scorer 결과는 rerank pool trim 전에 저장한다. 그래야 낮은 fit, 상한 때문에 빠진 fit, 최종 제안되지 않은 pair도 다음 run에서 정확하게 처리할 수 있다.

- 모델의 식별자·필수 필드·기존 scoring schema 검증을 통과한 결과만 저장한다.
- 현재 scorer call의 필수 role 결과가 누락되거나 잘못되면 정상 평가로 간주하지 않는다.
- timeout·모델 오류는 cache를 만들거나 기존 cache를 갱신하지 않는다.
- 재사용 fit은 쓰지 않는다. `scored_at`은 마지막 실제 scoring 성공 시각이다.
- 뒤의 reranking·전송 실패가 앞에서 성공한 scoring을 없애지는 않는다.
- 동시 run의 늦게 도착한 옛 결과가 더 최신 평가를 덮어쓰지 않도록 평가 기준 시각과 source run을 비교한다.
- read-only shadow는 cache를 읽어 같은 분기를 계산하되 운영 cache를 쓰지 않는다.

### 5.4 기존 fit을 재사용해도 최종 판단은 최신 context로 한다

재사용한 fit은 “과거 평가에서 fit이었다”는 뜻이다. 이번에도 회사에 제안해야 한다는 명령이 아니다.

reranker에는 평가 시각, 과거 평가와 이유, 현재 역할·회사 기준, 최신 후보자 context, 최신 추천·거절 이력을 함께 제공한다. 지금 거절이 확고하거나 회사가 제공할 수 있는 조건과 맞지 않으면 `no_action`을 선택할 수 있다.

fit cache hit이어도 `load_talent_packets`의 현재 Profile·Search Brief·Behavior Context 읽기를 생략하지 않는다. reranker 입력 builder에서 현재 후보자 조건을 실제로 전달하고, scorer의 과거 reason만으로 현재 선호를 대신하지 않는다. 기본 후보자 context의 version 계약은 그대로 유지한다.

과거 `criteria_evaluations`를 변경된 현재 회사 기준의 평가인 것처럼 재라벨링하지 않는다. 과거 평가에는 당시 기준이라는 점을 붙이고, 현재 criteria와 식별·이름 계약이 맞지 않는 평가 항목은 현재 회사 카드의 criteria 결과로 복사하지 않는다. 이번 회사 설명은 reranker의 현재 판단을 사용한다. 이 구조적 호환 처리는 fit 재평가 trigger가 아니다.

### 5.5 route 제한은 pair별로 한다

- 기존 Harper 추천이 있는 pair: `company_first | no_action`만 가능하다. 이번 기능이 후보자에게 동일 추천을 다시 발송하는 통로가 되어서는 안 된다.
- 기존 추천이 없는 pair: 정기 run의 기존 route 계약 유지.
- 회사가 명시적으로 요청한 검색: 기존처럼 모든 pair가 `company_first | no_action`.
- 모델 입력에 허용 route를 알리고, output validator와 commit에서 같은 식별자·중복 계약을 검증한다.

현재 queued/running candidate-first 작업 자체를 회사 전체의 영구 제외 이유로 사용하지 않는다. 아직 후보자 추천이 확정되지 않은 동시 작업은 기존 route lock과 마지막 저장 시점의 검증으로 충돌을 해결한다. 새 ready가 먼저 확정되면 아직 저장되지 않은 중복 candidate-first 발송을 막고, 기존 Harper 추천이 먼저 확정되면 그 사실을 읽어 company-first 가능성을 판단한다.

### 5.6 reranking 입력 상한: 재사용 fit과 신규 fit의 합계에 적용

현재 `opp/company_first_search/constants.py`와 `reranker.build_rerank_pool`의 상한을 유지한다.

| 제한 | 기존 값 | 적용 단위 |
| --- | --- | --- |
| `MAX_RERANK_PAIRS_PER_ROLE` | 12 | 역할별 score 상위 후보자–역할 pair |
| `MAX_RERANK_TALENTS` | 50 | 회사 run 전체의 서로 다른 후보자 수 |
| `MAX_RERANK_PAIRS` | 72 | 회사 run 전체의 후보자–역할 pair 수 |

같은 후보자가 두 역할에 들어가면 후보자 수는 1명, pair 수는 2개다. 위 상한은 정기 run과 회사의 명시적 검색 모두에 적용하며, 최종 선정 인원 제한과는 별개다.

**재사용 fit과 이번에 새로 평가한 fit을 먼저 합친 뒤, 같은 `build_rerank_pool`을 한 번 통과시킨다.** 역할별로 score 내림차순·talent ID 동률 순서로 상위 12개를 남기고, 기존 역할 간 round-robin으로 합치면서 전체 50명과 72 pair를 넘지 않게 한다.

따라서 역할 하나에 재사용 fit이 200명 있어도 reranking LLM에 들어가는 것은 최대 12명이다. 여러 역할을 합쳐도 최대 50명·72 pair다. 재사용 fit 전용 추가 입력이나 별도 상한을 두고 최종 입력 뒤에 덧붙이지 않는다.

pool에서 빠진 fit은 non-fit으로 바꾸거나 cache에서 삭제하지 않는다. 다음 run의 SQL에도 잡히면 동일한 상한 안에서 다시 경쟁할 수 있다.

## 6. 최소 저장 구조

### 6.1 추가할 durable fact

새로 필요한 사실은 **모든 평가된 후보자–역할의 마지막 성공 scoring 결과와 평가 시각**이다.

현재 `talent_opportunity_matching_review`에는 최종 reranker가 읽은 후보자의 대표 역할 review가 남는다. scorer에서 non-fit이 된 pair나 pool에서 빠진 pair를 모두 복원할 수 없다. `talent_opportunity_fit`은 다른 Worker의 canonical fit 소유권을 갖고 있으며 company-first scoring 이력과 같지 않다.

따라서 `company_first_talent_scores` 하나를 추가한다. 이는 대화 계획이나 중간 관계 판단을 저장하는 표가 아니라, 다음 검색에서 실제 재평가 여부를 결정하는 운영 cache다. 소비자는 retrieval eligibility, scorer 재사용, rerank 입력 builder 세 곳이다.

### 6.2 table 계약

| 필드 | 목적 |
| --- | --- |
| `talent_id`, `role_id` | composite primary key, 기존 대상 FK |
| `score` | 기존 0–100 score |
| `role_fit`, `candidate_fit`, `company_fit` | 기존 scorer의 A/B/C 판정 |
| `reason` | 기존 scorer의 짧은 판단 근거 |
| `criteria_evaluations` | 기존 기준별 결과, 당시 평가로 취급 |
| `scored_at` | 마지막 실제 scoring 성공 시각, 30일 계산 |
| `source_run_id` | 원본 company-first run과 trace 연결 |
| `evaluation_as_of` | scoring이 읽은 기준 시각, 동시 쓰기에서 오래된 결과 방지 |

기존 `RoleScore`와 같은 구조를 사용한다. 별도 `review_state`, `confidence`, `next_review_at`, `rejection_category`, `route_plan`, `fingerprint`는 추가하지 않는다. `next_review_at`은 `scored_at + 30 days`로 계산할 수 있다.

RLS·grant는 service-only로 한다. 브라우저와 회사 계정에 score 이유나 후보자의 비공개 선호를 직접 노출하지 않는다. FK·constraint·index는 실제 조회 계획에 맞춰 작성하고, migration 파일은 저장소의 Supabase CLI 방식으로 생성한다. 참고: [Supabase RLS와 권한 문서](https://supabase.com/docs/guides/database/postgres/row-level-security).

### 6.3 기존 데이터의 시작점

- 완전한 company-first scoring 결과가 없는 과거 review를 억지로 backfill하지 않는다.
- 특히 과거 rerank `no_action`을 non-fit으로 이관하지 않는다.
- cache가 없는 pair는 최초 한 번 scoring 대상이 될 수 있다.
- 실제로 회사를 통해 제안받았거나 이미 수락한 후보자의 제외는 기존 durable fact로 즉시 적용한다.
- 기존 cache 형식이 구조적으로 읽을 수 없는 경우에는 미평가로 취급하고 trace에 원인을 남긴다. 오류를 non-fit으로 저장하지 않는다.

### 6.4 추가하지 않는 저장 구조

추천·거절·Intro·수락·회사 단계의 원본은 기존 recommendation, feedback, company intro ledger, stage tag, progress를 사용한다. 이를 복제한 “관계 상태” table이나 추천 이력 요약 table을 만들지 않는다.

현재 사용자에게 보여야 하는 추천만 선택하는 DB read projection은 추가할 수 있다. 아래 8장의 view는 원본 상태를 복제하지 않고 매번 기존 사실에서 계산한다.

## 7. LLM에게 주는 추천 이력과 회사 설명

### 7.1 모델 판단을 위한 입력

동일 후보자와 이번에 비교하는 역할에 한정해 짧은 사실 text를 만든다.

```text
Role: <role_id>
Harper가 먼저 추천: 2026-09-02
후보자 응답: 2026-09-04 거절
후보자가 남긴 이유: “주 5일 출근은 어려워요.”
이후 이 역할 수락: 없음
현재 이 역할에 대한 회사 Intro 요청: 없음
```

무응답이면 무응답이라고 쓰고, 거절 사유가 없으면 없다고 쓴다. 무응답을 관심 없음으로, 일정 시간이 지났다는 것을 마음이 바뀌었다는 사실로 바꾸지 않는다.

이 text는 별도 LLM 요약 호출 없이 기존 사실을 compact하게 serialize한다. 날짜·상태·사유 원문은 데이터이고, “다시 제안할 만하다”는 해석은 scorer/reranker가 한다. 지나치게 긴 사유는 길이 제한을 두되 잘린 사실을 알리고, 키워드로 의미를 분류하지 않는다.

### 7.2 어느 단계에 전달할 것인가

| 소비자 | 제공할 내용 | 용도 |
| --- | --- | --- |
| scorer | 해당 pair의 기존 추천·응답·거절 사유, 기존 Profile·Brief·Behavior Context | 지금의 fit과 제안 가능성 판단 |
| reranker | 같은 이력의 최신값, score 시각, 현재 역할 조건과 후보자 context | 후보자 간 비교, company-first 여부, 회사에 필요한 설명 |
| 회사 카드·Slack 작성 LLM | 이번 선정의 회사 공개용 reason, 공유 가능한 프로필, 관련 제안 사실 | 회사가 다음 행동을 결정할 수 있는 설명 |
| 후보자 final delivery | 본인의 과거 추천·응답, 이번 회사 Intro 요청·appeal·현재 역할 정보 | 이전 대화와 이어지는 자연스러운 전달 |
| 회사 agent의 일반 read/tool 결과 | 현재 단계, 후보자 수락 사실·시각, 기존 Harper 추천 경로, 기존 회사 제안/요청 여부 | 오래된 요청에도 현재 상태 설명 |

최신 history를 scorer 입력에만 넣고 reranker·delivery에서 잃어버리지 않는다. 특히 fit cache를 재사용하는 run은 scoring 호출이 없으므로 reranker가 직접 최신 이력을 받아야 한다.

### 7.3 판단 지침

prompt는 다음 의미를 짧게 설명한다.

- 과거 Harper 추천이나 거절 자체는 company-first 금지가 아니다.
- 거절의 이유와 현재 역할·회사 제안이 어떻게 맞물리는지 판단한다.
- 후보자의 현재 의사를 사실보다 강하게 주장하지 않는다.
- 회사가 이 후보자를 검토할 때 필요한 설명은 기존 `reason`에 포함할 수 있다.
- 근거가 약하면 제안하지 않을 수 있다. 새로운 조건이 실제로 제시되지 않았다면 조건이 바뀌었다고 말하지 않는다.

“거절 사유가 연봉이면 허용, 출근이면 금지” 같은 분기를 만들지 않는다. 별도의 `rejection_recoverable`, `must_mention_history`, `suggest_counteroffer` 필드를 만들지 않는다.

### 7.4 회사 공개 범위

회사에 전달될 수 있어야 한다는 요구는 비공개 후보자 정보를 무제한 전달한다는 뜻이 아니다.

- 내부 scorer/reranker는 허용된 후보자 context를 읽을 수 있다.
- 회사에 저장하는 기존 `selection_reason`·`presentation`에는 공개 가능한 판단만 담는다.
- 예를 들어 출근 조건에 대한 우려가 현재 제안 검토에 중요하면, 공유 범위 안에서 회사가 조건을 확인할 필요가 있다는 설명을 할 수 있다.
- 비공개 메모, 민감한 개인 사정, 공개되지 않은 다른 회사 진행 상황, 원문을 공개할 근거가 없는 보상 정보는 회사 writer에 그대로 넘기지 않는다.
- 후보자의 직접적인 회사 차단·공유 금지는 LLM이 거절 맥락으로 완화할 수 없다.

기존 prompt의 “추천/거절 이력을 회사에 절대 언급하지 말 것”과 같은 포괄 금지가 있다면 이 계약으로 바꾼다. 반대로 “이력을 반드시 언급”하라는 문구도 추가하지 않는다. 출력 문장을 정규식이나 정해진 문구로 후처리하지 않는다.

### 7.5 입력 크기와 사실의 최신성

- 이번 후보자·역할의 관련 사실만 일괄 조회한다. 전체 추천 기록·대화 원문·Memory를 매번 주입하지 않는다.
- Worker에서 후보자 정보의 기존 version 계약을 유지한다. Behavior Context에 별도의 추론 결과를 되쓰지 않는다.
- 캐시된 score의 이유와 최신 추천 이력을 구분하여 표시한다.
- history가 모델 판단 후 바뀌었으면 commit 전에 최신 사실을 재확인한다. 수락·공유 철회 등은 즉시 제외한다.
- 새로운 거절이나 이유 변경으로 회사 설명의 사실관계가 낡았다면 기존 run의 stale-input 처리·bounded retry를 사용한다. 낡은 설명을 자동 수정하여 발송하지 않는다.
- 회사 일반 agent는 현재 관련 후보자의 짧은 상태를 기본 context로 받고, 기존 read 도구로 필요한 상세 정보를 읽는다. 상황 전용 판단 도구를 만들지 않는다.

## 8. Intro가 기존 Harper 추천을 대체하는 방식

### 8.1 원본은 보존하고 현재 행동 대상만 바꾼다

기존 Harper recommendation을 삭제하거나 `intro_request`로 덮어쓰지 않는다. 원래 추천 시점·거절·사유가 사라지면 이번 기능의 context와 오래된 이메일의 의미가 깨진다.

기존 `company_intro_candidates.recommendation_id`는 실제 Intro recommendation을 가리킨다. 그 연결된 Intro가 존재하면 이전의 같은 후보자–역할 Harper 추천은 현재 추천 목록과 행동 대상에서 제외한다.

새 `superseded` 상태 table이나 중간 판단 enum은 만들지 않는다. 기존 Intro 연결 사실로 대체 여부를 계산한다.

### 8.2 Intro 요청 transaction에서 recommendation을 확보한다

`request_company_intro_v1`의 한 transaction에서 다음을 수행한다.

1. 요청자 권한·pair·현재 상태를 확인하고 해당 후보자 및 route lock을 획득한다.
2. 후보자가 이미 수락하여 연결 대기로 옮겨졌다면 현재 상태를 반환한다. 추가 Intro를 만들지 않는다.
3. 기존 role availability, privacy, test-only, 다음 단계·수신자·company appeal 계약을 확인한다.
4. 기존 Intro delivery run을 만든다.
5. ledger를 `awaiting_talent`로 옮기고 해당 delivery run과 연결한다.
6. 기존 `preFinalDelivery` 방식의 `intro_request` recommendation을 하나 만든다.
7. ledger의 `recommendation_id`에 연결하고 commit한다.

외부 LLM 호출이나 이메일 전송을 이 transaction 안에서 실행하지 않는다. 이후 Worker가 기존 recommendation ID의 내용을 완성하고 기존 delivery 경로로 보낸다.

이렇게 해야 회사 요청 직후 이전 추천만 남거나, 기존 추천을 먼저 숨겨 아무 카드도 없는 중간 상태를 피할 수 있다. 요청이 rollback되면 Intro recommendation과 이전 추천의 대체 효과도 함께 rollback된다.

초기 recommendation에는 생성되지 않은 LLM 설명을 사실처럼 채우지 않는다. 역할·회사·요청의 실제 정보로 카드를 표시하고 설명이 준비되면 기존 finalize가 채운다. 이는 요청이 기록되었다는 표시이며 이메일 전송 완료를 조작하는 것이 아니다.

### 8.3 공통 read projection

`talent_effective_opportunity_recommendations_v1` 같은 service-only read view를 사용해 다음 조건을 한 곳에서 정의한다.

- 기본 원본은 `talent_opportunity_recommendation`.
- 실제 company intro ledger에 연결된 `intro_request`는 현재 추천으로 읽을 수 있다.
- 같은 후보자–역할의 해당 Intro보다 이전 Harper internal recommendation은 현재 목록에서 제외한다.
- 외부 공고, 다른 역할, unrelated recommendation은 영향을 받지 않는다.
- Intro가 거절·종료되어도 과거 Harper 추천을 새 미응답 카드처럼 되살리지 않는다. Intro의 실제 종료 상태를 보여 준다.
- 원본 이력 조회는 별도 raw recommendation 읽기를 유지한다.

view의 RLS·grant도 service-only로 고정한다. view가 기본 테이블의 접근 경계를 우회하여 브라우저에 비공개 데이터가 노출되지 않게 한다.

### 8.4 적용할 reader와 writer

| 경로 | 처리 |
| --- | --- |
| `/career/history` 목록·탭·count·pagination | 페이지를 자르기 전에 effective projection 사용 |
| Career의 현재 추천 read 도구·기본 추천 index | 이전 Harper 카드와 Intro를 동시에 현재 제안으로 설명하지 않음 |
| 추천 follow-up 후보 조회 | 대체된 원본 추천으로 후속 권유하지 않음 |
| 대기 중 follow-up 최종 발송 guard | enqueue 후 대체된 경우도 발송 직전 차단 |
| 수락·거절 RPC / 이메일 응답 tool | 원본 ID를 받아도 현재 유효한 추천인지 확인 |
| 회사 board | active Intro와 일반 recommendation을 pair 단위로 중복 제거 |
| scorer/reranker/final delivery history builder | raw 원본과 Intro 연결을 읽어 이전 사실 유지 |

회사 board의 기존 “ledger에 연결된 recommendation ID만 제외”로는 충분하지 않다. 같은 pair에 별도 Harper recommendation이 있으므로 pair 단위로 표시 소유자를 정해야 한다.

### 8.5 오래된 링크의 의미

Intro 요청 이후 과거 Harper 추천의 수락·거절 버튼이나 이메일에 응답하면 현재 Intro의 정보를 반환한다. 오래된 recommendation을 다시 활성화하거나, 이전 추천 수락을 더 강한 효과를 가진 Intro 수락으로 조용히 바꾸지 않는다.

API·tool은 현재 recommendation ID, 현재 상태, 가능한 다음 행동을 반환한다. 대화 LLM이 이 사실로 자연스럽게 설명한다. “이럴 때는 이 문장”이라는 deterministic 대사를 만들지 않는다.

### 8.6 delivery의 재시도와 완료

- `persist_recommendations_no_repeats`는 요청 transaction에서 만든 동일 run·동일 role의 recommendation을 재사용한다.
- `finalize_pre_final_delivery_recommendations`가 그 행의 생성 내용만 완성한다. feedback·수락·거절을 초기화하지 않는다.
- 후보자가 history에서 먼저 응답했으면 delivery live guard가 최신 ledger 상태를 보고 낡은 Intro 권유 발송을 막는다.
- 개인정보 공유 철회·역할 종료·요청 종료의 기존 live guard를 유지한다.
- 이미 전송이 시작되거나 완료된 이메일 자체를 취소했다고 주장하지 않는다. 이후 링크·응답은 현재 상태로 처리한다.
- 전송 실패의 재시도는 같은 recommendation·run·outbox를 사용한다. 기존 Harper 카드가 재등장하거나 Intro 카드가 추가 생성되면 실패다.

## 9. 회사 ready 이후 후보자가 기존 추천을 수락하는 경우

### 9.1 canonical acceptance RPC에서 처리한다

화면에서만 카드 위치를 바꾸지 않는다. `accept_talent_internal_role_recommendation_v1`의 공통 transaction으로 처리하여 Career UI·대화 tool·이메일 수락이 같은 결과를 얻도록 한다.

1. 현재 recommendation과 role, 후보자 동의·공유 범위, 대체 여부를 확인한다.
2. 같은 pair의 ready가 없으면 기존 수락 흐름을 수행한다.
3. 같은 pair의 ready가 있으면 후보자 수락 사실을 저장한다.
4. 기존 회사 ready 행을 `closed`, `close_reason=route_replaced`로 닫는다.
5. 수락한 recommendation을 기준으로 기존 일반 파이프라인의 `내부:연결대기` tag와 필요한 공유·진행 사실을 저장한다.
6. 단계 계산과 회사 가시성이 실제로 `pending_connection`이 되었는지 transaction 결과로 반환한다.

새 Intro 요청, 자동 warm intro, 가짜 회사 승인, 가짜 Harper 팀원 승인 이벤트를 생성하지 않는다. 필요한 전환 출처는 기존 progress/event metadata에 사실대로 남긴다. `candidate_requested_connection`과 기존 수락 이벤트의 의미를 임의로 동일시하지 않는다.

현재 TS의 회사 단계 변경 함수는 회사 사용자 행동·연락 부작용을 포함하므로 후보자 수락 후 별도 호출로 이어 붙이지 않는다. 필요한 DB 변경만 기존 공유·단계 계약에 맞춰 acceptance transaction에 포함한다. 공통 SQL helper가 필요하면 동일한 단계 저장을 두 군데에서 복제하지 않기 위한 내부 helper로 제한한다.

### 9.2 현재 상태가 정확히 읽혀야 한다

- 회사 board: ready에서 제거되고 일반 `연결 대기`에 한 번만 나타난다.
- 일반 회사 상세 read: 원래 Harper 추천, 후보자 수락 사실, 현재 단계가 연결되어 읽힌다.
- 후보자 화면: 수락이 반영되고 회사 연결 대기 의미가 일치한다.
- company-first 검색: 이미 제안·수락한 pair로 제외된다.
- 아직 발송하지 않은 ready 카드 Slack outbox: 기존 deliverable guard가 닫힌 ready를 발송하지 않는다.
- 반복 수락: tag·progress·알림·카드가 중복 생성되지 않는다.

기존 수락 RPC의 `companyShared=false` 고정 반환도 이번 분기에서는 실제 결과와 맞춰 수정한다. Career·이메일 응답의 완료 설명이 회사 연결 대기로 이동했는데도 아직 내부 확인만 기다리는 것으로 안내하지 않게 한다.

수락 후 철회 가능 여부는 기존 실제 진행 단계 계약을 따른다. 연결 대기로 전환된 후보자를 아직 회사 공유 전인 것처럼 보고 24시간 단순 되돌리기를 허용하지 않는다. 진행 중단은 기존 공통 도구와 계약으로 처리하고, 후보자가 뜻을 바꾸었다는 이유로 예전 ready 카드를 재생성하지 않는다.

### 9.3 뒤늦은 회사 Intro 요청

회사가 과거 Slack 카드에서 Intro를 요청하거나 “이 사람 intro 보내줘”라고 말할 수 있다.

기존 company read 도구와 `requestOrgCompanyIntro` / Intro tool 실행 결과가 다음 사실을 제공해야 한다.

```text
현재 단계: 연결 대기
후보자 수락: <시각>
수락한 제안: Harper가 먼저 추천한 동일 역할
기존 company-first ready: 후보자 수락으로 종료
이번 호출의 새 Intro 요청 생성: 없음
```

회사 agent는 이 정보를 근거로 이미 만나 보고 싶다는 의사를 받아 연결 대기로 옮겼다고 설명할 수 있다. 별도의 `explain_already_accepted_candidate` 같은 도구나 고정 응답은 만들지 않는다.

현재 상태 조회를 새 Intro의 next stage·CC·appeal 확인보다 먼저 한다. 이미 진행 상태가 바뀐 후보자에게 불필요한 요청 양식을 다시 받지 않는다. 실행 결과는 현재 `stage`와 실제 사실을 포함하고, API consumer가 분기해야 할 최소한의 `already_in_pipeline` 같은 결과만 추가한다. 새로운 durable status는 추가하지 않는다.

그 사이 회사가 다음 단계로 옮겼다면 실제 현재 단계를 반환한다. 무조건 `연결 대기`라고 답하지 않는다.

## 10. 동시성·idempotency·최종 guard

### 10.1 lock 순서

기존에 후보자 추천 변경 lock, 회사–후보자 route lock, Intro별 lock, 행 lock이 여러 경로에서 다르게 사용된다. 이번 기능이 만나는 경로의 획득 순서를 통일한다.

```text
후보자 추천 변경 advisory lock
→ 회사–후보자 route advisory lock
→ 필요한 role / recommendation / intro / setting 행 lock
```

회사 ready capacity를 보호하는 run commit lock은 후보자 lock보다 앞에서 잡고, 후보자 RPC에서는 그 capacity lock을 추가로 요구하지 않는다. 여러 후보자·역할을 한 transaction에서 잡는 곳은 ID 정렬 순서를 고정한다.

기존 guard trigger가 부모 transaction과 반대 순서로 lock을 잡지 않는지 함께 확인한다. LLM 호출은 lock을 잡은 transaction 밖에서 한다.

### 10.2 먼저 확정된 transaction 기준

| 겹치는 작업 | 결과 |
| --- | --- |
| scoring 중 후보자 수락 | final guard에서 제외, 새 ready 생성 안 함 |
| 회사 ready commit → 후보자 수락 | 수락 transaction이 ready를 닫고 연결 대기로 이동 |
| 후보자 수락 → 회사 ready commit | commit guard가 수락을 확인하고 ready 생성 안 함 |
| 후보자 수락 → 회사 Intro 요청 | 새 Intro 없이 현재 회사 pipeline 반환 |
| 회사 Intro 요청 → 옛 Harper 추천 수락 | 이전 추천은 대체됨. 현재 Intro를 읽게 하며 의미를 자동 변환하지 않음 |
| 회사 Intro 요청 → 새 Intro 수락 | 기존 Intro 수락·후속 연결 흐름 실행 |
| Intro 요청 두 번 | 같은 요청·recommendation·delivery run 재사용 |
| 일반 수락 두 번 | 동일 수락·단계 반환, 전환 부작용 한 번 |
| Intro 생성 후 Worker 재시도 | 같은 provisional recommendation finalize |
| 거절 사유 변경과 company-first commit 경합 | 낡은 선정 설명을 그대로 발송하지 않음 |
| 공유 철회 또는 역할 종료와 요청/수락 경합 | 최신 권한·가용성 검사 결과에 따라 중단 |
| 다른 역할의 요청과 수락 | 해당 pair만 변경, 다른 역할 route 보존 |

DB가 현재 상태를 반환하는데 API나 LLM wrapper가 과거 성공/실패 메시지로 덮어쓰지 않도록 결과 계약도 함께 수정한다.

## 11. 수정 대상 파일과 책임

아래 경로는 구현 위치를 고정하기 위한 목록이다. 별도 orchestration framework를 만들지 않는다.

### 11.1 `harper_worker`

| 경로 | 변경 책임 |
| --- | --- |
| `opp/company_first_search/sql_safety.py` | runtime eligibility를 LIMIT 앞에 결합, 실제 query 안전·비용 검사 |
| `opp/company_first_search/retrieval.py` | 같은 자격 기준을 원본·repair·fallback에 전달 |
| `opp/company_first_search/repository.py` | score cache batch read/write, pair별 eligibility, compact history, final transaction guard |
| `opp/company_first_search/models.py` | 기존 TalentPacket에 history·score 출처 등 최소 입력 추가 |
| `opp/company_first_search/scorer.py` | 새 평가 pair만 output 요구, 성공 결과 저장에 필요한 계약 |
| `opp/company_first_search/reranker.py` | 재사용 fit 병합, 최신 history 입력, pair별 허용 route 검증 |
| `opp/company_first_search/runner.py` | cache 분기 연결, 기존 recommendation 일괄 제외 제거 |
| `opp/company_first_search/prompts.py` | 기존 추천·거절의 LLM 판단 계약과 공개 범위 |
| `opp/company_first_search/slack_writer.py`, `delivery.py` | 회사 공개용 reason 전달, 잘못된 첫 추천 전제 제거 |
| `opp/company_first_search/shadow.py` | production과 동일한 eligibility/cache 해석, read-only 유지 |
| `opp/new_harper_agent_v2.py` | Intro final-delivery context에 실제 이전 추천 이력 |
| `opp/new_harper_agent.py` | 공통 metadata·legacy 실행 경로의 일관성 |
| `opp/agentic/prompts.py`, `opp/utils/new_prompts.py` | “후보자가 처음 본다”는 고정 전제 점검, 언급 강제 없이 context 사용 |
| `opp/utils/new_delivery.py` | precreated Intro 재사용, finalize, pair guard, 이전 추천 follow-up 제외 |
| `opp/worker.py` | follow-up eligibility와 발송 직전 대체 여부 |
| `email_reply/tools.py`, `email_reply/db.py` | canonical 수락 RPC 결과와 대체된 추천 ID 처리 |

### 11.2 `harper_beta`

| 경로 | 변경 책임 |
| --- | --- |
| `supabase/migrations/` 새 migration | score cache, effective view, 요청·수락 RPC, 관련 trigger·grant |
| `src/lib/talentOpportunity.ts` | history count/page/read projection, 수락·거절 결과 처리 |
| `src/lib/career/internalOpportunityDecision.ts` | 현재 유효한 결정 대상·대체 결과 처리 |
| `src/lib/career/internalRoleSearch.ts` 및 추천 read 경로 | 기존 일반 도구의 현재 추천 index와 상세 조회 |
| `src/lib/org/server.ts` | pair 기준 board 중복 제거, 현재 pipeline 반환, Intro 요청 상태 처리 |
| `src/lib/org/agent/data.ts`, `context.ts` | compact한 현재 추천 경로·수락·진행 사실 제공 |
| `src/lib/org/agent/toolExecution.ts`, `tools.ts` | 기존 Intro tool의 현재 상태 우선 확인과 최소 결과 확장 |
| `src/lib/org/agent/promptFormat.ts` | tool/read 사실을 LLM에게 전달 |
| `src/app/api/org/company-intro/route.ts` | 이미 pipeline으로 전환된 요청의 정상 결과 전달 |
| `src/components/org/OrgRoleTalentBoard.tsx`, `OrgCandidateDecisionDialogs.tsx` | 중복 제거·현재 상태에 맞는 기존 액션 갱신 |
| 기존 DB generated types | 추가 schema/RPC 계약 반영 |
| 기존 company-first·수락·history 테스트 | 실제 데이터·상태 전환 회귀 검증 |

진입점만 수정하고 하위 SQL/RPC에서 기존 추천을 다시 제외하는 오류를 막기 위해, 구현 시 위 경로의 모든 `recommendation exists`, active Intro, candidate-requested, queued run guard를 함께 추적한다. 무관한 역할 switch·진행 복구·연락 기능의 정책은 새로 설계하지 않는다.

## 12. 검증 계획

### 12.1 retrieval·cache 계약

| 사례 | 검증할 결과 |
| --- | --- |
| 미평가 pair가 SQL에 잡힘 | 한 번 scoring |
| 과거 fit이 SQL에 잡힘 | scoring 호출 없이 기존 score + 최신 history로 rerank |
| 과거 fit이 SQL에 안 잡힘 | cache에서 후보를 끌어오지 않음 |
| non-fit 29일 23시간 59분 | 제외 |
| non-fit 정확히 30일 | 재평가 자격 있음 |
| 30일 지난 non-fit이 SQL에 안 잡힘 | 아무 평가 없음 |
| 상위 150명이 최근 non-fit, 그 뒤에 적격 후보 존재 | 적격 후보가 budget에 진입 |
| 원본·repair·fallback SQL | 같은 자격·LIMIT 규칙 |
| 역할 A 최근 non-fit, B에서 검색 | A 재평가 없음, B는 자체 이력에 따라 처리 |
| fit cache와 신규 평가 역할 혼재 | scorer는 due 역할만 반환, reranker에는 유효 fit 병합 |
| 한 역할에 재사용 fit 200명 | reranking 입력은 score 상위 최대 12명 |
| 여러 역할의 재사용 fit과 신규 fit 혼재 | 합산 후 역할당 12 pair·전체 50명/72 pair 모두 준수 |
| 정상 non-fit / scorer 오류 | 전자는 cache 저장, 후자는 저장·시각 갱신 없음 |
| fit이 pool에서 탈락 | 결과는 저장, 다음 run에서 재평가하지 않음 |
| rerank no_action | fit cache를 non-fit으로 바꾸지 않음 |
| scorer 성공 후 delivery 실패 | 성공한 score는 재사용 가능 |
| shadow 실행 | 운영 cache 쓰기 없음 |
| 동시 scoring 완료 순서 역전 | 오래된 입력의 결과가 최신 cache를 덮어쓰지 않음 |

단순 SQL 문자열 존재 검사만으로 LIMIT 문제를 검증하지 않는다. 격리된 PostgreSQL fixture로 실제 결과와 순서·budget을 확인한다.

### 12.2 추천 history와 화면 계약

1. 미응답 Harper 추천이 scoring·reranking에 포함된다.
2. 거절한 Harper 추천도 포함되고 사유가 모델 입력에 있다.
3. 이미 수락한 pair와 기존 company-first 제안 pair는 제외된다.
4. Intro 요청 성공 직후 이전 Harper 카드는 없어지고 실제 Intro 카드가 한 번 나타난다.
5. history count·탭·pagination이 카드 개수와 일치한다.
6. 거절 원본은 raw history context에 남아 있고 화면을 위해 삭제되지 않는다.
7. Intro 거절·종료 후 옛 Harper 카드가 미응답으로 부활하지 않는다.
8. 오래된 링크·대기 follow-up이 대체된 추천을 재활성화하지 않는다.
9. 다른 역할·외부 공고·다른 후보자 history가 바뀌지 않는다.
10. 생성 설명이 아직 없는 Intro도 사실에 기반해 렌더되고, retry가 중복 카드를 만들지 않는다.

### 12.3 수락·회사 agent·동시성 계약

- ready가 있는 일반 수락 → ready 0개, 일반 연결 대기 1개, 실제 수락 1개.
- ready가 없는 일반 수락 → 기존 Harper 최종 확인 경계 유지.
- Intro 수락 → 기존 회사 다음 단계·수신자·handoff 흐름 유지.
- 이미 이동한 후보자의 Slack Intro 요청 → 새 run/요청 없이 현재 pipeline 반환.
- 회사 다음 단계로 이미 진행했으면 최신 단계 반환.
- UI·Career 대화·이메일 수락에서 동일 DB 결과.
- 실제 회사 공유 여부와 수락 완료 설명이 일치하며, 연결 대기 이후 철회·진행 중단은 기존 단계 계약을 따름.
- 두 DB connection으로 수락과 Intro 요청을 동시에 실행해 한 경로만 확정되는지 검증.
- 거절·privacy 철회·역할 종료·test-only에 대한 guard 검증.
- 중복 요청·중복 수락·Worker retry에서 recommendation, stage, outbox 중복 없음.
- 기존 다른 역할 Intro·주기적 검색 설정 변경 계약 유지.

### 12.4 LLM 품질 평가

정성 판단은 테스트용 사례에서 평가한다. 사례를 runtime keyword 분기로 구현하지 않는다.

| 평가 영역 | 확인할 의미 |
| --- | --- |
| 무응답 이력 | 관심이나 거절을 지어내지 않고 제안 여부 판단 |
| 거절 이유와 현재 제안이 조정 가능한 경우 | 회사 검토 가치와 확인할 조건을 설명할 수 있음 |
| 거절 이유가 현재도 명백한 충돌인 경우 | 무조건 재추천하지 않음 |
| 공유 금지·차단 | 모델 판단으로 우회하지 않음 |
| 과거 fit 이후 새 거절 | cache 점수보다 최신 사실을 제대로 고려 |
| 회사 설명 | 필요한 이력은 자연스럽게 전달하고 비공개 원문은 불필요하게 노출하지 않음 |
| 후보자 final delivery | 이전 추천·거절을 알고 이번 요청을 설명하되 매번 언급을 강제하지 않음 |
| 오래된 회사 Intro 요청 | 이미 수락/진행 중인 상태를 설명하고 중복 요청하지 않음 |

기존 registry의 `company-first-talent-selection`, `final-delivery-generation`, `career-request-intro-reply`, 필요한 회사 agent 평가 task를 사용한다. runner는 소유 저장소에 유지한다. frozen 데이터·gold를 덮어쓰지 않고, 신규 사례는 provenance가 있는 새 버전으로 등록한다. 평가 생성·실행 전 각 README를 다시 확인한다.

합격 조건은 문장 일치가 아니라 사실성·공유 범위·현재 상태·행동 결과다. 모델 평가를 했다고 주장하려면 실제 실행한 dataset/model/prompt/run과 결과를 남긴다.

수락 의사 조작, 공유 경계 위반, 중복 Intro 생성, 존재하지 않는 조건 변경 주장 같은 critical error는 0건이어야 한다. 모든 후보자를 제외하는 모델도 통과시키지 않도록 실제 제안 가치가 있는 positive 사례와 제안하지 않아야 하는 사례를 함께 검증한다.

### 12.5 데이터 격리

통합 검증은 로컬 또는 비운영 DB를 우선한다. test role은 삽입 전에 `information.testOnly=true`, 안정적인 `testFixture`, 필요한 경우 전용 `testTalentIds`를 지정한다. 일반 talent matching 경로에서 제외되는지도 확인한다.

운영 후보자에게 실제 추천·이메일·Slack 메시지를 보내는 방식으로 검증하지 않는다. raw 데이터·모델 출력·secret은 평가 registry의 ignored `private/` 또는 `runs/`에만 두고 commit하지 않는다.

## 13. 구현 순서와 완료 기준

각 단계는 같은 기능의 일부다. 검색 허용만 배포하고 history·수락 경합 처리를 나중으로 미루지 않는다.

1. **DB 계약과 격리 통합 테스트**: cache/view, Intro 요청과 일반 수락 transaction, trigger·lock 순서, 권한.
2. **Worker 검색·평가**: pre-limit eligibility, cache 재사용·쓰기, pair별 route, raw history 입력, shadow 일치.
3. **추천 delivery**: Intro recommendation 선확보와 기존 finalize 재사용, 최신 history, follow-up 차단.
4. **Career·회사 read/write**: history와 board의 현재 카드, canonical 수락 결과, 회사 일반 도구의 최신 상태.
5. **정성 검증**: 추천 이력 의미·회사 설명·후보자 delivery·뒤늦은 Intro 요청 평가.
6. **통합 검증과 문서 정리**: 경합·재시도·다른 역할 회귀 확인, 기존 운영 계약의 충돌 부분 갱신.

완료 체크리스트(로컬 코드와 아래 검증 범위 기준):

- [x] SQL에 잡힌 후보자만 검토하며 eligibility가 unique Talent budget 전에 적용된다.
- [x] 과거 fit은 재사용하고 non-fit은 마지막 성공 평가로부터 30일 후에만 재평가된다.
- [x] 재사용 fit과 신규 fit을 합친 rerank 입력이 역할당 12 pair·전체 50명/72 pair를 넘지 않는다.
- [x] rerank no_action과 scoring non-fit이 섞이지 않는다.
- [x] 기존 Harper 추천·거절 후보가 검토되고 최신 이력이 scoring과 reranking에 들어간다.
- [x] LLM이 필요한 설명을 회사에 전달할 수 있고 출력 문구를 규칙으로 강제하지 않는다.
- [x] Intro 요청은 history의 이전 추천과 현재 행동 대상을 일관되게 대체한다.
- [x] 원본 이력과 거절 사유는 보존되고 final delivery에서 읽을 수 있다.
- [x] 회사 ready 이후 일반 수락이 연결 대기 전환과 한 transaction으로 끝난다.
- [x] stale 회사 요청과 후보자 링크가 현재 상태를 반환하고 중복 부작용이 없다.
- [x] 일반 수락의 기존 최종 확인 경계와 다른 역할 진행을 보존한다.
- [x] 로컬 privacy·소유권·test-only·retry·lock 검증을 통과한다.
- [x] 실제 실행한 테스트·평가 결과와 미실행 항목을 구분해 기록한다.

## 14. 의도적으로 남기는 한계

### 14.1 fit cache의 자동 만료는 없다

사용자가 정한 정책대로 fit은 scoring을 매번 다시 하지 않는다. 이후 역할이나 후보자 정보가 달라지면 과거 평가가 오래될 수 있다. 최신 context를 읽는 reranker가 이번 제안 여부를 다시 판단하되, 이것이 scorer와 pool 정렬까지 모두 최신 평가라는 뜻은 아니다.

반대로 non-fit 직후 정보가 크게 바뀌어도 30일 동안은 자동 재평가하지 않는다. 이 비용과 최신성의 교환을 숨기지 않고, 이번 구현에 fingerprint·예외 trigger·추가 만료 정책을 끼워 넣지 않는다.

### 14.2 같은 fit 후보가 reranking에 반복될 수 있다

아직 회사에 제안되지 않은 fit 후보는 다음 SQL에도 잡히면 다시 reranking 후보가 될 수 있다. 기존 pool 상한 때문에 일부 후보가 반복해서 선택되고 신규 fit이 밀리는 가능성도 남는다. 이번 정책이 해결하는 것은 최근 non-fit의 반복 scoring과 그로 인한 retrieval budget 소진이다.

이를 이유로 신규 후보 quota, 점수 감쇠, no_action cooldown을 추가하지 않는다. 기존 run trace에 fresh score 수, fit 재사용 수, non-fit 제외 수, rerank·선정 수를 남겨 실제 문제가 있는지 확인할 수 있게 한다. 별도 분석 table은 필요 없다.

### 14.3 회사에 필요한 설명과 후보자 비공개 정보는 다르다

회사 writer가 내부 history 원문을 받지 못하는 경우가 있다. 공개 가능한 설명으로 검토 의미를 전달하는 것이 목표이며, 모든 거절 사유를 회사에 원문 공개하는 것이 완료 조건은 아니다.

## 15. 적용·배포 경계

이 요청의 구현 작업은 로컬 코드·migration 파일·테스트·문서 작성까지다. 운영 migration 적용, production branch push, Worker restart, 배포는 별도 명시적 배포 요청이 있을 때 수행한다.

실제 배포 때는 다음을 확인한다.

- 새 schema·RPC·view와 두 저장소 reader/writer의 호환 순서.
- 구버전 Worker가 새 Intro recommendation을 중복 생성하지 않는지, 구버전 API가 대체된 추천을 잘못 처리하지 않는지.
- 기존 배포·운영 설정을 실제 확인하고, migration 파일 유무만으로 적용 필요를 판단하지 않는 것.
- company-first와 Opportunity Worker의 적용 revision 및 컴포넌트별 health.
- Opportunity Worker는 전용 scheduler와 6개 queue Worker를 분리한 기존 rolling restart 절차.
- 배포된 코드 기준으로 관련 Notion 문서의 변경 여부 확인 및 필요한 동기화.

Notion은 구현 계획으로 먼저 고치지 않는다. 성공적으로 배포된 뒤 실제 동작을 반영한다. 특히 “일반 수락에는 최종 확인 필요, 기존 회사 ready 이후 수락에는 연결 대기 예외”를 정확하게 구분해야 한다.

## 16. 구현 결과와 검증 — 2026-09-28

### 구현 파일과 구조

- DB: `20260928045449_company_first_score_reuse_and_recommendation_history.sql`. 마지막 성공 scoring 사실을 위한 table 하나, raw recommendation을 보존하는 effective view, 기존 수락/Intro RPC와 공통 변경 guard를 사용한다. 별도 판단 상태·관계 agent·거절 사유 enum은 없다.
- Worker: `opp/company_first_search/`가 자격 → 필요한 scoring만 → 재사용 병합 → 단일 bounded pool → 최신 context rerank 순서를 수행한다. `opp/utils/recommendation_history.py`의 공통 reader가 짧은 사실 text를 만들어 scorer/reranker와 Intro final delivery에 제공한다.
- Career: `talentOpportunity.ts`·`career/internalRoleSearch.ts`와 이메일 일반 reader가 effective view를 사용한다. 오래된 응답은 409/currentRecommendationId를 반환하고 화면이 새 history를 읽는다. 원본 feedback·reason은 삭제하지 않는다.
- 회사: `org/server.ts`의 board/detail, `org/agent/data.ts`·`toolExecution.ts`·`promptFormat.ts`가 실제 수락 시각·origin·현재 stage를 제공한다. 현재 board·detail·agent reader도 effective view를 사용해 Intro 종료/연결 후 옛 카드가 같은 stage에 중복 등장하지 않는다. 기존 company Intro 링크도 이동한 현재 pipeline으로 해석하며 새 Intro 입력을 받기 전에 현재 상태를 돌려준다.
- 수락 후 준비 중이던 추천 전달·follow-up은 동일 recommendation ID와 현재 여부 guard로 처리한다. 새 Intro를 수락하는 것과 이전 Harper 추천을 수락하는 것의 동의를 합치지 않는다.
- 명시적 `Run Search`는 기존 결과 알림 경로를 쓰므로 정기 검색의 Slack bundle 없이도 ready를 저장할 수 있게 기존 저장 검증의 충돌을 수정했다. 정기 검색은 여전히 Slack bundle을 요구한다.

### 실행한 검증

| 검증 | 결과·범위 |
| --- | --- |
| Worker unit/회귀 | 223개 통과: company-first, email reply, internal follow-up, delivery outbox/retry, transaction pooling, internal-role isolation, acceptance contract, local launcher/debug counts |
| 회사 agent/검색 설정 unit | 74개 통과: promptFormat, prompts, companyIntroSearchSetting |
| 실제 PostgreSQL 격리 통합 | migration 실행, 최근 non-fit 150명 이후 eligible 회수, 정확히 30일, join 중복 budget, cache stale-write 방지, effective history, provisional Intro ID 재사용/finalize retry, 오래된 feedback/saved-stage 차단, 소유권, 일반 수락 예외, privacy, 다른 역할 자격, 두 connection으로 양쪽 순서의 수락/Intro 경합 통과 |
| 실제 selection LLM | 합성 4쌍으로 두 번 실행. 첫 run frozen route 4/4, 마지막 run 3/4. 의미 검토에서 critical 오류는 관찰되지 않았으나 **frozen route gate 통과는 아님**. [상세 보고서](../evaluation/company-first-talent-selection/reports/2026-09-28-history-reuse.md) |
| 실제 회사 LLM | 합성 2대화·3발화의 현재 상태 설명 3/3. 실제 연락·DB 변경 없음. [상세 보고서](../evaluation/company-side-conversational-qa/reports/2026-09-28-company-first-history.md) |
| 전체 TypeScript | 이번 수정 파일의 오류는 없었으나 기존 오류로 실패. 생성된 `.next` 두 디렉터리의 `pages/network.js` 참조, 기존 private 평가 스크립트의 RPC Promise 타입, `growthTalentGtmReport.test.ts`의 unknown/implicit-any 오류 |

재실행 명령:

```bash
# harper_worker
python3 -m unittest tests.test_email_reply_tools tests.test_company_first_search tests.test_company_first_history tests.test_internal_followup_role_availability tests.test_opp_delivery_format_outbox tests.test_opp_on_demand_delivery_retry tests.test_opp_transaction_pooling tests.test_internal_role_safety tests.test_internal_acceptance_prompt_contract tests.test_company_matching_local -q

# harper_beta — PostgreSQL initdb/pg_ctl이 PATH에 필요. 새 임시 DB만 사용.
python3 scripts/test_company_first_history.py
pnpm exec tsx --test src/lib/org/agent/promptFormat.test.ts src/lib/org/agent/prompts.test.ts src/lib/org/companyIntroSearchSetting.test.ts
pnpm exec tsc --noEmit --pretty false --incremental false
```

Candidate final-delivery에는 원본 이력을 넣는 구현과 실제 persistence/finalize 재시도를 검증했다. 이번 기능의 후보자 최종 문구를 새 실제 LLM dataset으로 평가하거나, 브라우저·Slack·후보자 이메일 왕복 E2E를 실행하지는 않았다. 운영 migration·서비스 배포·Notion 동기화도 하지 않았다. 작은 합성 LLM 결과를 광범위한 운영 성능 검증으로 해석하지 않는다.

검증 환경은 임시 loopback PostgreSQL 18.6이며 실행마다 fixture DB를 만들고 종료·삭제했다. 준비 과정의 Homebrew PostgreSQL 설치는 Xcode 버전 문제로 완료되지 않았고 `icu4c@78`·`ca-certificates` 의존성은 갱신됐다. 내려받은 PostgreSQL runtime을 임시 경로에서 사용했으며 검증용 `/usr/local` symlink는 제거했다. 운영 DB 또는 상주 PostgreSQL 서비스를 기동·재시작하지 않았다.

## 17. 운영 DB 적용 — 2026-09-28 13:54 KST

사용자의 명시적인 운영 DB migration 적용 요청에 따라 Harper 운영 프로젝트 `zzojrniuppueizhnmqfd`에 이번 migration 한 건을 적용했다.

- 운영 이력: `20260928045449_company_first_score_reuse_and_recommendation_history`.
- 적용 전 실제 catalog에서 신규 score table·effective view가 없음을 확인했고, 기존 RPC 정의와 필요한 선행 helper/migration을 대조했다. 선행 migration을 다시 적용하지 않았다.
- 준비된 SQL을 하나의 transaction으로 적용했다. 잠금 대기 5초·statement 60초 제한을 두었다.
- 적용 후 함수 10개의 body가 준비된 migration과 모두 일치했다. Trigger 2개 활성화, effective view 조회, RLS 및 service-role 전용 접근을 확인했다.
- 점수 cache는 0행으로 시작한다. 기존 후보자의 점수를 임의 backfill하거나 후보자에게 검증 연락을 보내지 않았다.
- Supabase가 부여한 실제 migration version에 로컬 파일명과 테스트의 참조를 맞췄다. SQL 내용은 동일하다.
- 앱/Worker push·배포·재시작은 하지 않았다. 새 scoring 재사용과 화면/LLM context까지 모두 운영에 반영된 것으로 해석하지 않는다.
