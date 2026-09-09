# Company-side Codex 작업 지도

- 문서 기준: 2026-09-09
- 기준 repository: `harper_beta`
- 목적: 새 internal Role 등록부터 초기 후보 검토, 이후 Hiring Brief 갱신까지 Codex가 언제 어떤
  문서를 읽고 무엇을 쓰는지 한곳에서 찾게 한다.
- 적용 채널: `/org`와 회사 Slack
- 운영 원칙: Scheduled task의 prompt는 이 문서의 경로와 진입 명령만 가진다. 정성 판단,
  안전 경계와 문구는 Git에 있는 상세 문서가 정본이다.

## 1. 이 문서가 답하는 것

이 문서는 세 작업의 큰 흐름과 소유권만 정의한다.

1. 새 Role이 active가 되면 즉시 profile calibration을 만든다.
2. Calibration을 전달한 시각으로부터 12시간 뒤에 Harper talent pool을 직접 검토하고, 추천
   가능한 pair를 저장한 뒤 회사에 한 번 진행 안내를 보낸다.
3. 48시간마다 최근 활동이 있는 Role만 찾아 회사의 직접 수정 요청을 Hiring Brief에 반영하고,
   행동에서 새로 추론한 기준은 확인 전 제안으로 남긴다.

후보 선택, 평가, Hiring Brief 보정처럼 긴 판단 계약은 이 파일에 복제하지 않는다. 각 실행은
아래 표의 상세 문서를 처음부터 끝까지 읽는다.

## 2. 전체 흐름

```text
Slack 또는 /org에서 internal Role이 처음 active가 됨
  -> DB가 calibration work를 durable하게 enqueue
  -> local event listener가 Codex를 즉시 실행
  -> Codex가 candid profile 3~5개를 선택·익명화·저장
  -> /org 목록에 노출하고 Slack으로 feedback 요청
  -> 실제 Slack 전송 성공 시각을 기준으로 +12시간 due work 저장
  -> local event listener가 due 시각에 Codex를 다시 실행
  -> 최신 Role/JD/Hiring Brief/calibration feedback을 읽음
  -> talent_users 후보 pool을 role-first로 직접 검토
  -> 추천 가능한 talent × role fit을 저장
  -> 회사에 한 번 진행 안내와 도움이 되는 질문/제안을 전달

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
| 새 Role profile calibration | DB event + local listener | Role 최초 active 직후 | [Company Role Profile Calibration](./company-role-profile-calibration-ko.md) | calibration snapshot, Slack delivery receipt | claim할 Role 없음 |
| Calibration 후 초기 talent 검토 | DB due work + 같은 local listener | calibration Slack `sentAt + 12h` | [Calibration 후 12시간 초기 후보 검토](./company-role-post-calibration-review-ko.md) | `talent_opportunity_fit`, run receipt, 회사 안내 delivery receipt | eligible unseen candidate 없음 |
| 활동 기반 Hiring Brief 갱신 | Codex Scheduled task 하나 | 48시간마다 | [48시간 Hiring Brief 갱신 런북](./company-role-request-refresh-48h-ko.md) | 승인된 `company_internal_roles.request` 변경 또는 확인 대기 proposal | 활동 또는 유효한 변경 없음 |

공통 판단 문서:

- Calibration profile 선택: [Calibration Codex 런북](../company/company-role-profile-calibration-codex-runbook-ko.md)
- Harper talent 직접 평가: [특정 Internal Role 추천 후보 직접 탐색·평가 기준](./internal-role-talent-direct-review-ko.md)
- Company context와 신규 fit 실행: [Company Context Run Codex 런북](../company/company-context-run-codex-runbook-ko.md)
- +12시간 listener prompt: [Post-calibration event worker prompt](../company/company-role-post-calibration-event-prompt-ko.md)
- Hiring Brief 도출: [Company-side 데이터 기반 Role Request 갱신 기준](./company-side-data-request-calibration-ko.md)
- 회사에 보이는 문구: [Company-side UX Writing Guide](../company-side-ux-writing-guide-ko.md)
- test Role 격리: [Test internal-role isolation](../test-internal-role-isolation-ko.md)

## 4. 작업별 정확한 책임

### 4.1 즉시 Calibration

이 단계는 회사의 기준을 빨리 확인하기 위한 예시 목록이다. `candid`를 읽고 3~5개 profile을
고르지만 Harper talent 추천, fit, 연락 또는 pipeline 상태를 만들지 않는다. Slack 전송 실패 시
웹 목록은 보존하고 기존 재시도 계약을 따른다.

Calibration 전달 시각은 profile 저장 시각이 아니라 Slack delivery receipt의 최초 `sentAt`이다.
12시간 due work는 이 시각이 생긴 transaction에서 한 번만 예약한다. Slack 채널이 없어 실제
전송되지 않았다면 12시간 clock을 시작하지 않는다. `/org`만으로도 clock을 시작해야 하는 제품
정책으로 바꿀 때에는 `webReadyAt` 같은 별도 명시적 receipt를 추가하고 이 문서를 먼저 고친다.

### 4.2 +12시간 초기 talent 검토

이 단계의 목적은 calibration feedback이 없어도 초기 추천 후보 발견을 늦추지 않는 것이다.
Feedback이 있으면 최신 Hiring Brief와 함께 사용하고, 없으면 현재 문서만으로 진행한다. 기다리는
12시간은 feedback을 받을 기회이지 feedback을 필수로 만드는 gate가 아니다.

Codex는 `talent_users`에서 Role별 retrieval을 만들고 bounded candidate packet을 전부 읽는다.
최종 판단은 문서와 실제 profile evidence로 하며 SQL rank, 키워드 점수 또는 deterministic 문구
규칙이 대신하지 않는다. 결과는 `talent_opportunity_fit`에 저장해 기존 추천 시스템이 사용할 수
있게 한다. 이 단계가 후보자에게 추천을 발송했거나 회사에 후보를 공유했다는 뜻은 아니다.

회사의 진행 안내는 한 Role에 한 번만 보낸다. 그 메시지는 다음 사실만 약속한다.

> Harper가 인재풀 검토를 시작했고, 다음 연락은 회사에 연결을 제안드릴 후보가 준비됐을 때 한다.

0~3개의 bullet에는 지금 답하면 검색에 도움이 되는 질문이나 선택 가능한 범위 조정 제안만 넣는다.
검토 수, 통과 수, 탈락 수, 보상 차이 같은 내부 수치를 공개하거나 `후보가 없다`, `연봉이 낮다`,
`기준이 너무 높다`처럼 부정적 결론을 전달하지 않는다. Fit이 0개여도 정상 완료이며 같은 원칙으로
안내한다.

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
6. 같은 Role에 대한 open run은 하나만 존재하고, 한 Codex process는 Role을 하나씩 terminal
   상태로 끝낸 다음 다음 Role을 claim한다.
7. Queue notification은 wake hint일 뿐이다. 실제 대상과 권한은 매번 DB queue를 다시 읽고 atomic
   claim해 결정한다.
8. Routine scheduled run은 source code, migration, 문서, 테스트, 배포 설정을 수정하지 않는다.

## 6. Durable 상태와 idempotency 목표

새 top-level 판단 table을 만들지 않는다. 필요한 durable fact는 기존 원장에 둔다.

- Calibration 생성·전달: `company_role_calibrations`
- +12시간 due anchor: calibration payload의 최초 delivery `sentAt`
- +12시간 실행 queue·history: `company_context_runs`의 `trigger_reason=post_calibration_12h`
- Fit 결과: `talent_opportunity_fit`
- 회사 안내 receipt: 해당 run `result.companyNotice`에 `companyMessageId`, `slackMessageTs`,
  `sentAt`, `status`를 저장한다.
- 48시간 request refresh의 역할별 cursor·결론: 해당 scheduled run의 owner-only manifest와
  canonical proposal/event receipt. 여러 host가 동시에 실행될 수 있게 할 때에는 기존
  `company_context_runs`에 별도 `request_refresh_48h` run kind를 추가하거나 동등한 DB claim
  계약을 먼저 구현한다. Local 파일 lock만 production 중복 방지로 쓰지 않는다.

`company_context_runs`의 현재 one-open-row 제약 때문에 기존 `role_created` 즉시 context run과
`post_calibration_12h`를 동시에 enqueue하면 먼저 존재한 row가 뒤 작업을 삼킬 수 있다. Target
구현에서는 신규 Role의 최초 context/matching run을 calibration 전달 후 +12시간 run으로
통합하고, activation 시 즉시 생성하는 기존 `role_created` run을 제거하거나 queued 상태에서
정확한 due/trigger로 전환한다. 두 경로를 동시에 유지하지 않는다.

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
| 새 Role calibration queue/helper/listener/Slack route | 구현 존재 | production migration·app revision·listener status를 preflight로 확인 |
| calibration 전달 후 정확히 +12시간 queue | 목표 계약만 정의됨 | delivery transaction enqueue, trigger 전환, listener 확장 구현·테스트·배포 |
| +12시간 talent direct review와 fit write | 재사용 가능한 helper/runbook 존재 | 새 trigger reason, post-calibration runner, coverage 검증 구현 |
| +12시간 회사 Slack + `/org` 안내 | 목표 계약만 정의됨 | idempotent dual-channel delivery path와 receipt 구현 |
| 48시간 활동 선별·request refresh helper | 판단 문서는 존재, 전용 canonical helper는 없음 | source cursor, claim, proposal/write/readback 구현·테스트 |
| 48시간 Codex Scheduled task | host-local task를 `PAUSED`로 생성/갱신 | 위 helper preflight와 production rollout 후 `ACTIVE` 전환 |

이 문서를 추가하는 것만으로 production behavior가 바뀌지는 않는다. Migration, application push,
listener enable과 Scheduled task activation은 각각 실제 rollout 증거를 확인한 뒤 수행한다.

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
9. Listener `check`가 모두 ready일 때만 `on`으로 전환한다.
10. 48시간 Scheduled task는 전용 helper `preflight`가 ready이고 read-only dry-run 및 conflict
    test가 통과한 뒤에만 `ACTIVE`로 바꾼다.
11. 첫 실제 실행에서 calibration 전달 receipt, +12시간 due timestamp, fit coverage, 회사 안내
    idempotency와 request readback을 각각 확인한다.
12. 배포가 완료되면 root `AGENTS.md`의 Notion 문서 동기화 절차를 수행한다.

### 9.1 목표 change set

다른 작업자가 구현 범위를 다시 해석하지 않도록 목표 파일 책임을 고정한다. 실제 migration 번호는
작업 시점의 최신 번호를 사용하며 아래 이름을 그대로 복사해 충돌시키지 않는다.

| 영역 | 기존 또는 목표 파일 | 책임 |
| --- | --- | --- |
| Calibration delivery hook | `src/app/api/internal/company-role-calibrations/deliver/route.ts`와 새 corrective migration | 최초 Slack `sentAt` transaction에서 +12시간 run을 idempotent하게 예약 |
| 신규 Role context trigger 정리 | `company_context_runs` 관련 corrective migration | 즉시 `role_created`와 `post_calibration_12h` 중복 제거, test/eligibility guard 유지 |
| Event listener | `scripts/company_role_calibration_listener.py` | calibration work와 +12시간 due work 중 가장 이른 시각에 맞춰 Codex 실행 |
| +12시간 prompt | `docs/company/company-role-post-calibration-event-prompt-ko.md` | 짧은 실행 진입점; 정성 계약은 scheduled 문서에서 읽음 |
| 후보 검토 helper | `scripts/company_role_recurring_matching.py` | `post_calibration_12h` claim, packet, fit write, coverage와 terminal receipt |
| 회사 안내 endpoint/helper | 기존 internal delivery API 계층과 matching helper | Slack + `/org` idempotent 전달 및 채널별 receipt |
| 48시간 helper | 목표 `scripts/company_role_request_refresh.py` | preflight, activity enqueue/claim, packet, proposal/apply, readback, finish/fail |
| Scheduled host task | Codex app의 `Harper company role request refresh` | 48시간마다 helper queue drain; repository 밖 host-local 설정 |

최소 targeted test는 delivery 재시도, `sentAt + 12h`, listener restart, open-run conflict,
test-only/inactive 차단, candidate coverage, dual-channel idempotency, 48시간 gap recovery, actor attribution,
direct-request/proposal 분리와 expected-value conflict를 포함한다.

## 10. 구현 완료 정의

다음 항목을 모두 직접 확인해야 “세팅 완료”라고 보고한다.

- [ ] Slack과 `/org` 두 Role 생성 경로가 같은 calibration enqueue를 만든다.
- [ ] 새 Role 생성 후 event listener가 polling 지연 없이 calibration Codex를 시작한다.
- [ ] Calibration snapshot과 Slack message가 같은 profile set을 보여 준다.
- [ ] 재전송해도 Slack duplicate가 생기지 않는다.
- [ ] 최초 Slack `sentAt`에 정확히 하나의 `post_calibration_12h` run이 예약된다.
- [ ] +12시간 전에 실행되지 않고, listener 재시작 후에도 due work를 잃지 않는다.
- [ ] +12시간 run이 최신 feedback과 Hiring Brief를 읽고 eligible candidate packet 전부를 평가한다.
- [ ] Fit write coverage, source fingerprint와 readback이 검증된다.
- [ ] Fit 저장만으로 후보자 연락이나 회사 공유가 발생하지 않는다.
- [ ] 회사 진행 안내가 Slack과 `/org`에 한 번씩만 남고, 실제 전달 receipt가 있다.
- [ ] 회사 안내에 내부 수치·부정적 결론·보상 비판이 없다.
- [ ] 48시간 task가 활동 없는 Role을 건드리지 않는다.
- [ ] 회사의 직접 수정 요청만 자동 반영되고 추론 기준은 confirmation-required proposal로 남는다.
- [ ] Request write가 expected-value conflict를 덮어쓰지 않고 저장 후 readback된다.
- [ ] inactive, expired, external, auto-disabled, test-only Role이 모든 자동 경로에서 제외된다.
- [ ] 정상 no-op은 사용자·회사·운영 채널에 불필요한 메시지를 만들지 않는다.
- [ ] raw production 자료와 secret이 Git diff에 없다.
- [ ] 다른 사람이 새 clone과 이 문서만으로 설치, preflight, dry-run, 활성화와 검증 순서를 수행할
      수 있다.
