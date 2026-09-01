# Company Context Run: Codex 반복 실행 런북

- 작성일: 2026-08-14
- 용도: Codex 예약 작업이 현재 claim 가능한 queued role을 모두 순차 처리할 때 읽는 문서
- 기능·구현 계약: [Company Context Run 개요](./company-context-run-overview-ko.md)

이 문서는 migration, 최초 배포, 테스트 계획을 설명하지 않는다. 이미 queue에 들어온 role 하나의 context를 올바르게 갱신하고 연결 후보를 평가하는 데만 집중한다.

## 1. 예약 작업의 계약

예약 작업이 깨어날 때마다 다음 순서를 따른다.

1. Root와 project `AGENTS.md`, 이 런북을 읽는다.
2. Canonical helper로 weekly due-enqueue를 실행한다. Due 조건을 직접 다시 판단하지 않는다.
3. `available_at <= now()`인 `queued` row 하나를 atomic claim한다.
4. Claim할 row가 없으면 아무 write 없이 종료한다.
5. Claim한 `run_id`와 `role_id` 하나의 전체 작업을 끝낸다.
6. 해당 row가 `succeeded`, `canceled`, `failed` 중 하나의 terminal 상태가 된 뒤 다음 row를 claim한다.
7. Claim할 row가 없을 때까지 3~6을 반복한다. 동시에 여러 role을 claim하거나 처리하지 않는다.

직접 table을 임의 update하지 말고 enqueue, claim, save, finish, fail을 담당하는 repository helper를 사용한다.

자동 queue는 `is_auto=true`인 role만 포함한다. Helper가 이 조건을 enqueue와 claim 양쪽에서 검증한다. `is_auto=false` role을 임의로 자동 enqueue하지 않는다. 명시적인 `manual` run만 예외다.

### 1.1 실제 시작 명령

모든 명령은 project root에서 실행한다.

```bash
cd /Users/gimhojin/Desktop/harper/harper_beta
python3 scripts/company_role_recurring_matching.py preflight
python3 scripts/company_role_recurring_matching.py start \
  --enqueue-due \
  --runner codex-scheduled
```

첫 claim에서만 `--enqueue-due`를 사용한다. 한 row를 terminal 상태로 끝낸 뒤 다음 claim부터는 아래 명령을 반복한다.

```bash
python3 scripts/company_role_recurring_matching.py start \
  --runner codex-scheduled
```

`start` JSON의 `started=false`이고 reason이 `no_queued_run`이면 현재 claim 가능한 queue가 빈 것이므로 전체 예약 실행을 정상 종료한다. Inactive, expired, missing, non-internal, auto-disabled 등의 이유로 row가 즉시 `canceled`로 닫히면 그 row만 terminal 처리된 것이다. 여기서 예약 실행을 멈추지 않고 다음 row를 claim한다.

`started=true`이면 출력된 `runId`, `artifactPath`, `sourcePacket`을 이후 명령에 그대로 사용한다. 해당 row를 terminal 상태로 끝내기 전에는 다음 row를 claim하지 않는다. 예시에서는 반복되는 값을 다음처럼 표시한다.

```bash
RUN_ID='<start가 반환한 runId>'
RUN_DIR='<start가 반환한 artifactPath>'
```

Shell 변수는 설명을 짧게 하기 위한 표기일 뿐이다. 실제 명령에서는 반드시 방금 claim한 값을 사용한다.

### 1.2 결과를 반영하지 않는 전체 dry-run

특정 queued role을 실제 데이터로 끝까지 검증하되 context, fit, 추천, queue 상태를 바꾸면 안 될 때만 `--dry-run`을 사용한다. 예약 작업의 정상 실행에는 이 옵션을 쓰지 않는다.

```bash
python3 scripts/company_role_recurring_matching.py start \
  --role-id '<검증할 queued role_id>' \
  --runner codex-manual-dry-run \
  --dry-run
```

Dry-run은 대상 row를 claim하지 않고 읽기만 하며 이후 `save-context`, `upsert-fits`, `finish`, `fail`, `skip`도 DB write를 하지 않는다. Context와 평가 결과, 검증 receipt는 local run artifact에만 남고 원래 queue row는 `queued` 상태를 유지한다. 종료 후에는 반드시 manifest의 `databaseWrites = 0`, verification의 `queueStatusUnchanged = true`, 그리고 context·fit·recommendation 전후 count가 같음을 확인한다.

사용자가 특정 inactive 또는 `is_auto=false` internal role의 일회성 검토를 명시적으로 요청한 경우에만 아래 수동 preview를 쓸 수 있다. 이 명령은 DB queue row를 만들거나 claim하지 않는 local-only run이다. 자동 예약 작업에는 절대 사용하지 않으며, `--allow-inactive`는 `--dry-run` 및 정확한 `--role-id` 없이는 실행되지 않는다.

```bash
python3 scripts/company_role_recurring_matching.py start \
  --role-id '<사용자가 명시한 internal role_id>' \
  --runner codex-manual-dry-run \
  --dry-run \
  --allow-inactive
```

종료 후에는 `queueBacked=false`, `queueRowCreated=false`도 확인한다. 이 preview는 역할을 active로 바꾸거나 `is_auto`를 켠 것으로 취급하지 않는다.

## 2. Claim 직후 확인

Helper가 반환한 다음 값을 확인한다.

- `run_id`, `role_id`, `trigger_reason`
- internal role이고 현재 `active`인지
- 자동 run이면 현재 `is_auto=true`인지
- 회사 workspace와 role 정보
- 기존 current context
- 이전 성공 실행 이후의 evidence 범위

Claim 뒤 role이 더 이상 active가 아니거나 자동 run의 `is_auto`가 꺼졌으면 context나 fit을 쓰지 않고 `canceled`로 닫는다. Trigger의 정당성을 사람이 재심사하지 않는다. Queue 조건은 코드의 책임이다.

## 3. Evidence 읽기

기존 context를 먼저 읽고, helper가 만든 evidence packet을 시간순으로 검토한다.

중요한 원천:

- 회사-side LLM 채팅과 conversation summary
- 회사가 후보자를 수락·거절한 명시적 결정과 이유
- 진행·중단·stage 변화와 actor
- 후보나 진행 상황에 남긴 회사 메모
- Role을 설명·수정하며 추가로 남긴 말
- 회사 공통 판단임을 보여 주는 다른 role의 반복 신호

누가 내린 결정인지 구분한다. 후보자의 수락·거절을 회사의 반응으로 쓰거나, 이유 없는 자동 stage 변경에서 선호를 만들어내지 않는다.

`request`, `criteria`, JD, 회사 기본 정보는 context의 비교 입력으로 읽되 그대로 복제하지 않는다. Context는 그 밖의 회사 행동에서 새로 배운 것만 기록한다.

## 4. Context verbalization

### 4.1 편집 순서

1. 먼저 context가 검토 이력이 아니라 다음 `[talent × role]` 평가의 입력임을 확인한다.
2. 기존 문장마다 근거가 유효한지와 다음 평가에 여전히 필요한지를 각각 본다.
3. 최근의 명시적 이유·메모·결정 중 retrieval, label, score, reason 또는 확인 질문을 바꿀 정보만 충분한 detail로 남긴다.
4. 같은 이유의 반복 반응은 하나의 판단 패턴으로 압축한다.
5. 단순 조회, 중복 event, 이유 없는 stage 변경, 검토했다는 사실과 일반적인 “아직 모름”은 생략한다.
6. 최근 신호가 과거 판단과 충돌하면 범위 차이인지 기준 변화인지 설명한다.
7. 근거가 약한 단일 사건이나 이유 없는 결과에서 후보 선호를 추론하지 않는다.
8. 새로 반영할 필요한 정보가 없으면 기존 text를 그대로 사용한다. 기존 text도 비어 있으면 빈 파일을 그대로 저장한다.
9. 기존 문장이 더 이상 유효하지 않거나 필요한 정보가 아니면 삭제한다. 삭제 결과가 빈 context여도 된다.

### 4.2 입력 효용성 gate

각 문장에 아래 제거 검사를 적용한다.

> 이 문장을 제거했을 때 다음 후보 평가가 달라질 합리적인 가능성이 있는가?

가능성이 없으면 context에 쓰지 않는다. 다음 항목은 evidence 검토 대상일 수는 있어도 context가 아니다.

- 회사 actor가 확인됐지만 이유·메모가 없는 stage 변경
- “이 역할에서 이런 조치가 있었다”는 사건 요약
- “명시적 이유가 없어 일반화하지 않는다”는 방어 문장
- “추가 판단 기준은 미확정이다” 같은 일반적인 무정보 문장
- 후보 수, 검토 수, 날짜 등 실행·감사 정보

이유 없는 stage 변경은 행동의 존재만 증명하고 판단 원인은 증명하지 않는다. 후보 속성과 함께 보이더라도 명시적 이유나 충분히 반복된 고신호 근거 없이 선호로 만들지 않는다.

반대로 다음은 context가 될 수 있다.

- 회사가 진행·중단 이유로 직접 설명한, 다음 후보에도 적용할 판단 기준
- 같은 명시적 이유로 반복된 반응에서 확인된 기준과 허용 가능한 trade-off
- 기존 판단을 바꾸는 최근의 명시적 설명
- 그대로 두면 다음 평가를 잘못 이끌 기존 context의 정정·삭제
- 실제 label을 바꿀 수 있으며 확인 질문이 구체적인 불확실성

### 4.3 반영할 정보가 없을 때

필요한 문장이 0개인 것은 정상적인 성공 결과다.

- `context_before.md`가 비어 있으면 `context_after_draft.md`도 빈 파일로 만든다. DB에는 빈 `text_context`를 유지하고 receipt의 `contextChanged`가 `false`인지 확인한다.
- 기존 context가 있고 새 evidence가 의미를 바꾸지 않으면 기존 파일을 그대로 사용한다.
- 기존 context의 모든 문장이 무효하거나 불필요해졌으면 모두 삭제하고 빈 context를 저장한다. 이 경우 정리 자체가 변화이므로 `contextChanged=true`일 수 있다.
- 검토 완료 사실은 context가 아니라 run summary에 `행동 evidence를 검토했으나 context에 반영할 matching-relevant 정보 없음`처럼 남긴다.

예를 들어 회사 사용자가 `수락 → 아카이브`, `연결 대기 → 아카이브`로 이동시켰더라도 두 건 모두 이유와 메모가 없다면, 그 사실만으로 context 문장을 만들지 않는다. 기존 context가 비어 있다면 계속 비워 둔다.

### 4.4 기본 형태

```markdown
## 현재 채용 판단
- ...

## 긍정 신호
- ...

## 부정 신호
- ...

## 회사 공통 운영 맥락
- ...

## 최근 변화
- ...

## 아직 불확실한 점
- 실제 평가를 바꿀 수 있고 확인할 대상이 구체적인 불확실성
```

빈 section은 생략한다. 쓸 내용이 없다는 이유로 `아직 불확실한 점`을 만들지 않는다. Context는 짧고 현재형이어야 하며, 사건을 날짜별로 전부 나열하지 않는다. 후보자 이름, 연락처, raw resume, 대화 전문을 넣지 않는다. “몇 명을 봤다”보다 “어떤 근거 때문에 어떤 유형을 진행하거나 거절했고 그 판단이 다음 후보에게 어떻게 적용되는가”가 중요하다.

### 4.5 저장 전 질문

- 이 문장은 request/criteria/JD의 중복이 아니라 행동에서 새로 배운 사실인가?
- 명시적 근거와 추론을 구분했는가?
- 최근 변화와 오래된 패턴의 관계가 드러나는가?
- 이 문장이 다음 `[talent × role]` 평가를 더 정확하게 만드는가?
- 이 문장을 삭제해도 다음 평가가 같다면 왜 저장하려 하는가?
- 낮은 신호 여러 개로 강한 결론을 만들지 않았는가?
- 검토 완료나 무정보 상태를 context에 잘못 기록하지 않았는가?

Context를 먼저 저장하고 `company_behavior_contexts`의 해당 `role_id`에 current text가 그대로 저장됐는지 다시 읽어 확인한다. 이 table은 `role_id`, `text_context`만 사용하며 version, hash, cursor, `changed_domains`를 저장하지 않는다. 새 evidence가 있지만 의미 변화가 없으면 기존 text를 그대로 저장한다.

기존 문서는 `$RUN_DIR/context_before.md`, raw evidence는 `$RUN_DIR/source_packet.json`, 편집 원칙은 `$RUN_DIR/context_edit_instructions.md`에 있다. 갱신한 문서를 `$RUN_DIR/context_after_draft.md`에 작성한 뒤 저장한다.

```bash
python3 scripts/company_role_recurring_matching.py save-context \
  --run-id "$RUN_ID" \
  --context-file "$RUN_DIR/context_after_draft.md"
```

의미 변화가 없으면 빈 파일을 포함해 `context_before.md`를 그대로 `--context-file`로 사용한다. “검토했으나 반영할 정보 없음”은 finish의 `--summary`에만 쓰고 context 파일에는 쓰지 않는다. Source가 중간에 바뀌었다는 오류가 나면 임의로 우회하지 말고 packet을 새로 만든 뒤 다시 읽는다.

```bash
python3 scripts/company_role_recurring_matching.py refresh-packet --run-id "$RUN_ID"
```

## 5. Pending gate

Context 저장 후 helper가 현재 role의 정확한 `연결 대기` unique talent 수와 `max_pending_talents`를 반환하게 한다.

```text
current_pending >= max_pending_talents
```

이면 후보 검색과 fit write를 하지 않는다. Run은 `succeeded`로 닫되 `matching.skippedReason = "pending_limit_reached"`와 현재 count를 result에 남긴다.

Pending limit 미도달이면 다음 단계로 간다. Context 갱신 자체를 pending gate 앞에서 생략하면 안 된다.

`source_packet.json`의 `pendingGate.reason`이 `pending_limit_reached`이면 검색 없이 완료한다.

```bash
python3 scripts/company_role_recurring_matching.py finish \
  --run-id "$RUN_ID" \
  --result-reason pending_limit_reached \
  --summary '<context 변화와 현재 pending count를 담은 짧은 결론>'
```

## 6. 후보 retrieval SQL

최신 role, 회사 정보, request, criteria, 갱신된 context를 함께 읽고 이번 role 전용 read-only SQL을 작성한다.

SQL의 목적은 평가할 후보 목록을 만드는 것이다. 최종 적합도는 SQL 점수나 keyword hit가 아니라 다음 단계의 full-text pair 평가가 정한다.

SQL은 다음을 만족해야 한다.

- 단일 read-only `SELECT` 또는 `WITH ... SELECT`
- 결과에 `talent_id`
- 명시적인 `LIMIT`
- 안정적인 tie-breaker
- Role에 맞는 recall signal과 필요한 hard constraint
- 아직 이 role에 fit row가 없는 신규 후보만 반환하는 결과
- 핵심 기술 신호는 가능하면 같은 경력·프로젝트 안에서 함께 나타나는지 확인한다. 서로 무관한 학력의 `robotics`와 다른 직장의 `control`을 합쳐 강한 후보로 만들지 않는다.
- Experience와 education을 동시에 join해 기간이나 evidence count가 중복 증폭되지 않게 `exists`, 별도 aggregate 또는 먼저 talent 단위로 집계한다.

검색 결과의 count, 상위 표본, 경계 표본을 읽는다. 지나치게 넓거나 좁으면 SQL을 고쳐 다시 실행한다. 숫자를 채우기 위해 무관한 후보를 넣지 않는다.

SQL을 `$RUN_DIR/retrieval_new.sql`에 작성한다. 각 수정본은 revision을 올려 실행한다.

```bash
python3 scripts/company_role_recurring_matching.py run-sql \
  --run-id "$RUN_ID" \
  --sql-file "$RUN_DIR/retrieval_new.sql" \
  --lane new \
  --revision 1 \
  --max-rows 500
```

명령이 반환한 `result` 경로를 candidate packet 생성에 사용한다. 신규 lane은 SQL 순서대로 최대 150명을 scan하고 안전 제외를 통과한 최대 100명의 packet을 만든다. SQL 결과가 100명 이하라면 중복·안전 제외를 뺀 전원을 평가해야 하며 임의로 20명 같은 더 작은 상한을 두지 않는다.

`scan-limit=150`은 packet 후보를 검토하는 범위이고 `limit=100`은 실제 full-text 평가 상한이다. `150 → 100`은 fit threshold가 아니라 실행 상한이므로, 평가하지 않은 나머지를 평가한 것처럼 보고하면 안 된다. SQL이 80명을 반환했다면 최대 80명을 scan해 제외되지 않은 전원을 평가한다.

```bash
python3 scripts/company_role_recurring_matching.py candidate-packet \
  --run-id "$RUN_ID" \
  --query-result '<run-sql이 반환한 result 경로>' \
  --lane new \
  --limit 100 \
  --scan-limit 150

```

신규 후보가 0명이면 빈 discovery index가 생성됐는지 확인하고 다음처럼 정상 완료한다.

```bash
python3 scripts/company_role_recurring_matching.py finish \
  --run-id "$RUN_ID" \
  --result-reason no_eligible_unseen_candidate \
  --summary '<context 확인 결과와 후보가 없었던 이유>'
```

### 6.1 신규 lane

- 이 role의 `talent_opportunity_fit` row가 없음
- 같은 role의 연결 흐름에 이미 들어가거나 명시적으로 종료된 pair가 아님
- Canonical identity dedupe를 통과함

### 6.2 재검사 금지

이 자동 운영 흐름은 기존 fit을 시간 경과, 프로필 변경, 대화, 회사 기록 변경, fingerprint 차이 등의 이유로 다시 계산하지 않는다. 이 단계에서 평가하는 대상은 해당 role의 fit row가 아직 없는 신규 후보뿐이다.

후보자가 실제 `hold_role_question`에 답한 경우의 재검사는 질문과 답을 보유한 Worker 경로에서만 처리한다. 이 role 중심 실행 흐름이 그 답변을 추정하거나 대신 재검사해서는 안 된다.

## 7. Candidate 문서 만들기

Helper가 SQL 결과의 각 talent를 `harper_worker` internal fit과 같은 canonical 구조로 가져오게 한다. 가능하면 `harper_worker/opp/utils/internal_fit.py`가 사용하는 projection과 normalization을 재사용한다.

각 candidate 문서에는 다음을 넣는다.

- Profile, resume, structured experience·education·skill
- Matching preference와 명시적 constraint
- Talent Behavior Context와 current interaction delta
- 관련된 최근 추천 반응과 활동
- 이 role의 기존 progress·fit·human override
- 같은 회사의 다른 역할에 대한 최근 기록을 짧게 압축한 text. 이미 추천한 역할, 추천하지 않은 fit 역할, 후보 반응과 이유, 회사 진행 단계만 판단에 필요한 만큼 포함하고 sibling hold 역할은 제외한다.
- 회사와 role의 최신 정보
- `request`, `criteria`
- 이번 run에서 저장한 context

Candidate packet이 불완전하거나 context 저장 이후 source가 바뀌었으면 그 pair를 평가·저장하지 말고 packet을 새로 만든다.

## 8. `[talent × role]` 평가

각 candidate 문서 전체를 읽고 pair를 독립적으로 평가한다. 다른 후보와의 상대 순위, retrieval lane, SQL rank는 label의 근거가 아니다.

| Label | Score | 의미 |
| --- | ---: | --- |
| `fit` | 80~100 | 회사-side bar를 통과하고 명시적 blocker 없이 지금 후보에게 보여 줄 가치가 있음 |
| `hold` | 60~79 | 결과를 바꿀 구체적인 candidate-side 정보 하나가 없어 지금은 보류 |
| `ambiguous` | 60~79 | 명확한 blocker는 없지만 근거가 부족하거나 혼재함 |
| `dissatisfied` | 40~59 | 한쪽이 의미 있게 불만족할 가능성이 높은 soft mismatch |
| `unfit` | 0~39 | 명시 조건이나 핵심 역량 등의 hard mismatch |

후보자가 아직 보지 못한 새 역할에 대해 role-specific 의향 기록이 없는 것은 당연하다. “현재 이 역할에 대한 의향 정보가 없음”만으로 `ambiguous`나 `hold`를 주지 않는다. 정확한 회사·역할에 대한 사전 관심 표시도 `fit`의 필수 조건이 아니다.

`harper_worker/opp/utils/internal_fit.py`와 같은 `fit`·`recommend` 분리 원칙을 적용한다.

- 회사-side 수행 bar를 통과하고 후보의 일반적인 직무·레벨·지역·근무형태 선호, 최근 반응, 경력 선택과 충돌하지 않으며 보여 줄 가치가 있으면 `fit`이 가능하다.
- 알려진 후보 선호가 적으면 `fit`의 candidate-preference 점수를 0~2로 낮춘다. 그 이유만으로 label을 자동으로 `ambiguous`로 내리지 않는다.
- `ambiguous`는 회사-side 수행 근거 또는 상호 적합 근거가 실제로 불완전·혼재됐거나, 명시적 blocker는 없지만 추천할 만큼 강하지 않을 때 쓴다.
- `hold`는 위치, 보상, 회사 단계, 고용형태, 큰 직무 전환, 핵심 역량처럼 결과를 바꿀 구체적인 candidate-side 사실 하나가 빠졌을 때만 쓴다.
- Candidate-facing opportunity 정보 부족은 보상·근무형태·회사 단계 등 기회 자체의 속성이 입력에 없다는 뜻이다. 후보가 이 새 역할을 사전에 몰랐다는 뜻이 아니다.
- `fit`은 이 역할을 후보에게 보여 줄 수 있을 만큼 적합한지이고, `recommend`는 같은 회사 기록과 현재 타이밍까지 고려해 지금 먼저 제안할지다.
- 같은 회사에 여러 `fit`이 있어도 모두 `fit`으로 남을 수 있다. 일반적으로 가장 설득력 있는 하나만 `recommend=true`가 되지만, 개수를 코드로 강제하지 않는다.
- 이미 추천된 역할에 답이 없더라도 새 역할이 더 적합하면 새 역할을 `recommend=true`로 판단할 수 있다. 반대로 기존 추천을 유지하는 편이 낫다면 새 역할은 `fit=true`, `recommend=false`로 두고 `reason`에 짧게 남긴다.
- `fit=false`인 결과는 항상 `recommend=false`다.

평가마다 다음을 작성한다.

```json
{
  "talentId": "...",
  "score": 0,
  "label": "fit|hold|ambiguous|dissatisfied|unfit",
  "recommend": false,
  "reason": "이 pair의 핵심 적합 근거, 중요한 차이, 불확실성을 담은 짧은 text-context",
  "reevaluationCriteria": null,
  "companyCriteriaEvaluations": null
}
```

`reason` 작성 규칙:

- Resume를 다시 요약하지 않는다.
- 회사가 이 talent를 원할 이유와 talent가 이 기회를 고려할 이유를 구분한다.
- Context에서 사용한 회사의 실제 행동 신호를 필요한 만큼 연결한다.
- 부족한 정보와 실제 불일치를 구분한다.
- 같은 회사의 다른 fit을 먼저 추천하기로 했다면 그 상대 판단을 한 문장으로 남긴다.
- `hold`가 아니면 `reevaluationCriteria`를 만들지 않는다.

각 index의 `evaluationDocument`를 모두 읽는다. 결과는 lane별 JSON 파일에 다음 형태로 모은다.

```json
{
  "evaluations": [
    {
      "talentId": "...",
      "score": 86,
      "label": "fit",
      "recommend": true,
      "reason": "...",
      "reevaluationCriteria": null,
      "companyCriteriaEvaluations": null
    }
  ],
  "skippedReevaluations": []
}
```

## 9. 저장과 검증

이번 run에서 실제 평가한 pair만 upsert한다.

저장할 핵심 값:

- `talent_id`, `opportunity_id`
- `score`, `label`, `recommend`, `reason`
- 필요한 `reevaluation_criteria`, `company_criteria_evaluations`
- `last_evaluated_at`
- run ID와 실행 당시 talent/role/context 식별 정보

저장 후 다시 읽어 다음을 확인한다.

- 평가한 모든 pair가 같은 값으로 저장됨
- Human override가 유지됨
- 저장된 current context와 평가 metadata의 context fingerprint가 일치함
- Pending limit skip run에는 fit write가 없음

평가 JSON을 먼저 검증한 다음 저장한다.

```bash
python3 scripts/company_role_recurring_matching.py validate-fits \
  --role-id '<현재 roleId>' \
  --input "$RUN_DIR/evaluations_new.json" \
  --index "$RUN_DIR/candidate_packet_index_new.json" \
  --require-complete

python3 scripts/company_role_recurring_matching.py upsert-fits \
  --run-id "$RUN_ID" \
  --input "$RUN_DIR/evaluations_new.json"
```

모든 index candidate가 실제 평가되어 저장됐을 때만 완료한다.

```bash
python3 scripts/company_role_recurring_matching.py finish \
  --run-id "$RUN_ID" \
  --result-reason completed \
  --summary '<가장 중요한 context 변화, 평가 수, fit 수를 담은 짧은 결론>'
```

## 10. Run 완료 기록

성공 시 queue row를 `succeeded`로 바꾸고 `result`에 다음만 간결하게 남긴다.

- Context changed 여부
- Matching skip 이유 또는 retrieval·신규 평가·재평가 count
- Label별 저장 count
- 가장 중요한 context 변화와 결과를 합친 한두 문장

좋은 summary 예:

> 최근 진행 메모에서 고객 현장 배포 ownership이 핵심 기준으로 확인되어 context를 갱신했다. 신규 41명과 변경 영향이 있는 기존 18명을 평가해 fit 6명을 확인했다.

Context가 바뀌지 않은 것도 정상이다. 후보가 0명인 것도 정상이다. 결과를 만들기 위해 context 문장, SQL 범위, label 기준을 억지로 완화하지 않는다.

## 11. 실패 처리

오류가 나면 queue row를 방치하지 않는다. Canonical helper로 `failed` 처리하고 `result`에 다음을 남긴다.

- 실패 stage: `evidence`, `context_write`, `retrieval`, `candidate_packet`, `fit_write`, `verification`
- 짧고 재현 가능한 error
- 재시도 가능 여부
- 이미 저장된 current context와 완료된 fit count

올바르게 저장된 context를 fit 단계 실패 때문에 되돌리지 않는다. 재시도는 기존 저장 상태를 읽고 미완료 부분부터 계속한다.

```bash
python3 scripts/company_role_recurring_matching.py fail \
  --run-id "$RUN_ID" \
  --stage '<evidence|context_write|retrieval|candidate_packet|fit_write|verification>' \
  --result-reason '<짧은 machine-readable reason>' \
  --error '<짧고 재현 가능한 오류>' \
  --retryable
```

재시도 불가능한 오류라면 `--retryable`을 빼고 실행한다. Role이 claim 뒤 inactive가 된 경우에는 실패로 쓰지 않는다.

```bash
python3 scripts/company_role_recurring_matching.py skip \
  --run-id "$RUN_ID" \
  --result-reason role_not_active \
  --summary 'Claim 이후 role이 active가 아니어서 취소함'
```

Claim 뒤 `is_auto=false`가 된 자동 run은 `--result-reason auto_disabled`로 닫는다. `manual` run에는 이 이유를 사용할 수 없다.

## 12. 종료 전 체크

- [ ] Queue에서 claim한 정확한 role 하나만 처리했다.
- [ ] 자동 run의 role이 `is_auto=true`인지 확인했다.
- [ ] 기존 context를 읽고 새 행동 evidence를 verbalize했다.
- [ ] Request·criteria·JD를 context에 복제하지 않았다.
- [ ] Context를 pending gate보다 먼저 저장했다.
- [ ] Pending limit 도달 시 matching만 생략했다.
- [ ] SQL rank가 아니라 candidate 전체 문서로 pair를 평가했다.
- [ ] 기존 fit을 시간 경과, 입력 변경, 대화, 회사 기록 또는 fingerprint 변화 때문에 다시 계산하지 않았다.
- [ ] Pair `reason`을 저장했다.
- [ ] Human override를 보존했다.
- [ ] Queue status와 짧은 결론을 기록했다.
