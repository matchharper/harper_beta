# 회사 선확인 후보자 선정: Codex 반복 실행 런북

- 문서 기준: 2026-09-11
- 상태: 구현 예정 실행 계약. 현재 production runner가 존재한다는 뜻이 아니다.
- 제품·상태 정본: [회사 선확인 후보자 추천 · Intro 요청 구현 기획](./company-first-talent-recommendation-product-plan-ko.md)
- 범위: 한 회사의 company-first 후보를 0~3명 선정해 `company_intro/ready`로 반영하는 한 번의 실행
- 제외: 회사의 `Request Intro` 이후 메일·후보자 응답·연결 실행, 정기 실행 요일과 시간

이 문서는 **Codex가 매 company-first selection run을 시작할 때 전체를 다시 읽는 실행 계약**이다.
이전 run에서 읽었거나 기억하고 있다는 이유로 생략하지 않는다. Dry-run, 수동 run, 정기 run 모두 같다.

현재는 구현 계획 단계이므로 아래에 적힌 runner interface가 실제 repository에 생기기 전까지 raw SQL로
production ledger를 직접 쓰지 않는다. 구현 시 canonical helper를 하나 만들고 이 문서의 명령과 실제
interface를 함께 맞춘다.

## 1. Run의 목표와 비목표

한 run의 목표는 다음 한 문장이다.

> 현재 회사·Role·Talent 맥락에서 회사가 먼저 판단하는 편이 실제 연결 가능성을 높이는 후보를 회사
> 전체 active 상한 안에서 최대 3명 고르고, 후보자에게는 아직 아무 추천이나 연락도 만들지 않는다.

이 run이 하지 않는 일:

- 후보자에게 `talent_opportunity_recommendation` 생성
- 후보자 email, chat, follow-up 발송
- 회사 대신 `Request Intro` 또는 `Pass` 결정
- company pipeline normal stage 이동
- Brief나 Memory 수정
- company behavior context 수정
- `talent_opportunity_fit` 재평가·덮어쓰기
- 약한 후보를 세 명에 맞춰 채우기

## 2. 실행 전 반드시 읽을 것

매 run마다 다음 순서로 전체를 읽는다.

1. `/Users/gimhojin/Desktop/harper/AGENTS.md`
2. `/Users/gimhojin/Desktop/harper/harper_beta/AGENTS.md`
3. 이 런북
4. [회사 선확인 후보자 추천 · Intro 요청 구현 기획](./company-first-talent-recommendation-product-plan-ko.md)
5. [Company Context Run 목적과 구현 계약](./company-context-run-overview-ko.md)
6. [특정 Internal Role 추천 후보 직접 탐색·평가 기준](../scheduled/internal-role-talent-direct-review-ko.md)
7. [Talent Memory · Search Brief 최종 설계](../talent-unified-memory-implementation-plan-ko.md)

후보자 응답 가능성은 repository의 canonical
`harper_worker/opp/agentic/talent_reply_confidence.py` 동작을 helper를 통해 읽는다. Codex가 별도 점수나
keyword rule을 만들지 않는다.

## 3. 실행 단위와 입력

실행 단위는 Role 하나가 아니라 **company workspace 하나**다. 모든 대상 Role 결과를 모은 뒤 talent를
dedupe해야 Role 처리 순서가 최종 세 명을 우연히 결정하지 않는다.

필수 입력:

- exact `company_workspace_id`
- unique `run_id`
- mode: `shadow` 또는 `commit`
- runner identity

선택 입력:

- 명시적으로 제한한 Role ids
- 최대 신규 카드 수. 3보다 클 수 없음
- 사용자가 허용한 manual reason

회사 이름의 부분 문자열만으로 workspace를 선택하지 않는다. Role scope를 제한하지 않았다면 같은
workspace의 현재 active, unexpired, internal, non-test Role 전체를 본다.

## 4. 실행 모드

### 4.1 `shadow`

- 실제 회사와 후보자에게 아무것도 보이지 않는다.
- DB의 recommendation, tag, progress, outbox, company intro ledger를 쓰지 않는다.
- private local run artifact에 input manifest, candidate index, selection result, verification만 남긴다.
- 초기 구현과 calibration의 기본 모드다.

### 4.2 `commit`

- 검증이 끝난 selected pair만 `company_intro_candidates/status=ready`로 upsert한다.
- company board에 표시될 수 있다.
- candidate-side recommendation과 outbound는 여전히 만들지 않는다.
- feature flag와 대상 workspace가 모두 허용한 경우에만 쓴다.

Mode를 run 도중 바꾸지 않는다. Shadow 결과를 보고 나중에 반영하려면 source가 여전히 같은지 새
preflight와 live guard를 거친 별도 commit run으로 실행한다.

## 5. Canonical runner 계약

구현 시 helper는 다음 책임만 가진다.

- exact workspace와 Role scope 검증
- run idempotency와 lock
- current source packet과 candidate packet 생성
- hard eligibility와 개인정보 projection
- Codex selection output의 schema·identifier·현재성 검증
- shadow artifact 저장 또는 verified ledger write
- 완료·실패 manifest

Helper 안에 후보자 적합도나 company-first route를 고르는 별도 LLM을 넣지 않는다. 정성 판단은 이
런북을 읽은 Codex가 packet 전체를 보고 수행한다. Helper는 hard safety와 data integrity만 담당한다.

권장 interface:

```bash
cd /Users/gimhojin/Desktop/harper/harper_beta

python3 scripts/company_first_intro_candidates.py preflight \
  --company-workspace-id '<workspace_id>' \
  --mode shadow

python3 scripts/company_first_intro_candidates.py start \
  --company-workspace-id '<workspace_id>' \
  --mode shadow \
  --runner codex

python3 scripts/company_first_intro_candidates.py finish \
  --run-id '<run_id>' \
  --selections '<run_dir>/selections.json'

python3 scripts/company_first_intro_candidates.py verify \
  --run-id '<run_id>'
```

이 interface는 runner 구현과 함께 확정한다. 실제 script가 없거나 문서와 interface가 다르면 임의의
SQL write로 대체하지 말고 구현·문서를 먼저 맞춘다.

## 6. Preflight

### 6.1 Repository

- working directory와 repository root가 정확한지 확인한다.
- 관련 source와 docs의 dirty state를 확인한다.
- routine run 중 application code, prompt, migration, docs를 수정하지 않는다.
- private run artifact가 ignored directory 아래 있고 owner-only permission인지 확인한다.

### 6.2 Workspace와 Role

- workspace가 실제 하나로 resolve되는지 확인한다.
- target Role이 같은 workspace 소속인지 확인한다.
- `source_type=internal`, active, unexpired인지 확인한다.
- `information.testOnly=true`인 Role과 fixture를 제외한다.
- 자동 scope이면 `is_auto` 같은 현재 Company Run eligibility를 canonical helper에서 확인한다.
- Role이 하나도 없으면 정상 no-op으로 종료한다.

### 6.3 현재 company intro backlog

Active status는 `ready`, `awaiting_talent`, `connecting`이다.

```text
available_slots = max(0, 3 - active_unique_talent_count)
```

- `available_slots=0`이면 후보를 새로 선정하지 않는다.
- 이전 카드가 미결정이라고 Pass로 추정하거나 자동 종료하지 않는다.
- active row의 visibility가 이미 무효라면 cleanup 대상임을 표시하되, read-time eligibility가 그 후보를
  새 selection에 다시 넣지 않게 한다.

### 6.4 필요한 정본과 version

- 현재 Role/JD/request/criteria
- Role별 current company behavior context
- `talent_opportunity_fit`과 마지막 평가 시점·입력 fingerprint
- candidate Profile, 전체 Search Brief, 같은 version의 Behavior Context
- current profile visibility와 blocked companies
- `get_internal_recommendation`의 명시적 opt-out 여부
- active/terminal recommendation, company request, intro, tag, progress
- canonical reply confidence band

Behavior Context가 stale하거나 아직 build되지 않은 Talent는 production commit selection 전에 canonical
builder로 준비한다. Downstream 판단에 raw Memory 행과 과거 행동 전문을 반복 주입하지 않는다.

## 7. Source packet

Run 시작 시점의 immutable manifest를 만든다.

```text
run id
mode
workspace id
role ids와 role fingerprints
company behavior context versions/hashes
candidate behavior context builder version
source high-water marks
active intro count와 available slots
started at
```

Manifest에는 name, email, resume 원문, Brief/Memory 원문, 회사 private 대화 원문을 넣지 않는다.

Role variant의 `location`, `countryCode`, `workMode`, employment type, request와 criteria가 company pitch나
공통 summary와 충돌하면 실제 variant가 우선한다. 다른 국가·Role을 전제로 쓴 pitch 문구는 candidate
fit이나 company-facing reason의 근거로 사용하지 않고 source-quality 경고로 남긴다.

Source가 selection 도중 materially 바뀌면 stale result를 억지로 commit하지 않는다. Helper가 live guard에서
탈락시킨 pair는 `stale_at_commit`으로 기록하고 남은 pair만 검증한다. 남은 수를 새 후보로 즉석 보충하지
않는다.

## 8. Candidate pool 만들기

### 8.1 먼저 제외할 hard boundary

다음 중 하나라도 해당하면 Codex 정성 판단 전에 제외한다.

- Talent soft-deleted
- `profile_visibility`가 정확히 `open_to_matches`가 아님
- `get_internal_recommendation=false`
- Talent가 이 workspace/company를 차단
- Role inactive, expired, external, test-only
- current hard constraint와 Role의 verified 조건이 명백히 충돌
- reply confidence `0 / LOW`
- same pair나 실질적으로 같은 opportunity에 active recommendation, request, intro, pipeline 존재
- recommendation row가 아직 없어도 `candidate_requested_connection` 등 후보자가 시작한 active progress가 존재
- 회사 또는 후보자가 current Role version의 exact pair를 명시적으로 종료
- 이미 같은 Talent가 같은 workspace의 active company intro에 있음

이 조건을 SQL keyword나 이름 문자열 추측으로 새로 작성하지 않는다. repository의 canonical visibility,
blocked-company, role availability, test-only, route uniqueness helper를 사용한다.

Route uniqueness helper는 recommendation과 stage tag만 보는 함수가 아니다. Candidate progress,
company request, 같은 workspace의 active pipeline, company intro를 함께 읽어야 한다. 후보자가 이미 exact
Role의 연결을 요청한 경우는 “아직 recommendation이 없으니 회사가 먼저 본다”로 바꾸지 않는다.

### 8.2 Pool source

기본 pool은 current `talent_opportunity_fit` 중 최신 Role/company/candidate context와 함께 다시 읽을 수 있는
pair다. Existing fit row는 retrieval memory이지 자동 자격증이 아니다.

- strong fit과 recommendable pair를 포함한다.
- non-recommend/hold pair는 “애매하니 회사에게 넘김”이라는 이유만으로 넣지 않는다.
- stale fit은 최신 packet으로 재판단하거나 제외한다.
- 기존 reason이 Role의 핵심 역량 부족을 인정하면서도 `fit`이라고 결론냈다면 score나 label을 신뢰하지
  않고 최신 원문으로 처음부터 다시 판단한다.
- 후보가 부족하다는 이유로 hard boundary를 완화하지 않는다.

Company Context Run이 별도 retrieval로 찾은 new pair가 있다면 current fit write와 검증이 끝난 뒤 같은
pool에서 다룬다. 이 run 자체가 ad hoc keyword search로 missing fit을 발명하지 않는다.

### 8.3 Unique Talent와 Role 선택

한 Talent가 여러 Role에 맞으면 company-first route가 가장 설득력 있는 Role 하나만 고른다.

- Role의 회사 우선순위
- 후보자의 구체적인 수행 근거
- 회사가 먼저 판단하거나 조건을 열 수 있는 가치
- 후보자에게도 제안할 실제 가치
- current pipeline capacity

다른 Role도 fit이라는 사실은 비교에 사용할 수 있지만 회사 카드 여러 장으로 만들지 않는다.

## 9. Codex의 pair 판단

각 pair를 독립적으로 다음 순서로 판단한다.

1. **Can do:** 이 Role을 수행할 충분하고 구체적인 경력·성과 근거가 있는가?
2. **Company value:** 회사가 왜 이 사람에게 관심을 가질지 설명할 수 있는가?
3. **Talent value:** 후보자에게 이 Role을 제안할 이유가 실제로 있는가?
4. **No hard conflict:** 명시된 방향·보상·위치·근무·역할 조건과 확정 충돌이 없는가?
5. **Company-first value:** 회사가 먼저 관심, 조건, scope를 확정하면 연결 가능성이 의미 있게 높아지는가?
6. **Route freshness:** candidate-first 또는 다른 active route와 경쟁하지 않는가?
7. **Timing:** 지금 회사의 backlog와 process capacity 안에서 행동 가능한가?

정답은 가중치 합산 점수가 아니다. 각 selected pair에는 회사가 읽을 수 있는 짧은 human-readable
`reason` 하나만 쓴다. Chain-of-thought, hidden score breakdown, 응답 가능성 근거를 저장하지 않는다.

Company-first value는 단순히 “좋은 fit이고 회사가 좋아할 것 같다”가 아니다. 회사가 먼저 열거나
판단할 조건, 혹은 회사가 직접 볼 가치가 있는 비전형 전이 근거가 있어야 한다. 별도 선확인 가치가
없으면 strong fit이어도 candidate-first가 기본 경로다.

### 9.1 좋은 selection의 성격

- independently compelling한 strong anchor
- 핵심 수행 bar는 강하고 회사가 보상·title·scope·근무 조건을 실제로 열 수 있는 사람
- 비전형 경력이지만 Role 성공과 연결되는 구체적인 transfer evidence가 있는 사람
- 회사의 실제 yes/no가 다음 판단을 선명하게 하면서도 hard unfit이 아닌 사람

이 성격들을 quota로 만들지 않는다. 세 명 모두 anchor여도 되고 한 명만 선택해도 된다.

### 9.2 선택하지 말아야 할 이유

- 단지 fit score가 상위라서
- 단지 reply confidence가 HIGH라서
- 단지 current recommendation이 false라서
- 세 명을 채워야 해서
- 회사 반응 데이터를 더 많이 얻고 싶어서
- candidate-first로 추천하기에는 자신이 없어서
- 회사가 유명하거나 후보 경력이 좋아 보여서

### 9.3 Company-facing reason 품질 gate

선택하기 전에 실제 card에 쓸 한두 문장을 먼저 작성해 다음을 확인한다.

- 후보자 자신의 구체적인 ownership·성과가 적어도 하나 있고 Role의 핵심 업무와 직접 연결된다.
- `훌륭한`, `exceptional`, `top-tier`, `strong fit` 같은 평가어를 빼도 회사가 검토 이유를 이해할 수 있다.
- 중요한 caveat가 있으면 회사가 판단할 수 있는 한 가지만 정확히 말한다. 핵심 hard mismatch를
  “확인해 볼 점”으로 완화하지 않는다.
- Candidate가 아직 이 Role을 보지 않았다는 현재 상태와 모순되는 관심·지원·수락 표현을 쓰지 않는다.
- Brief·Behavior Context·private chat·정확한 보상 하한·sponsorship 요구·reply band는 회사 공유 projection이
  별도로 허용하지 않는 한 쓰지 않는다.

Company-safe 근거만으로 설득력 있는 문장을 만들 수 없으면 selection 자체를 다시 검토한다. 별도
presentation writer도 이 빈 근거를 형용사나 회사 홍보 문구로 채우지 않는다.

## 10. Company-wide portfolio 선택

Eligible pair를 모두 판단한 뒤 한 번에 portfolio를 정한다.

1. Talent를 workspace 단위로 dedupe한다.
2. 각 Talent의 대표 Role 하나를 고른다.
3. 회사가 실제로 지금 판단할 수 있는 순서로 정렬한다.
4. `available_slots`까지만 선택한다.
5. 마지막 후보가 독립적으로 충분히 강하지 않으면 slot을 비운다.
6. 직전 run과 거의 같은 후보·근거가 반복되는지 확인한다.

이 portfolio 판단은 같은 fit snapshot에서 candidate-first recommendation을 만들기 전에 끝나야 한다.
먼저 recommendation을 생성한 뒤 남은 pair만 보면 strong candidate가 구조적으로 모두 사라진다. 선택된
pair가 `company_intro/ready`로 확정되면 기존 candidate-first selector가 같은 pair를 건너뛰고, 선택되지
않은 pair만 기존 흐름을 계속한다.

`selected=[]`는 정상적인 성공 결과다. 이때 이유를 `no_qualified_company_first_candidate`,
`active_intro_capacity_full`, `all_pairs_already_active`처럼 machine-readable run outcome으로 남길 수 있지만,
후보자별 qualitative reject label을 대량 저장하지 않는다.

## 11. Selection output contract

Codex가 helper에 넘기는 structured output은 machine이 실제 소비하는 최소 값만 담는다.

```json
{
  "schemaVersion": 1,
  "runId": "...",
  "workspaceId": "...",
  "selected": [
    {
      "talentId": "...",
      "roleId": "...",
      "reason": "회사가 이 후보를 먼저 검토할 구체적인 이유와 중요한 trade-off를 담은 짧은 설명"
    }
  ],
  "noSelectionReason": null
}
```

규칙:

- `selected`는 `available_slots`와 3을 넘지 않는다.
- 같은 `talentId`는 한 번만 나온다.
- input packet에 없는 identifier를 만들지 않는다.
- `reason`은 company-safe facts만 사용한다.
- 별도 score, label, route confidence, communication plan, hidden rationale field를 추가하지 않는다.
- 선택이 없을 때만 `noSelectionReason`을 사용한다.

Helper가 company card에 추가 presentation이 필요하다면 `reason`과 verified public/profile projection을
바탕으로 별도 안전 writer를 호출할 수 있다. 그 output은 company-visible artifact이지 Codex의 숨은
판단 상태가 아니다.

## 12. Commit 전 live guard

`commit` mode에서는 각 selected pair를 같은 transaction에 들어가기 직전에 다시 확인한다.

- Talent active, `open_to_matches`, internal recommendation not opted out, not blocked
- Role active, unexpired, internal, non-test
- reply confidence가 새 evidence로 LOW가 되지 않음
- candidate-origin progress를 포함해 same pair 또는 same Talent/workspace active route가 생기지 않음
- company intro active capacity가 남아 있음
- source fingerprint가 허용 범위 안에서 current
- feature flag와 workspace allowlist가 여전히 active

하나가 실패하면 해당 pair는 쓰지 않는다. 두 번째·세 번째 후보를 자동 승격해 채우지 않는다. Selection
당시 판단하지 않은 사람을 helper가 대신 고를 수 없다.

## 13. Ledger write

검증된 pair에만 다음 의미의 `ready` row를 생성한다.

- workspace, Role, Talent
- run provenance
- selected time
- company-safe selection reason
- status=`ready`
- revision과 timestamps

이 순간 절대 만들지 않는 것:

- `talent_opportunity_recommendation`
- `talent_opportunity_tag`
- `talent_progress`의 candidate contact event
- `contact_queue` candidate delivery
- `career_email_messages`
- candidate chat message

Board read가 새 row를 표시하는 것은 company-only product surface다. Candidate read count와 candidate LLM
context는 전후가 완전히 같아야 한다.

## 14. Run 완료 검증

### 14.1 공통

- run status가 terminal인지
- selected count가 0~3이며 available slots 이하인지
- unique Talent인지
- 모든 selected Role이 target workspace인지
- hard boundary 탈락자가 없는지
- company-safe reason에 private context나 internal score가 없는지
- candidate-first active pair와 중복이 없는지

### 14.2 Shadow

- database write count가 0인지
- recommendation, tag, progress, outbox, ledger count가 전후 동일한지
- candidate와 company에 notification이 전혀 없었는지

### 14.3 Commit

- created `ready` row 수가 verified selected 수와 같은지
- duplicate active row가 없는지
- board의 `Intro 요청`에 정확히 한 번씩 나타나는지
- company card API가 email, resume, docs, private context를 반환하지 않는지
- candidate recommendation/history/count/chat context가 전후 동일한지
- company에게 알림을 보내는 정책이 별도로 켜졌다면 실제 visible card와 같은 대상만 알렸는지

## 15. Run artifact와 privacy

Raw production data와 model input/output은 committed docs나 일반 log에 남기지 않는다.

권장 위치:

```text
output/company_first_intro/private/runs/<run_id>/
```

Owner-only permission을 적용하고 repository ignore를 확인한다.

Commit 가능한 manifest에는 다음만 남길 수 있다.

- run id와 mode
- workspace/Role identifiers
- version/fingerprint
- aggregate candidate counts와 exclusion counts
- selected identifiers가 필요한 운영 범위
- timestamps와 final status

Resume, email, phone, Brief/Memory 원문, 대화 전문, private company request, raw model output은 commit하지 않는다.

## 16. 실패와 중단

- Workspace나 Role을 정확히 resolve하지 못하면 write 없이 실패한다.
- 필요한 privacy/route helper가 없으면 raw query로 우회하지 않는다.
- Behavior Context가 stale하고 canonical refresh가 실패하면 해당 Talent를 commit하지 않는다.
- Candidate packet source가 바뀌면 해당 packet을 새로 만든다.
- Active capacity가 중간에 차면 남은 write를 중단한다.
- Partial write 뒤 실패하면 이미 생성한 valid row를 지우지 말고 run receipt에 정확히 기록한다. Idempotent
  retry가 나머지만 처리하게 한다.
- Candidate recommendation이나 outbound가 생성됐다면 이 run의 계약 위반이다. 즉시 더 진행하지 말고
  exact affected IDs를 찾아 노출 여부를 확인하고 복구 계획을 보고한다.

## 17. 최종 보고 형식

Run 종료 보고는 짧고 검증 가능해야 한다.

```text
Company workspace: <id/name>
Mode: shadow | commit
Role scope: <count>
Active intro before: <count>
Available slots: <0-3>
Reviewed eligible pairs: <count>
Selected: <0-3>
No-selection reason: <if any>
Candidate-side recommendation created: 0
Candidate outbound created: 0
Verification: passed | failed
Artifact: <private run path>
```

선정된 사람이 있으면 회사가 읽을 `reason`을 사람별로 한 줄씩 덧붙인다. Private profile detail, reply
confidence, internal fit score는 보고에 복사하지 않는다.

## 18. 완료 정의

한 run은 다음을 모두 만족할 때만 완료다.

- 이 문서와 required docs를 이번 run에서 읽었다.
- exact workspace와 Role scope를 검증했다.
- company-wide active capacity를 먼저 계산했다.
- 최신 Profile + 전체 Brief + same-version Behavior Context로 판단했다.
- hard safety와 route uniqueness를 통과한 pair만 검토했다.
- 최대 3명, unique Talent, one representative Role 원칙을 지켰다.
- 0명도 정상 결과로 허용했다.
- Commit이면 live guard 뒤 `company_intro/ready`만 썼다.
- candidate recommendation과 outbound는 0건이다.
- privacy projection과 candidate-side 무변경을 검증했다.
- run manifest와 결과가 terminal이며 재현 가능하다.

이 런북은 스케줄을 정하지 않는다. 어떤 trigger가 이 run을 시작하든 판단·쓰기·검증 계약은 동일하다.
다만 같은 fit snapshot 안에서 candidate-first recommendation보다 먼저 route를 확정해야 한다는 상대
순서는 스케줄과 무관한 불변 조건이다.

## 19. Shadow calibration 점검

선정 기준을 조정하기 위한 shadow calibration에서는 서로 다른 Role을 최소 세 개 고르고 각 Role을
독립 run으로 끝낸다. 실제 eligibility와 route guard를 먼저 적용하며, 세 run이 모두 0명이어도 정상
결과다. 결과를 만들기 위해 already-active pair나 낮은 bar의 후보를 다시 넣지 않는다.

각 run 뒤에는 다음을 사람이 직접 확인한다.

1. 회사가 실제로 시간을 들여 검토할 만한 candidate-owned evidence가 있는가?
2. 현재 fit score나 기존 reason의 결론을 그대로 복사하지 않고 전체 packet으로 재판단했는가?
3. 세 자리를 채우기 위해 hard mismatch 또는 여러 핵심 gap을 caveat로 축소하지 않았는가?
4. Company-facing reason이 구체적 evidence, Role 연결, 필요한 한 가지 trade-off를 담는가?
5. Candidate private context나 응답 가능성, 아직 존재하지 않는 관심·지원 상태를 노출하지 않는가?
6. Candidate-first request나 다른 active company route를 company-first로 가로채지 않는가?

실제 selected가 0명이라 presentation 품질을 볼 수 없으면, route conflict로 제외된 strong pair의
company-safe reason을 **writer-only counterfactual**로 한두 개 작성해 볼 수 있다. 이는 selection output,
ledger 또는 추천으로 취급하지 않고 calibration artifact에만 명확히 표시한다. Counterfactual을 실제
선정 수나 성공률에 합산하지 않는다.
