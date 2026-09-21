# Company-first Talent Search Worker 구현 계획

- 문서 기준: 2026-09-17
- 상태: 1차 local 구현과 한 개 positive production read-only shadow 검토 완료. Migration 적용, production
  배포, v2 frozen gold와 서로 다른 회사·직군 3곳 shadow gate는 아직 완료하지 않았으며 이 문서는
  production 동작 완료를 뜻하지 않는다.
- 범위: 회사 단위 예약 실행, search 여부 판단, 동적 SQL retrieval, scoring, 회사 전체 reranking,
  company-safe 설명 작성, `company_intro_candidates/ready` 반영과 회사 Slack 전달
- 제품 lifecycle 정본: [회사 선확인 후보자 추천 · 먼저 제안하기 구현 기획](./company-first-talent-recommendation-product-plan-ko.md)
- 과거 수동 calibration: [회사 선확인 후보자 선정 Codex 런북](./company-first-talent-recommendation-codex-runbook-ko.md)
- 관련 Worker 설계: [Talent Memory · Search Brief 최종 설계](../talent-unified-memory-implementation-plan-ko.md)

## 1. 결론

Company-first 후보 선정은 더 이상 Codex Scheduled task가 문서를 읽고 매번 직접 수행하는 작업으로
설계하지 않는다. `harper_worker`의 Python runtime이 매주 월요일 오전 9시 KST에 회사를 queue에 넣고,
회사 하나를 한 실행 단위로 처리한다.

한 번의 실행은 다음 순서다.

```text
월요일 09:00 KST scheduler
  → 대상 회사와 Role을 deterministic하게 확정
  → 회사 단위 run enqueue
  → 현재 상태 재검증과 source cutoff 고정
  → query planner가 이번 search의 실행 여부·탐색 가설·Role별 SQL 작성
  → read-only SQL로 회사 전체 최대 100/150/200명 retrieval
  → privacy·route·응답 가능성 hard filter
  → Talent 한 명과 회사의 전체 대상 Role을 함께 pointwise scoring
  → 회사 전체 후보·Role을 한 번에 reranking
  → Role별 최대 3명 또는 0명 선택, 회사 안에서 Talent 중복 금지
  → 선택된 사실만으로 company-safe reason과 Slack message 작성
  → ready ledger와 durable delivery outbox를 transaction으로 저장
  → 기존 company Slack delivery 경계로 멱등 발송
```

핵심 원칙은 네 가지다.

1. 실행 단위는 Role이 아니라 회사다. 같은 Talent가 같은 회사의 여러 Role에 중복 추천되는 일을 최종
   rerank에서 막고, 더 적절한 대표 Role 하나를 고르기 위해서다.
2. candidate-first와 company-first는 fit의 높고 낮음이 아니라 **누가 먼저 판단할 때 불확실성이 더 잘
   해소되는가**의 차이다.
3. query planner는 매 run마다 탐색 가설과 SQL을 바꿀 수 있지만, privacy·권한·route uniqueness·test-only·
   backlog·pending capacity는 Python과 DB가 강제한다.
4. 최대 인원은 채워야 할 quota가 아니다. 강한 후보가 없으면 search, scoring, reranking을 모두 정상적으로
   마치고 0명을 선택한다.

### 1.1 현재 local 구현 위치

- Worker pipeline: `harper_worker/opp/company_first_search/`
- Worker entrypoint: `harper_worker/company_first_worker.py`
- Worker·scheduler service unit: `harper_worker/harper-company-first-worker.service`,
  `harper_worker/harper-company-first-scheduler.service`
- DB migration: `harper_beta/supabase/migrations/20260917162551_company_first_talent_search.sql`
- Slack outbox delivery: `harper_beta/src/app/api/internal/company-first/deliver/route.ts`
- Read-only shadow runner: `harper_worker/llm_evals/company_first_talent_selection/run_shadow.py`

현재 구현은 회사 단위 queue부터 `ready` ledger와 Slack outbox까지다. `/org`의 먼저 제안하기·제안하지 않기 UI와
후보자 연락/수락/연결 lifecycle은 제품 lifecycle 문서의 별도 구현 범위다. 그 UI 없이 Worker를 production
enable하면 Slack의 검토 링크가 완결되지 않으므로, migration이나 service 설치만으로 rollout하지 않는다.

## 2. 기존 구현에서 재사용할 것과 재사용하지 않을 것

### 2.1 재사용할 구현 원칙

| 기존 구현 | 가져올 원칙 |
| --- | --- |
| Opportunity Worker external search | `query plan → retrieval → pointwise scoring → listwise rerank` 분리, LLM call 설정 중앙화, bounded retry, trace·usage 기록 |
| People Search | LLM이 recall-first SQL을 만들고, Python이 single read-only SELECT·table allowlist·timeout·LIMIT를 강제하며 실패 시 제한적으로 repair하는 방식 |
| Internal fit evaluator | 한 Talent를 평가할 때 한 회사의 여러 Role을 함께 보여 주고, Role variant를 company 단위로 비교하는 방식 |
| External scorer | 여러 독립 scoring call을 제한된 동시성으로 실행하고, DB transaction을 닫은 뒤 외부 LLM을 호출하는 방식 |
| External reranker | pointwise score만으로 확정하지 않고 compact 후보군을 listwise로 다시 판단하며, schema 실패 시 fail closed하는 방식 |
| Talent context loader | Profile + 전체 Search Brief + 같은 version의 Behavior Context를 downstream 단계 전체에서 재사용하는 방식 |
| Reply confidence | `0/LOW`만 자동 제외하고 `2/HIGH`는 작은 tie-break로만 쓰며, 수락과 거절을 같은 reply 신호로 보는 방식 |
| Company Slack | active integration·enabled channel·Role opt-out을 존중하고 idempotency key와 `/org` 대화 기록을 남기는 방식 |

### 2.2 그대로 재사용하지 않을 것

- 기존 Codex run의 raw SQL·local artifact를 production runner로 사용하지 않는다.
- `candid`와 People Search용 LinkedIn/Scholar/GitHub 테이블을 검색 원본으로 사용하지 않는다. 이번 기능은
  Harper 사용자이므로 canonical `talent_*` 테이블만 사용한다.
- 기존 `talent_opportunity_fit.recommend=true`를 company-first 선정 결과로 취급하지 않는다. 이는
  candidate-first 적합성 판단이고 실제 발송 사실도 아니다.
- 기존 fit reason을 회사 설명으로 그대로 복사하지 않는다. private preference나 candidate interest를
  포함할 수 있기 때문이다.
- Candidate-first delivery와 company-first ready를 동시에 만들지 않는다.
- 기존 Company Context Run의 Role별 Codex queue를 새 Worker queue로 억지로 재사용하지 않는다. 새 run은
  회사 단위이며 이전 실행 결과 자체가 다음 planner의 통계 입력이므로 독립 원장이 필요하다.

## 3. Candidate-first와 Company-first의 관계

### 3.1 두 경로가 답하는 질문

| 경로 | 먼저 답할 질문 | 기본적으로 알맞은 상황 |
| --- | --- | --- |
| Candidate-first | “이 후보자가 이 기회를 먼저 볼 가치가 있는가?” | 후보자 관점의 매력이 충분히 선명하고 회사 검토 전에 후보자 의사를 물어도 됨 |
| Company-first | “회사가 먼저 관심과 조건을 확인하면 이 연결의 가능성이 커지는가?” | 회사 적합성은 강하지만 후보자 관심이 덜 선명하거나, 회사가 level·scope·보상·근무 조건을 열 수 있음 |

Company-first는 candidate-first에서 탈락한 사람의 배출구가 아니다. 강한 fit도 company-first가 될 수 있고,
`recommend=false`나 애매한 fit도 그대로는 company-first가 될 수 없다.

### 3.2 A/B/C fit을 읽는 기본 방향

현재 axis 이름과 값은 그대로 사용한다.

- A `roleFit`: `fit | hold | ambiguous | unfit`
- B `candidateFit`: `fit | middle | unfit`
- C `companyFit`: `fit | ambiguous | unfit`

초기 company-first rerank 후보의 구조적 하한은 다음과 같다.

```text
roleFit = fit
candidateFit ∈ {fit, middle}
companyFit ∈ {fit, ambiguous}
```

이 하한을 통과했다고 선택되는 것은 아니다. LLM은 최신 원문으로 다시 판단하고, 아래를 route prior로
사용한다.

| 조합 | 기본 해석 |
| --- | --- |
| A fit · B middle · C fit | 대표적인 company-first 후보. 회사 쪽 가치는 강하지만 후보자 관심을 회사 신호로 보강할 가치가 있음 |
| A fit · B fit · C fit | candidate-first가 기본. 회사가 먼저 열어 줄 구체적인 조건이나 비전형 경력 판단 가치가 있을 때만 company-first 가능 |
| A fit · B fit/middle · C ambiguous | 탐색적으로 가능하지만, 회사가 실제로 판단할 구체적인 upside가 없으면 선택하지 않음 |
| A가 fit 아님, B/C가 unfit | 자동 company-first로 선택하지 않음 |

이는 몇 가지 예시를 코드 분기로 만드는 뜻이 아니다. Axis 하한만 machine guard이고, 실제 route는 최신
Profile·Brief·Behavior Context·Role·회사 context를 읽은 reranker가 의미로 판단한다.

### 3.3 `recommend`와 실제 추천을 구분한다

- `talent_opportunity_fit.recommend=true`: 과거 evaluator가 candidate-first로 추천할 만하다고 판단한 값
- `talent_opportunity_recommendation`과 confirmed delivery: 후보자에게 실제 기회가 생겼거나 전달된 사실
- `company_intro_candidates/ready`: 회사에 먼저 실제로 보여 준 사실

`fit.recommend=true`만으로 retrieval에서 제외하지 않는다. 그렇지 않으면 좋은 후보가 모두 빠져 회사에는
애매한 사람만 남는다. 반대로 candidate-visible recommendation이나 active candidate-origin progress가
이미 있으면 actual route conflict이므로 hard exclude한다.

### 3.4 동시에 두 경로가 생기지 않게 하는 방법

Selection 시작 시 조회만으로 race를 막을 수 없다. 최종 ready insert와 candidate-first recommendation
생성 경로가 같은 transaction coordinator를 사용해야 한다.

1. workspace–Talent와 Role–Talent 기준 transaction lock을 잡는다.
2. 같은 회사의 exact 또는 실질적으로 같은 sibling Role에 active recommendation, candidate request,
   pipeline, progress, intro가 없는지 다시 확인한다.
3. company-first가 이기면 `company_intro_candidates/ready`를 insert한다.
4. candidate-first 생성 경로도 ready ledger를 같은 방식으로 검사한다.
5. Rerank 이후 candidate-first가 먼저 생겼다면 해당 pair는 이번 run에서 제외한다. 빈 slot을 약한 후보로
   자동 보충하지 않는다.

별도 “LLM route 판단” 테이블은 만들지 않는다. 실제 ready 또는 recommendation만 durable route이고,
중간 판단은 run trace다.

## 4. 예약 실행과 대상 회사

### 4.1 시각과 enqueue

- 기준 timezone: `Asia/Seoul`
- 정기 실행: 매주 월요일 오전 9시 KST
- 별도 `harper-company-first-scheduler` process가 이 queue의 enqueue만 담당한다.
- 실제 company run은 별도 `harper-company-first-worker` Python process가 claim한다.
- 초기에는 consumer 1개로 시작한다. Queue는 `FOR UPDATE SKIP LOCKED`와 lease를 지원해 나중에 안전하게
  scale-out할 수 있게 한다.

Company-first run을 기존 여섯 Opportunity Worker가 직접 소비하게 하지 않는 이유는 월요일 burst와 한
회사 내부의 병렬 scoring이 Talent 단위 discovery queue를 굶기지 않게 하기 위해서다. LLM client,
config, context loader, usage logging, shutdown·heartbeat 방식은 재사용한다.

Scheduler는 매 분 leader lock 아래에서 due slot을 확인한다. `scheduled_slot`은 해당 월요일
`09:00 KST`의 절대 시각이며 `(company_workspace_id, scheduled_slot, contract_version)` unique key로 중복
enqueue를 막는다. Catch-up window는 **월요일 09:00 이상, 화요일 00:00 KST 미만**으로 고정한다. 09:00에
process가 내려가 있었더라도 이 구간에서는 해당 slot을 한 번만 복구하고, 화요일이 되면 지난 slot과 지난
여러 주를 소급 실행하지 않는다. 수동 재실행은 새 `trigger=manual`과 `retry_of_run_id`로만 만들고 정기
slot의 unique key를 우회하지 않는다.

### 4.2 Role 자격

회사의 Role 중 아래를 모두 만족한 Role만 이번 run의 대상이다.

- 실제 internal Role
- active이고 만료되지 않음
- `company_roles.information.testOnly != true`
- `company_internal_roles.is_company_first_search = true`
- active Company Slack integration이 있음
- enabled Slack channel이 하나 이상 있고 해당 Role이 그 채널에서 opt-out되지 않음
- 현재 `연결 대기` unique Talent 수가 Role의 `max_pending_talents`보다 작음

`is_company_first_search`는 새 boolean field이며 default는 `false`다. 기존 `is_auto`와 의미를 섞지 않는다.
`is_auto`는 다른 internal matching 자동화의 제어이고, 이번 search의 명시적 opt-in은 새 field가 담당한다.

`max_pending_talents`가 6이고 현재 pending이 6이면 capacity가 이미 찬 상태이므로 실행하지 않는다. 즉,
코드 조건은 `current_pending >= max_pending_talents`다. 회사에 여러 Role이 있으면 포화 Role만 제외하고,
하나라도 남으면 그 회사 run은 계속할 수 있다. 값이 `null`이면 기존 pending gate와 같이 상한 없음으로
해석한다.

### 4.3 회사 단위 hard skip

다음은 LLM 호출 전에 Python이 전체 회사를 skip한다.

- 자격을 만족하는 Role이 0개
- Mistral, Sierra, Wonderful에 해당하는 exact workspace ID
- 회사가 피드백하지 않은 company-first 카드가 30명 이상
- 같은 schedule slot의 queued/running/succeeded run이 이미 존재
- active Slack integration 또는 전달 가능한 channel이 없음

제외 회사는 이름 문자열 비교로 판정하지 않는다. 배포 환경의
`COMPANY_FIRST_SEARCH_EXCLUDED_WORKSPACE_IDS`에 확인된 workspace UUID를 넣고, 이름은 운영 문서의 설명으로만
남긴다. Rename이나 동명 회사가 안전 경계를 바꾸면 안 된다.

“피드백하지 않은 카드”는 `company_intro_candidates.status='ready'`인 unique Talent다. 회사가
`먼저 제안하기`를 누른 `awaiting_talent`는 회사 피드백이 이미 있었으므로 30명 계산에서는 제외하지만,
active route uniqueness와 후보자 연락 피로도에는 계속 포함한다.

## 5. Durable 상태와 queue

### 5.1 `company_first_search_runs`

새 run table은 transient LLM 판단을 영구 저장하려고 만드는 것이 아니다. 다음 사실은 다른 테이블에서
복구할 수 없고 다음 planner, retry worker, 운영 화면이 실제로 읽으므로 별도 persistence가 필요하다.

- 어느 회사가 어느 월요일 slot에 실행됐는가
- 실행 당시 대상 Role과 source cutoff는 무엇이었는가
- search를 실행하거나 생략한 이유는 무엇인가
- 몇 명을 retrieval·filter·score·rerank·select했는가
- Slack delivery가 성공했는가, 재시도가 필요한가

권장 필드군:

| 필드군 | 값 |
| --- | --- |
| 식별 | `id`, `company_workspace_id`, `scheduled_slot`, `trigger`, `contract_version` |
| queue | `status`, `available_at`, `lease_token`, `lease_heartbeat_at`, `attempt_count` |
| snapshot | current attempt의 `source_cutoff`, 대상 `role_ids`, source fingerprint, compact attempt history |
| 판단 | compact `query_plan` JSON |
| 결과 | counts, skip/failure reason, selected ledger ids, delivery receipt를 담은 compact `result` JSON |
| 시간 | `started_at`, `selection_committed_at`, `completed_at`, `created_at`, `updated_at` |

Candidate resume, Search Brief 원문, Behavior Context 원문, raw conversation, raw LLM output은 이 table에 넣지
않는다. 필요한 private trace는 ignored run directory에 owner-only 권한으로 보존한다.

### 5.2 상태

Queue state는 실행·재시도에 필요한 최소 machine contract만 둔다.

```text
queued → running → succeeded
                 → skipped
                 → delivery_pending → succeeded
                 → failed
```

- `skipped`: hard gate 또는 planner의 정상적인 `runSearch=false`
- `delivery_pending`: ready ledger와 outbox는 commit됐으나 Slack delivery가 아직 끝나지 않음
- `failed`: retry budget을 소진한 infrastructure/schema/provider 실패
- 후보 0명은 `succeeded`이며 실패가 아니다.

Worker는 running 동안 heartbeat를 갱신한다. Lease가 stale하면 recovery가 같은 run을 재개하고, 이미
생성된 ledger와 outbox는 idempotency key로 다시 만들지 않는다. SIGTERM에서는 새 run을 claim하지 않고
현재 run의 안전한 boundary까지 drain한다. 긴 run을 `SIGKILL`로 끝내는 stop timeout을 두지 않는다.

### 5.3 `company_intro_candidates`와 Slack outbox

Selection 결과는 제품 lifecycle 정본인 `company_intro_candidates/status=ready`로 저장한다. Run row만으로
board를 재구성하지 않는다.

최종 commit transaction은 다음을 함께 수행한다.

1. live guard를 다시 수행한다.
2. selected pair의 ready ledger를 insert한다.
3. 회사에게 실제 보일 `selection_reason`과 작은 versioned presentation snapshot을 저장한다.
4. exact Slack text/blocks와 idempotency key를 durable outbox에 seal한다.
5. run을 `delivery_pending`으로 바꾼다.

그 뒤 delivery service가 기존 `sendHarperWorkspaceSlackMessage` 경계를 통해 발송하고 receipt를 저장한다.
Python에서 회사별 encrypted Slack token 처리와 `/org` conversation 저장을 새로 복제하지 않는다. 구현 시
`harper_beta`에 service-authenticated internal delivery endpoint 또는 동등한 queue consumer를 두고 기존
Slack helper를 호출한다.

DB commit 후 Slack이 실패해도 ready 카드는 `/org`에 남고 같은 outbox만 재시도한다. Slack 성공 뒤 DB
응답 저장 직전에 process가 죽는 작은 window는 Slack의 stable `client_msg_id`와 outbox idempotency key로
중복 가능성을 최소화하고, receipt가 있으면 다시 `chat.postMessage`하지 않는다.

### 5.4 DB 노출과 권한 경계

새 table과 RPC가 `public` schema에 있다는 이유로 browser client나 Supabase Data API에 자동 노출된다고
가정하지 않는다. 각 object의 reader와 writer를 먼저 정하고 migration에서 privilege를 명시한다.

- `company_first_search_runs`와 delivery outbox는 Worker와 internal delivery service만 읽고 쓴다.
  `anon`, `authenticated`, `PUBLIC` 권한은 주지 않으며 일반 client용 RLS policy도 만들지 않는다.
- `company_intro_candidates`는 회사 사용자가 raw row를 직접 조회하지 않는다. `/org` server가 workspace
  membership과 현재 privacy를 다시 확인한 redacted projection만 반환한다.
- Browser에서 반드시 직접 읽어야 하는 object가 생기면 RLS를 켜고 exact workspace membership policy와
  column-safe projection을 함께 추가한다. Service-role client를 browser에 전달하지 않는다.
- `SECURITY DEFINER` transaction RPC가 필요하면 fixed `search_path`, schema-qualified object, 입력 UUID와
  workspace membership 검증을 사용하고 `PUBLIC` execute를 revoke한다. 호출 주체에 필요한 최소 role만
  명시적으로 grant한다.
- LLM SQL executor는 application write connection이나 Supabase transaction-pool URL을 재사용하지 않는다.
  기존 `connect_read_only_database()` 계열의 dedicated session connection과 매 transaction의 검증된
  read-only barrier를 사용한다.

Migration test는 table 존재뿐 아니라 `anon`·`authenticated`가 run/outbox를 읽거나 쓸 수 없는지,
redacted reader가 다른 workspace와 현재 비공개 Talent를 반환하지 않는지까지 검사한다.

## 6. Source cutoff와 입력 snapshot

Run attempt가 시작하면 `source_cutoff`를 UTC로 한 번 고정한다. 모든 “최근”, “지난 run 이후”, “새로
가입” event는 이 시각 이하만 읽는다. 실행 중 들어온 event는 다음 attempt 또는 다음 run으로 넘긴다.
외부 LLM call 동안 DB transaction을 열어 두거나 장시간 repeatable-read snapshot을 유지하지 않는다.

Planner에는 서로 다른 두 기준점을 제공한다.

- `previous_terminal_run`: 가장 최근 `succeeded` 또는 `skipped` run. 직전 판단과 주간 변화량을 설명한다.
- `previous_search_run`: planner가 실제 retrieval을 시작한 가장 최근 run. 여러 번 연속 skip했을 때 그 사이
  누적된 신규·갱신 Talent와 미탐색 pool을 놓치지 않게 한다.

“직전 run 이후”와 “마지막 실제 search 이후” 통계를 모두 만들며 둘을 같은 cursor로 합치지 않는다. 첫
run이면 두 값 모두 없다고 명시하고 최근 90일 bootstrap window를 사용한다.

`source_cutoff`는 event window의 상한이지 모든 mutable row의 역사적 DB snapshot을 뜻하지 않는다. 현재
Profile, Role, Brief, visibility 같은 durable state는 각 stage 직전 다시 읽고 fingerprint로 비교한다.
Planner SQL에도 created/updated event를 사용할 때 cutoff parameter를 바인딩하며, LLM이 timestamp literal을
직접 만들게 하지 않는다.

다음 fingerprint를 남긴다.

- company workspace와 eligible Role ids
- Role availability, JD, Hiring Brief, criteria, work mode, location, compensation의 hash
- Role별 `company_behavior_contexts` version/hash
- selected Talent별 Profile, Search Brief version, same-version Behavior Context version/hash
- Talent context loader contract version
- reply confidence policy version
- prompt contract version과 model configuration

최종 ready commit 직전에 Role·Talent·route의 현재성을 다시 확인한다. Role request·availability 또는
selected Talent의 Profile·Brief·Behavior input이 바뀌어 fingerprint가 달라진 pair는 제외한다. 이미 끝난
LLM 판단을 새 source에 억지로 적용하지 않고 다음 run 또는 명시적 manual retry를 기다린다.

Ready/outbox commit 전 Worker가 죽으면 host-local private trace를 복구 정본으로 믿지 않는다. 같은 run의
새 attempt가 source cutoff와 fingerprint를 새로 고정하고 side effect가 없는 planner·retrieval·scoring·
rerank를 다시 수행한다. Ready/outbox가 한 번 commit된 뒤에는 selection을 다시 실행하지 않고 sealed
outbox delivery만 재시도한다. Run에는 `attempt_count`, attempt별 cutoff/hash, `selection_committed_at`을
남겨 이 경계를 판별한다.

모든 LLM stage의 input은 제목과 bullet이 있는 text document로 serialize한다. Python dict나 DB JSON을
그대로 dump하지 않는다. JSON은 machine validation이 필요한 **출력 contract**에만 사용한다. 같은 의미의
Profile, Brief, Behavior, Role 문장은 stage마다 서로 다른 key 이름으로 재구성하지 않고 versioned serializer를
공유한다.

## 7. Query planner가 읽는 데이터

Planner input은 DB row JSON dump가 아니라 섹션이 분명한 텍스트 packet으로 만든다. ID는 검증을 위해
포함하되, boolean·enum·timestamp를 사람이 읽을 수 있는 의미로 바꾼다.

### 7.1 회사와 Role

- 회사 이름과 compact description
- 대상 Role 전체의 exact id, 이름, location, work mode, seniority, employment type
- JD 또는 공유 source Role과 variant 차이
- `company_internal_roles.request` 전체 Hiring Brief
- optional structured criteria
- Role별 최대 10개 `company_behavior_contexts` bullet과 version
- 최근 회사의 후보 피드백, 명시적 이유, 대화·Slack·메모에서 나온 matching-relevant evidence의 compact
  summary

새로운 company-side evidence collector를 따로 만들지 않고 Company Context Run이 이미 수집하는 source와
actor 판정을 공통 loader로 분리해 재사용한다. 여기에는 `/org`·Slack의 회사 발화, `company_memories`,
회사가 남긴 후보 피드백과 이유, 회사 actor가 확인된 진행·중단 기록이 포함된다. Query planner는 원문
event log 전체가 아니라 source ref가 붙은 compact evidence를 읽는다.

Incremental evidence window는 `previous_terminal_run.source_cutoff` 초과부터 이번 cutoff 이하까지다. Planner가
검색을 skip했어도 읽은 company evidence까지 다음 run에 다시 무한 반복하지 않는다. 첫 run은 현재 durable
Role 상태·Behavior Context에 최근 90일의 high-signal company evidence를 더하되, Role별 최신 20건을 넘기지
않는다. 그보다 오래된 유효한 판단은 현재 `company_behavior_contexts`로 이어 받는다. 수정·삭제된 원본을
놓치지 않도록 단순 `created_at` cursor뿐 아니라 source fingerprint를 비교한다.

회사 행동에서 추론한 context는 명시적 JD·Hiring Brief·criteria를 덮어쓰지 않는다. 단순 무응답, 이유 없는
stage 이동, actor가 불명확한 상태 변경을 회사 선호로 만들지 않는다.

### 7.2 이전 company-first 실행과 outcome

최근 여러 run을 짧은 텍스트로 제공한다. 가장 최근 terminal run과 가장 최근 실제 search run은 따로
표시한다.

- 마지막 성공 또는 skip 시각과 경과 시간
- 마지막 실제 retrieval 시각과 그 뒤 누적된 skip 수
- 당시 search strategy와 retrieval budget
- retrieved, hard-filtered, scored, reranked, selected 수
- Slack delivery 성공 여부
- 선택 후 회사가 `먼저 제안하기`, `제안하지 않기`, 미응답 중 무엇을 했는지
- 먼저 제안하기 뒤 후보자의 답장, 수락, 거절, 무응답 수
- 반복해서 검색됐지만 선택되지 않은 pool의 비율

아직 회사가 판단할 합리적 시간이 지나지 않은 최신 `ready`를 응답률의 미응답으로 세지 않는다. Planner용
outcome에는 전체 unresolved 수와 생성 후 7일이 지난 matured unresolved 수를 분리한다. 7일은
`COMPANY_FIRST_REVIEW_MATURITY_DAYS`의 초기 관찰 window이며 자동 만료 시간이 아니다. 이 값은 search
우선순위 신호일 뿐 회사를 `제안하지 않기`로 간주하거나 fit 기준을 낮추는 규칙이 아니다. `ready`의 상태 전이는
제품 lifecycle 정본만 따른다.

Raw candidate 이름과 reason 전체를 planner history에 반복 주입하지 않는다. 다음 search 결정을 바꾸는
aggregate와 짧은 결론만 넣는다.

### 7.3 현재 통계

`previous_terminal_run.source_cutoff` 이후와 `previous_search_run.source_cutoff` 이후를 각각 계산한다. 첫
run이면 최근 90일을 bootstrap window로 사용하고 `이전 run 없음 · 신규 통계 기준 최근 90일`이라고
명시한다.

최소 통계:

- 전체 active·onboarding 완료·`open_to_matches` Talent 수
- 직전 terminal run과 마지막 search 이후 각각의 계정 생성 수, onboarding 완료 수, 현재 eligible 수
- 두 기준점 이후 Profile, Search Brief 또는 Behavior Context가 갱신된 수
- Role별 pending / `max_pending_talents`
- 회사 전체 unresolved ready / 30
- 다음 세 fit bucket의 전체 수와 새 Talent 수
  - `roleFit=fit, candidateFit=middle, companyFit=fit`
  - `roleFit=fit, candidateFit=middle, companyFit=ambiguous`
  - `roleFit=fit, candidateFit=fit, companyFit=fit`이지만 actual candidate-visible route가 아직 없는 pair
- exact/sibling actual route 때문에 제외될 수
- reply confidence LOW 예상 수는 planner의 fit 판단에 쓰지 않고 실행비용 추정을 위한 aggregate로만 제공

Fit bucket은 전체 row 수만 보여 주지 않는다. 현재 Role·Talent input fingerprint와 evaluator version에 맞는
fresh count, stale count, 실제 candidate-visible route가 생긴 count를 분리한다. 오래된 fit row가 많다는
이유만으로 충분한 신규 inventory가 있는 것처럼 planner를 오도하지 않는다. “신규 Talent”는 account 생성과
onboarding 완료를 혼용하지 않고, bucket의 신규 수는 현재 eligible이면서 해당 기준점 뒤 onboarding을
완료한 Talent로 계산한다.

세 bucket은 관찰용이지 SQL template이나 선택 rule이 아니다. Planner는 실제 Role에 맞게 다른 profile
signal을 SQL에 사용할 수 있다.

### 7.4 날짜를 텍스트화하는 계약

LLM에는 raw epoch, timezone 없는 timestamp, 긴 ISO microseconds를 그대로 넣지 않는다. 기존 Worker의
`current_date_for_llm`, `compact_datetime_for_llm`, `readable_datetime_for_llm` 의미를 재사용한다.

예:

```text
현재 기준: 2026-09-17 09시 KST
이전 성공 run: 2026-09-14 09시 KST (3일 전)
마지막 회사 피드백: 2026-09-16 16시 KST (17시간 전)
이전 run: 없음
```

Date-only 값은 `YYYY-MM-DD`, 시각은 분 또는 시 단위 KST로 통일한다. 상대 시간만 주지 않고 절대 시각을
항상 함께 준다. Python이 계산한 경과를 제공하며 LLM에게 날짜 산술을 맡기지 않는다.

## 8. Stage 1 — Query plan

### 8.1 한 번의 company-level 호출

Planner는 Role마다 따로 호출하지 않는다. 한 회사의 대상 Role, 회사 evidence, run history, 현재 통계를
한 번에 보고 다음을 결정한다.

1. 이번 주에 expensive search를 수행할 기대가 있는가
2. 있다면 무엇을 이번 run의 탐색 가설로 둘 것인가
3. 회사 전체 unique Talent retrieval budget을 100, 150, 200 중 무엇으로 할 것인가
4. 각 Role의 recall-first SQL을 어떻게 쓸 것인가

`이번에는 꼭 3명을 줘라` 같은 전략을 세울 수는 있지만, 이는 탐색을 넓히라는 의미이지 약한 후보를
선택하라는 quota가 아니다. `연차가 짧은 사람도 보자`도 최신 Hiring Brief와 회사 evidence가 그
trade-off를 허용할 때만 가능하다.

### 8.2 출력 contract

```json
{
  "runSearch": true,
  "reason": "왜 지금 다시 검색할 가치가 있는지",
  "searchStrategy": "이번 run에서 달리 볼 범위와 trade-off",
  "retrievalBudget": 150,
  "roleQueries": [
    {
      "roleId": "exact-role-uuid",
      "sql": "SELECT ... AS talent_id ..."
    }
  ]
}
```

Machine-consumed field는 이 정도로 제한한다. `runSearch=false`이면 `roleQueries=[]`이고 정상 skip한다.
`retrievalBudget`은 회사 전체 unique Talent hard cap이며 `{100, 150, 200}`만 허용한다. 초기 default는
150이다. 작은 변화 확인은 100, 일반 탐색은 150, 신규 pool이나 명확한 exploration이 큰 경우 200을
권장한다.

모든 eligible Role은 정확히 한 query를 반환해야 한다. 누락·중복·다른 회사 Role id는 schema error다.
SQL은 `talent_id` 하나를 반드시 반환한다. 검색 이유 같은 LLM 문구를 row마다 생성해 DB에서 가져오지
않는다.

### 8.3 Planner prompt 계약

```text
당신은 Harper의 company-first talent search planner다.

목표:
- 이번 회사에서 지금 다시 사람을 찾아볼 기대가 있는지 판단한다.
- 실행한다면 각 Role에 대해 recall-first SQL을 작성한다.
- 좋은 후보를 회사가 먼저 판단할 별도 가치가 있는 pool을 넓게 가져온다.

판단 원칙:
- 결과가 0명이어도 정상이다. 선택 quota를 만들지 않는다.
- 기존 candidate-first actual route를 빼기 위해 좋은 후보 자체를 SQL에서 제거하지 않는다.
  실제 route와 privacy는 Python이 최신 상태로 필터한다.
- `recommend=false`, 애매한 fit, 낮은 연차만을 위한 검색이 되지 않게 한다.
- 명시적 Role 기준이 허용하지 않는 완화를 회사의 빠른 피드백만으로 만들지 않는다.
- query는 제공된 talent table과 column만 사용한다.
- 각 query는 broad candidate id retrieval만 담당하고 최종 적합성을 판정하지 않는다.

출력:
- 제공된 JSON schema만 반환한다.
- 입력에 있는 exact Role id만 복사한다.
```

### 8.4 모델

초기 모델 계열은 기존 external search planner를 따르되, Role별 SQL을 함께 만드는 이 단계의 반복적인
schema 오류를 줄이기 위해 sampling과 출력 한도는 실제 shadow 결과에 맞게 좁힌다.

- primary: `openrouter:z-ai/glm-5.3-flash`
- reasoning effort: `high`
- temperature: `0.4`
- max tokens: `32768`
- primary transport/JSON 실패 시 `GPT-5.6 Luna`로 한 번 fallback

`131072`를 그대로 썼을 때 fallback 모델의 completion 한도 `128000`을 넘어 repair 자체가 400으로 실패했다.
Planner의 실제 출력은 수천 token이므로 현재 `32768`로 제한한다. Scorer도 provider 한도 안에서
`16384`를 사용한다.

새 call name과 environment override를 `opp/new_config.py`에 둔다. 실제 provider·model·reasoning·temperature·
prompt version은 run manifest와 usage log에 남긴다. 모델 변경은 같은 frozen eval set의 새 run이지 dataset
또는 gold 덮어쓰기가 아니다.

## 9. 동적 SQL 안전 계약

### 9.1 허용 source

초기 allowlist는 실제 schema 확인 후 아래 계열로 제한한다.

- `talent_users`
- `talent_setting`
- `talent_experiences`
- `talent_educations`
- `talent_extras`
- `talent_contexts`
- `talent_behavior_contexts`
- `talent_opportunity_fit`

Raw `talent_messages`, Memory 원문, email body, candidate-side private conversation을 query SQL이 직접 훑게
하지 않는다. Search Brief는 `talent_contexts`, 추천용 파생 signal은 versioned
`talent_behavior_contexts`, 경력은 canonical profile table을 사용한다. `candid`와 People Search source는
금지한다.

### 9.2 validator와 DB sandbox

기존 People Search의 방식을 출발점으로 삼되 production `talent_*` 접근이므로 더 강하게 만든다.

- SQL parser AST 기준 single statement `SELECT` 또는 read-only CTE만 허용
- INSERT/UPDATE/DELETE/MERGE/COPY/DDL, data-modifying CTE, system catalog, extension call 금지
- table·schema·function allowlist
- `SELECT *` 금지
- 반환 column은 UUID-compatible `talent_id` 하나
- stable `ORDER BY`와 마지막 `talent_id` tie-break 요구. 정렬이 없거나 non-deterministic function을 쓰면
  validation 실패
- planner가 쓴 LIMIT은 제거하고 Python이 `SELECT talent_id FROM (...) LIMIT %s` 형태의 hard LIMIT 적용
- `COUNT(*)`는 허용하되 row `SELECT *`는 금지하고, CTE·derived table alias는 그 relation이 실제 project한
  column만 참조할 수 있음
- psycopg named parameter binding 전에 `LIKE/ILIKE '%...%'`의 literal percent만 escape하고 검증된 세 runtime
  placeholder는 유지함
- 기존 Worker의 dedicated non-pooling session 연결과 read-only DB role 재사용
- transaction 첫 statement에서 read-only barrier를 적용하고 `SHOW transaction_read_only`로 `on` 확인
- schema-qualified allowlist와 fixed `search_path` 사용
- 짧은 `statement_timeout`과 `lock_timeout`
- query별 별도 connection/transaction, 실패 후 명시적 rollback
- 실행 전에 `EXPLAIN` 또는 cost guard를 적용하되 실제 data 내용을 LLM에 돌려주지 않음

Regex validator 하나만 안전 경계로 사용하지 않는다. Parser validation과 제한된 DB 권한을 함께 둔다.
Validator가 issue를 반환했는데 log만 남기고 실행하는 경로도 허용하지 않는다. Validation false는 DB 실행
전 repair 또는 fallback으로만 이동한다.

Exploration 순서가 필요하면 `random()`을 쓰지 않고 Worker가 제공한 `scheduled_slot` seed와 `talent_id`의
deterministic hash를 허용된 expression으로 사용한다. 같은 run을 재현할 수 있으면서 다음 주에는 다른
후보를 볼 수 있어야 한다.

### 9.3 실행과 repair

Role query는 DB 부하를 위해 최대 3개만 병렬 실행한다. `source_cutoff`, current Role id처럼 runtime이 아는
값은 bind parameter로 넘기며 LLM이 timestamp·UUID literal을 조립하지 않게 한다. 각 결과를 Role별 순서를
유지한 채 round-robin으로 merge하고, 같은 Talent는 한 번만 남겨 회사 전체 `retrievalBudget`에서 자른다.
한 Role이 200명을 먼저
반환해 다른 Role의 pool을 모두 차지하지 않게 한다.

- 문법·column·timeout 실패: sanitized error와 원 query를 주고 한 번 repair
- 유효 query가 0명을 반환했고 preflight 통계에는 hard-filter 전 eligible inventory가 있음: 실제 count와
  aggregate inventory만 주고 한 번 broaden 가능. 1명 이상을 반환했다는 이유만으로 목표 수를 채우려고
  자동 broaden하지 않음
- repair도 실패: 해당 Role은 deterministic fallback retrieval로 전환
- fallback: current A/B/C fit, legacy `recommend=true`·`label in (fit, ambiguous)`·score 65 이상, 최근
  가입·갱신 Talent를 넓게 가져오는 versioned read-only query. Legacy `unfit/dissatisfied`를 fit column이
  비어 있다는 이유만으로 anchor로 삼지 않음
- Planner SQL이 deterministic fallback으로 교체된 run은 company retrieval budget을 최소 enum인 100으로
  제한함. 이는 선택 quota가 아니라 잘못된 broad fallback이 150~200개의 비싼 packet/scoring을 유발하는
  비용·지연 fail-safe임
- 전체 Role query가 실패: run failed, ready write 없음
- 일부만 실패: 성공 Role로 계속하되 result에 partial retrieval을 명시

Fallback은 selection rule이 아니라 recall 복구다. Fallback 결과도 동일한 filter, scoring, reranking을 모두
거친다.

## 10. Retrieval 뒤 deterministic filter

SQL 결과는 추천 가능한 후보가 아니라 **평가할 후보 ID**다. Python이 모든 ID를 batch로 읽어 아래를
최신 상태에서 다시 적용한다.

### 10.1 Talent·privacy

- Talent가 존재하고 soft-delete되지 않음
- onboarding 완료
- `profile_visibility=open_to_matches`
- `get_internal_recommendation`을 명시적으로 끄지 않음
- 회사 선공유 동의가 가능한 일반 sharing mode. `exceptional_only`와 `dont_share`는 자동 company-first에서
  제외
- 회사 차단 없음
- production Talent이며 fixture allowlist 밖의 test 계정 아님
- 회사에 보여도 되는 redacted profile projection 생성 가능

### 10.2 route·history

- same workspace의 active `company_intro_candidates` 없음
- exact 또는 실질적으로 같은 sibling Role에 active candidate-visible recommendation/delivery 없음
- active company request, candidate-origin connection request, normal pipeline 없음
- 회사나 후보자가 명시적으로 종료한 exact pair를 material change 없이 되살리지 않음
- 최근 동일 회사 outreach와 contact-frequency policy 위반 없음

이 검사는 planner SQL마다 흩어진 status 문자열로 구현하지 않는다. Candidate-first recommendation,
candidate-origin request, normal pipeline, company-first ledger를 한 곳에서 읽는 shared route coordinator를
만들고 retrieval post-filter와 final transaction이 같은 함수를 사용한다. “active”의 정확한 terminal status
목록도 이 coordinator가 소유한다.

과거 company-first `passed`, candidate decline, no response는 삭제하지 않고 terminal evidence로 읽는다.
재추천이 허용되는 material change 계약이 별도로 생기기 전에는 자동 재노출하지 않는다.

### 10.3 reply confidence

Canonical `fetch_talent_reply_confidences()`를 ID batch로 한 번 호출한다.

- `LOW/0`: 자동 search에서 제외
- `UNKNOWN/1`: 정상 pool
- `HIGH/2`: fit이 유사할 때만 reranker의 작은 tie-break

이 값은 profile quality, fit, 수락 가능성이 아니다. Scorer에는 주지 않아 fit 판단을 오염시키지 않고,
reranker에는 `reply confidence: high/unknown` 두 값만 제공한다. Company-facing writer에는 아예 제공하지
않는다.

### 10.4 pool balance

Post-filter 결과도 Role별 source membership을 보존한다. 한 Talent가 여러 query에 잡히면 한 번만 profile을
load하되 retrieved-for Role ids를 모두 붙인다. Scoring에는 같은 회사의 모든 eligible Role을 보여 주어
query가 놓친 더 적절한 sibling Role도 발견할 수 있게 한다.

## 11. Stage 2 — Pointwise scoring

### 11.1 평가 단위

한 scoring call의 기본 단위는 다음이다.

```text
Talent 한 명 × 회사 한 곳의 eligible Role 전체
```

후보 여러 명을 한 prompt에 넣지 않는다. 후보끼리 비교하는 일은 reranker가 담당하고, scorer는 한 사람의
증거를 빠뜨리지 않고 모든 Role에 독립적으로 판단한다. 회사의 Role이 context budget을 넘을 때는 기존
internal fit의 shared source Role/variant grouping을 사용해 loss 없이 나누고 결과를 합친다. 단순 문자열
truncate로 Role을 누락하지 않는다.

### 11.2 입력

Run 시작 시 load한 같은 snapshot을 모든 scoring call이 재사용한다.

- current date/time text
- candidate Profile
- 전체 Search Brief, 최대 40행과 기존 Worker char budget
- same-version Behavior Context 한 개
- raw Memory나 과거 대화 전체는 넣지 않음
- 회사와 eligible Role의 JD/request/criteria/behavior context
- 이번 `searchStrategy`
- 기존 `talent_opportunity_fit` A/B/C, score, reason, evaluated_at은 **과거 참고값**으로 표시
- retrieved-for Role ids

기존 fit을 prior로 보여 주되 그대로 유지하라는 지시는 하지 않는다. Profile·Role·Brief가 최신이면 scorer가
다르게 판단할 수 있다. 이 단계 결과는 selection run 안에서만 사용하고 `talent_opportunity_fit`을
덮어쓰지 않는다. Canonical fit 변경은 기존 internal fit owner가 담당한다.

모든 LLM input은 사람이 읽을 수 있는 text section으로 serialize한다. `json.dumps(DB row)`를 그대로 넣지
않는다. Empty field, internal key, raw timestamp, 중복 JD를 제거하고 Role variant 차이는 명시적으로 쓴다.

### 11.3 출력 contract

```json
{
  "talentId": "exact-talent-uuid",
  "roles": [
    {
      "roleId": "exact-role-uuid",
      "score": 0,
      "roleFit": "fit|hold|ambiguous|unfit",
      "candidateFit": "fit|middle|unfit",
      "companyFit": "fit|ambiguous|unfit",
      "reason": "evidence, role relevance, uncertainty를 담은 짧은 판단"
    }
  ]
}
```

- 모든 input Role이 정확히 한 번 반환돼야 한다.
- `score`는 pool trim과 관찰용 0~100 값이며 최종 선택을 자동 결정하지 않는다.
- Python은 A/B/C 하한과 context budget용 Role별 score 순서만 사용해 rerank pool을 만든다. Scorer가 별도
  `pass`, route, communication plan을 중복 판단하지 않는다.
- `reason` 하나에 정성 판단을 유지한다. 별도 intent·confidence·communication plan JSON을 만들지 않는다.
- Missing, duplicate, unknown id, invalid enum이면 전체 call을 한 번 repair하고, 여전히 잘못되면 그 Talent를
  fail closed로 제외한다.

### 11.4 Scoring prompt 계약

```text
당신은 Harper의 company-first 후보 scorer다.

목표:
- 이 Talent가 회사의 각 Role을 실제로 수행할 수 있는지 판단한다.
- 후보자에게도 제안할 합리적 이유가 있는지 판단한다.
- 회사가 관심을 가질 candidate-owned evidence와 남은 불확실성을 찾는다.
- 최종 선택이나 candidate-first/company-first route를 정하지 않고 각 Role의 fit evidence를 평가한다.

중요:
- candidate-first와 company-first route는 이 단계에서 확정하지 않는다.
- 기존 fit score와 reason은 과거 참고값이지 정답이 아니다.
- A roleFit은 객관적 수행 가능성과 hard requirement, B candidateFit은 후보자의 지속적 선호·행동, C
  companyFit은 회사가 작성한 quality bar와 durable evidence라는 서로 다른 질문으로 정의한다.
- active/paused 같은 Role 운영 상태와 검색·전달 메모는 실행 자격이지 A/B/C 적합성 근거가 아니다.
- 연봉, location, work mode, seniority를 서로 대체 가능한 조건처럼 합치지 않는다.
- title이나 회사명보다 실제 scope, ownership, 결과, 기술·도메인 evidence를 우선한다.
- candidate interest를 추측하지 않는다.
- search slot을 채우기 위해 gap을 축소하지 않는다.
- 제공된 exact id만 JSON schema에 복사한다.
```

### 11.5 모델과 병렬성

초기 기본값은 current internal prefilter 설정을 재사용한다.

- primary: `openrouter:z-ai/glm-5.3-flash`, reasoning `high`, temperature `0.3`
- malformed JSON/provider failure fallback: routed DeepSeek V4 Flash 0731 한 번
- max tokens: `16384`
- Talent scoring 최대 동시성: 5

한 회사 run 안에서 최대 5개 Talent를 동시에 score한다. 각 future는 독립 LLM call이며 DB connection을
공유하지 않는다. Profile·Brief·Behavior packet은 LLM 시작 전에 읽고 transaction을 commit/close한다.
Company-first Profile loader는 범용 agent loader의 대화·활동·추천 이력을 다시 읽지 않는다. 그 원천은 같은
version의 Behavior Context에 이미 반영되므로, 이름·headline·bio·location·경력·학력·extra·locale만 회사
후보군 전체에 대해 한 번에 batch 조회한다. 2026-09-17 shadow의 29명에서 기존 packet과 company-first
소비 field가 29/29 exact 일치했고 batch query는 3.3초였다.
Future 결과는 완료 순서가 아니라 원래 candidate order와 id로 합친다.

External scorer의 “높은 점수 30개가 쌓이면 남은 batch scheduling을 멈춘다”는 early-stop은 v1에 그대로
적용하지 않는다. Company-first는 여러 Role의 coverage와 route 판단이 필요하므로 retrieval budget 안에서
hard filter를 통과한 Talent를 끝까지 평가한다. 비용 때문에 early-stop이 필요해지면 최소 Role coverage와
global rerank 품질을 frozen eval로 먼저 정의한다.

Provider rate limit이나 error가 늘면 exponential backoff를 하되 전체 200명을 처음부터 재실행하지 않는다.
실패한 Talent만 bounded retry한다. Worker process 전체 동시성은 초기 한 company run으로 제한하므로 최대
scoring LLM concurrency도 5다.

한 Talent의 schema repair와 provider fallback까지 모두 실패하면 그 Talent를 scoring failure로 센다. 초기
runtime gate는 `failed_talent_count / attempted_talent_count > 0.20`이면 run 전체를 `failed`로 끝내고 ready를
0건 쓰는 것이다. 20% 이하면 성공한 Talent만으로 계속하되 partial count를 result와 alert에 남긴다. 이 값은
운영 config와 frozen eval로 변경하며, 결과를 내기 위해 실패 output을 점수 0이나 deterministic reason으로
대체하지 않는다.

## 12. Rerank pool 만들기

모든 scorer output을 그대로 한 호출에 넣으면 회사 Role 수에 따라 prompt가 비정상적으로 커진다. 다음
방법으로 compact pool을 만든다.

1. A/B/C 하한을 통과한 pair만 남긴다.
2. Role별 score 상위 12개까지 남긴다.
3. 동일 Talent가 여러 Role에 있으면 한 candidate group으로 묶는다.
4. 회사 전체 최대 50 unique Talent, 최대 72 Talent–Role pair로 제한한다.
5. Role representation을 round-robin으로 보존한다.

이 cap은 quality threshold가 아니라 context budget이다. Pool trim 때문에 좋은 후보가 반복적으로 잘린다면
hardcoded 직군 예외를 추가하지 않고 scoring prompt, pool cap, model 또는 retrieval eval을 개선한다.

Rerank 입력은 full resume와 full JD를 다시 반복하지 않고 다음 compact evidence만 쓴다.

- Role id/name과 핵심 기준
- Talent id와 compact career summary
- scorer의 각 Role A/B/C, score, reason
- retrieved-for Role
- reply confidence `high|unknown`
- actual route가 없다는 verified fact
- 이번 search strategy

## 13. Stage 3 — Company-wide reranking

### 13.1 한 번의 전사 호출

Reranker는 한 회사의 모든 eligible Role과 compact pool을 한 번에 받는다. Role별로 따로 고른 뒤 합치지
않는다. 그래야 다음을 동시에 지킬 수 있다.

- 같은 Talent는 회사 전체에서 한 번만 선택
- Talent에게 가장 적절한 대표 Role 하나 선택
- 더 맞는 sibling Role을 설명에만 보조적으로 언급
- Role 처리 순서가 selection을 결정하지 않음
- 정말 검토할 후보가 없는 Role은 0명 허용

### 13.2 수량

- Role별 최대 3명
- 같은 Talent는 회사 전체 최대 1회
- 회사 전체 신규 수는 `30 - 현재 ready unique Talent 수`를 넘지 않음
- 세 명을 채우는 minimum은 없음
- 초기에는 별도 arbitrary company total cap을 두지 않는다. 다만 planner와 reranker가 회사가 실제로 검토할
  수를 고려해 작게 고르도록 하고, 30명 unresolved hard cap을 넘지 않는다.

이는 과거 Company Context Run의 candidate-first `recommend=true` 전사 최대 3명 계약과 다른 기능적
상한이다. Company-first는 최신 요청대로 **Role별 최대 3명**이며, 회사 전체에서는 Talent 중복 금지와
unresolved ready 30명 capacity만 hard guard로 둔다. 두 상한을 같은 config 이름으로 재사용하지 않는다.

Role이 매우 많은 회사에서 한 run 메시지가 과도해지는 현상은 운영 지표로 본다. 필요하면 frozen eval과
회사 피드백을 근거로 별도 company-run cap을 추가하되, 현재 단계에서 임의 숫자를 숨은 규칙으로 만들지
않는다.

### 13.3 선택 기준

선택된 후보는 모두 다음 질문에 답할 수 있어야 한다.

1. 회사가 실제로 시간을 들여 볼 candidate-owned evidence가 무엇인가?
2. 그 evidence가 exact Role의 어떤 문제·scope와 연결되는가?
3. 왜 candidate-first로 바로 보내기보다 회사가 먼저 관심을 표시하는 편이 유용한가?
4. 중요한 caveat가 있다면 무엇이며, 회사가 판단하거나 열 수 있는 종류인가?
5. 같은 Talent의 다른 Role보다 이 Role이 대표 Role인 이유는 무엇인가?

`좋은 후보`, `빠르게 성장`, 유명 회사·학교, 높은 응답 가능성만으로 선택하지 않는다. 후보자가 아직
관심을 보였다고 쓰지 않는다.

### 13.4 출력 contract

```json
{
  "selected": [
    {
      "talentId": "exact-talent-uuid",
      "primaryRoleId": "exact-role-uuid",
      "alsoSuitableRoleIds": ["optional-sibling-role-uuid"],
      "reason": "회사에 보여도 되는 선정 근거와 먼저 연락해 볼 이유"
    }
  ],
  "noSelectionReason": "아무도 고르지 않았거나 일부 Role이 0명인 이유"
}
```

`alsoSuitableRoleIds`는 최대 2개이고 같은 회사의 eligible Role만 허용한다. 이는 별도 pipeline 상태가
아니라 writer가 정확한 Role 이름을 말하기 위한 presentation metadata다. Selected에 없는 후보나 Role을
writer가 새로 추가할 수 없다.

Python validation은 unique Talent, Role별 최대 3, backlog remaining slots, input id membership, A/B/C 하한,
latest hard guard를 검사한다. Validation이 실패하면 같은 output을 한 번 schema repair할 수 있지만 Python이
임의로 점수 순서대로 채우지 않는다. Repair도 실패하면 selection은 0명으로 fail closed하고 run을
`failed/rerank_invalid`로 기록한다.

### 13.5 Reranker prompt 계약

```text
당신은 한 회사의 company-first 최종 reranker다.

회사 전체 Role을 동시에 보고, 지금 회사가 먼저 검토할 가치가 높은 Talent만 선택한다.
각 Talent는 대표 Role 하나에만 배정한다. 다른 Role에도 실제로 어울리면 보조 Role id를 붙일 수 있다.

선택의 핵심은 fit만이 아니다.
- Role과 회사에 대한 근거가 강해야 한다.
- 후보자에게도 제안할 합리적 이유가 있어야 한다.
- 회사가 먼저 관심을 표시할 때 해결되는 불확실성이나 열 수 있는 조건이 있어야 한다.
- candidate-first가 더 자연스러우면 company-first로 선택하지 않는다.
- 응답 confidence high는 비슷한 후보 사이의 작은 tie-break일 뿐이다.
- Role별 최대 수는 quota가 아니다. 각 Role이 0명이어도 된다.

reason은 회사에 그대로 보여도 되는 문장이다.
- candidate-owned 성과·ownership과 Role 연결을 구체적으로 쓴다.
- 먼저 연락해 볼 이유를 쓰되 후보자의 관심이 이미 확인됐다고 말하지 않는다.
- 필요한 caveat는 하나만 명확히 쓴다.
- Brief, Behavior Context, reply score, 내부 fit label, private compensation을 노출하지 않는다.
```

### 13.6 모델

초기 기본값은 external listwise reranker와 같은 `GPT-5.6 Luna`, reasoning `high`, temperature `0.25`,
max tokens `65536`이다. 이 단계가 최종 quality owner다. Model 또는 prompt 변경은 company-first selection
evaluation registry의 frozen dataset에서 critical error 0을 통과한 뒤 rollout한다.

## 14. Stage 4 — Company-facing reason과 Slack message

Reranker reason은 이미 company-safe해야 하지만, 최종 writer는 여러 Role과 후보를 회사가 빠르게 읽을 수
있는 company-level intro와 독립적인 Role별 section copy로 구성한다. Python은 이를 **채널별 delivery
bundle**로 조립한다. 한 채널이 모든 선택 Role을 받도록 설정돼 있으면 보통 Slack message 한 개이고,
Role opt-out이나 채널 구성이 다르면 그 채널에서 허용된 Role section만 포함한다. 선택 수가 Slack의
text/block 제한을 넘으면 같은 channel bundle의 parent message와 Role별 thread reply로 나눈다. Writer는
retrieval SQL, 탈락 후보, raw Profile, Brief, Behavior, reply confidence, 내부 A/B/C와 score를 받지 않는다.

입력은 다음뿐이다.

- 회사 이름과 output language
- 선택된 exact Role name
- 선택된 Talent의 company-visible profile summary와 안전한 링크
- validated reranker reason
- 후보자가 아직 이 기회를 보지 않았다는 사실
- 회사의 가능한 action: `먼저 제안하기` 또는 `제안하지 않기`

Writer는 발견된 사실만 사용하고 새 경력·관심·조건을 만들지 않는다. Role별 section으로 묶되 같은 Talent는
회사 selection 전체에서 한 번만 나온다. 후보자에게 아직 추천되지 않았다는 점과 먼저 제안하기를 누르면
그때 후보자에게 연락한다는 점을 자연스럽게 알린다.

초기 모델은 `GPT-5.6 Terra`, reasoning `high`, temperature `0.4`, max tokens `16384`로 별도 call config를 둔다.
문구는 Company-side UX Writing Guide와 web의 상태 의미를 따른다.

LLM output은 intro copy와 exact selected item에 대응하는 Role별 copy만 반환한다. Python이 selected coverage,
중복, 길이, Role–channel 허용 범위를 검증하고 링크·버튼·Block Kit와 chunk를 조립한다. LLM에게 channel
routing, action metadata나 raw Block Kit JSON을 만들게 하지 않는다. Button metadata에는 ledger id와
revision만 넣고 Talent email, resume URL, private id를 직접 싣지 않는다. `먼저 제안하기`와 `제안하지 않기`는 Slack
전용 side effect가 아니라 web과 같은 canonical command를 호출한다.

Chunk가 여러 개이면 `(run_id, channel_id, chunk_index)`를 outbox idempotency key에 포함하고 parent receipt의
`thread_ts`를 다음 chunk가 참조한다. 한 chunk 실패 때문에 성공한 chunk를 다시 보내지 않으며, Slack 제한
때문에 candidate card를 조용히 누락하지 않는다. Role에서 opt-out된 채널에는 그 Role의 이름·후보·count를
보내지 않는다. Ready ledger 전체와 모든 channel outbox chunk를 먼저 같은 transaction에서 seal한 뒤
전달한다.

선택이 0명이면 company-facing Slack을 보내지 않는다. 매주 “이번에는 없습니다”를 보내 interaction 수로
오인하게 만들지 않는다. Run row와 internal observability에만 정상 0명 결과를 남긴다.

## 15. Slack 전달 직전 live guard

Writer 이후, ready transaction 전에 다음을 다시 batch 확인한다.

- Role eligibility와 Slack channel이 여전히 유효
- pending capacity가 여전히 남아 있음
- ready backlog가 30 미만이며 이번 insert 뒤 30을 넘지 않음
- Talent visibility, delete, opt-out, block 상태가 여전히 허용
- reply confidence가 LOW로 바뀌지 않음
- exact/sibling candidate-first 또는 company-first route가 생기지 않음
- 같은 Talent가 같은 회사 selected set에 한 번만 존재
- Role fingerprint와 selected Talent input fingerprint가 planning snapshot과 같음

한 pair만 stale이면 그 pair만 제외한다. 남은 message는 excluded pair 없이 writer를 다시 호출하거나, writer
출력이 card 단위로 완전히 분리돼 있으면 안전하게 재조립한다. LLM이 쓴 문장에서 이름만 문자열 삭제하는
식의 후처리는 하지 않는다. 남은 pair가 0명이면 ledger/outbox를 만들지 않고 정상 완료한다.

## 16. Prompt·trace·privacy 운영

### 16.1 Version

각 stage에 독립 version을 둔다.

- `company_first_query_plan_v3`
- `company_first_scoring_v3`
- `company_first_rerank_v3`
- `company_first_slack_writer_v4`
- `company_first_run_contract_v2`

Run result에는 prompt text 전체가 아니라 version, source hash, model config, token usage와 count를 남긴다.

### 16.2 Private trace

Debug는 production에서 기본 off다. 명시적으로 allowlist된 run만 아래를 ignored path에 저장한다.

```text
runs/company_first/<run_id>/
  manifest.json
  planner_input.txt
  planner_output.json
  retrieval_summary.json
  scoring/<opaque-talent-ref>.json
  rerank_input.txt
  rerank_output.json
  writer_input.txt
  writer_output.json
```

Directory는 `0700`, file은 `0600`으로 만든다. Tracked docs/eval에는 비식별 case, fingerprint, gold만 둔다.
Raw production candidate/company data와 model raw output은 commit하지 않는다. Production private trace의 초기
retention은 14일이고 cleanup job이 만료 directory를 삭제한다. Incident hold가 필요하면 exact run id와 종료
시점을 별도로 기록한다.

### 16.3 Logging

일반 log에는 run id, workspace id, Role count, stage, count, latency, model call name, retry reason만 남긴다.
Candidate 이름, resume, Brief, message body, full reason은 남기지 않는다. SQL 전문도 일반 log에 출력하지 않고
private trace 또는 hash로 남긴다.

## 17. 실패 처리

| 실패 | 동작 |
| --- | --- |
| Planner가 `runSearch=false` | `skipped`; 이유와 통계 snapshot 저장 |
| Planner JSON invalid | fallback 1회; 실패하면 `failed`, write 0 |
| 일부 Role SQL 실패 | repair/fallback 후 성공 Role로 계속; partial count 기록 |
| 모든 SQL 실패 | `failed`, scoring·write 없음 |
| Retrieval 0명 | `succeeded`, selected 0, 회사 Slack 없음 |
| Scoring 일부 실패 | 실패 Talent만 제외; retry 뒤 실패율이 20%를 초과하면 `failed`, ready 0 |
| Rerank invalid | repair 1회; 실패하면 `failed/rerank_invalid`, ready 0 |
| Live guard stale | stale pair 제외, 자동 padding 없음 |
| Ready/outbox transaction 실패 | 전부 rollback, Slack 없음 |
| Slack provider 실패 | ready/outbox 유지, `delivery_pending`, same outbox retry |
| Slack 연결 해제 | 새 발송 중단, run에 terminal delivery reason 기록; ready 노출 정책은 product contract에 맞춰 처리 |
| Worker shutdown, selection 미commit | stale lease recovery가 새 attempt cutoff/hash로 pure stage를 재실행; local trace 재사용 안 함 |
| Worker shutdown, selection commit 뒤 | ready를 다시 고르지 않고 sealed outbox의 미전달 chunk만 재시도 |

Provider error 때문에 qualitative selection을 deterministic score로 대체하지 않는다. 실패는 실패로 보존하고
다음 retry 또는 다음 run에서 다시 판단한다.

## 18. 통계와 품질 지표

### 18.1 Run health

- eligible / skipped company 수와 skip reason
- query plan run rate
- retrieval budget과 실제 unique Talent 수
- SQL validation, timeout, repair, fallback 비율
- filter reason별 제외 수
- scoring success·latency·token·cost
- rerank pool, selected 0/1/2/3+ 분포
- Slack delivery 성공·retry·duplicate 수

### 18.2 Product funnel

- ready → `먼저 제안하기` / `제안하지 않기` / unresolved
- 회사 첫 피드백까지 시간
- 먼저 제안하기 → 후보자 reply / accept / decline / no response
- 후보자 reply는 수락과 거절을 모두 reply로 집계
- mutual connection과 normal stage 진입
- Role별·회사별 후속 interview 진행

### 18.3 Candidate-first 관계

- A/B/C bucket별 company-first selection 비율
- strong all-fit 중 candidate-first로 남은 비율
- live guard에서 candidate-first가 먼저 생겨 제외된 수
- company-first ready 때문에 candidate-first가 건너뛴 수
- 동일 company/Talent duplicate route violation
- company-first가 없었다면 candidate-first로 갔을 후보를 과도하게 지연시키는지

Interaction 수만 성공 지표로 보지 않는다. 회사가 실제로 판단하고 후보자가 답하며 mutual connection이
늘어야 한다. Zero-yield는 그 자체로 나쁜 결과가 아니지만, 반복 zero-yield와 SQL fallback 증가는 retrieval
또는 대상 회사 설정을 재검토할 신호다.

## 19. Evaluation과 release gate

기존 `company-first-talent-selection/v1`은 수동 Codex calibration이므로 덮어쓰지 않는다. Worker 구현에는
새 dataset version과 canonical runner를 등록한다.

현재 canonical read-only runner는
`harper_worker/llm_evals/company_first_talent_selection/run_shadow.py`다. Raw production 입력과 출력은
evaluation registry의 ignored `runs/<run_id>/`에 `0700/0600`으로만 저장한다. 2026-09-17 Harper Founding
Engineer, AI Agent Role positive pilot은 v2-pilot이며 frozen gold가 아니다.

평가 단위는 네 가지다.

1. Query planner: run/skip, search strategy, SQL validity와 recall
2. Pointwise scorer: A/B/C, score, 최신 evidence grounding
3. Company-wide reranker: unique Talent, 대표 Role, no padding, candidate-first route 판단
4. Slack writer: grounding, privacy, 아직 확인되지 않은 candidate interest 표현 금지

필수 case:

- A fit/B middle/C fit positive company-first
- A/B/C 모두 fit이지만 candidate-first가 더 자연스러운 case
- 높은 연봉·level·work mode가 회사가 열 수 있는 trade-off인 case와 hard mismatch인 case
- 같은 Talent가 두 Role에 맞지만 대표 Role 하나만 선택해야 하는 case
- reply UNKNOWN 신규 Talent가 정상 선택될 수 있는 case
- reply LOW, blocked, opt-out, test-only, active route hard exclude
- `exceptional_only`, `dont_share`, 다른 workspace read와 Data API 권한 hard exclude
- Role별 최대 수보다 후보가 적은 zero/padding case
- 이전 run 이후 신규 Talent가 거의 없어 planner가 skip하는 case
- 30 ready backlog와 pending capacity gate
- Slack writer의 private Brief/Behavior/score leak case

초기 release gate:

- hard boundary violation 0
- duplicate company/Talent selection 0
- active candidate-first route interception 0
- padding error 0
- unsupported company-facing claim 0
- private context leak 0
- positive gold selection과 representative Role 정확도 수동 adjudication 통과
- SQL safety adversarial suite 100% 차단

그 뒤 서로 다른 회사·직군을 최소 세 곳 이상 production read-only shadow로 실행하고, selected와
non-selected packet을 사람이 검토한다. Shadow 결과를 production ready로 자동 승격하지 않는다.

### 19.1 2026-09-17 positive shadow 관찰

- paused Role을 명시적 read-only override로만 실행했고 DB write, ready 생성, Slack·이메일 발송은 모두 0건이다.
- 최종 full run은 30명 retrieval, reply LOW 1명 제외, 29명 scoring, 구조적 rerank pool 6명, 최종 2명을
  선택했다. Role별 최대 3명을 채우지 않았다.
- 선택된 두 후보는 hard requirement와 production agent/full-stack 근거를 갖췄고, 각각 work mode·제품
  layer 또는 최근 역할 방향처럼 회사가 먼저 조건·scope를 열어 판단할 이유가 있었다.
- 응답 confidence HIGH 한 명과 UNKNOWN 한 명이 선택됐다. HIGH인 다른 후보도 보상·seniority·근무 조건
  충돌이 더 커 제외돼 reply signal이 fit을 덮지 않았다.
- 연구 중심 production gap, 지나치게 senior한 scope·보상 충돌, 스타트업 실행 근거 부족 후보는 높은 기술
  신호가 있어도 최종 선택하지 않았다.
- A/B/C 정의를 scorer prompt에 명시한 뒤 `paused` 운영 상태는 fit label·reason에 섞이지 않았다.
- full run은 368.2초였고 stage는 packet 179.6초, scoring 80.4초, rerank 31.3초, planner 27.8초였다. 이후
  exact-output batch Profile loader, literal `%` SQL binding fix, Planner temperature·token cap을 반영했다.
  개선 뒤 planner-only 재검증은 한 호출 23.6초, repair/fallback 없이 23명을 회수했다. 전체 latency 개선값은
  다음 full shadow에서 다시 측정해야 한다.

## 20. 테스트 계획

### 20.1 Python unit

- schedule slot, 월요일 09:00~화요일 00:00 catch-up window와 KST DST 비영향
- eligible Role, exact exclusion workspace ids, 30 backlog, pending `>= max`
- previous terminal/search 두 cursor, 누적 skip inventory, text serializer와 date format
- query plan schema, Role coverage, budget enum
- SQL AST validator와 LIMIT wrapper
- round-robin merge와 unique Talent cap
- reply confidence batch integration
- scorer output coverage·enum·repair
- scoring failure 20% 경계
- reranker unique Talent, Role max 3, backlog remaining slots
- source fingerprint와 live guard
- lease, heartbeat, precommit attempt 재실행, postcommit outbox-only recovery, idempotency

### 20.2 DB integration

- two scheduler ticks가 같은 slot run 하나만 생성
- 두 worker가 같은 run을 claim하지 않음
- candidate-first insert와 company-first ready race에서 하나만 성공
- same workspace/Talent가 여러 Role ready로 생기지 않음
- ready와 outbox가 같이 commit되거나 같이 rollback
- Slack channel/chunk 일부가 실패해도 성공 chunk를 재발송하지 않고 card coverage와 Role opt-out이 보존됨
- test-only Role에 fit/run/ledger가 생기지 않음
- visibility/block/delete 변경 직후 commit 차단
- run/outbox raw table의 `anon`·`authenticated` 접근 차단과 workspace redacted read 격리

### 20.3 LLM contract

- 모든 input이 textified packet이고 raw DB JSON·timestamp가 없음
- scorer가 모든 Role을 정확히 반환
- reranker가 0명을 정상 반환
- writer가 selected safe facts 밖의 내용을 만들지 않음
- schema repair가 새 후보를 추가하지 않음
- model fallback과 usage log가 actual provider를 기록

### 20.4 End-to-end shadow

최소 세 회사 또는 서로 다른 세 internal Role군에서 다음을 기록한다.

- planner가 왜 실행/skip했는가
- retrieval 100/150/200 선택이 합리적인가
- 좋은 candidate-first 후보를 모두 빼서 애매한 pool만 남기지 않았는가
- 선택 후보는 회사가 실제 검토할 만한가
- 억지로 Role별 세 명을 채우지 않았는가
- representative Role과 sibling mention이 자연스러운가
- company-facing reason이 구체적이고 안전한가

## 21. 구현 위치와 순서

### Phase 1 — queue와 hard boundary

`harper_beta`:

- `is_company_first_search` migration과 generated DB types
- `company_first_search_runs`, `company_intro_candidates`, durable Slack outbox migration
- run/outbox server-only privilege, company intro redacted read와 workspace RLS/RPC 계약
- route uniqueness와 live guard용 transaction/RPC
- existing candidate-first creation path가 ready ledger를 검사하도록 공통 coordinator 적용

`harper_worker`:

- `opp/company_first_search/queue.py`
- `opp/company_first_search/scheduler.py`
- company-first worker command와 service unit
- config, heartbeat, recovery, no-LLM preflight

### Phase 2 — context, planner, retrieval

- `context.py`: company/Role/history/stats text packet
- `prompts.py`: versioned query plan contract
- `query_planner.py`: model call, parse, fallback
- `sql_safety.py`: AST allowlist와 read-only executor
- `retrieval.py`: parallel Role query, round-robin dedupe, fallback

Read-only executor는 Supabase transaction pool이 아니라 기존 dedicated session read-only connection을
사용하고, generated SQL의 cutoff와 runtime id는 bind parameter로 전달한다.

이 단계는 read-only shadow만 지원한다.

### Phase 3 — scoring과 reranking

- `scorer.py`: Talent packet batch load, max 5 parallel scoring
- `reranker.py`: compact global pool과 one-company listwise selection
- `opp/new_config.py`: 네 stage call config와 운영 상수
- evaluation v2 runner와 frozen positive/negative cases

### Phase 4 — ready commit과 Slack

- `runner.py`: end-to-end state transition과 live guard
- `slack_writer.py`: selected-safe input만 받는 writer
- `harper_beta` internal delivery endpoint/consumer
- existing company Slack helper, Role–channel routing, bundle chunk idempotency, thread/conversation receipt 연결
- `/org` board가 ready ledger를 읽는 product-plan 구현과 함께 feature flag pilot

### Phase 5 — 관찰과 rollout

- production read-only shadow
- exact pilot workspace allowlist
- Mistral/Sierra/Wonderful exclusion 검증
- alert, metrics, retry 운영 화면
- candidate-first displacement와 company response 검토 후 확대

## 22. 구현 완료 정의

다음을 모두 만족하기 전에는 “Company-first Worker가 구현됐다”고 하지 않는다.

- 월요일 09:00 KST slot이 Python scheduler에서 멱등 enqueue된다.
- 09:00 장애는 월요일 안에 한 번만 catch-up하고 오래된 주차는 소급하지 않는다.
- 실행 단위가 company workspace이고 모든 대상 Role이 같은 rerank에 들어간다.
- `is_company_first_search=true`, active Slack, non-test, availability, pending capacity가 강제된다.
- exact workspace ID로 세 회사가 제외된다.
- unresolved ready 30명에서 자동 실행이 멈춘다.
- Planner가 run 여부, strategy, 100/150/200 budget, Role SQL을 한 번에 만든다.
- SQL은 talent source allowlist와 read-only sandbox 안에서만 실행된다.
- run/outbox는 client Data API에 노출되지 않고 company read는 workspace·privacy가 적용된 projection만 쓴다.
- Profile + 전체 Brief + same-version Behavior Context가 scoring 단계 전체에 재사용된다.
- 최대 5개 scoring call만 병렬 실행되고 DB transaction을 외부 LLM 동안 열어 두지 않는다.
- retry 뒤 scoring 실패율이 20%를 넘으면 ready를 쓰지 않고 실패한다.
- Reranker가 Role별 최대 3명, 회사 안 unique Talent, 0명 허용을 지킨다.
- Candidate-first actual route와 ready가 동시에 생기지 않는다.
- Writer는 selected safe facts만 읽고 회사가 먼저 연락할 이유를 정확히 설명한다.
- Ready ledger와 delivery outbox가 원자적으로 저장되고 Slack은 멱등 재시도된다.
- Role opt-out별 channel bundle을 지키고, Slack platform limit을 넘는 결과도 chunk로 전부 전달하며 성공
  chunk를 중복 발송하지 않는다.
- Candidate recommendation, email, follow-up은 회사가 먼저 제안하기를 누르기 전 0건이다.
- Eval release gate와 최소 세 곳 shadow review를 통과한다.
- 문서와 실제 model/config/queue/schema가 일치한다.

## 23. 명시적으로 하지 않는 것

- Codex Scheduled task를 production selection engine으로 유지하지 않는다.
- 회사 이름 문자열로 대상·제외 회사를 판정하지 않는다.
- Query LLM이 쓴 SQL을 service role로 그대로 실행하지 않는다.
- `candid`나 외부 People Search profile을 Harper Talent처럼 추천하지 않는다.
- `fit.recommend=false`만 모아서 회사에 보내지 않는다.
- 반대로 `fit.recommend=true`를 모두 숨겨 애매한 후보만 남기지 않는다.
- Response HIGH를 fit 점수처럼 크게 가산하지 않는다.
- Reply UNKNOWN인 신규 Talent를 데이터 부족만으로 낮추지 않는다.
- Scoring 결과를 `talent_opportunity_fit`에 덮어써 selection worker가 fit owner가 되지 않는다.
- Role별 rerank 결과를 나중에 합쳐 duplicate Talent를 제거하지 않는다.
- 최대 3명을 채우기 위해 score 순으로 자동 padding하지 않는다.
- Reranker reason에 Brief, Behavior Context, reply score, private 조건을 노출하지 않는다.
- Slack 실패 때문에 selection LLM 전체를 다시 실행하지 않는다.
- Ready commit 전 crash 복구에 host-local private trace를 durable checkpoint처럼 사용하지 않는다.
- Raw production packet이나 model output을 git에 넣지 않는다.

이 설계에서 Company-first는 “후보자에게 보내고 남은 애매한 사람을 회사에 보여 주는 기능”이 아니다.
Harper가 보유한 같은 좋은 Talent pool 안에서, 회사가 먼저 판단하거나 조건을 열어 주는 것이 연결 가능성을
높이는 경우를 별도로 선택하는 경로다. Search의 폭은 매주 달라질 수 있지만, privacy, route uniqueness,
no-padding, company-wide dedupe는 항상 코드와 DB가 같은 방식으로 지킨다.
