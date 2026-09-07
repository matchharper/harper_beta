# Company Role Profile Calibration Scheduled 실행 기준

- 권장 주기: 12시간마다
- 기준 repository: `harper_beta`
- 실행 계약: [`company-role-profile-calibration-codex-runbook-ko.md`](../company/company-role-profile-calibration-codex-runbook-ko.md)
- helper: `scripts/company_role_calibration.py`
- Codex automation: `Company Role Profile Calibration` (12시간 주기, `gpt-5.6-sol` / `xhigh`, 현재 paused)
- 활성화 조건: production migration과 application 배포·smoke 확인 후 별도 활성화

## 목적

아직 어떤 상태의 calibration row도 등록되지 않은 eligible internal Role을 최초 한 번만 대상으로
claim하고, 실행 계약에 따라 `candid`에서 서로 연결 가능성이
있는 예시 profile 3~5개를 고른 뒤 같은 calibration을 웹과 Slack에 공개한다. 이 작업은 실제
후보 추천, fit, 연락이나 pipeline 상태를 만들거나 바꾸지 않는다.

## 매 실행 절차

1. repository의 `AGENTS.md`, 실행 계약과 이 문서를 처음부터 끝까지 읽는다.
2. `python3 scripts/company_role_calibration.py preflight`로 migration과 helper 준비 상태를 확인한다.
3. `python3 scripts/company_role_calibration.py pending-deliveries --limit 10`을 실행하고, 아직 Slack
   전달이 확인되지 않은 `ready` row마다 `deliver --calibration-id ...`를 재시도한다.
4. `python3 scripts/company_role_calibration.py start --runner codex-scheduled`를 실행한다.
5. `claimed=false`이면 새 profile 생성 없이 정상 종료한다.
6. claim된 Role 하나를 실행 계약에 따라 조사한다. 검색 SQL은 owner-only run directory에 두고
   helper의 `run-sql`, `candidate-packet`, `finish` 순서로만 처리한다.
7. `finish`가 성공한 calibration만 `deliver`한다. Slack channel이 없으면 웹의 `ready` 상태를
   유지하고 정상 종료한다.
8. 실패하면 가능한 한 `fail --stage ... --error ...`로 짧은 원인을 기록한다. 개인정보, raw
   profile, SQL 결과와 secret을 task 답변이나 repository에 남기지 않는다.
9. 다시 `start`하여 다음 row를 처리한다. Queue가 비거나 한 번의 scheduled task에서 10개를
   처리하면 종료하고 다음 실행에 이어간다.

## 안전 경계

- `information.testOnly=true`, external, inactive, expired Role은 처리하지 않는다.
- `candid` 검색은 read-only이고 명시적 `LIMIT`이 있어야 한다.
- Helper가 만든 candidate packet 밖의 ID는 선택하지 않는다.
- 원래 이름과 profile photo만 표시 snapshot에서 바꾸며 경력·학력 사실은 수정하지 않는다.
- 원래 이메일, 전화번호와 개인 profile URL은 공개 snapshot에 넣지 않는다.
- Slack에는 Good/Bad button을 만들지 않는다. 회사의 평가는 해당 Role 채팅이나 Slack thread의
  자연어 답변으로만 받는다.
- 변경된 Role/Hiring Brief timestamp 때문에 `finish`가 거부되면 오래된 결과를 강제로 저장하지
  않고 run을 실패 처리한다.

## 알림 원칙

Queue가 비었거나 한 Role이 정상 처리됐다는 이유만으로 운영 알림을 보내지 않는다. Migration
누락, 반복되는 helper 실패, 처리할 수 없는 backlog처럼 사람의 조치가 필요한 경우에만 현재
task에 짧게 보고한다.
