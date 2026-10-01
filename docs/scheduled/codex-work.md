# Company-side Codex 작업 지도

> **최우선 실행 규칙:** 새 internal Role의 등록이 완료되고 최초 `active` 상태가 감지되면,
> Codex는 profile calibration을 시작하기 전에 `company_roles.summary.ko.content`와
> `company_roles.summary.en.content`를 먼저 작성·저장하고 readback한다. 이 선행 단계가 끝나기
> 전에는 calibration 후보를 조회하거나 선택하지 않는다. 회사 정보가 부족하면 이 summary 작성에
> 한해 공개 웹을 검색해 검증 가능한 회사 정보를 보강할 수 있다.

- 문서 기준: 2026-09-23
- 기준 repository: `harper_beta`
- 목적: 새 internal Role 등록의 Codex calibration과 그 뒤 Company Matching Worker 실행, 이후 Hiring
  Brief 갱신의 소유권을 한곳에서 찾게 한다.
- 적용 채널: `/org`와 회사 Slack
- 운영 원칙: Scheduled task의 prompt는 이 문서의 경로와 진입 명령만 가진다. 정성 판단,
  안전 경계와 문구는 Git에 있는 상세 문서가 정본이다.

## 0. Calibration보다 먼저 만드는 Role summary

이 단계는 새 Role activation으로 시작된 Codex 실행의 첫 번째 write다. 동일한 event와 claim을
사용하되, calibration의 일부 결과로 뒤늦게 만들지 않는다. Role을 claim한 직후 eligibility를 다시
확인하고, 아래 순서로 처리한다.

1. 대상이 internal, active, unexpired, non-test Role인지 확인한다. 하나라도 아니면 summary와
   calibration을 모두 만들지 않고 기존 cancel 계약을 따른다.
2. Role/JD, 위치, 근무 방식, 보상, 저장된 회사 설명·pitch와 공개 가능한 회사 정보를 읽고 현재
   `company_roles.summary`를 확인한다.
3. `summary.ko.content`와 `summary.en.content` 중 비어 있는 언어만 작성한다. 둘 다 비어 있으면 한
   실행에서 두 언어를 함께 작성한다. 이미 값이 있는 언어는 다시 쓰거나 번역문으로 덮어쓰지 않는다.
4. 누락된 content를 충돌 안전한 조건부 write로 저장하고 두 언어를 readback한다. 다른 실행이 먼저
   유효한 content를 저장했다면 그 값을 정본으로 사용한다.
5. 필요한 두 content가 모두 존재하는 것을 확인한 뒤에만 candid retrieval과 profile calibration을
   시작한다. 생성·저장·readback이 실패하면 fallback 문구를 cache에 넣지 말고 해당 작업을
   retriable failure로 끝낸다.

### 작성 가이드

한국어와 영어는 같은 사실을 바탕으로 자연스럽게 작성하며, 다음 계약을 모두 지킨다.

- 여러 후보자에게 그대로 재사용할 수 있는 중립적인 회사·역할 설명이다. 특정 후보자, 후보자의
  경력·선호, 왜 그 후보자에게 맞는지, 추천 판단이나 점수를 넣지 않는다.
- 먼저 회사가 무엇을 하는지와 객관적으로 주목할 이유를 2~4개의 간결한 문장으로 쓴다. 입력에
  있고 실제 설명에 도움이 될 때만 투자 금액·단계, 주요 투자자, traction·규모 또는 창업자 배경을
  포함한다.
- 이어서 Role이 무엇을 책임지는지, 제품·domain 범위와 핵심 업무를 2~4개의 간결한 문장으로
  쓴다.
- location이나 work mode가 제공되면 마지막 별도 문장에 제공된 값만 적는다. 둘 다 없으면 이
  문장을 생략한다. 국가 제한, 출근 일수, remote 정책을 추론하지 않는다.
- compensation이 제공되면 그 다음 마지막 별도 문장에 정확한 범위만 적는다. 통화를 변환하거나
  총보상, equity, bonus, benefit을 추정하지 않는다.
- Role/JD와 회사 자료에 없는 투자, 투자자, 창업자, traction, 팀 수준, 문화, 보상, 채용 조건과
  역할 범위를 만들지 않는다. `companyRoleRequest`, `internalFit`, 비공개 회사 요청·평가와 후보자
  정보는 summary의 근거로 사용하거나 바꾸어 말하지 않는다.
- 한국어 content는 자연스러운 한국어를 기본으로 하고 회사명·직무명·기술명 같은 고유명사는
  자연스러우면 원문을 유지한다. 영어 content의 모든 자연어 문장은 영어로 쓰며, 자연스러운 영어
  형태가 없는 고유명사만 원문을 유지할 수 있다.
- `internal`, DB, retrieval, score, cache, calibration 같은 구현 용어를 content에 쓰지 않는다.

저장된 회사 정보만으로 회사 부분을 사실에 맞게 작성하기 어렵다면 공개 웹 검색을 허용한다. 공식
회사 사이트의 About·Product·Careers, 공식 보도자료·투자 발표, 현재 공개 JD를 우선하고, 필요할 때만
신뢰할 수 있는 보조 출처로 교차 확인한다. 검색 결과의 snippet만으로 단정하거나 서로 다른 동명
회사를 섞지 않는다. 확인되지 않은 내용은 빼며, 검색을 허용한다는 이유로 Role summary 이외의
calibration 판단을 공개 웹 조사로 확장하지 않는다.

저장은 `company_roles.summary.<lang>.content`를 정본으로 하며 기존 JSON의 다른 언어와 sibling
metadata를 보존한다. 현재 canonical write helper가 `version`, `generatedAt`, `sourceHash` 같은
metadata를 관리하면 같은 계약을 사용한다. 직접 전체 `summary` 객체를 교체하거나 non-empty
content를 무조건 overwrite하지 않는다.

## 1. 이 문서가 답하는 것

이 문서는 네 작업의 큰 흐름과 소유권만 정의한다.

1. 새 Role이 active가 되면 한국어·영어 Role summary를 먼저 만든다.
2. 두 summary의 저장과 readback 뒤에 즉시 profile calibration을 만든다.
3. Calibration을 전달한 시각으로부터 12시간 뒤에 월요일 정기 실행과 같은 Company Matching
   Worker를 해당 회사·Role에 대해 한 번 실행한다.
4. 48시간마다 최근 활동이 있는 Role만 찾아 회사의 직접 수정 요청을 Hiring Brief에 반영하고,
   행동에서 새로 추론한 기준은 확인 전 제안으로 남긴다.

후보 선택, 평가, Hiring Brief 보정처럼 긴 판단 계약은 이 파일에 복제하지 않는다. 각 실행은
아래 표의 상세 문서를 처음부터 끝까지 읽는다.

## 2. 전체 흐름

```text
Slack 또는 /org에서 internal Role이 처음 active가 됨
  -> DB가 calibration work를 durable하게 enqueue
  -> local event listener가 Codex를 즉시 실행
  -> Codex가 비어 있는 summary.ko.content와 summary.en.content를 작성·저장·readback
  -> 필요하면 이 summary 작성에 한해 공개 웹에서 회사 사실을 보강
  -> Codex가 candid profile 3~5개를 선택·익명화·저장
  -> /org 목록에 노출하고 Slack으로 feedback 요청
  -> 실제 Slack 전송 성공 시각을 기준으로 +12시간 Company Matching run 저장
  -> 상시 Company Matching Worker가 due 시각 뒤 같은 queue에서 claim
  -> 월요일 정기 실행과 같은 planner/retrieval/scoring/company-wide reranking 수행
  -> candidate-first | company-first | no-action을 결정하고 기존 route별 delivery 실행

48시간마다 별도 Codex Scheduled task
  -> 직전 성공 cursor 이후 최근 48시간에 의미 있는 활동이 있는 active Role 선별
  -> 회사 발화, calibration feedback, 회사가 남긴 후보 피드백을 문서 기준으로 검토
  -> 이미 회사가 직접 요청한 Hiring Brief 수정은 canonical write path로 반영
  -> 행동에서 새로 추론한 기준은 proposal로 남기고 자동 반영하지 않음
  -> 바꿀 것이 없는 Role은 no-op
```

## 3. 작업 레지스트리

| 작업 | 기동 방식 | 시간 기준 | 정본 문서 | 주요 write | 정상 무작업 |
| --- | --- | --- | --- | --- | --- |
| 신규 Role 한·영 summary 작성 | DB event + local listener | Role 최초 active 직후, calibration claim 직후 | 이 문서 제0장 | 비어 있는 `company_roles.summary.ko/en.content` | 두 언어 content가 이미 존재 |
| 새 Role profile calibration | DB event + local listener | Role 최초 active 직후 | [Company Role Profile Calibration](./company-role-profile-calibration-ko.md) | calibration snapshot, Slack delivery receipt | claim할 Role 없음 |
| Calibration 후 Company Matching 1회 실행 | Company Matching durable queue + Python Worker | calibration Slack `sentAt + 12h` | [Calibration 후 12시간 Company Matching](./company-role-post-calibration-review-ko.md) | matching review, route별 기존 ledger·delivery receipt | planner skip 또는 actionable 후보 없음 |
| 활동 기반 Hiring Brief 갱신 | Codex Scheduled task 하나 | 48시간마다 | [48시간 Hiring Brief 갱신 런북](./company-role-request-refresh-48h-ko.md) | 승인된 `company_internal_roles.request` 변경 또는 확인 대기 proposal | 활동 또는 유효한 변경 없음 |
| LinkedIn Jobs 수요 기반 GTM (운영 전) | Codex Scheduled task 예정 | 매일 08:00 KST 예정 | [LinkedIn Jobs GTM 운영 계약](./linkedin-jobs-marketplace-gtm-ko.md) | eligible Role의 공개 공고, 검증된 LinkedIn 게시 상태, Notion 행동 이력 | 신규·수정·교체 필요 없음 |

공통 판단 문서:

- Calibration profile 선택: [Calibration Codex 런북](../company/company-role-profile-calibration-codex-runbook-ko.md)
- Company Matching Worker: [Company-scoped Talent Matching Worker 구현 계획](../company/company-first-talent-search-worker-implementation-plan-ko.md)
- Candidate/company route lifecycle: [회사 선확인 후보자 추천 구현 기획](../company/company-first-talent-recommendation-product-plan-ko.md)
- Hiring Brief 도출: [Company-side 데이터 기반 Role Request 갱신 기준](./company-side-data-request-calibration-ko.md)
- 회사에 보이는 문구: [Company-side UX Writing Guide](../company-side-ux-writing-guide-ko.md)
- test Role 격리: [Test internal-role isolation](../test-internal-role-isolation-ko.md)

## 4. 작업별 정확한 책임

### 4.0 신규 Role summary 선행 작성

이 단계는 profile calibration보다 먼저 같은 Role에 대해 정확히 한 번 수행한다. 비어 있는 언어만
채우며, 작성 품질과 저장 계약은 제0장을 따른다. Summary는 역할을 소개하는 공용 사실 설명이지
calibration 결과, Hiring Brief, 후보자 fit 또는 회사의 비공개 요청을 요약한 문서가 아니다.

두 언어 content의 readback이 끝나야 calibration으로 넘어간다. 이 순서는 Role 등록 직후 회사와
후보자에게 사용될 수 있는 공용 설명을 먼저 안정시키기 위한 것이며, summary 저장 자체가 후보자
추천·연락, 회사 공유 또는 fit 생성을 뜻하지 않는다.

### 4.1 즉시 Calibration

이 단계는 회사의 기준을 빨리 확인하기 위한 예시 목록이다. `candid`를 읽고 3~5개 profile을
고르지만 Harper talent 추천, fit, 연락 또는 pipeline 상태를 만들지 않는다. Slack 전송 실패 시
웹 목록은 보존하고 기존 재시도 계약을 따른다.

Calibration 전달 시각은 profile 저장 시각이 아니라 Slack delivery receipt의 최초 `sentAt`이다.
12시간 due work는 이 시각이 생긴 transaction에서 한 번만 예약한다. Slack 채널이 없어 실제
전송되지 않았다면 12시간 clock을 시작하지 않는다. `/org`만으로도 clock을 시작해야 하는 제품
정책으로 바꿀 때에는 `webReadyAt` 같은 별도 명시적 receipt를 추가하고 이 문서를 먼저 고친다.

Calibration listener는 여기까지 소유한다. +12시간 후속 run은 Company Matching Worker queue에 들어가며
listener가 두 번째 Codex process를 띄우지 않는다.

### 4.2 +12시간 Company Matching 1회 실행

이 단계의 목적은 calibration feedback이 없어도 기존 정기 matching을 첫 주까지 기다리지 않게 하는
것이다. Feedback이 있으면 이미 반영된 최신 Hiring Brief가 Worker 입력에 들어가고, 없으면 현재
Hiring Brief로 진행한다. 기다리는 12시간은 feedback을 받을 기회이지 feedback을 필수로 만드는 gate가
아니다.

`company_first_search_runs`에 `trigger_reason=post_calibration`과 calibration 대상 Role의
`requested_role_ids`를 저장한다. Worker는 이 run을 회사 사용자의 explicit `Run Search`가 아니라 월요일
정기 실행과 같은 mixed-route run으로 처리한다. 따라서 Role별 actionable 최대 3명, 0명 허용,
candidate-first/company-first/no-action, 회사 단위 Talent 중복 금지와 모든 privacy·route guard가 같다.

별도 fit-only write나 “인재풀 검토 시작” 안내를 만들지 않는다. Candidate-first는 기존 후보자 delivery,
company-first는 기존 ready ledger와 Slack outbox를 사용한다. Planner skip과 no-action은 정상이며 결과를
채우기 위한 padding이나 별도 deterministic 메시지를 만들지 않는다.

### 4.3 48시간 Hiring Brief 갱신

48시간 작업의 첫 질문은 “Role을 바꿔야 하는가?”가 아니라 “새로운 company-side evidence가
있는가?”다. 단순 조회, 시스템 event, 후보자의 반응, 이유 없는 운영 stage 변화는 실행 대상이나
새 회사 기준이 아니다.

다음 둘을 분리한다.

- 회사가 직접 `이 기준을 추가/수정/삭제해 달라`고 말했는데 아직 반영되지 않은 경우: 그 발화가
  해당 변경의 명시적 authorization이므로 expected-value 보호가 있는 canonical path로 반영한다.
- 여러 후보 결과와 피드백을 종합해 Codex가 새 기준을 추론한 경우: old/new diff와 근거를
  proposal로 남긴다. 회사 또는 권한 있는 owner의 확인 전에는 `request`를 쓰지 않는다.

이 구분은 scheduled 실행을 켠다는 이유로 약화되지 않는다.

## 5. 공통 안전 경계

모든 작업은 다음을 지킨다.

1. `company_roles.information.testOnly = true`인 Role은 자동 matching, fit, 추천, 안내와 request
   갱신에서 제외한다. 명시적으로 allowlist된 fixture 경로를 일반 작업에 섞지 않는다.
2. Internal, active, unexpired Role만 자동 처리한다. Role이 중간에 비활성화되면 write와 전달 전에
   다시 확인하고 안전하게 cancel한다.
3. 후보자 원문, 이름, 연락처, 이력서, 회사 private 대화와 raw model output을 Git에 저장하지
   않는다. 실행 artifact는 ignored owner-only `output/`, `runs/` 또는 `private/`에 저장하고
   permission을 `0600`/`0700`으로 유지한다.
4. 후보자의 추천 수락은 회사 공유가 아니다. Harper 사람의 최종 확인 전에는 `연결 대기` 또는
   회사-visible 후보 소개가 만들어졌다고 말하지 않는다.
5. LLM 정성 판단을 키워드, 정규식, 단어 목록, punctuation 또는 heuristic score로 대체하지
   않는다. Deterministic code는 eligibility, identifier, type, idempotency, authorization,
   expected-value conflict와 privacy boundary만 검증한다.
6. Calibration queue는 같은 Role의 open calibration을 하나만 두고, Company Matching Worker는 같은
   workspace의 run을 동시에 두 개 처리하지 않는다.
7. Queue notification은 wake hint일 뿐이다. 실제 대상과 권한은 매번 DB queue를 다시 읽고 atomic
   claim해 결정한다.
8. Routine scheduled run은 source code, migration, 문서, 테스트, 배포 설정을 수정하지 않는다.

## 6. Durable 상태와 idempotency 목표

새 top-level 판단 table을 만들지 않는다. 필요한 durable fact는 기존 원장에 둔다.

- Calibration 생성·전달: `company_role_calibrations`
- Role 공용 설명: `company_roles.summary.ko/en.content`
- +12시간 due anchor: calibration payload의 최초 delivery `sentAt`
- +12시간 실행 queue·history: `company_first_search_runs`의 `trigger_reason=post_calibration`
- Calibration과 run 연결: `company_first_search_runs.source_calibration_id`와 calibration payload의
  `postCalibrationSearch.runId`
- Matching 결과: `talent_opportunity_matching_review`, candidate-first discovery run 또는
  `company_intro_candidates`
- Delivery receipt: route별 기존 Opportunity Worker 또는 Company-first Slack outbox
- 48시간 request refresh의 역할별 cursor·결론: 해당 scheduled run의 owner-only manifest와
  canonical proposal/event receipt. 여러 host가 동시에 실행될 수 있게 할 때에는 기존
  `company_context_runs`에 별도 `request_refresh_48h` run kind를 추가하거나 동등한 DB claim
  계약을 먼저 구현한다. Local 파일 lock만 production 중복 방지로 쓰지 않는다.

Legacy `company_context_runs.post_calibration_12h`는 더 이상 새로 만들지 않는다. Corrective migration은
아직 claim되지 않은 old row를 Company Matching queue로 옮긴다. Old waiting/notify side effect는
제거하되 rolling rollout 동안 이전 listener의 preflight가 막히지 않도록 trigger/function 이름은
아무 작업도 하지 않는 inert shim으로 유지한다.

## 7. Codex Scheduled task 계약

48시간 작업은 project-local standalone Codex Scheduled task 하나로 운영한다.

- 이름: `Harper company role request refresh`
- 주기: 2일마다 오전 09:30 KST
- 작업 directory: repository root. Prompt가 절대 checkout 경로를 실행 계약으로 사용하지 않고
  `harper_beta/`를 찾은 뒤 이 문서를 읽게 한다.
- 알림: 정상 no-op·정상 완료는 조용히 끝낸다. Preflight 실패, 반복 write conflict, 처리하지 못한
  backlog 또는 사람 확인이 필요한 proposal이 있을 때만 알린다.
- 실행 prompt: 이 문서와 [48시간 런북](./company-role-request-refresh-48h-ko.md)을 처음부터 끝까지
  읽고 canonical helper로 queue를 drain하라는 짧은 지시만 둔다.

Codex desktop의 local Scheduled task는 지정된 컴퓨터가 켜져 있고 앱이 실행 중이어야 한다.
새 컴퓨터로 clone한 것만으로 host-local task와 secret이 복제되지는 않는다. 제9장의 bootstrap을
수행해야 한다.

## 8. 현재 구현 상태와 rollout gate

이 표는 문서가 목표 동작을 실제 live 동작처럼 보이게 하지 않기 위한 상태표다.

| 항목 | repository 상태 | 활성화 전 확인 |
| --- | --- | --- |
| 신규 Role summary 선행 생성·조건부 write·readback | helper와 event prompt 구현 존재 | production app revision·migration·listener 활성화 후 첫 실행 receipt 확인 |
| 새 Role calibration queue/helper/listener/Slack route | 구현 존재 | production migration·app revision·listener status를 preflight로 확인 |
| calibration 전달 후 정확히 +12시간 Company Matching queue | corrective migration 구현 존재 | production migration 적용·delivery readback으로 `sentAt + 12h`와 run id 확인 |
| +12시간 정기 계약 1회 실행 | 기존 Company Matching Worker queue·mixed-route pipeline 재사용 | Worker revision과 첫 실제 `post_calibration` run receipt 확인 |
| +12시간 route별 전달 | candidate-first Opportunity Worker와 company-first ready/Slack outbox 재사용 | 실제 route·delivery receipt 확인 |
| 48시간 활동 선별·request refresh helper | 판단 문서는 존재, 전용 canonical helper는 없음 | source cursor, claim, proposal/write/readback 구현·테스트 |
| 48시간 Codex Scheduled task | host-local task를 `PAUSED`로 생성/갱신 | 위 helper preflight와 production rollout 후 `ACTIVE` 전환 |

Repository 구현만으로 production behavior가 바뀌지는 않는다. Migration, application push, listener
enable과 Scheduled task activation은 각각 실제 rollout 증거를 확인한 뒤 수행한다.

## 9. 새 clone에서 시작하는 순서

1. repository root와 `harper_beta/AGENTS.md`를 읽는다.
2. 이 문서의 제8장 상태표를 실제 코드와 migration history에 맞게 갱신한다. 파일 존재만으로
   production 적용을 가정하지 않는다.
3. `harper_beta`와 `harper_worker`의 정확한 branch/revision을 기록하고, 둘의 internal-fit 입력
   계약이 맞는지 확인한다.
4. secret은 Git에 넣지 않고 기존 운영 경로에 설정한다. 최소한 DB read/write credential,
   internal delivery secret, app base URL과 로그인된 Codex CLI/App가 필요하다.
5. Calibration listener는 [설치 절차](./company-role-profile-calibration-ko.md)를 따라 `install`한
   뒤 OFF 상태에서 preflight한다.
6. 제8장의 미구현 항목을 문서에 적힌 순서로 구현하고 repository의 targeted test를 실행한다.
7. 명시적 배포 요청이 있는 release에서 migration과 app를 배포한다. Push가 production 배포를
   시작하는 repository에서는 별도 수동 Vercel deploy를 하지 않는다.
8. Production에서 새 test-only Role로 직접 검증하지 않는다. 가능하면 non-production project를
   사용하고, 불가피한 E2E는 test isolation 문서의 marker, allowlist와 exact-ID cleanup을 따른다.
9. Calibration listener `check`가 calibration queue와 notification에 대해 ready일 때만 `on`으로
   전환한다. Post-calibration search는 listener preflight 대상이 아니다.
10. 48시간 Scheduled task는 전용 helper `preflight`가 ready이고 read-only dry-run 및 conflict
    test가 통과한 뒤에만 `ACTIVE`로 바꾼다.
11. 첫 실제 실행에서 calibration 전달 receipt, +12시간 due timestamp, `post_calibration` run,
    matching review와 route별 delivery idempotency를 각각 확인한다.
12. 배포가 완료되면 root `AGENTS.md`의 Notion 문서 동기화 절차를 수행한다.

### 9.1 목표 change set

다른 작업자가 구현 범위를 다시 해석하지 않도록 목표 파일 책임을 고정한다. 실제 migration 번호는
작업 시점의 최신 번호를 사용하며 아래 이름을 그대로 복사해 충돌시키지 않는다.

| 영역 | 기존 또는 목표 파일 | 책임 |
| --- | --- | --- |
| 신규 Role summary 선행 단계 | `scripts/company_role_calibration.py`와 event prompt | claim 직후 누락된 한·영 content 생성, 조건부 write, readback을 완료한 뒤에만 candid retrieval 허용 |
| Calibration delivery hook | `src/app/api/internal/company-role-calibrations/deliver/route.ts`와 corrective migration | 최초 Slack `sentAt` transaction에서 +12시간 Company Matching run을 idempotent하게 예약 |
| Legacy 후속 trigger 정리 | `20260923120000_post_calibration_company_matching.sql` | queued `post_calibration_12h`를 이관하고 old waiting/notify side effect 제거. Rolling rollout용 trigger 이름은 inert shim으로 유지 |
| Event listener | `scripts/company_role_calibration_listener.py` | profile calibration work만 Codex로 실행 |
| +12시간 실행 | `harper_worker/opp/company_first_search/` | `post_calibration` run을 정기 mixed-route 계약으로 claim·실행 |
| 결과 전달 | 기존 Opportunity Worker와 Company-first outbox | 실제 candidate-first/company-first route만 기존 방식으로 전달 |
| 48시간 helper | 목표 `scripts/company_role_request_refresh.py` | preflight, activity enqueue/claim, packet, proposal/apply, readback, finish/fail |
| Scheduled host task | Codex app의 `Harper company role request refresh` | 48시간마다 helper queue drain; repository 밖 host-local 설정 |

최소 targeted test는 delivery 재시도, `sentAt + 12h`, listener의 calibration-only 경계,
workspace run serialization, test-only/inactive 차단, regular mixed-route 계약, route delivery idempotency,
48시간 gap recovery, actor attribution, direct-request/proposal 분리와 expected-value conflict를 포함한다.

## 10. 구현 완료 정의

다음 항목을 모두 직접 확인해야 “세팅 완료”라고 보고한다.

- [ ] Slack과 `/org` 두 Role 생성 경로가 같은 calibration enqueue를 만든다.
- [ ] 새 Role 생성 후 event listener가 polling 지연 없이 calibration Codex를 시작한다.
- [ ] 새 active Role의 비어 있는 `summary.ko.content`와 `summary.en.content`가 제0장 가이드로 먼저
      작성되고 readback된 뒤에만 candid retrieval이 시작된다.
- [ ] 기존 non-empty summary와 sibling metadata를 덮어쓰지 않고, 생성 실패 시 fallback 문구를
      `company_roles.summary`에 저장하지 않는다.
- [ ] Calibration snapshot과 Slack message가 같은 profile set을 보여 준다.
- [ ] 재전송해도 Slack duplicate가 생기지 않는다.
- [ ] 최초 Slack `sentAt`에 정확히 하나의 `post_calibration` Company Matching run이 예약된다.
- [ ] `available_at=sentAt+12h`이고 Company Matching Worker가 그 전에는 claim하지 않는다.
- [ ] Calibration 대상 Role이 `requested_role_ids`에 있고 정기 mixed-route 계약으로 실행된다.
- [ ] Candidate-first/company-first/no-action, Role별 최대 3명과 0명 허용을 정기 run과 동일하게 지킨다.
- [ ] Local calibration listener가 post-calibration Codex work를 조회하거나 실행하지 않는다.
- [ ] Route가 생긴 경우에만 기존 candidate/company delivery가 실행되고 별도 진행 안내는 없다.
- [ ] 48시간 task가 활동 없는 Role을 건드리지 않는다.
- [ ] 회사의 직접 수정 요청만 자동 반영되고 추론 기준은 confirmation-required proposal로 남는다.
- [ ] Request write가 expected-value conflict를 덮어쓰지 않고 저장 후 readback된다.
- [ ] inactive, expired, external, auto-disabled, test-only Role이 모든 자동 경로에서 제외된다.
- [ ] 정상 no-op은 사용자·회사·운영 채널에 불필요한 메시지를 만들지 않는다.
- [ ] raw production 자료와 secret이 Git diff에 없다.
- [ ] 다른 사람이 새 clone과 이 문서만으로 설치, preflight, dry-run, 활성화와 검증 순서를 수행할
      수 있다.
