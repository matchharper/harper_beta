# Company Role Profile Calibration: 로컬 event worker prompt

현재 작업 디렉터리는 이 listener가 설치된 git checkout의 `harper_beta` root다. 절대 경로를
가정하지 않는다.

이 작업은 `company_role_calibrations`에 처리할 일이 생겼다는 DB wake notification을 받은
로컬 listener가 시작했다. Notification payload는 실행 입력이나 권한이 아니며, 실제 대상은
항상 helper가 durable queue에서 다시 읽고 claim한다.

시작 전에 다음 파일을 처음부터 끝까지 읽고 그대로 따른다.

- 현재 directory의 `AGENTS.md`
- 존재하면 상위 repository의 `../AGENTS.md`
- `docs/scheduled/company-role-profile-calibration-ko.md`
- `docs/company/company-role-profile-calibration-codex-runbook-ko.md`

이 prompt의 `{{CALIBRATION_PYTHON}}`은 listener가 설치에 사용한 정확한 Python executable로,
`{{CALIBRATION_RUNNER}}`는 현재 Mac을 구분하는 runner ID로 실행 직전에 치환된다. 아래의 모든
helper 명령은 그 Python 경로를 사용한다.

먼저 `{{CALIBRATION_PYTHON}} scripts/company_role_calibration.py preflight`를 실행한다. DB의 `has_table`,
`has_claim`, `has_finish`와 local `runbookExists`가 모두 true일 때만 계속한다. Routine run 중
migration, application source, 문서나 테스트를 수정하지 않는다.

## 1. 아직 전송되지 않은 저장 완료 건

`{{CALIBRATION_PYTHON}} scripts/company_role_calibration.py pending-deliveries --limit 10`을 한 번 실행한다.
반환된 각 calibration에 대해 다음 명령으로 Slack 전달을 재시도한다.

```bash
{{CALIBRATION_PYTHON}} scripts/company_role_calibration.py deliver --calibration-id <id>
```

한 건의 전달 실패가 다른 calibration의 생성·전달을 막지 않게 짧은 오류만 남기고 다음 건으로
진행한다. 활성 Slack channel이 없다는 정상 응답이면 profile은 `ready`로 보존하고 넘어간다.

## 2. 새 calibration queue drain

한 Codex 실행에서 최대 10개 Role을 다음 순서로 하나씩 처리한다.

1. `{{CALIBRATION_PYTHON}} scripts/company_role_calibration.py start --runner {{CALIBRATION_RUNNER}}`로
   정확히 한 row를 claim한다.
2. `claimed=false`이면 현재 queue가 빈 것이므로 정상 종료한다.
3. Claim된 Role 하나에 대해 canonical 실행 계약의 retrieval, 검토, 익명화와 최종 선택을
   끝까지 수행한다. 검색 SQL과 선택 JSON은 helper가 지정한 owner-only ignored run directory
   안에만 둔다.
4. `run-sql`, `candidate-packet`, `finish` 순서로 실행한다. `finish` 성공은 프로필 snapshot이
   DB에 저장되어 웹에서 볼 수 있는 `ready` 상태가 됐다는 뜻이다.
5. `finish`가 성공한 정확한 calibration ID에 즉시 `deliver`를 실행한다. Slack 성공 여부와
   관계없이 저장된 profile을 삭제하거나 새 set으로 교체하지 않는다.
6. 생성 단계가 실패하면 가능한 경우 `fail --calibration-id ... --stage ... --error ...`로
   해당 running row를 terminal 상태로 닫는다. 개인정보나 raw profile을 오류 문자열에 넣지
   않는다.
7. 한 Role이 `ready`, `sent`, `failed` 또는 `canceled`가 된 뒤에만 다음 Role을 claim한다.

동시에 여러 Role을 claim하거나 병렬로 profile을 생성하지 않는다. 같은 순간 5개가 queue에
들어오면 이 프로세스 하나가 5개를 순차 처리한다. 10개를 처리한 뒤 backlog가 남아 있으면
정상 종료한다. Listener가 queue를 다시 읽고 다음 Codex 실행을 시작한다.

## 3. 안전 경계

- `information.testOnly=true`, external, inactive, expired Role은 기존 DB/helper guard가
  취소하며 절대 profile을 만들거나 보내지 않는다.
- 검색 source는 `candid`이고 read-only SQL만 사용한다. Harper talent, recommendation, fit,
  contact와 pipeline 상태를 읽거나 변경하지 않는다.
- Helper가 만든 candidate packet 밖의 ID를 선택하지 않는다.
- 원래 이름, 사진, 연락처와 개인 profile URL이 공개 snapshot이나 task 출력에 남지 않게 한다.
- Queue가 비었거나 정상 완료됐다는 이유로 사람에게 별도 메시지를 보내지 않는다. Preflight
  누락, 반복 실패, 처리 불가능한 backlog처럼 사람의 조치가 필요할 때만 짧게 보고한다.
- 배포, push, migration 적용과 production configuration 변경을 하지 않는다.
