# Company Run 예약 실행 정본

- 문서 기준: 2026-09-11
- 실행 시각: 매주 월요일·목요일 오전 8시, `Asia/Seoul`
- 실행 주체: Codex Scheduled task
- 실행 helper: `scripts/company_role_recurring_matching.py`
- pair 평가 참고: [`internal-role-talent-direct-review-ko.md`](../scheduled/internal-role-talent-direct-review-ko.md)

이 문서는 예약 프롬프트가 지목하는 유일한 실행 정본이다. Scheduled task의 프롬프트에는 이 문서를
처음부터 끝까지 읽고 실행하라는 말만 둔다. 실행 중 source code, migration, prompt 또는 이 문서를
수정하지 않는다. 계약 개선은 별도 개발 작업으로 한다.

## 1. 목적과 완료 조건

한 번의 예약 실행을 하나의 `company_run` batch라고 부른다. 물리적인 새 table을 만들지 않고 기존
`company_context_runs`를 durable ledger로 사용한다. 한 batch에는 동일한 `batchRunId`가 붙고, 실행
대상 Role마다 row 하나가 쌓인다. `company_behavior_contexts`는 Role별 최신값 하나만 가진다.

각 Role row는 다음을 완료해야 한다.

1. 이전 성공 run 이후의 회사 발화·피드백·메모·진행 결과와 정정된 현재 상태를 검토한다.
2. 인재 탐색 기준을 바꿀 근거가 있으면 `company_behavior_contexts`를 갱신한다. 결과는 최대 10개의
   compact bullet이다. 추가·수정·삭제가 모두 가능하고, 바꿀 필요가 없으면 그대로 둔다.
3. 지금 추천 후보 탐색·재평가 cycle을 실행할 기대효과가 있는지 LLM이 판단한다.
4. 실행하기로 했다면 Role-first retrieval SQL, pair scoring, 같은 회사 전체 Role reranking을 한 번
   수행한다. Batch 전체에서 최종 `recommend=true`는 최대 3명이며, 추천 가능한 사람이 0명인 것도 정상이다.
5. 두 LLM 출력, 실행 count, 한두 문장 summary, 실패 stage를 Role row의 `result`에 저장한다.
6. batch 전체가 끝나면 internal-notification 채널에 thread 하나를 열고, Role마다 저장된 summary를
   답글 하나로 남긴다.

이 workflow는 `talent_opportunity_fit`을 만들거나 갱신하지만 recommendation row를 만들거나 talent·회사에
추천을 발송하지 않는다. `recommend=true`는 후속 추천기에 전달할 선택 상태일 뿐이다.

## 2. 변하지 않는 경계

- `information.testOnly=true`인 Role과 test fixture는 대상이 아니다.
- 대상은 현재 `internal`, `active`, 미만료, `is_auto=true`인 Role뿐이다.
- privacy, internal recommendation opt-out, blocked company, 동일 Role의 실제 추천·진행 이력과 human
  override를 우회하지 않는다.
- pending capacity가 닫혀 있으면 context는 검토하지만 search와 fit write는 하지 않는다.
- 회사의 빠른 피드백은 이번 cycle의 우선순위·기대효과를 높일 수 있지만 talent fit bar를 낮추지 않는다.
- 후보 수나 추천 수를 채우지 않는다. hard requirement와 fit label 의미는 탐색을 넓힐 때도 유지한다.
- 한 `company_run` batch의 모든 회사·Role을 합쳐 최종 추천 후보는 최대 3명이다. 초과하는 `fit` 후보는
  label·score·reason을 보존하고 `recommend=false`로 둔다.
- 후보자의 추천 반응을 회사 피드백으로 오인하지 않는다. 회사 actor나 명시적 이유가 없는 stage 변화로
  회사 선호를 만들지 않는다.
- 긴 raw company/talent data는 DB run row나 Slack에 저장하지 않는다. Local private artifact는
  owner-only로 두고 terminal 처리 시 helper가 정리한다.

## 3. 반복 가능한 LLM call 계약

각 call은 `a) 기본 입력`, `b) 지침`, `c) 출력`을 분리한다. Codex는 판단에 필요하면 read-only source를
더 열거나 불필요한 저신호 입력을 덜 볼 수 있다. 다만 아래 출력 schema와 안전 경계는 바꾸지 않는다.
Qualitative 판단은 keyword rule이나 heuristic score로 대체하지 않는다.

### Call 1 — Role의 Company Behavior Context 갱신 (`output 1`)

입력:

- `$RUN_DIR/source_packet.json`: Role·회사 snapshot, 기존 context, 이전 성공 run cursor, 그 이후의
  `newOrChangedEvidence`, bounded current evidence
- `$RUN_DIR/context_before.md`: 현재 저장된 Role context
- `$RUN_DIR/context_edit_instructions.md`: 이 call의 prompt

우선 `newOrChangedEvidence`를 읽되, 기존 bullet의 유지·삭제 판단이나 정정된 상태 확인에 필요하면 packet의
current evidence를 다시 본다. `company_memories`는 회사가 선언해 둔 보조 맥락이며, 여러 행동을 종합해
새 선호를 발명하는 독립 evidence로 쓰지 않는다.

출력 파일 `$RUN_DIR/context_output.json`:

```json
{
  "bullets": [
    "회사 공통 또는 현재 Role에 적용되는, 다음 matching 판단을 실제로 바꿀 수 있는 현재형 기준"
  ],
  "reason": "이번에 무엇을 추가·수정·삭제·유지했는지에 대한 짧은 설명"
}
```

- `bullets`는 patch가 아니라 저장 후의 전체 current context다.
- 0~10개이며 heading, 사건 일지, 후보 이름, 연락처, raw 대화 전문을 넣지 않는다.
- 회사 공통인지 이 Role 한정인지 bullet 문장 안에서 명확히 한다.
- 기존 context가 이미 bullet-only이고 의미 변화가 없으면 wording과 순서를 유지한다.
- heading이 있는 legacy context는 의미를 보존해 최대 10개의 bullet로 한 번 전환한다.
- 새 정보가 없어도 잘못됐거나 불필요해진 기존 bullet은 삭제할 수 있다.
- 검토했지만 반영할 정보가 없다는 문장은 context가 아니라 `reason`과 최종 summary에 쓴다.

저장:

```bash
chmod 600 "$RUN_DIR/context_output.json"
python3 scripts/company_role_recurring_matching.py save-context-output \
  --run-id "$RUN_ID" \
  --input "$RUN_DIR/context_output.json"
```

Source drift 오류가 나면 우회하지 않는다. 아래 명령으로 packet을 다시 만든 뒤 Call 1부터 다시 읽는다.

```bash
python3 scripts/company_role_recurring_matching.py refresh-packet --run-id "$RUN_ID"
```

### Call 2 — 지금 matching cycle을 실행할지 판단 (`output 2`)

Call 1 저장 뒤 생성된 다음 두 파일을 읽는다.

- `$RUN_DIR/search_decision_input.json`: 갱신된 context, 새 company evidence, 신규·갱신 talent 수, 기존 fit
  inventory, 최근 Role run 결과, 동일 회사의 실제 추천·talent 반응·company stage·검증된 company response
  시각, deterministic gate
- `$RUN_DIR/search_decision_instructions.md`: 이 call의 prompt

판단할 수 있는 이유에는 다음이 포함되지만, 고정 분기나 quota로 사용하지 않는다.

- 기준 변화가 기존 query의 사각지대나 과거 pair 판단을 실제로 바꿀 가능성
- 새 talent 또는 matching-relevant profile·Brief·Behavior Context 변화
- 기존 run의 zero-yield와 이번에는 검증할 만한 다른 retrieval 가설
- 오래된 `hold`·`ambiguous` 중 현재 원문으로 다시 볼 가치
- talent에게 실제 추천됐고 수락 뒤 회사에 전달된 기록, 회사의 명시적 피드백과 처리 속도
- 반대로 새 정보·새 cohort·새 가설이 없어 이번에는 생략하는 것이 더 정확한 경우

출력 파일 `$RUN_DIR/search_decision_output.json`:

```json
{
  "runMatching": true,
  "reason": "왜 지금 한 cycle의 기대효과가 있거나 없는지",
  "searchInstruction": "이번 run에서 retrieval·재평가·exploration을 어떻게 볼지"
}
```

`runMatching=false`이면 `searchInstruction`은 `null`이어야 한다. `true`이면 빈 값일 수 없다. 이 지침은
이번 run의 탐색 가설이며 `company_behavior_contexts`에 넣지 않는다.

저장:

```bash
chmod 600 "$RUN_DIR/search_decision_output.json"
python3 scripts/company_role_recurring_matching.py save-search-decision \
  --run-id "$RUN_ID" \
  --input "$RUN_DIR/search_decision_output.json"
```

### Call 3 — `[talent × Role]` scoring

`runMatching=true`일 때만 수행한다. [`internal-role-talent-direct-review-ko.md`](../scheduled/internal-role-talent-direct-review-ko.md)의
Role-first retrieval과 full-text direct review 원칙을 사용하되, 실제 입력과 저장 contract는 helper가 만든
candidate packet과 `$RUN_DIR/fit_evaluation_contract.md`가 우선한다. 특히 production V2 candidate 입력은
Profile + 전체 Search Brief + 같은 version의 Talent Behavior Context이며 Memory·광범위한 raw 대화를 매
pair에 다시 넣지 않는다.

각 candidate의 `evaluationDocument` 전체를 읽고 다음을 출력한다.

```json
{
  "evaluations": [
    {
      "talentId": "uuid",
      "score": 86,
      "label": "fit",
      "recommend": true,
      "reason": "이 pair의 구체적 적합·불일치·불확실성 근거",
      "reevaluationCriteria": null,
      "companyCriteriaEvaluations": null
    }
  ],
  "skippedReevaluations": []
}
```

기존 `talent_opportunity_fit.reason`은 이전 판단의 유용한 참고지만 gold label이 아니다. 기존 pair도 현재
원문과 fingerprint를 다시 읽고 판단한다. Human label과 human reason은 절대 덮어쓰지 않는다. Upsert
직전의 label·score·reason·recommend와 human override는 같은 fit row의 metadata `previousFit`에 보존해
최종 선택 보고에서 현재 판단과 함께 읽을 수 있게 한다. 같은 run 재시도는 최초 스냅샷을 유지한다.

### Call 4 — batch 내 같은 회사 Role reranking

모든 Role row가 terminal이 된 뒤 한 번 수행한다. 입력은 `batch_rerank_input.json`, prompt는
`batch_rerank_instructions.md`다. 같은 talent에게 한 회사의 여러 Role이 `fit`이면 독립 fit은 유지하고,
실제 same-company 추천·반응·진행 이력까지 보아 지금 먼저 제안할 Role 하나 또는 `null`을 정한다. 그 뒤
batch 전체의 group을 비교해 `selectedRoleId`가 있는 talent가 최대 3명이 되게 한다. 네 번째 이후 후보는
fit 판단을 바꾸지 않고 `selectedRoleId=null`로 둔다.

```json
{
  "decisions": [
    {
      "companyWorkspaceId": "uuid",
      "talentId": "uuid",
      "selectedRoleId": "uuid 또는 null",
      "reason": "선택 또는 보류 이유"
    }
  ]
}
```

입력의 모든 group을 정확히 한 번 포함한다. non-null 선택이 3개를 넘으면 helper가 저장을 거부한다.
적절한 추천이 없으면 `null`이 정상이다.

## 4. 예약 실행 절차

모든 명령은 `harper_beta/`에서 실행한다.

### 4.1 Preflight와 batch 생성

```bash
python3 scripts/company_role_recurring_matching.py preflight
python3 scripts/company_role_recurring_matching.py enqueue-scheduled
```

`preflight.ready=false`이면 DB write나 Slack 전송을 하지 말고 Scheduled task를 실패로 끝낸다.
`enqueue-scheduled`가 반환한 `batchRunId`를 이후 모든 batch 명령에 그대로 쓴다. 같은 예약 slot을 다시
실행하면 같은 ID가 나오고 이미 만든 Role row를 재사용한다. 실행이 늦게 시작되면 가장 최근 월·목
오전 8시 slot을 사용한다. 대상 Role row가 하나도 없으면 알림 없이 정상 종료한다.

### 4.2 Role row를 하나씩 처리

다음 명령을 `started=false`가 나올 때까지 반복한다.

```bash
python3 scripts/company_role_recurring_matching.py start \
  --batch-id "$BATCH_ID" \
  --runner codex-scheduled-company-run
```

`started=true`이면 반환된 `runId`와 `artifactPath`를 `RUN_ID`, `RUN_DIR`로 사용한다. 한 Role을 terminal로
끝내기 전에 다음 Role을 claim하지 않는다.

1. Call 1을 실행하고 `save-context-output`으로 저장한다.
2. Call 2를 실행하고 `save-search-decision`으로 저장한다.
3. `runMatching=false`이면 검색·packet·fit write 없이 완료한다.

```bash
python3 scripts/company_role_recurring_matching.py finish \
  --run-id "$RUN_ID" \
  --result-reason matching_skipped \
  --summary '<context 판단과 matching 생략 이유를 합친 한두 문장>'
```

Deterministic pending gate가 닫혀 있어 `runMatching=false`인 경우에는 result reason을
`pending_limit_reached`로 쓴다.

4. `runMatching=true`이면 `searchInstruction`과 Role source를 바탕으로 `retrieval_new.sql`을 작성한다.
   최대 150명의 unique talent를 넓게 회수하되 숫자를 채우지 않는다.

```bash
python3 scripts/company_role_recurring_matching.py run-sql \
  --run-id "$RUN_ID" \
  --sql-file "$RUN_DIR/retrieval_new.sql" \
  --lane new \
  --revision 1 \
  --max-rows 500

python3 scripts/company_role_recurring_matching.py candidate-packet \
  --run-id "$RUN_ID" \
  --query-result '<run-sql의 result>' \
  --lane new \
  --limit 100 \
  --scan-limit 150
```

5. Call 2가 오래된 기존 판단의 재검사를 지시하고 대상이 있을 때만 reevaluation lane을 추가한다. 이
   lane은 21일 이상 지난 effective `hold`·`ambiguous`만 대상으로 하며, 신규 SQL과 같은 최종 Role
   ranking을 쓴다. 10~50명을 평가하고 최대 500명을 scan할 수 있다. 기존 `reason`과 현재 packet을
   함께 읽는다. Input fingerprint가 완전히 같으면 helper가 제외한다.

```bash
python3 scripts/company_role_recurring_matching.py run-sql \
  --run-id "$RUN_ID" \
  --sql-file "$RUN_DIR/retrieval_reevaluation.sql" \
  --lane reevaluation \
  --revision 2 \
  --max-rows 500

python3 scripts/company_role_recurring_matching.py candidate-packet \
  --run-id "$RUN_ID" \
  --query-result '<run-sql의 result>' \
  --lane reevaluation \
  --limit '<10..50>' \
  --scan-limit 500
```

`fit`, `dissatisfied`, `unfit` 전체를 시간만으로 재평가하지 않는다. 새로운 기준·입력·탐색 가설 때문에
지금 판단이 달라질 구체적 가능성이 있으면 별도 후속 계약으로 확장한다.

6. 각 lane의 index에 후보가 있으면 Call 3 결과를 lane별 JSON으로 만들고 전원을 검증·저장한다.

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

Reevaluation 결과도 해당 index로 검증한 뒤 같은 `upsert-fits` 명령으로 저장한다. Scheduled batch의
pair `recommend`는 이 단계에서는 임시로 `false`가 저장되고, LLM의 preliminary 판단은 metadata에
보존된다. 최종값은 Call 4에서 한꺼번에 정한다.

신규와 reevaluation index가 모두 비었으면 `no_eligible_unseen_candidate`, 하나라도 평가했으면
`completed`로 끝낸다. Summary는 context 변화, 실행/생략 이유, 평가·fit 결과를 한두 문장으로 쓴다.

```bash
python3 scripts/company_role_recurring_matching.py finish \
  --run-id "$RUN_ID" \
  --result-reason completed \
  --summary '<Role 결과 한두 문장>'
```

### 4.3 Batch reranking과 internal notification

모든 Role row를 terminal 처리한 뒤 수행한다. Matching을 실행한 Role이 없어도 rerank input을 준비해
group이 0개인지 확인할 수 있다.

```bash
python3 scripts/company_role_recurring_matching.py prepare-batch-rerank \
  --batch-id "$BATCH_ID"
```

명령이 반환한 `input` 파일의 부모 디렉터리를 `BATCH_DIR`로 사용한다. Call 4 결과를
`$BATCH_DIR/batch_rerank_output.json`에 쓰고 owner-only로 만든 뒤 적용한다. Group이 0개면
`{"decisions":[]}`을 사용한다.

```bash
chmod 600 "$BATCH_DIR/batch_rerank_output.json"
python3 scripts/company_role_recurring_matching.py apply-batch-rerank \
  --batch-id "$BATCH_ID" \
  --input "$BATCH_DIR/batch_rerank_output.json"

python3 scripts/company_role_recurring_matching.py notify-batch \
  --batch-id "$BATCH_ID"
```

`apply-batch-rerank`가 만드는 `$BATCH_DIR/batch_rerank_receipt.json`에는 최종 선택된 각 talent의 이름,
선택 Role, 이전 `previousFit`, 현재 fit, 선택 이유를 함께 기록한다. 이 owner-only artifact를 Scheduled task의
최종 사용자 보고에 사용한다. 후보 정보는 internal-notification Slack thread에는 쓰지 않는다.

`notify-batch`는 internal-notification 채널에 root message 하나와 Role별 답글 하나를 보낸다. Root와 각
답글 timestamp를 모든 Role row의 `result.notification`에 저장하므로 재실행 시 이미 보낸 message는
건너뛴다. 후보 이름·profile·raw evidence는 Slack에 쓰지 않는다. 대상 Role이 0개인 정상 no-op은
thread를 만들지 않는다.

## 5. 실패와 재개

Role 처리 오류는 row를 `running`으로 방치하지 말고 terminal `failed`로 닫은 뒤 다음 Role을 계속한다.

```bash
python3 scripts/company_role_recurring_matching.py fail \
  --run-id "$RUN_ID" \
  --stage '<evidence|context_write|search_decision|retrieval|candidate_packet|fit_write|verification>' \
  --result-reason '<machine-readable reason>' \
  --error '<짧고 재현 가능한 오류>'
```

Scheduled batch의 실패 row는 자동으로 별도 generic retry row를 만들지 않는다. 같은 slot의 Scheduled
task를 다시 실행하면 기존 batch 상태를 읽어 미완료 batch 후처리를 재개한다. Batch rerank나 Slack이
실패하면 Role row를 되돌리지 말고 같은 `prepare/apply/notify` 단계를 다시 실행한다. Slack 전송은 저장된
thread와 Role reply timestamp부터 이어간다.

## 6. Role row에 남는 최소 결과

`company_context_runs.result`에는 다음이 남는다.

```json
{
  "contractVersion": "company-run-v1",
  "batchRunId": "uuid",
  "scheduledFor": "timestamp",
  "contextOutput": {
    "contractVersion": "company-context-output-v1",
    "bullets": [],
    "reason": "...",
    "changed": false,
    "afterHash": "..."
  },
  "searchDecision": {
    "contractVersion": "company-search-decision-v1",
    "runMatching": false,
    "reason": "...",
    "searchInstruction": null
  },
  "matching": {
    "skippedReason": "matching_skipped",
    "retrieved": 0,
    "evaluatedNew": 0,
    "reevaluated": 0,
    "fit": 0,
    "rerankSelected": 0
  },
  "counts": {},
  "summary": "Role 결과 한두 문장",
  "notification": {
    "status": "sent",
    "channelId": "...",
    "threadTs": "...",
    "roleReplyTs": "..."
  }
}
```

이 구조에서 사람이 읽는 핵심 판단은 `reason`, `searchInstruction`, `summary`에 작게 유지한다. 새
정성 판단을 별도 table·state machine·세분화된 enum으로 늘리지 않는다. 이후 코드화할 때도 같은 입력,
prompt text, 출력 schema를 LLM call boundary로 그대로 사용한다.
