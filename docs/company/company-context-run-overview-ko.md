# Company Context Run: 목적과 구현 계약

- 작성일: 2026-08-14
- 상태: 구현 기준 설계
- 반복 실행 절차: [Company Context Run Codex 런북](./company-context-run-codex-runbook-ko.md)

## 1. 한 문장으로 설명

`company_context_run`은 회사가 실제 채용 과정에서 남긴 행동과 설명을 자연어 `context`로 압축해 계속 갱신하고, 그 최신 기억을 사용해 특정 internal role에 지금 연결을 제안할 만한 talent를 찾고 평가하는 작업이다.

이 작업의 산출물은 다음 세 가지다.

1. Role별로 관리되는 최신 `context` 문서 하나
2. 새로 평가하거나 다시 평가한 `[talent × role]`의 `talent_opportunity_fit`
3. 이번 실행의 상태와 짧은 결론이 담긴 `company_context_runs` row

Context 갱신은 matching을 위한 준비 작업이 아니라 이 workflow의 핵심 결과다. 현재 run의 후보 평가에 즉시 사용하고, 앞으로 `harper_worker`의 new agent v2가 internal matching을 할 때도 같은 회사 기억을 사용할 수 있게 한다.

## 2. 왜 context를 만드는가

`request`, `criteria`, JD는 회사가 명시적으로 적어 둔 현재 요구사항이다. 그러나 실제 채용 의도는 그 밖에서도 계속 드러난다.

- 회사-side LLM과 주고받은 채팅
- 후보자를 수락하거나 거절한 결정과 그 이유
- 후보자를 다음 단계로 진행시키거나 중단한 결정
- 후보자나 진행 상황에 남긴 메모
- 역할을 설명하거나 수정하면서 추가로 밝힌 판단 기준
- 같은 유형의 후보자에 대한 반복된 반응

이 원천을 매 평가에 그대로 모두 넣으면 신호가 중복되고 오래된 사실과 최근 변화가 뒤섞인다. 따라서 raw event를 나열하는 대신, 회사가 현재 무엇을 중요하게 보고 어떻게 판단하는지를 하나의 짧은 자연어 기억으로 관리한다.

이 접근은 Netflix GenRec의 [verbalization과 context engineering](https://netflixtechblog.com/genrec-towards-llm-native-recommendation-at-netflix-f20be6f643e3)에서 가져온다. 핵심은 raw log를 단순히 문자열로 바꾸는 것이 아니다. GenRec은 context window를 새로운 `feature budget`으로 보고, 추천에 중요한 고신호 사건은 충분히 남기고, 저신호 사건은 버리고, 반복 행동은 압축하며, 최근의 중요한 변화만 선택적으로 자세히 쓴다. Harper도 같은 원칙을 따른다. Evidence가 존재한다는 사실만으로 context 공간을 차지할 자격이 생기지 않으며, 다음 matching 판단에 필요한 정보만 남긴다. GenRec 논문도 이를 feature engineering에서 context engineering으로의 전환으로 설명한다: [GenRec paper](https://arxiv.org/abs/2608.10257).

`company_behavior_contexts.text_context`는 검토 이력이나 사건 원장이 아니다. 다음 `[talent × role]` 평가에 직접 들어가는 compact input이다. 어떤 사건을 검토했다는 사실, 이유 없는 상태 변경, “아직 알 수 없다”는 일반론은 run 이력에는 남길 수 있지만 matching input에는 넣지 않는다.

## 3. context의 단위와 내용

### 3.1 Role당 current 문서 하나

한 run의 target은 internal role 하나다. 각 role에는 현재 상태를 나타내는 `context` 문서 하나만 둔다. 별도의 company context와 role context 두 문서를 동시에 관리하지 않는다.

문서 안에서는 다음 두 범위를 구분한다.

- `회사 공통으로 보이는 판단`: 여러 역할에도 적용될 가능성이 충분한 운영 방식이나 선호
- `현재 역할에서 확인된 판단`: 이 role의 후보 반응, 진행, 거절, 메모에서만 확인된 기준

다른 role에서 발생한 사건도 회사 공통 기준을 분명히 보여 줄 때는 참고할 수 있다. 다만 다른 role의 특수한 결과를 현재 role의 기준으로 자동 일반화하지 않는다.

### 3.2 context에 넣는 것

- 명시된 결정 이유와 메모
- 실제 수락·거절·진행·중단에서 반복적으로 드러난 기준
- 처음의 request/criteria보다 더 구체화된 기대 수준
- 최근 들어 달라진 우선순위나 기준
- 서로 충돌하는 신호와 아직 결론내릴 수 없는 질문
- 평가 결과를 바꿀 수 있는 회사의 일하는 방식, 역할 범위, seniority, ownership 기대

### 3.3 context에 복제하지 않는 것

다음 정보는 평가 시 별도 최신 입력으로 제공하므로 context에 다시 요약하지 않는다.

- 회사 기본 소개와 공개 정보
- Role description과 JD
- `company_internal_roles.request`
- `company_internal_roles.criteria`
- 후보자의 이력서나 프로필 원문
- 후보 검색 SQL, 검색 순위, fit 점수 목록

Context는 회사 행동으로부터 새로 알게 된 정보에 집중한다.

## 4. verbalization 작성 원칙

### 4.1 신호 선택

| 처리 | 대상 |
| --- | --- |
| 자세히 유지 | 명시적 판단 이유, 메모, 조건 수정, 최근의 수락·거절·진행 결정 |
| 압축 | 같은 이유로 반복된 반응, 오래 유지된 일관된 패턴 |
| 생략 | 단순 조회, 중복 event, 이유 없는 상태 변경, 검토했다는 사실, 평가에 의미 없는 운영 로그 |
| 선택적으로 확장 | 기존 기억과 충돌하는 최근 신호, 결과를 크게 바꿀 새 정보 |

최근의 고신호 사건은 구체적으로 쓰고, 오래된 이력은 아직 유효한 패턴만 남긴다. 단일 사건은 단일 사건으로 표현하며 반복 선호처럼 과장하지 않는다.

### 4.2 필요한 정보 gate

Context 후보 문장은 저장 전에 다음 질문을 통과해야 한다.

> 이 문장을 빼면 다음 후보의 retrieval, label, score, reason 또는 확인 질문이 달라질 합리적인 가능성이 있는가?

`아니오`이면 쓰지 않는다. `예`인 문장도 다음 중 하나를 해야 한다.

- 별도 최신 입력인 JD, request, criteria에는 없는 회사의 명시적 판단 기준을 추가한다.
- 회사가 어떤 후보를 왜 진행·중단했는지에서 반복적으로 확인된 평가축이나 trade-off를 설명한다.
- 기존 context의 잘못된 해석을 바로잡거나, 최근 변화로 더 이상 유효하지 않은 기준을 수정·삭제한다.
- 실제 label을 바꿀 수 있는 구체적인 불확실성과 무엇을 확인해야 하는지를 남긴다.

다음은 그 자체로 필요한 정보가 아니다.

- 회사 actor가 stage를 바꿨지만 이유·메모가 없는 사실
- “관련 사례를 검토했다”, “추가 기준은 아직 모른다” 같은 검토 완료 문장
- 후보를 몇 명 보았거나 언제 이동시켰는지에 대한 운영 통계
- 명시적 이유 없이 후보 속성과 결과가 함께 나타났다는 상관관계
- 이미 JD, request, criteria에 최신 상태로 들어 있는 내용

회사 actor가 확인된 이유 없는 stage 변경은 그 행동이 실제 발생했다는 것만 증명한다. 그 원인, 선호, 배제 기준은 증명하지 않으며, 다른 고신호 evidence와 결합해 다음 평가를 바꾸지 않는 한 context에서 생략한다.

### 4.3 Context와 검토 이력의 분리

모든 evidence를 검토했지만 필요한 정보가 하나도 없을 수 있다. 이는 정상 결과다.

- 기존 context가 비어 있으면 `text_context`를 빈 문자열로 유지하고 `contextChanged=false`로 처리한다.
- 기존 context가 있고 새 evidence가 그 의미를 바꾸지 않으면 기존 text를 byte-for-byte 그대로 유지한다.
- 기존 문장이 더 이상 위 gate를 통과하지 못하거나 근거가 사라졌으면 그 문장을 삭제한다. 결과가 빈 context여도 된다.
- 검토 완료를 남겨야 하면 `company_context_runs.result.summary`에 `행동 evidence를 검토했으나 context에 반영할 matching-relevant 정보 없음`처럼 짧게 기록한다. 이 문장을 context에 넣지 않는다.

Context의 빈 값은 실패나 미완성이 아니다. 현재 별도 입력을 보완할 회사 행동 신호가 없다는 정확한 표현이다.

### 4.4 문서 형태

Context는 사건 일지가 아니라 현재 판단에 바로 쓸 수 있는 메모다. 다음 구조를 기본으로 한다.

```markdown
## 현재 채용 판단
- 지금 이 role에서 실제로 중요해 보이는 기준

## 긍정 신호
- 수락하거나 진행시킨 사례에서 확인된 패턴과 이유

## 부정 신호
- 거절하거나 중단한 사례에서 확인된 패턴과 이유

## 회사 공통 운영 맥락
- 여러 role에도 적용할 근거가 있는 판단 방식이나 협업 기대

## 최근 변화
- 이전 context 이후 새로 생기거나 달라진 내용

## 아직 불확실한 점
- 실제 평가를 바꿀 수 있고 확인할 대상이 구체적인 불확실성
```

빈 section을 억지로 채우지 않는다. 특히 쓸 내용이 없다는 이유로 `아직 불확실한 점`을 만들지 않는다. 후보자 이름과 raw 대화 전문은 남기지 않고, 평가에 필요한 속성과 결정 이유로 일반화한다.

### 4.5 갱신 방식

1. 기존 context 전체를 먼저 읽는다.
2. 이전 성공 실행 이후의 새 evidence와, 정정·삭제된 기존 evidence를 확인한다.
3. 여전히 근거가 있고 필요한 정보 gate를 통과하는 문장만 유지한다.
4. 새 evidence가 의미를 바꾼 문장만 수정·추가·삭제한다.
5. 새 event가 있어도 해석이 같으면 context text를 바꾸지 않는다.
6. 오래된 판단과 최근 판단이 충돌하면 무조건 덮어쓰지 말고, 범위 차이인지 실제 변화인지 설명한다.
7. 사실, 합리적 추론, 아직 모르는 점을 구분한다. 단, 아직 모른다는 사실도 다음 평가에 필요할 때만 남긴다.

## 5. 언제 실행하는가: 코드의 책임

실행 시점은 Codex가 매번 추론하지 않는다. 애플리케이션과 DB helper가 아래 조건을 판정하고 즉시 queue에 넣는다.

자동 실행의 첫 gate는 `company_internal_roles.is_auto = true`다. 아래 `role_created`, `reactivated_after_7d`, `weekly`는 모두 `is_auto=true`인 role에만 적용한다. `is_auto=false`로 바뀌면 아직 시작하지 않은 자동 queue row를 취소한다. 운영자가 명시적으로 넣는 `manual` run만 이 gate와 무관하다.

| Trigger | Queue 조건 |
| --- | --- |
| `role_created` | `is_auto=true`인 새로운 internal role이 `active`로 확정됨. Draft 생성만으로는 queue에 넣지 않음 |
| `reactivated_after_7d` | `is_auto=true`이고 `paused` 또는 `ended` 상태가 합쳐서 연속 7일 이상 지속된 뒤 `active`로 바뀜 |
| `weekly` | `is_auto=true`인 role이 계속 `active`이고 마지막 성공한 `company_context_run` 이후 7일이 지남 |
| `manual` | 운영자가 특정 role의 실행을 명시적으로 요청함 |

`role_created`와 `reactivated_after_7d`는 상태 변경 transaction 직후 enqueue한다. `weekly` due 판정도 코드로 구현하며, 예약 작업이 시작될 때 due-enqueue helper를 한 번 호출하면 된다.

모든 자동 queue는 enqueue 시점에 role이 internal, `active`, 미만료, `is_auto=true`여야 한다. Queue 대기 중 role이 비활성화·삭제·만료되거나 `is_auto=false`가 되면 아직 시작하지 않은 자동 row를 즉시 취소한다. `manual` row만 이 자동 조건의 예외다.

“즉시 실행”은 즉시 queue에 들어간다는 뜻이다. 실제 Codex 실행 시각은 설정된 예약 주기를 따른다. 이미 같은 role의 `queued` 또는 `running` row가 있으면 중복 enqueue하지 않는다.

예약 작업은 한 번 깨어날 때 현재 claim 가능한 queue를 모두 비울 때까지 순차 처리한다. 한 role을 `succeeded`, `canceled`, `failed` 중 하나의 terminal 상태로 끝낸 뒤 다음 role을 claim하며, 여러 role을 동시에 처리하지 않는다. 무효한 row를 취소한 경우에도 예약 실행을 끝내지 않고 다음 row로 진행한다.

## 6. `company_context_runs`: 6-column queue와 실행 이력

Queue는 실행 대상 전달, atomic claim, 완료 기록에만 사용한다. 6개를 넘는 top-level column을 만들지 않는다.

| Column | 역할 |
| --- | --- |
| `id` | run ID |
| `role_id` | 처리할 internal role |
| `status` | `queued`, `running`, `succeeded`, `failed`, `canceled` |
| `trigger_reason` | `role_created`, `reactivated_after_7d`, `weekly`, `manual` |
| `available_at` | claim 가능한 시각. 실패 재시도의 backoff에도 사용 |
| `result` | 시작·종료 시각, runner, 짧은 결론, count, 실패 stage를 담는 JSON |

권장 `result` 형태:

```json
{
  "startedAt": "...",
  "finishedAt": "...",
  "context": {"changed": true},
  "matching": {
    "skippedReason": null,
    "retrieved": 84,
    "evaluatedNew": 41,
    "reevaluated": 18,
    "fit": 6
  },
  "summary": "최근 진행·거절 메모로 역할 기대치를 갱신하고 연결 후보 6명을 확인함"
}
```

실패 시에는 `stage`, 짧은 `error`, `retryable`을 같은 JSON에 쓴다. 긴 raw evidence나 후보자 문서는 queue row에 넣지 않는다.

Column을 늘리지 않고도 다음은 index와 RPC/helper로 구현한다.

- role별 open run 하나만 허용하는 partial unique index
- `(status, available_at)` claim index
- `FOR UPDATE SKIP LOCKED` 기반 atomic claim
- due enqueue와 실패 retry
- 마지막 성공한 queue run의 종료 시각을 기준으로 한 weekly 판정

## 7. 한 run의 전체 흐름

1. Queue에서 role 하나를 atomic claim한다.
2. 기존 context와 이전 성공 실행 이후의 회사 행동 evidence를 가져온다.
3. Evidence를 verbalize해 context를 갱신하고 먼저 저장한다.
4. 현재 정확히 `연결 대기`인 unique talent 수를 센다.
5. 그 수가 `company_internal_roles.max_pending_talents` 이상이면 후보 검색만 생략한다. Context 갱신은 이미 완료됐으므로 run은 정상 완료할 수 있다.
6. 검색이 가능하면 Codex가 최신 role, 회사 정보, request, criteria, context를 읽고 이번 run 전용 read-only SQL을 작성·실행한다.
7. SQL 결과의 각 talent를 `harper_worker` internal fit의 canonical user context 방식과 같은 정보 구조로 텍스트화한다.
8. 각 `[talent × role]`을 독립적으로 평가한다.
9. 평가 결과와 pair text-context를 `talent_opportunity_fit`에 저장한다.
10. 저장 결과를 검증하고 queue row를 짧은 결론과 함께 완료 처리한다.

Pending limit은 matching만 막는다. 일주일마다 context를 새로 확인하는 목적은 유지되므로 context 갱신까지 건너뛰지 않는다.

## 8. 신규 후보와 재평가 후보

### 8.1 신규 후보

Codex가 role마다 SQL을 새로 작성한다. 고정 keyword query 하나를 모든 role에 재사용하지 않는다. SQL은 후보 목록을 만드는 retrieval 단계이며, SQL rank를 fit 점수로 사용하지 않는다.

신규 lane은 해당 role의 `talent_opportunity_fit`이 아직 없는 talent를 대상으로 한다. 이미 같은 role의 연결 흐름에 들어갔거나 명시적으로 종료된 pair를 새 후보처럼 다시 만들지 않는다.

한 run의 신규 lane은 SQL 순서대로 최대 150명을 scan하고, 안전 제외를 통과한 최대 100명을 full-text 평가한다. SQL 결과가 100명 이하이면 제외되지 않은 전원을 평가하며 임의로 더 작은 상한을 두지 않는다. Scan된 수, 제외된 수, 실제 평가한 수를 결과에서 서로 구분한다.

### 8.2 기존 평가의 재사용과 재평가

기존 label별 기본 정책은 다음과 같다.

| Effective label | 반복 run 처리 |
| --- | --- |
| `fit` | 자동 재평가에서 제외 |
| `hold` | 마지막 실제 평가 후 21일 이상 지났을 때 재평가 pool에 포함 |
| `ambiguous` | 마지막 실제 평가 후 21일 이상 지났을 때 재평가 pool에 포함 |
| `dissatisfied` (40~59) | 자동 후보 검색과 자동 재평가에서 제외 |
| `unfit` (0~39) | 자동 후보 검색과 자동 재평가에서 제외 |

`effective label`은 human override가 있으면 human label, 없으면 model label이다. Human override는 이 run이 덮어쓰지 않는다.

재평가 SQL은 effective label이 `hold` 또는 `ambiguous`이고 `last_evaluated_at <= now() - interval '21 days'`인 pair만 반환한다. 이 조건은 candidate packet 이후가 아니라 SQL 결과 단계에서 적용한다. Effective `fit`은 input 변화 여부와 무관하게 이 반복 재평가에서 제외한다.

재평가 후보 순서는 신규 후보와 같은 role-specific evidence와 같은 최종 `ORDER BY`로 정한다. `hold`를 `ambiguous`보다 먼저 두거나 단순히 오래된 평가부터 정렬하지 않는다. Rank는 누구부터 다시 볼지를 정할 뿐 새 label이나 score를 대신하지 않는다.

코드는 due pool을 rank 순으로 scan하면서 talent, role, company, context, evaluator의 fingerprint를 비교한다. 모두 같으면 기존 결과를 그대로 재사용하고 실제 재평가 수에 포함하지 않는다. Fingerprint가 달라 candidate index에 들어온 pair는 full-text로 다시 평가하며 별도의 `non_matching_change` 판단으로 일괄 skip하지 않는다.

동일 fingerprint를 제외하고 재평가할 pair가 10명 이상이면 rank 순으로 최소 10명을 평가한다. 한 run의 최대 실제 재평가는 50명이다. 대상이 10명 미만이면 남은 전원만 평가하는 것이 정상이며, 50명을 넘는 대상은 다음 run으로 넘긴다.

## 9. 후보 텍스트와 pair 평가

후보 텍스트는 `harper_worker/opp/utils/internal_fit.py`의 internal fit 입력을 기준으로 삼는다. 가능한 한 같은 projection과 normalization helper를 재사용하고 별도의 축약 프로필 규격을 새로 만들지 않는다.

같은 프롬프트의 recommend-first 원칙도 따른다. 후보가 새 역할을 사전에 알고 role-specific 의향을 표시한 기록은 `fit`의 필수 조건이 아니다. 회사-side bar를 통과하고 일반적인 직무·레벨·지역·근무형태 선호 및 최근 행동과 충돌하지 않으며 보여 줄 가치가 있으면 `fit`이 가능하다. 알려진 선호가 적다는 이유만으로 `ambiguous`로 내리지 않고 candidate-preference 점수를 낮춘다. `ambiguous`는 수행 근거나 상호 적합 근거가 실제로 불완전·혼재됐을 때 사용한다.

최소 포함 정보:

- canonical profile, resume, experience, education, skill
- matching preference와 명시적 제약
- talent Behavior Context와 현재 interaction delta
- 최근 추천 수락·거절·무응답 등 관련 행동
- 현재 role에 대한 기존 progress와 fit이 있다면 그 상태
- 최신 회사·role 정보, request, criteria, 이번에 갱신한 context

평가는 모든 후보를 한 문서에서 상대 비교하는 방식이 아니라 pair별로 한다. 저장 결과는 다음을 포함한다.

- `score`, `label`
- `reason`: 이 pair의 재사용 가능한 짧은 text-context. 적합 근거, 중요한 불일치, 불확실성을 설명한다.
- `reevaluation_criteria`: `hold`일 때만 필요한 구체적 확인 정보
- 해당되는 `company_criteria_evaluations`
- run ID와 talent/role/context fingerprint

`reason`은 raw profile 요약이 아니다. 다음 run이 입력 변화의 영향 여부를 판단하고 사람이 결과를 이해할 수 있을 정도의 평가 기억이다.

## 10. 저장 순서

1. Role별 current context text 하나를 `company_behavior_contexts`에 저장한다. 이 table은 `role_id`, `text_context` 두 column만 가진다.
2. 이번 run에서 실제로 평가한 pair만 `talent_opportunity_fit`에 upsert한다.
3. Queue `result`에 context 변화 여부, skip 이유, 평가 count와 한두 문장의 결론을 저장한다.

Fit 단계가 실패해도 이미 저장한 올바른 context를 되돌리지 않는다. 재시도에서는 같은 context가 unchanged임을 확인한 뒤 미완료 matching부터 이어갈 수 있어야 한다.

이 run은 연결 가능한 후보를 식별하고 durable fit을 만드는 데서 끝난다. 후보자에게 메시지를 보내거나 회사에 자동 공유하는 것은 별도의 downstream 흐름이다.

## 11. 코드와 Codex의 책임 경계

| 코드로 고정할 것 | 매 run에서 Codex가 판단할 것 |
| --- | --- |
| Trigger 판정과 enqueue | 새 evidence가 현재 회사 판단을 어떻게 바꾸는지 |
| Atomic claim, 중복 방지, retry | Context 문장의 추가·수정·삭제 |
| Role active 여부와 pending count | Role별 retrieval SQL 작성과 결과 점검 |
| Evidence fetch와 실행 중 source drift 검증 | 신규·재평가 SQL의 role별 rank evidence 설계 |
| 재평가 label·21일·fingerprint 제외와 lane별 cap | 후보별 상호 적합도, label, score, reason |
| Candidate packet 생성과 canonical projection | Run의 짧은 결론 작성 |
| Context·fit·run result의 검증된 write |  |

Due 여부, pending limit, 중복 실행, 같은 fingerprint skip처럼 결정적인 조건을 prompt에 맡기지 않는다. 반대로 회사 행동의 의미, 좋은 검색 SQL, pair 적합도처럼 role마다 달라지는 판단을 좁은 규칙과 고정 keyword로 대체하지 않는다.

## 12. 기존 초안에서 폐기하는 결정

이 문서는 이전 `company-role-behavior-context-recurring-matching-plan-ko.md`의 다음 결정을 대체한다.

- DB queue를 금지하고 로컬 artifact를 실행 원장으로 쓰는 구조
- 비활성 72시간 후 재개 trigger
- 회사 context와 role context를 별도 current 문서로 유지하는 구조
- 매 run 문서에 migration·test 절차를 반복해서 싣는 구성
- 목적보다 privacy·fairness·artifact 보관 규칙을 앞세운 구성

현재 구현은 `company_context_runs`를 실행 원장으로 사용한다. 이전 local-ledger table과 72시간 재개 trigger는 corrective migration에서 제거되며 예약 실행에서도 더 이상 참조하지 않는다.

## 13. 완료 기준

- `is_auto=true`인 새 role, 7일 이상 비활성 후 재개, active 7일 경과만 코드로 정확히 enqueue된다.
- Codex 예약 작업은 조건을 다시 추론하지 않고 queued role을 하나씩 atomic claim하며, 현재 claim 가능한 queue를 순차적으로 모두 처리한다.
- Role당 current context 문서 하나가 실제 회사 행동을 compact하게 verbalize한다.
- Pending limit에 도달해도 context는 갱신되고 matching만 생략된다.
- 신규 후보는 동적 SQL과 full candidate text를 거쳐 pair별로 평가된다.
- Effective `fit`, `dissatisfied`, `unfit`, 평가 후 21일 미만 pair는 재평가 SQL에서 제외된다.
- 동일 fingerprint pair는 재사용하고, 달라진 due `hold/ambiguous` pair는 가능한 경우 최소 10명·최대 50명을 같은 role rank 순으로 재평가한다.
- Pair reason과 input fingerprint가 저장되어 다음 run이 판단을 재사용할 수 있다.
- Queue row에 성공·실패와 짧은 실행 결론이 남는다.
