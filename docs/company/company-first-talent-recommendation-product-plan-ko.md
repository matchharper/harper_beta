# 회사 선확인 후보자 추천 · 먼저 제안하기 구현 기획

- 문서 기준: 2026-09-17
- 상태: 구현 전 목표 설계. 이 문서는 현재 production 동작이나 구현 완료를 뜻하지 않는다.
- 범위: 후보 선정, 회사 노출, `먼저 제안하기`, 후보자 전달, 응답, 연결, 철회까지의 제품·상태 계약

Worker 구현 계약:

- [Company-first Talent Search Worker 구현 계획](./company-first-talent-search-worker-implementation-plan-ko.md)

과거 수동 shadow calibration 절차:

- [회사 선확인 후보자 선정 Codex Runbook](./company-first-talent-recommendation-codex-runbook-ko.md)

관련 정본:

- [Company Context Run 목적과 구현 계약](./company-context-run-overview-ko.md)
- [특정 Internal Role 추천 후보 직접 탐색·평가 기준](../scheduled/internal-role-talent-direct-review-ko.md)
- [Company-side UX Writing Guide](../company-side-ux-writing-guide-ko.md)
- [Talent lifecycle contact policy](../system/talent-lifecycle-contact-policy.md)
- [Talent Memory · Search Brief 최종 설계](../talent-unified-memory-implementation-plan-ko.md)

## 1. 이번 기획의 결론

회사 선확인 추천에는 기존 `연결 대기` 앞에 새로운 company-side built-in stage가 필요하다.
이 문서에서는 내부 stage id를 `company_intro`, 사용자에게 보이는 칼럼명을 `먼저 제안 가능한 후보`로 둔다.

이 칼럼은 후보자의 한 가지 상태만 뜻하지 않는다. 카드 안의 substatus로 두 순간을 구분한다.

| Substatus | 실제 의미 | 회사의 행동 |
| --- | --- | --- |
| `아직 후보자에게 제안하지 않음` | Harper가 회사에 먼저 후보자를 제안했고 후보자는 아직 Role을 보지 않음 | `먼저 제안하기`, `제안하지 않기` |
| `후보자 답변 대기` | 회사가 연결을 미리 승인했고 Harper가 후보자에게 직접 연결 요청을 보냄 | 기다리기만 가능 |

핵심 구현 결정은 다음과 같다.

1. 회사에 먼저 보이는 후보를 `talent_opportunity_recommendation`에 미리 저장하지 않는다.
   후보자가 볼 수 있는 모든 기존 조회 경로에서 숨김 조건을 빠뜨릴 위험이 있기 때문이다.
2. 회사 선확인 전용 durable ledger인 `company_intro_candidates`를 둔다. 이 행은 회사가 실제로
   어떤 후보를 보았고, `먼저 제안하기` 또는 `제안하지 않기` 중 무엇을 결정했는지 보존하는 제품 상태다.
3. 회사가 `먼저 제안하기`를 확정하는 순간에만 `talent_opportunity_recommendation`을
   `opportunity_type=intro_request`로 생성한다. 이 순간부터 `/career`에서 후보자에게 보인다.
4. `먼저 제안하기`를 누를 때 회사는 후보자가 수락한 뒤 들어갈 다음 process stage와 CC 받을
   회사 이메일을 미리 확정한다. 회사의 이 행동은 북마크가 아니라 “수락하면 연결한다”는 약속이다.
5. `company_intro`에서는 질문, 이력서 요청, 미팅 요청, 인터뷰 전송, 직접 연락, 일반 stage 이동을
   모두 막는다. UI만 숨기는 것이 아니라 모든 server action과 company-side LLM tool이 같은
   capability 판정을 사용한다.
6. 후보자에게 보내는 메일은 기존 internal recommendation의 final-delivery 구성과 follow-up
   인프라를 재사용하되, 회사가 먼저 관심을 보인 `직접 연결 요청`이라는 사실을 정확히 쓴다.
7. 후보자가 수락하면 회사에게 다시 Connect 여부를 묻지 않는다. 기존 `연결 대기` 수락 시 쓰는
   warm intro 메일 생성·안전 검사·CC 발송을 공통 서비스로 호출하고, 성공 후 미리 정한 process
   stage로 바로 이동한다.
8. 후보자가 탈퇴하거나 `Open to matches`가 아닌 공개 범위로 바꾸거나 회사를 차단하면
   company-side read에서 즉시 사라진다. 비동기 정리 작업이 늦더라도 다시 노출되지 않게 read-time
   guard와 durable cleanup을 함께 둔다.
9. 한 Worker run에서 Role별 최대 3명을 선택한다. 같은 Talent는 회사 전체에서 한 번만 선택하고, 기존
   미결정 `ready` 카드가 30명이면 새 자동 run을 시작하지 않는다. 최대값은 quota가 아니다.
10. Python Worker scheduler가 매주 월요일 오전 9시 KST에 회사 단위 run을 enqueue한다. Query plan,
    retrieval, scoring, 회사 전체 reranking, Slack 전달의 자세한 계약은 별도 Worker 구현 계획으로 고정한다.

## 2. 목표 경험

### 2.1 전체 흐름

```text
Harper가 회사에 후보자를 먼저 제안
  → 먼저 제안 가능한 후보 / 아직 후보자에게 제안하지 않음
     ├─ 제안하지 않기
     │   └─ 회사에서만 종료. 후보자에게 추천·메일 없음
     └─ 먼저 제안하기
         ├─ 다음 process stage와 CC 수신자 확정
         ├─ 후보자측 intro_request 생성
         ├─ 후보자 메일 즉시 발송
         └─ 먼저 제안 가능한 후보 / 후보자 답변 대기
             ├─ 후보자 수락
             │   ├─ 회사와 후보자를 즉시 CC 연결
             │   └─ 미리 정한 process stage로 이동
             ├─ 후보자 거절
             │   └─ 연결 없이 종료
             ├─ 정책상 follow-up 후 무응답
             │   └─ 응답 없음으로 종료
             └─ 탈퇴·공개 범위 변경·차단·Role 종료
                 └─ 노출과 후속 연락을 중단하고 종료
```

### 2.2 기존 후보자 선확인 경로와의 차이

```text
후보자 선확인
Harper가 후보자에게 추천 → 후보자 수락 → Harper 최종 확인 → 회사 연결 대기
→ 회사 Connect → warm intro와 다음 stage

회사 선확인
Harper가 회사에 후보 제안 → 회사 먼저 제안하기와 연결 계획 확정
→ 후보자에게 직접 연결 요청 → 후보자 수락 → warm intro와 다음 stage
```

회사 선확인에서는 회사가 후보자 연락 전에 이미 연결을 승인했다. 따라서 후보자 수락 이후
`연결 대기`에서 같은 결정을 반복하면 안 된다. 후보자의 긍정 응답 자체가 저장된 연결 계획을 실행하는
trigger다.

## 3. 용어와 상태 의미

### 3.1 사용자에게 보이는 용어

| 위치 | 권장 용어 | 의미 |
| --- | --- | --- |
| Company pipeline 칼럼 | `먼저 제안 가능한 후보` | Harper가 회사에 먼저 보여준 후보와 이미 요청을 보낸 후보가 모이는 곳 |
| 준비된 카드 상태 | `아직 후보자에게 제안하지 않음` | 후보자는 아직 기회를 받지 않음 |
| 발송 준비 카드 상태 | `제안 준비 중` | 회사가 제안을 요청했지만 메일은 아직 발송되지 않음 |
| 발송 후 카드 상태 | `후보자 답변 대기` | 제안 메일이 전달됐고 답을 기다리는 중 |
| Primary action | `먼저 제안하기` | 후보자가 수락하면 연결하겠다는 조건부 승인 |
| Secondary action | `제안하지 않기` | 이번 Role로는 후보자에게 제안하지 않음 |
| Candidate opportunity type | `직접 연결 요청` | 회사가 먼저 관심을 보이고 연결을 요청한 기회 |

Stage label과 카드 상태를 섞지 않는다. `먼저 제안 가능한 후보` 칼럼 안에서도 후보자가 아직 기회를 못 본 카드와
이미 답변을 기다리는 카드는 badge와 설명으로 분명히 구분한다.

### 3.2 `연결 대기`와의 불변 차이

| 구분 | `먼저 제안 가능한 후보` | `연결 대기` |
| --- | --- | --- |
| 먼저 긍정한 쪽 | 아직 없음 또는 회사 | 후보자 |
| 후보자가 Role을 봤는가 | `아직 후보자에게 제안하지 않음`에서는 아니오 | 예 |
| 후보자 관심이 확인됐는가 | 답변 전에는 아니오 | 예 |
| 회사의 main action | `먼저 제안하기` / `제안하지 않기` | `Connect` / `Reject` |
| 후보자에게 질문·미팅 요청 | 불가 | 현재 제품 계약에 따라 가능 |
| 일반 stage 이동 | 불가. 이동 시도는 먼저 제안하기 흐름으로 전환 | Connect 결정과 함께 가능 |
| 긍정 뒤 결과 | 후보자에게 제안 | 양측 warm intro |

회사와 company-side LLM은 `먼저 제안 가능한 후보`의 사람을 “지원자”, “관심을 보인 후보”, “연결 대기 후보”라고
설명하면 안 된다. 아직 후보자의 의사는 확인되지 않았기 때문이다.

## 4. 상태의 source of truth

### 4.1 하나의 테이블에 모든 단계를 억지로 넣지 않는다

| 관심사 | 정본 | 이유 |
| --- | --- | --- |
| Role–Talent 적합도와 평가 근거 | `talent_opportunity_fit` | 선정 input이며 사용자 노출·결정 상태가 아님 |
| 회사에 먼저 보여준 시점부터 후보자 답변까지 | 새 `company_intro_candidates` | 회사 선확인에만 존재하는 durable lifecycle |
| 후보자에게 실제로 보이는 기회와 후보자 feedback | `talent_opportunity_recommendation` | `/career`, candidate LLM, feedback의 기존 정본 |
| 연결 뒤 company pipeline stage | `talent_opportunity_tag`와 기존 `processed_stage` | 현재 normal pipeline의 정본 |
| 후보자 요청·warm intro 메일 | 기존 durable outbox와 `career_email_messages` | 재시도, idempotency, 실제 발송 증거 |
| 질문·이력서 요청 | `company_talent_requests` | 연결된 후보자 대상 기존 기능이며 이번 ledger로 재사용하지 않음 |
| 활동·운영 추적 | `talent_progress`와 기존 event/log | 사용자 응답과 stage 전환 audit |

`company_talent_requests`는 현재 추천 row가 있고 회사가 후보자에게 질문·자료를 요청하는 흐름이다.
회사에 먼저 보여준 prospect를 여기에 넣으면 추천이 이미 존재한다는 전제를 깨고, 이 stage에서 금지해야
할 질문·이력서 요청과 제안을 같은 상태로 오해하게 된다. 따라서 재사용하지 않는다.

### 4.2 왜 회사 노출 전에 recommendation을 만들지 않는가

현재 후보자 history, Role별 조회, recent recommendation prompt, count, chat tool 등 여러 reader가
`talent_opportunity_recommendation`을 곧 “후보자에게 추천된 기회”로 이해한다. 숨김 column 하나를
추가해 모든 reader에 조건을 붙이는 방식은 누락 한 번으로 후보자에게 너무 일찍 노출될 수 있다.

따라서 lifecycle은 다음처럼 자른다.

| 순간 | `company_intro_candidates` | `talent_opportunity_recommendation` |
| --- | --- | --- |
| 회사에 처음 카드 노출 | `ready` | 생성하지 않음 |
| 회사 제안하지 않기 | `passed` | 생성하지 않음 |
| 회사 먼저 제안하기 확정 | `awaiting_talent` | `intro_request` 생성 |
| 후보자 수락 후 연결 중 | `connecting` | feedback positive |
| warm intro 완료 | `connected` | connected 상태와 normal stage 반영 |
| 후보자 거절 | `closed`, reason=`talent_declined` | feedback negative |

이 경계 덕분에 “추천 row는 후보자에게 보여도 되는가?”라는 질문의 답이 항상 yes가 된다. 별도의
후보자 visibility flag를 전역 reader에 도입할 필요가 없다.

## 5. `company_intro_candidates` durable ledger

### 5.1 이 테이블이 보존해야 하는 irreducible fact

새 테이블은 일시적인 LLM 추론을 저장하려고 만드는 것이 아니다. 다음 사실은 기존 데이터로 재구성할
수 없고 실제 독자가 있으므로 별도 persistence가 정당하다.

- 어느 회사·Role에 어떤 후보가 실제로 노출됐는가
- 회사가 `먼저 제안하기`와 `제안하지 않기` 중 무엇을 선택했는가
- 후보자가 수락하면 사용할 다음 stage와 회사 CC 수신자는 무엇인가
- 후보자에게 언제 실제 요청이 발송됐고 어떤 추천 row와 연결되는가
- 해당 흐름이 연결, 회사 제안하지 않기, 후보자 거절, 무응답, privacy 철회 중 무엇으로 끝났는가

독자는 company pipeline, company-side LLM, candidate delivery worker, candidate decision coordinator,
Company-first search Worker, 운영·분석이다.

### 5.2 권장 최소 필드

정확한 migration 이름과 타입은 구현 시 현재 schema convention에 맞춘다. 의미 계약은 아래와 같다.

| 필드군 | 필요한 값 |
| --- | --- |
| 식별 | `id`, `company_workspace_id`, `role_id`, `talent_id` |
| 선정 provenance | `selection_run_id`, `selected_at`, `selection_reason` |
| 상태 | `status`, `close_reason`, `revision`, `created_at`, `updated_at` |
| 후보자측 연결 | nullable `recommendation_id` |
| 회사 commitment | `requested_by_company_user_id`, `requested_at`, `next_stage_id`, `intro_recipient_emails` |
| 전달 증거 | `candidate_delivery_id`, `candidate_sent_at` |
| 후보자 결정·연결 | `talent_decision_at`, `connected_at` |

회사에 실제로 보여준 설명을 나중에 재현해야 한다면 `selection_reason`과 함께 작은 versioned
company-safe presentation snapshot을 둘 수 있다. 원본 Brief, Memory, 전체 resume, 모델 chain-of-thought,
응답 가능성 근거를 복제하지 않는다.

### 5.3 상태 값

상태 enum은 정성 판단이 아니라 side-effect와 권한을 지키는 machine contract다.

| 상태 | 의미 | Active board 노출 |
| --- | --- | --- |
| `ready` | 회사가 아직 결정하지 않음 | 예, `아직 후보자에게 제안하지 않음` |
| `awaiting_talent` | 후보자에게 요청을 보냈고 답변 대기 | 예, `후보자 답변 대기` |
| `connecting` | 후보자 수락이 확정됐고 CC 연결을 재시도 중 | 짧게 표시하거나 연결 준비 상태로 표시 |
| `connected` | warm intro 발송과 normal stage handoff 완료 | 먼저 제안 가능한 후보 칼럼에서는 아니오 |
| `passed` | 회사가 제안하지 않기로 결정 | 아니오 |
| `closed` | 후보자 거절, 무응답, Role 종료, privacy 철회 등 | 아니오 |

`closed`의 이유는 구조적으로 필요한 작은 set으로 둔다. 이는 추천 이유를 분류하는 enum이 아니라
재발송·재노출·후속 연락을 막는 lifecycle 종료 원인이다.

`ready`는 회사가 명시적으로 `먼저 제안하기` 또는 `제안하지 않기`를 선택하기 전에는 시간 경과만으로 `passed`나
`closed`로 바꾸지 않는다. Worker가 생성 후 7일을 “matured unresolved”로 집계하는 것은 다음 search 판단을
위한 관찰값일 뿐 자동 응답 추론이나 카드 만료가 아니다.

### 5.4 무결성 제약

- 같은 workspace–Role–Talent에는 active ledger가 하나만 존재한다.
- active ledger에 연결된 `recommendation_id`는 하나이며 다른 ledger와 공유하지 않는다.
- `ready`에는 `recommendation_id`, `requested_at`, `next_stage_id`가 없다.
- `awaiting_talent` 이후에는 `recommendation_id`, `requested_at`, `next_stage_id`, 유효한 회사 수신자가
  반드시 있다.
- `next_stage_id`는 같은 Role의 실제 custom process stage만 가리킨다.
- active Intro가 참조하는 next stage는 조용히 삭제할 수 없다. 먼저 active request를 해결해야 한다.
- `requested_at` 이후 회사의 단순 UI 조작으로 commitment를 삭제하거나 `ready`로 되돌리지 않는다.
- 모든 mutation은 expected revision 또는 현재 상태를 확인해 중복 클릭과 race를 막는다.

## 6. 회사 단위 후보 선정 계약

선정의 자세한 실행 절차는 별도 Worker 구현 계획을 정본으로 사용한다. 제품 수준의 결정은 다음과 같다.

### 6.1 수량

- 한 run에서 Role별 신규 `company_intro`는 최대 3명이다.
- 같은 talent를 같은 회사의 여러 Role에 중복 노출하지 않는다.
- Role별 3명은 quota가 아니며 0명도 정상이다.
- 세 명을 채우기 위해 약한 후보를 포함하지 않는다.
- 회사가 아직 피드백하지 않은 `ready` unique Talent가 30명이면 자동 run을 생략한다.
- 이번 run의 회사 전체 신규 수는 `30 - 현재 ready unique Talent 수`를 넘지 않는다.
- `awaiting_talent`와 `connecting`은 회사 피드백이 이미 있었으므로 30명 gate에는 포함하지 않지만,
  active route와 후보자 연락 정책에는 계속 포함한다.

### 6.2 기본 자격

- active이고 만료되지 않은 실제 internal Role
- `company_internal_roles.is_company_first_search=true`인 Role
- active company Slack integration과 해당 Role에 전달 가능한 enabled channel이 있음
- 현재 `연결 대기` unique Talent가 `max_pending_talents` 미만
- `testOnly`가 아닌 Role과 일반 production Talent
- 삭제되지 않은 Talent
- 현재 `profile_visibility=open_to_matches`
- `get_internal_recommendation`을 명시적으로 끄지 않은 Talent
- 후보자가 차단한 회사가 아님
- 명시적인 hard constraint와 현재 Role 조건이 충돌하지 않음
- exact pair 또는 실질적으로 같은 기회에 active recommendation, company request, pipeline, intro가 없음
- `candidate_requested_connection`처럼 후보자가 이미 이 기회의 진행을 요청한 active progress가 없음
- 명시적으로 종료된 exact pair를 새 run만으로 되살리지 않음
- 응답 가능성 `0 / LOW`가 아님

Mistral, Sierra, Wonderful은 이름 비교가 아니라 확인된 exact workspace id denylist로 정기 자동 실행에서
제외한다. 수동 shadow 평가 여부는 별도 명시적 scope로만 정한다.

`exceptional_only`는 후보자가 먼저 회사·Role을 보고 허용해야 하므로 company-first 자동 노출 대상이
아니다. `dont_share`는 물론 제외한다. 후보자가 이미 exact Role의 검토나 연결을 요청했다면
recommendation row가 아직 없더라도 회사 선확인 후보로 바꾸지 않고 기존 candidate-first 요청을
계속 처리한다.

### 6.3 Fit과 route는 분리한다

`talent_opportunity_fit`이 좋은지와 누구에게 먼저 보여줄지는 다른 판단이다.

1. 후보자가 Role을 실제로 수행할 근거가 충분한가
2. 회사가 이 사람에게 관심을 가질 구체적인 이유가 있는가
3. 후보자에게도 이 회사·Role을 제안할 합리적인 이유가 있는가
4. 남은 불확실성을 회사가 먼저 판단하거나 조건을 열어 주는 편이 유용한가
5. 지금 company-first로 두는 것이 기존 candidate-first 흐름을 지연하거나 중복시키지 않는가

강한 fit 후보를 전부 제외하면 이 칼럼에는 애매한 사람만 남는다. 따라서 strong anchor도 포함할 수
있다. 반대로 `recommend=false`, hold, 애매함만으로 자동 company-first 대상이 되지는 않는다.

Strong anchor를 company-first로 보내려면 “좋은 후보”라는 사실 외에 회사가 먼저 판단할 별도 가치가
있어야 한다. 예를 들어 회사가 level·scope·보상·근무 조건을 열 수 있거나, 비전형 경력의 전이 가능성을
회사가 직접 판단하면 다음 단계가 선명해지는 경우다. 이런 가치가 없다면 기존 candidate-first 흐름이
기본 경로다.

### 6.4 응답 가능성 사용법

| Band | 사용 |
| --- | --- |
| `2 / HIGH` | fit과 company upside가 비슷한 후보 사이의 작은 tie-break |
| `1 / UNKNOWN` | 정상 후보군. 신규·노출 부족을 감점하지 않음 |
| `0 / LOW` | 자동 company-first에서 제외 |

이 band는 수락 확률이나 후보자 품질이 아니며 회사에 절대 노출하지 않는다. 로그인 수, 조회 수 같은
약한 신호를 합산해 별도 heuristic score를 만들지 않는다.

### 6.5 Candidate-first와의 동시성

Company-first는 매주 월요일 오전 9시 KST에 별도 회사 단위 Worker로 실행되므로 모든 candidate-first
추천보다 항상 먼저 실행된다고 가정하지 않는다. 대신 fit 판단값과 실제 route를 분리한다.

1. `talent_opportunity_fit.recommend=true`만으로 좋은 후보를 retrieval에서 제외하지 않는다.
2. 후보자에게 실제 recommendation이 생겼거나 candidate-origin progress가 있으면 company-first에서
   제외한다.
3. Final commit 직전에 latest route를 다시 확인한다.
4. Company-first ready와 candidate-first recommendation 생성 경로가 같은 transaction lock과 guard를
   사용해 둘 중 하나만 성공하게 한다.
5. Company-first가 먼저 ready를 확정하면 candidate-first selector가 건너뛰고, candidate-first가 먼저
   실제 route를 만들면 이번 company-first selected pair를 제외한다.

Rerank 뒤 route conflict가 생긴 slot을 약한 후보로 자동 보충하지 않는다. 이를 위해 별도 route enum이나
중간 판단 테이블을 추가하지 않고, 실제 `company_intro` ledger 또는 candidate recommendation의 존재만
durable route로 사용한다.

## 7. Company pipeline과 board 구현

### 7.1 새 built-in stage

`OrgBuiltInStageId`에 `company_intro`를 추가하고 sort order를 `연결 대기`보다 앞에 둔다.

```text
먼저 제안 가능한 후보 → 연결 대기 → 기존 진행 stage들 → 최종 제안 → 프로세스 종료
```

단, 이 화살표는 카드가 반드시 `연결 대기`를 거친다는 뜻이 아니다. 후보자 수락 시 저장된 회사
승인을 이미 가지고 있으므로 먼저 제안 가능한 후보에서 지정 custom stage로 바로 handoff한다.

### 7.2 Board item을 discriminator로 구분한다

현재 board item은 recommendation이 항상 있다고 가정한다. 새 칼럼은 그 가정을 깨므로 nullable
`recommendationId`만 여기저기 허용하기보다 source를 명시한다.

```text
boardItemKind = company_intro | recommendation
boardItemId   = company_intro.id | recommendation.id
```

- `company_intro` item은 `companyIntroId`를 가지며 `ready`일 때 recommendation이 없다.
- `recommendation` item은 기존과 같이 recommendation id와 stage tag를 가진다.
- `awaiting_talent`에서 recommendation이 생성돼도 active ledger가 소유한 동안 normal recommendation
  board query에서는 제외해 같은 사람이 두 칼럼에 중복 표시되지 않게 한다.
- 연결 완료 후 ledger를 terminal로 바꾼 다음 recommendation을 normal board source로 handoff한다.

### 7.3 카드에 보이는 정보

`Open to matches`가 허용한 제한적 회사 공유 범위만 별도 projection으로 제공한다.

보일 수 있는 정보:

- 이름과 공개 가능한 headline
- 최근 경력·학력의 제한된 요약
- 이 Role에서 검토할 근거를 설명하는 Harper 작성 요약
- 회사가 판단하거나 열 수 있는 중요한 trade-off 한 가지
- 후보자가 아직 Role을 보지 않았는지, 이미 답변 대기인지

Harper 작성 요약은 후보자의 이름값이나 일반적인 형용사가 아니라 이 Role과 직접 연결되는 후보자
자신의 ownership·성과를 적어도 하나 포함한다. 중요한 trade-off가 있으면 회사가 실제로 판단할 수
있는 한 가지만 함께 쓴다. 후보자의 사적인 Search Brief, 정확한 보상 하한, sponsorship 요구, 응답
이력이나 Role별 관심 표현은 별도 회사 공유 권한이 없는 한 요약 근거로 노출하지 않는다.

보이지 않는 정보:

- 이메일, 전화번호와 직접 연락 수단
- resume 원문·파일·다운로드 URL
- 후보자 문서와 등록 링크 전체
- Brief, Memory, private chat 원문, Ops memo
- 응답 가능성 band와 무응답 이력
- 내부 fit score, label, 모델 판단 구조

현재 normal detail response가 email, resume, documents, 상세 profile을 포함하더라도
`company_intro` item에는 그대로 재사용하지 않는다. 별도 redacted response 또는 capability-aware server
projection을 사용한다. 화면에서 숨기기만 하고 API가 반환하는 방식은 금지한다.

### 7.4 카드 행동

`ready` 카드에는 다음 두 버튼만 표시한다.

- Primary: `먼저 제안하기`
- Secondary: `제안하지 않기`

`awaiting_talent` 카드에는 decision 버튼을 표시하지 않고, 발송 시각과 `후보자 답변 대기`만 보여준다.
`connecting`이면 회사가 다시 판단하는 버튼 대신 `연결 준비 중`과 실제 발송 재시도 상태를 보여준다.

다음 요소는 `company_intro` 전체에서 노출하지 않는다.

- 대신 질문하기
- 이력서 요청
- 미팅 요청·인터뷰 보내기
- 직접 연락
- 연락처 열기
- 기존 `Connect` / `Reject`
- 일반 stage 변경 menu

### 7.5 Drag and drop

Drag는 stage mutation이 아니라 회사의 의도를 시작하는 shortcut으로 해석한다.

- `ready` 카드를 정상 custom process stage로 drag하면 `먼저 제안하기` dialog를 열고 해당 stage를
  next stage로 preselect한다.
- dialog를 확정하기 전에는 카드가 이동하지 않는다.
- `연결 대기`, `연결됨`, `최종 제안`처럼 next process stage로 부적합한 built-in column에는 직접
  drop하지 못한다.
- 종료·archive 방향으로 drag하면 `제안하지 않기` 확인으로 해석할 수 있다. `프로세스 종료` stage tag를
  쓰지는 않는다. 아직 후보자 프로세스가 시작되지 않았기 때문이다.
- `awaiting_talent`과 `connecting` 카드는 drag할 수 없다.

권장 안내 의미:

> 아직 이 기회는 후보자에게 전달되지 않았어요. 먼저 제안하기를 선택하시면 Harper가 먼저 제안하고,
> 수락하는 즉시 두 분을 연결한 뒤 선택한 단계로 옮겨둘게요.

실제 문구는 [Company-side UX Writing Guide](../company-side-ux-writing-guide-ko.md)에 맞춰 UI와
company-side LLM에서 자연스럽게 작성한다. 위 예시를 deterministic exact copy로 강제하지 않는다.

## 8. `먼저 제안하기` dialog와 회사 commitment

### 8.1 Dialog가 반드시 확정할 것

1. 후보자는 아직 이 Role에 관심을 표시하지 않았다는 사실
2. Harper가 회사의 관심을 담아 후보자에게 먼저 제안한다는 사실
3. 후보자가 수락하면 회사의 두 번째 검토 없이 바로 연결된다는 사실
4. 연결 성공 후 들어갈 next process stage
5. warm intro 메일을 받을 회사 담당자 이메일

next stage가 하나도 없다면 현재 `연결 대기` Connect 흐름과 같은 stage 생성 UI를 제공한다. 생성된
stage id가 확정되기 전에는 먼저 제안하기를 완료할 수 없다.

### 8.2 허용하지 않는 연결 방식

이 dialog에서는 기존 Connect dialog의 모든 옵션을 그대로 열지 않는다.

- `direct contact`는 허용하지 않는다. 후보자의 연락처는 수락 전 공유되지 않는다.
- `schedule interview`를 후보자 수락 전 확정하지 않는다.
- `skip automatic contact`를 허용하지 않는다. 이 route의 약속은 수락 즉시 Harper가 CC로 연결하는
  것이다.
- warm intro를 받을 유효한 회사 이메일이 최소 한 개 있어야 한다.

기존 dialog의 stage 생성, 회사 수신자 선택, high-impact confirmation composition은 재사용할 수 있다.
그러나 action 의미와 허용 option은 먼저 제안 가능한 후보 전용으로 제한한다.

### 8.3 먼저 제안하기 command의 순서

외부 메일 발송을 DB transaction 안에서 직접 수행하지 않는다. 대신 다음 순서로 구성한다.

1. ledger를 읽고 `ready`와 expected revision을 확인한다.
2. Role active, Talent active, `open_to_matches`, 차단 회사, 중복 route, next stage, 회사 수신자를 다시
   검증한다.
3. 후보자에게 보여줄 fit summary와 요청 메일을 최신 public Role/company facts와 후보자 context로
   생성한다. 입력값은 untrusted source로 취급한다.
4. 하나의 transaction에서:
   - `opportunity_type=intro_request` recommendation을 만든다.
   - ledger에 recommendation, requester, next stage, recipients를 연결한다.
   - ledger를 `awaiting_talent`로 바꾼다.
   - 후보자 메일을 immediate outbox에 넣는다.
5. commit 뒤 delivery worker가 지연 시간 없이 발송한다.
6. 실제 발송 성공 시 `candidate_sent_at`과 delivery evidence를 기록한다.

후보자 `/career` 노출과 durable outbox 생성은 같은 commitment에 포함된다. provider가 일시적으로
실패해도 요청 자체를 없었던 일로 되돌리지 않고 같은 draft와 idempotency key로 재시도한다.
LLM draft 생성 자체가 실패해 아직 transaction을 commit하지 못했다면 카드는 `ready`에 남고 회사에
재시도를 안내한다.

### 8.4 Idempotency

- idempotency key는 `company_intro.id`와 request revision에 귀속한다.
- double click, browser retry, company-side LLM retry가 recommendation이나 메일을 둘 이상 만들지 않는다.
- commit 뒤 HTTP response가 끊겨도 다음 호출은 이미 `awaiting_talent`인 결과와 기존 delivery id를
  반환한다.
- 서로 다른 회사 사용자가 동시에 먼저 제안하기와 제안하지 않기를 선택하면 row lock과 expected status로
  정확히 하나만 성공한다.

## 9. 후보자 요청 메일과 final delivery

### 9.1 기존 internal recommendation에서 재사용할 것

- Role/company facts와 후보자 context를 조립하는 방식
- candidate-safe fit summary·fit reasons 생성
- locale 결정
- 이메일 subject/body 구조와 rendering
- durable outbox, 전송 evidence, retry와 bounce 처리
- 추천 link와 `/career` 카드 연결
- 현재 internal opportunity follow-up의 due 계산, live Role guard, suppression, progress 기록

### 9.2 그대로 재사용하면 안 되는 문구 의미

기존 internal recommendation은 Harper가 먼저 후보자에게 기회를 제안하고, 후보자 수락 후 회사에
공유하는 흐름이다. 회사 선확인 메일은 이미 회사가 제한된 프로필을 보고 관심을 표시했다. 따라서
별도 final-delivery action 또는 opportunity-type-aware prompt section이 필요하다.

메일은 다음 사실을 자연스럽게 전달해야 한다.

1. 제목과 첫 문장에서 회사가 이 Role로 후보자를 직접 만나고 싶어 한다는 가장 중요한 소식을 먼저 전한다.
2. 그 다음에 Harper가 후보자에게 맞을 가능성이 높은 기회라고 보고, `Open to matches` 설정에 따라 회사에
   제한된 프로필을 먼저 제안했고 회사가 검토 후 먼저 제안하기를 선택했다는 배경을 짧게 설명한다.
3. 회사·Role의 핵심 매력과 후보자에게 의미 있는 이유가 무엇인지 설명한다.
4. 중요한 trade-off가 있으면 숨기지 않되, 회사가 실제로 열기로 한 조건만 쓴다.
5. 수락하면 Harper가 회사와 바로 연결한다는 결과를 간결하게 설명한다. CC 수신자나 내부 첫 stage 이동은
   실행 세부사항이므로 후보자 안내의 전면에 두지 않는다.
6. 지금은 시점이 아니면 부담 없이 거절할 수 있고, Harper가 후보자의 private reason을 그대로 넘기지 않고
   회사에 자연스럽게 결과를 전달한다. 수락 전에는 연락처와 추가 profile 정보가 공유되지 않는다.

제목은 요청의 성격과 Role·회사를 한눈에 알 수 있게 짧게 쓴다. 영어라면
`Intro request: {Role} at {Company}` 같은 형태를 우선하고, 다른 언어에서는 같은 의미의 자연스러운 표현을
사용한다. 본문 첫 문장도 영어의 `Great news — {Company} wants to meet you for its **{Role}** role.`처럼
회사 관심을 직접적으로 전하되, 입력에서 hiring manager가 확인되지 않았다면 특정 actor를 만들어내지 않는다.

회사 선확인 메일을 포함한 모든 internal recommendation은 템플릿이나 닫힌 형식 목록에 고정하지 않는다. LLM이
실제 근거, 언어, 정보 밀도, 최근 발송 이력에 맞춰 가장 자연스러운 구조를 직접 설계한다. 문단, bullet, 짧은 label,
`**The catch:**` 등은 가능한 예시일 뿐 필수 요소나 우선순위가 아니며, 그 밖의 구성도 자유롭게 사용할 수 있다.
다만 형식 변화를 위해 없는 내용이나 단점을 만들지 않고, 회사·Role의 매력, 개인화된 추천 이유, 다음 행동은
어떤 구조에서도 쉽게 이해할 수 있어야 한다.

Location과 work mode는 기본적으로 가능 여부나 조건 호환성을 알려주는 보조 정보로만 다룬다. 현재 거주지,
지원 가능 지역, 조건 충족, 명시적 반대가 없다는 사실은 해당 지역이나 출근 형태를 선호한다는 근거가 아니다.
후보자의 결정에 유용하면 짧게 언급할 수 있지만 추천의 핵심 이유로 강조하지 않으며, 후보자가 명시적으로 원한다고
말한 근거가 있을 때만 선호와 맞는다고 표현한다.

회사에 먼저 보여준 내부 점수, reply confidence, Company Run, candidate pool, prompt 이름은 쓰지 않는다.
“회사가 전체 프로필을 검토했다”, “지원했다”, “면접이 확정됐다”처럼 실제보다 앞선 주장도 하지 않는다.

### 9.3 Candidate-facing recommendation 내용

`talent_opportunity_recommendation`에는 기존 `IntroRequest` type을 사용한다.

- `fit_summary`, `fit_reasons`, `tradeoffs`, `preference_fit`에는 candidate-safe 내용만 쓴다.
- company-only pass/selection reason이나 private company context를 복사하지 않는다.
- `recommended_at`은 회사가 먼저 제안하기를 commit한 시점이다.
- source Role이 internal이어도 action routing은 `source_type`만 보지 않고 `opportunity_type`을 먼저 본다.

마지막 항목이 중요하다. 현재 internal Role의 positive feedback 경로가 source type을 보고 기존 internal
acceptance RPC로 들어가면 `intro_request`의 즉시 연결 계약을 놓칠 수 있다. UI, chat, email reply 모두
`opportunity_type=intro_request`를 최우선 discriminator로 사용해야 한다.

## 10. 기존 internal 기회와 같은 follow-up

“같은 follow-up”은 후보자에게 동일한 문장을 보낸다는 뜻이 아니라, 현재 internal recommendation의
운영 정책과 delivery machinery를 재사용한다는 뜻이다.

- 실제 첫 요청이 성공적으로 전달된 시점부터 due를 계산한다.
- 현재 internal recommendation과 같은 follow-up 간격·횟수·bundling 정책을 따른다.
- Role이 종료되거나 요청이 terminal이면 발송 직전에 다시 제외한다.
- 이미 후보자가 답했거나 연결 중이면 보내지 않는다.
- delivery 실패는 무응답으로 계산하지 않는다.
- follow-up도 reply confidence의 하나의 contact episode로 연결한다.

Copy는 opportunity type을 반영한다.

- internal recommendation: “Harper가 전에 추천드린 기회”
- intro request: “회사가 Harper를 통해 먼저 요청드린 연결”

기존 `internal_follow_up` prompt가 intro request에 그대로 적용돼 Harper가 먼저 추천했다고 잘못 말하지
않게 한다. 공통 `connection opportunity follow-up` target contract로 일반화하거나 type별 prompt section을
둘 수 있지만, cadence와 delivery guard를 복제한 별도 scheduler는 만들지 않는다.

## 11. `/career` 후보자 경험

### 11.1 카드

현재 존재하는 `OpportunityType.IntroRequest`를 사용하되 일반 internal recommendation과 시각·설명에서
구분한다.

- type badge: `직접 연결 요청`
- company-interest callout: 회사가 먼저 연결을 요청했다는 사실
- timeline: Harper가 먼저 회사에 제안 → 회사가 먼저 제안하기 선택 → 회원님 결정 대기
- primary action: `Intro 수락` 또는 현재 type의 명확한 연결 수락 표현
- secondary action: `거절하기`
- 수락 결과: 회사 담당자와 즉시 CC 연결

새 modal은 직접 구현하지 않고 `/career`의 `TalentCareerModal` composition을 사용한다. 모든 새 copy는
`t(key, koSource)`로 작성하고 Codex가 영어 번역을 직접 작성한다.

### 11.2 수락 modal

후보자가 다음을 한 번에 이해해야 한다.

- 이 요청은 회사가 먼저 관심을 보이고 보낸 요청이다.
- 수락하면 Harper가 회사 담당자와 현재 후보자를 이메일로 바로 연결한다.
- 회사의 추가 Connect 판단을 기다리지 않는다.
- 연결을 위해 이메일과 필요한 profile 정보가 회사에 공유된다.
- 회사가 후보자에게 실제로 약속한 다음 과정이 있으면 candidate-safe한 말로 설명한다. 내부 custom
  stage label을 그대로 노출하지 않는다.

권장 의미:

> {회사}에서 {Role}로 먼저 연결을 요청했어요. 수락하면 Harper가 회사 담당자와 회원님을 이메일로
> 바로 연결해드려요. 회사가 실제 다음 과정을 함께 제시했다면 그 내용도 여기서 확인할 수 있어요.

### 11.3 거절 modal

일반 추천 거절보다 회사 요청에 답하는 상황임을 반영한다.

- 회사가 먼저 요청했지만 부담 없이 거절할 수 있음을 말한다.
- 거절하면 연락처와 추가 정보는 공유되지 않고 연결도 시작되지 않는다.
- 거절 이유는 다음 추천 개선을 위한 선택 입력이다.
- 자유 입력 이유를 회사에 그대로 전달하지 않는다. 회사에는 연결하지 않기로 했다는 결과만 기본
  공유하고, 후보자가 별도로 공유를 허용한 내용만 전달한다.

회사가 이미 limited profile을 보았으므로 “회사에는 아무 정보도 공유되지 않았다”는 거짓 copy는 쓰지
않는다.

### 11.4 Career LLM과 이메일 답장

버튼, Career chat, 이메일 reply 중 어느 채널에서 답해도 하나의 canonical decision command를 호출한다.

- positive: company intro acceptance coordinator
- negative: company intro decline coordinator
- ambiguous reply: 기존 대화 LLM이 의미를 확인하고 확정된 결정만 tool로 기록

채널별로 recommendation feedback을 직접 update하는 코드를 복제하지 않는다. 같은 request에 서로 다른
채널이 거의 동시에 답해도 idempotent하게 같은 결과를 반환한다.

## 12. 후보자 수락과 즉시 CC 연결

### 12.1 수락은 회사의 두 번째 판단을 만들지 않는다

회사는 먼저 제안하기 때 이미 다음을 확정했다.

- 후보자가 수락하면 연결한다.
- 어느 process stage에서 시작한다.
- 어떤 회사 사람들이 warm intro 메일을 받는다.

따라서 후보자 수락 후 회사 inbox나 `연결 대기`에 다시 Connect/Reject task를 만들지 않는다.

### 12.2 공통 warm intro service

현재 company-side `연결 대기` 수락 경로의 다음 기능을 공통 서비스로 추출해 그대로 사용한다.

- `buildOrgIntroEmailDraft`의 locale-aware prompt
- candidate professional summary 안전 projection
- unfavorable candidate 정보 생략 검사
- 두 사람의 이름·회사·Role을 보존한 warm intro copy
- `sendOrgIntroEmail`의 capture thread, reply-to, CC, idempotency, `career_email_messages` 기록
- Slack/activity notification

현재 함수가 로그인한 company user object에 강하게 묶여 있다면, 내부 구현을 다음처럼 분리한다.

```text
resolve and validate connection plan
  → build warm intro draft
  → send idempotent warm intro
  → commit normal pipeline handoff
```

두 entry point가 같은 command를 호출한다.

- 회사가 `연결 대기`에서 Connect
- 후보자가 company-first 제안을 수락

### 12.3 수락 coordinator의 상태 전이

1. request, recommendation, Role, Talent를 lock하고 `awaiting_talent`인지 확인한다.
2. recommendation을 positive feedback으로 기록하고 ledger를 `connecting`으로 바꾼다.
3. 저장된 next stage와 현재 유효한 회사 수신자를 확인한다.
4. 같은 warm intro idempotency key로 CC 메일을 발송한다.
5. 발송 성공 후:
   - normal stage tag를 저장된 custom stage로 설정한다.
   - recommendation `processed_stage`를 동기화한다.
   - progress와 notification을 기록한다.
   - ledger를 `connected`로 닫는다.
6. board는 먼저 제안 가능한 후보 칼럼에서 카드를 제거하고 normal next stage에 표시한다.

후보자가 수락한 뒤 warm intro provider가 실패해도 후보자 수락을 취소하거나 회사에게 다시 결정하게
하지 않는다. `connecting` 상태에서 자동 재시도하고, 장기 실패 시 Ops와 회사에 실행 문제만 알린다.
성공하지 않았는데 normal stage로 옮겨 연결된 것처럼 보여주지는 않는다.

### 12.4 Next stage와 담당자 변화

- next stage는 같은 Role의 custom stage여야 하며 active request가 참조하는 동안 삭제를 제한한다.
- 회사 requester가 workspace를 떠났다면 현재 Role assignee와 workspace membership을 다시 확인한다.
- 저장된 수신자 중 더 이상 유효하지 않은 계정은 제외하고, 유효한 수신자가 하나도 없으면 자동 연결을
  버리지 말고 `connecting`에 유지하며 workspace admin에게 수신자 보완을 요청한다.
- 이는 새로운 company hiring decision이 아니라 이미 한 약속을 이행하기 위한 운영 보완이다.

## 13. 제안하지 않기, 후보자 거절, 무응답

### 13.1 회사 제안하지 않기

- ledger를 `passed`로 바꾸고 active board에서 제거한다.
- recommendation과 candidate email을 만들지 않는다.
- candidate에게 어떤 알림도 보내지 않는다.
- optional reason은 Company Context의 evidence가 될 수 있지만 한 번의 제안하지 않기를 회사 전체의 영구 hard
  preference로 만들지 않는다.
- `process_stopped` tag를 만들지 않는다. 후보자와 회사 사이 process가 아직 시작되지 않았다.

### 13.2 후보자 거절

- recommendation feedback을 negative로 기록한다.
- ledger를 `closed`, reason=`talent_declined`로 닫는다.
- active company board에서 제거한다.
- 회사에는 후보자가 이번 연결을 진행하지 않기로 했다는 사실만 전달한다.
- 후보자의 private reason은 기본적으로 전달하지 않는다.
- `process_stopped`에 넣지 않는다. 이는 회사가 연결된 후보자의 process를 중단한 상태가 아니다.

### 13.3 무응답

- 기존 internal recommendation과 같은 follow-up이 끝날 때까지 `후보자 답변 대기`로 둔다.
- 정책상 response window가 끝나면 `closed`, reason=`no_response`로 닫고 board에서 제거한다.
- 회사에는 `답변을 받지 못해 이번 요청을 종료했다`고만 알린다.
- 무응답을 후보자 거절이나 회사 hiring preference로 기록하지 않는다.
- 실제 첫 메일이 전달되지 않았다면 response window와 reply-confidence nonresponse episode를 시작하지
  않는다.

## 14. 탈퇴·공개 범위·차단 변경

### 14.1 두 겹의 안전장치

후보자 설정 변경 뒤 cleanup job이 끝나기 전 잠깐이라도 회사에 계속 보이면 안 된다.

1. **Read-time guard:** 모든 board, detail, company-side LLM read가 현재 Talent와 설정을 join해
   `deleted_at is null`, `profile_visibility=open_to_matches`, blocked-company 없음인 경우에만 반환한다.
2. **Durable cleanup:** 계정 삭제, 공개 범위 변경, blocked company 변경 event가 active ledger와 queued
   delivery를 찾아 terminal로 닫고 후속 연락을 취소한다.

한쪽만 구현하지 않는다. cleanup만 두면 지연 중 노출이 남고, read filter만 두면 outbox와 follow-up이
계속 발송될 수 있다.

### 14.2 상태별 처리

| 시점 | 처리 |
| --- | --- |
| `ready` | 즉시 회사에서 숨기고 `closed/visibility_withdrawn` 처리. 후보자에게 아무것도 보내지 않음 |
| 요청 메일 queued, 아직 미발송 | 회사에서 숨기고 outbox 취소. recommendation은 closed 처리해 새 카드에서 제외 |
| 요청 메일 이미 발송, 답변 전 | 회사에서 숨기고 follow-up 중단. 후보자 `/career`에는 이미 받은 요청의 종료 사실만 history로 보존하고 stale acceptance를 막음 |
| `connecting`, warm intro 미발송 | 즉시 회사에서 숨기고 아직 시작하지 않은 발송을 중단한다. 더 나중의 공개 범위 변경을 철회로 존중해 `closed/visibility_withdrawn`으로 닫는다. 이미 provider가 발송을 확정했다면 아래 `connected` 정책으로 처리 |
| `connected` | 이번 pre-intro stage의 범위를 벗어남. 기존 connected-profile privacy 정책을 적용 |

이 문서의 기본안은 `Open to matches`에서 다른 값으로 바뀐 active intro request를 자동으로 되살리지
않는 것이다. 다시 `Open to matches`로 돌아와도 새 run이 최신 조건에서 새로 판단해야 한다.

### 14.3 회사에 보이는 결과

회사에는 설정 변경 이유나 탈퇴 여부를 노출하지 않는다. 카드와 profile detail은 즉시 사라지고,
이미 요청을 보낸 건이라면 필요한 경우 `현재 더 이상 진행할 수 없어 요청이 종료되었습니다` 정도의
outcome만 남긴다. candidate private setting을 설명하지 않는다.

## 15. Company-side LLM 계약

### 15.1 Context에 추가할 최소 사실

Company-side LLM이 normal pipeline candidate와 `company_intro`를 구분할 수 있도록 각 candidate read에
다음 user-safe semantics를 제공한다.

- 후보자는 아직 Role을 보지 않았는지 또는 답변 대기인지
- 후보자 관심이 확인되지 않았다는 사실
- 회사가 지금 할 수 있는 action
- 먼저 제안하기가 후보자 수락 시 즉시 연결 약속이라는 사실
- 이미 요청했다면 발송 여부와 다음 stage

원시 `profile_visibility`, reply score, 내부 status enum, Brief, Memory, candidate message 원문은 prompt에
넣지 않는다. code가 사용자에게 필요한 의미로 projection한다.

### 15.2 중앙 capability projection

Stage 이름을 각 component와 tool에서 제각각 검사하지 않는다. server가 candidate state에서 다음
capability를 한 번 계산하고 UI와 company-side LLM tool이 같은 결과를 사용한다.

| Capability | `company_intro/ready` | `company_intro/awaiting_talent` | Normal pipeline |
| --- | --- | --- | --- |
| 먼저 제안하기 | 예 | 아니오 | 아니오 |
| 제안하지 않기 | 예 | 아니오 | 기존 상태에 따름 |
| Move stage | 아니오 | 아니오 | 기존 상태에 따름 |
| Ask question/resume | 아니오 | 아니오 | 기존 상태에 따름 |
| Request meeting/interview | 아니오 | 아니오 | 기존 상태에 따름 |
| Direct contact | 아니오 | 아니오 | 기존 상태에 따름 |
| Connect/Reject | 아니오 | 아니오 | `연결 대기`에서만 예 |
| Read full contact/profile | 아니오 | 아니오 | 기존 공유 상태에 따름 |

모든 write API와 tool executor는 capability를 server에서 다시 검사하고 금지된 action에는 409/403으로
실패해야 한다. prompt 지시나 button 숨김은 권한 경계가 아니다.

### 15.3 Tool 설계

먼저 제안하기는 후보자 메일이라는 새로운 외부 side effect가 있으므로 전용 company action이 정당하다.
권장 방식은 하나의 decision tool이 다음 최소 입력만 받는 것이다.

```text
candidate/intro item identifier
decision = request_intro | pass
request_intro일 때 next stage와 company recipients
optional human-readable reason
```

Company-side LLM은 기존 high-impact confirmation 흐름을 사용해 사용자가 실제 효과를 이해한 뒤 실행한다.
새 상황마다 `review`, `switch`, `move`, `send` tool을 따로 만들지 않는다.

### 15.4 대화 행동 예

- “이 사람한테 이력서 받아줘”
  - 아직 후보자와 연결되지 않았음을 설명하고, 먼저 제안할지 묻는다.
- “인터뷰 단계로 옮겨”
  - 먼저 제안하기 confirmation을 열고 해당 interview stage를 next stage로 제안한다.
- “바로 연락처 줘”
  - 수락 전에는 연락처를 공유할 수 없다고 설명하고 먼저 제안하기를 안내한다.
- “이 사람은 패스”
  - 제안하지 않기 효과를 확인하고 후보자에게 연락하지 않은 채 종료한다.
- “이미 관심 있는 거 아니야?”
  - Harper가 회사에 먼저 제안한 상태이며 후보자 관심은 아직 확인되지 않았다고 바로잡는다.

이 예들은 경험을 설명하기 위한 것이며 keyword branch나 scenario state machine으로 구현하지 않는다.

## 16. Company web·Slack 알림

- 새 후보가 생겼다는 알림은 후보 수와 회사가 해야 할 행동을 먼저 말한다.
- 후보자가 아직 Role을 보지 않았다는 사실을 숨기지 않는다.
- `먼저 제안하기`와 `제안하지 않기`는 web과 Slack에서 같은 의미와 같은 server command를 사용한다.
- `먼저 제안하기` 후에는 후보자 답변 대기로 표시하고 같은 결정을 재촉하지 않는다.
- 후보자 수락 시 warm intro가 발송되고 next stage로 이동했다는 실제 결과만 알린다.
- 후보자 거절·무응답·요청 불가 시 그 outcome만 알리고 private reason을 추측하지 않는다.

회사에게 보내는 모든 반복 용어와 상태 문구는 구현 시 Company-side UX Writing Guide에 정식으로 추가해
web, Slack, company-side LLM의 의미를 맞춘다.

## 17. 중복, race, 실패 처리

### 17.1 Route uniqueness

한 pair에는 한 시점에 하나의 active route만 둔다.

- 후보자에게 이미 internal recommendation이 전달됐으면 새 company-first 카드로 만들지 않는다.
- company-first `ready`인 동안 candidate-first delivery가 같은 pair를 선점하지 않는다.
- 먼저 제안하기 뒤에는 formal `intro_request`가 정본이며 기존 internal recommendation을 새로 만들지 않는다.
- 회사 제안하지 않기와 후보자 거절은 exact pair의 명시적 terminal evidence다. 단순 새 run으로 되살리지 않는다.
- materially changed Role이나 명시적 수동 재검토가 필요하면 별도 현재성 검증을 거친다.

이 uniqueness는 application-level 사전 조회만이 아니라 DB unique constraint/transaction guard로 지킨다.

### 17.2 대표 실패와 기대 결과

| 실패 | 기대 결과 |
| --- | --- |
| 후보자 요청 draft 생성 실패 | recommendation/outbox를 만들지 않고 `ready`; 회사에 재시도 가능 안내 |
| DB commit 뒤 HTTP timeout | retry가 기존 request와 delivery를 반환; 중복 메일 없음 |
| 후보자 요청 메일 provider 실패 | `/career` 요청은 유지하고 동일 outbox로 재시도; 무응답 clock 시작 안 함 |
| 후보자 수락과 Role 종료 동시 발생 | lock 후 최신 Role 기준으로 하나만 성공; unavailable이면 연결 성공을 주장하지 않음 |
| 후보자 수락 뒤 warm intro 실패 | 수락은 유지, `connecting`에서 재시도; 회사 재승인 요구 없음 |
| next stage 삭제 시도 | active intro가 참조하면 삭제 차단 또는 먼저 대체 stage를 지정하도록 요구 |
| 공개 범위 변경과 board read race | read-time guard가 우선 숨김; cleanup이 outbox/follow-up 종료 |
| Company-first Worker run 두 개 동시 실행 | active unique key와 run idempotency로 같은 카드 중복 생성 없음 |

## 18. 현재 코드에서 예상되는 변경 지점

이는 file-by-file 구현 명세가 아니라 누락을 막기 위한 영향 범위다.

### 18.1 Company board·stage

- `src/lib/org/server.ts`
  - `OrgBuiltInStageId`, `buildBoardStages`, `OrgBoardItem` source discriminator
  - recommendation query와 company intro ledger의 union projection
  - company intro용 redacted profile read
  - normal recommendation과 active intro의 duplicate suppression
- `src/lib/org/pipelineStage.ts`
  - `company_intro` label과 waiting bucket
- `src/components/org/OrgCandidateCard.tsx`
  - substatus와 `먼저 제안하기` / `제안하지 않기`
- `src/components/org/OrgRoleTalentBoard.tsx`, `OrgPipeline.tsx`
  - drag interception과 dialog routing
- `src/components/org/TalentDetailSimpleView.tsx`, `useOrgCandidateActions.ts`
  - capability 기반 action suppression

### 18.2 Company action·LLM

- 새 ledger read/write server module과 migration
- company-side LLM data projection, prompt format, tool schema와 executor
- 기존 stage/contact/meeting/question API의 server-side deny guard
- web과 Slack이 호출하는 공통 Intro decision command

### 18.3 Candidate delivery·Career

- direct Intro request용 final-delivery prompt section과 immediate outbox type
- `OpportunityType.IntroRequest` 카드·info·accept/reject modal copy
- candidate history/read의 intro-specific progress
- Career LLM과 이메일 reply가 호출하는 canonical intro decision command
- 현재 internal follow-up scheduler가 intro request를 type-aware하게 처리하도록 확장

### 18.4 Warm intro·handoff

- 기존 `buildOrgIntroEmailDraft`와 `sendOrgIntroEmail`을 session-bound stage mutation에서 분리한 공통 service
- 저장된 next stage와 recipients로 실행하는 candidate-acceptance entry point
- success 뒤 tag, processed stage, progress, Slack notification의 한 번뿐인 handoff

### 18.5 Privacy invalidation

- board/detail/agent read의 current visibility guard
- profile visibility·blocked companies·soft delete 변경 시 ledger/outbox/follow-up cleanup
- 이미 연결된 normal pipeline과 아직 연결되지 않은 company intro의 서로 다른 처리

## 19. 구현 순서

### Phase 1. 데이터와 권한 경계

- `is_company_first_search`, company run queue와 Slack outbox migration
- ledger migration, status/unique constraints, next-stage reference
- active pair exclusion query
- company intro redacted read projection
- 중앙 capability 계산과 server-side deny guard

이 단계에서는 feature flag 뒤에서만 새 item을 읽고 사용자에게 노출하지 않는다.

### Phase 2. Selection Worker shadow

- Python scheduler의 월요일 09:00 KST company run enqueue
- query planner, safe SQL retrieval, parallel scoring, company-wide reranking
- reply confidence와 candidate-first route guard
- frozen eval과 production read-only shadow

이 단계에서는 ready ledger와 company Slack을 쓰지 않는다.

### Phase 3. Company experience

- board built-in stage와 union item
- card status, 먼저 제안하기/제안하지 않기 dialog
- drag interception
- company-side LLM read·tool·prompt
- selected-safe writer, durable Slack outbox와 web/Slack parity

Candidate outbound는 아직 shadow/mock transport로 검증할 수 있다.

### Phase 4. Candidate request delivery

- 먼저 제안하기 transaction
- `intro_request` recommendation 생성
- candidate-safe final delivery와 immediate outbox
- `/career` 카드·modal·번역
- follow-up reuse와 suppression

### Phase 5. Acceptance, privacy invalidation and rollout

- canonical candidate decision command
- warm intro common service
- stored next-stage handoff
- UI/chat/email reply idempotency
- connection failure recovery
- visibility, blocked company, delete event cleanup
- read-time guard와 stale link
- metrics·alerts·운영 화면
- shadow → selected workspace pilot → 확대

## 20. 검증 계획

### 20.1 상태·DB

- ready item에는 recommendation이 없고 candidate history count도 변하지 않는다.
- 먼저 제안하기 한 번이 recommendation 하나와 outbox 하나만 만든다.
- 제안하지 않기는 candidate-side data를 만들지 않는다.
- same pair에 active candidate-first와 company-first route가 공존하지 않는다.
- next stage가 없거나 다른 Role의 stage면 먼저 제안하기가 실패한다.

### 20.2 권한·privacy

- ready와 awaiting item API에서 email, resume, docs, private context가 반환되지 않는다.
- 질문, resume, meeting, interview, stage mutation, direct contact API를 직접 호출해도 거부된다.
- `open_to_matches → exceptional_only/dont_share`, blocked company 추가, soft delete 직후 board/detail/agent read에서
  즉시 사라진다.
- queued outbound와 follow-up도 취소된다.
- test-only Role이 어떤 company-first selection에도 들어오지 않는다.

### 20.3 Company UX

- 새 카드에서 두 action만 보인다.
- custom stage로 drag하면 card가 먼저 움직이지 않고 먼저 제안하기 dialog가 열린다.
- 먼저 제안하기 버튼 경로에서도 next stage를 선택·생성해야 한다.
- 발송 뒤 같은 칼럼에 `후보자 답변 대기`로 남는다.
- Company-side LLM이 후보자 관심을 잘못 확정하거나 질문·인터뷰 action을 실행하지 않는다.

### 20.4 Candidate UX

- `/career`에서 일반 Harper 추천과 회사의 직접 연결 요청이 구분된다.
- 수락 modal이 즉시 CC 연결과 next step을 설명한다.
- 거절 modal이 이미 limited profile이 회사에 보였다는 사실과 모순되지 않는다.
- UI, Career chat, email reply의 수락/거절 결과가 같다.
- intro request follow-up이 “Harper가 전에 추천했다”는 잘못된 origin을 말하지 않는다.

### 20.5 Connection E2E

- 후보자 수락 → 한 번의 CC warm intro → normal next stage 이동
- company recipient 여러 명, requester 탈퇴, duplicate acceptance, provider retry
- warm intro 실패 시 `connecting`, 성공 전 normal stage 미표시, 재승인 없음
- 후보자 거절·무응답은 `process_stopped`로 잘못 표시되지 않음

Production E2E가 필요하면 Role에 `information.testOnly=true`와 stable `testFixture`를 먼저 기록하고,
일반 Talent matching path와 완전히 격리한다.

## 21. 지표와 운영

### 21.1 Funnel

- company-first active card 수
- `먼저 제안하기` / `제안하지 않기` 결정률과 결정 시간
- 먼저 제안하기 뒤 candidate delivery 성공률
- 후보자 전체 reply, 수락, 거절, 무응답 비율
- 후보자 수락 뒤 warm intro 성공률과 소요 시간
- normal process stage 진입과 이후 interview 진행률
- candidate-first와 중복 없이 새로 만든 mutual connection

### 21.2 Guardrail

- 후보자에게 보이기 전 recommendation이 생성된 건수
- privacy/blocked/deleted Talent 노출 수
- 수락 전 email·resume·document 유출 수
- 금지된 company action server 호출 성공 수
- duplicate recommendation/email/connection 수
- 후보자 수락 뒤 회사 재승인이 필요했던 수
- warm intro 장기 `connecting` backlog
- reply confidence `LOW` 자동 노출 수
- 미결정 company intro backlog

Interaction 수만 늘었다고 성공으로 보지 않는다. 회사 결정률, 후보자 응답, 실제 mutual connection과
privacy guard가 함께 좋아져야 한다.

## 22. 확정 결정과 남은 결정

### 22.1 이 문서에서 확정

| 질문 | 결정 |
| --- | --- |
| 새 stage가 필요한가 | 예. 내부 id `company_intro`, UI `먼저 제안 가능한 후보` |
| 회사 선노출 시 recommendation을 만들까 | 아니오. 전용 ledger만 생성 |
| 언제 intro_request recommendation을 만들까 | 회사가 먼저 제안하기를 확정할 때 |
| 이 stage에서 가능한 action | `먼저 제안하기`, `제안하지 않기`만 |
| 먼저 제안하기 뒤 board에서 사라질까 | 아니오. 같은 칼럼에서 후보자 답변 대기로 유지 |
| 후보자 수락 뒤 연결 대기에 둘까 | 아니오. 기존 warm intro를 실행하고 저장된 next stage로 이동 |
| next stage는 언제 정할까 | 먼저 제안하기 전에 회사가 선택·생성 |
| follow-up은 새로 만들까 | 기존 internal recommendation policy와 machinery를 재사용하고 copy만 origin-aware하게 함 |
| 공개 범위가 바뀌면 | company read 즉시 숨김 + outbox/follow-up durable cleanup |
| 최대 몇 명인가 | Role별 run 최대 3명, 회사 내 Talent 중복 금지, unresolved ready 30명 hard gate, quota 아님 |
| candidate-first와 어느 쪽이 먼저인가 | 고정 선후관계를 가정하지 않고 shared transaction guard에서 실제 route 하나만 확정 |
| 언제 실행하는가 | Python Worker scheduler가 매주 월요일 오전 9시 KST에 회사 단위로 enqueue |

### 22.2 나중에 정할 것

- pilot workspace와 feature flag rollout 순서
- 현재 internal follow-up 정책이 바뀔 때 intro request에 같은 변경을 자동 적용하는 구체적 모듈 경계
- card의 최종 label·microcopy. 의미는 본 문서와 Writing Guide를 따르되 실제 UI에서 검증 후 확정

## 23. 명시적으로 하지 않는 것

- 회사 interaction을 늘리기 위해 fit bar를 낮추지 않는다.
- `recommend=false`나 애매한 후보의 배출구로 만들지 않는다.
- 정확히 세 명을 채우지 않는다.
- 회사에 보이기만 한 후보를 candidate recommendation으로 저장하지 않는다.
- hidden recommendation row를 만들고 모든 candidate reader가 잘 숨겨 주기를 기대하지 않는다.
- `company_talent_requests`를 prospect lifecycle로 확장하지 않는다.
- 후보자 응답 전 질문, resume, interview, meeting, direct contact를 허용하지 않는다.
- UI에서만 action을 숨기고 API를 열어두지 않는다.
- 후보자 수락 뒤 회사의 두 번째 Connect/Reject를 만들지 않는다.
- candidate decline을 회사의 `프로세스 종료`로 표시하지 않는다.
- 공개 범위 변경 뒤 async cleanup만 믿고 잠시 계속 노출하지 않는다.
- 회사 card와 candidate email에 Brief, Memory, reply score, 내부 fit label을 노출하지 않는다.
- 몇 개 예시를 keyword·regex·scenario-specific prompt branch로 구현하지 않는다.
- 이 문서를 현재 production 기능 설명으로 사용하지 않는다.

최종적으로 회사가 보는 것은 “이미 지원한 후보자”가 아니라 Harper가 먼저 의견을 묻는 제한된 후보
제안이다. 회사가 `먼저 제안하기`를 선택한 뒤에야 후보자에게 공식 기회가 생기며, 그때 회사는 이미
수락 시 연결할 준비를 끝내야 한다. 이 순서를 데이터, UI, LLM, 메일, privacy guard가 모두 같은
의미로 지킬 때 회사 interaction 증가가 후보자 신뢰를 해치지 않고 실제 연결 증가로 이어진다.
