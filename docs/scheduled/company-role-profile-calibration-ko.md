# Company Role Profile Calibration: 로컬 event 실행·운영 기준

- 기준 repository: `harper_beta`
- 실행 계약: [`company-role-profile-calibration-codex-runbook-ko.md`](../company/company-role-profile-calibration-codex-runbook-ko.md)
- event prompt: [`company-role-profile-calibration-event-prompt-ko.md`](../company/company-role-profile-calibration-event-prompt-ko.md)
- calibration helper: `scripts/company_role_calibration.py`
- local listener: `scripts/company_role_calibration_listener.py`
- DB wake migration: `20260908190000_company_role_calibration_notify.sql`
- 기존 Codex automation: `Company Role Profile Calibration` 12시간 주기, event listener를 쓰는 동안
  `PAUSED` 유지

## 목적

새 internal Role이 처음 active가 되어 `company_role_calibrations` queue에 들어오면 특정 Mac에서
로컬 Codex를 바로 시작한다. Codex는 `candid`에서 서로 연결 가능성이 있는 예시 profile 3~5개를
고르고, `finish`로 같은 snapshot을 DB에 저장한 다음 `deliver`로 Slack에 보낸다. 실제 후보 추천,
fit, 연락과 pipeline 상태는 만들거나 바꾸지 않는다.

## 실행 구조

1. Role activation trigger가 한 Role당 최초 calibration row 하나를 `queued`로 저장한다.
2. DB trigger가 `harper_company_role_calibration_work` channel에 calibration ID, status,
   `available_at`만 보낸다.
3. 켜져 있는 local listener는 notification을 받으면 DB queue를 다시 읽는다. Notification payload를
   작업 입력으로 신뢰하지 않는다.
4. Due work가 있을 때만 `codex exec` process 하나를 시작한다.
5. Codex는 미전송 `ready` row를 먼저 전달하고, 새 `queued` row를 한 번에 하나씩 claim한다.
6. 각 Role은 `finish`로 profile을 저장한 뒤 같은 실행에서 `deliver`한다. 그 Role이 `ready`, `sent`,
   `failed`, `canceled` 중 하나가 된 다음에만 다음 Role을 처리한다.
7. 한 process는 최대 10개 Role을 처리한다. Backlog가 남으면 listener가 process 종료 뒤 queue를
   다시 읽고 다음 process를 시작한다.

`codex exec`은 automatic approval의 workspace-write sandbox를 사용하되, DB 조회와 internal
delivery API 호출에 필요한 network access만 명시적으로 켠다. Helper 명령은 PATH의 임의
`python3`가 아니라 LaunchAgent 설치에 사용한 정확한 Python executable로 실행한다.

동시에 5개 Role이 생성되면 notification은 여러 개 올 수 있지만 Codex process는 하나만 실행되고
5개를 순차 처리한다. DB의 `FOR UPDATE SKIP LOCKED` claim과 one-set-per-Role 제약이 다른 runner와의
중복 저장을 막는다.

## 새 컴퓨터에서 최초 설정

이 설정은 host-local이다. Git에 포함되는 것은 migration, listener, prompt와 문서이고, 어떤
checkout과 Python을 실행할지는 설치한 각 Mac의 LaunchAgent plist에 기록된다.

### 1. 필수 조건

- macOS와 로그인된 Codex CLI/App. 기본적으로 `/Applications/ChatGPT.app/Contents/Resources/codex`
  또는 `PATH`의 `codex`를 찾는다.
- 해당 checkout에서 production DB를 읽고 calibration RPC를 호출할 `DATABASE_URL`
- deployed internal delivery API와 같은 `INTERNAL_WORKER_API_SECRET`
- 필요하면 `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL` 또는 `APP_BASE_URL`. 없으면
  `https://matchharper.com`을 사용한다.
- Role notification 설정에 활성 Slack channel이 있어야 실제 Slack 전송이 된다. 없으면 profile은
  웹의 `ready` 상태로 안전하게 남는다.

환경값은 기존 운영 방식대로 repository 상위의 `worker.env` 또는 `harper_beta/.env.local`에 둔다.
Secret을 plist, git이나 명령행 인자에 복사하지 않는다.

Python dependency가 없는 새 컴퓨터에서는 checkout 안에 전용 venv를 만든다.

```bash
cd harper_beta
python3 -m venv .venv-company-role-calibration
.venv-company-role-calibration/bin/pip install \
  -r scripts/requirements-company-role-calibration.txt
```

### 2. DB와 app rollout

아래 상태가 production에 실제로 있어야 `on`이 통과한다.

- `20260904130000_company_role_calibrations.sql`의 table, enqueue/claim/finish/delivery RPC와 Role
  enqueue trigger
- `20260908190000_company_role_calibration_notify.sql`의 notification function과 trigger
- `/api/internal/company-role-calibrations/deliver`가 포함된 application revision

Migration 파일이 git에 있다는 사실만으로 적용됐다고 보지 않는다. 배포·migration 적용은 별도의
명시적 release 작업에서 수행하고, 그 전에는 listener를 OFF로 둔다.

### 3. LaunchAgent 설치

System Python에 dependency가 있으면 package command를 쓴다.

```bash
pnpm ops:company-role-calibration-listener install
pnpm ops:company-role-calibration-listener check
pnpm ops:company-role-calibration-listener status
```

전용 venv를 쓴다면 그 Python으로 설치한다. Plist는 이때 사용한 Python과 현재 checkout의 절대
경로를 캡처하므로 다른 컴퓨터의 경로를 복사할 필요가 없다.

```bash
.venv-company-role-calibration/bin/python \
  scripts/company_role_calibration_listener.py install
.venv-company-role-calibration/bin/python \
  scripts/company_role_calibration_listener.py check
```

`install`은 plist를 만들지만 최초 상태를 OFF로 둔다. `check`가 local prerequisite, DB workflow,
notification trigger를 모두 ready로 표시한 뒤 켠다.

Checkout 위치나 사용할 Python을 바꿨다면 listener를 `off`한 뒤 새 경로에서 `install`을 다시
실행한다. 다른 사람의 plist를 복사하지 않는다.

## 켜기·끄기·확인

System Python 설치 기준:

```bash
pnpm ops:company-role-calibration-listener on
pnpm ops:company-role-calibration-listener off
pnpm ops:company-role-calibration-listener status
pnpm ops:company-role-calibration-listener logs --lines 100
```

전용 venv이면 위 package command 대신 설치 때 사용한 같은 Python으로 listener script를 실행한다.

- `on`: local/DB preflight를 먼저 검사하고 통과할 때만 이 Mac의 listener를 시작한다.
- `off`: 새 Codex 실행을 막는다. 이미 처리 중인 Codex는 row를 안전한 상태로 끝낸 뒤 listener가
  종료된다. Queue row를 삭제하지 않으므로 다시 켜면 이어서 처리한다.
- `status`: 이 Mac의 설치/실행 상태, Codex와 secret 준비 여부, DB notification, due work를 함께
  보여준다.
- `logs`: listener와 최근 Codex JSONL/error log를 보여준다.

## 로컬 파일과 privacy

- LaunchAgent: `~/Library/LaunchAgents/com.harper.company-role-calibration-codex.plist`
- on/off state와 process lock:
  `~/Library/Application Support/Harper/company-role-calibration-codex/`
- listener와 Codex log: `~/Library/Logs/Harper/`
- raw candidate packet과 SQL: `output/company_role_calibration/runs/<calibration-id>/`

State directory, Codex logs와 raw run artifact는 owner-only permission으로 만든다. Raw candidate
packet, 원래 이름, 연락처, 개인 URL, SQL 결과와 secret은 task 답변이나 git에 남기지 않는다.

## 복구와 retry

- Listener 시작·DB 재연결 때 queue를 다시 읽으므로 꺼져 있는 동안의 notification도 catch-up한다.
- Codex가 비정상 종료되고 `running` row가 남으면 2시간 뒤 기존 claim RPC가 복구한다.
- Slack 전달 실패 또는 활성 channel 없음은 profile을 버리지 않고 `ready`로 유지한다. 첫 전달은
  즉시, 이후는 12시간 cooldown 뒤 재시도한다.
- Codex가 non-zero로 끝나거나 due work가 전혀 줄지 않으면 15분 backoff한다.
- 여러 Mac에서 listener를 켜도 atomic claim이 같은 row의 중복 처리를 막지만 불필요한 Codex
  process가 뜰 수 있으므로 평소에는 담당 Mac 하나만 ON으로 둔다. 다른 Mac으로 넘길 때 기존
  Mac을 `off`한 뒤 새 Mac을 `on`한다.

## 안전 경계

- `information.testOnly=true`, external, inactive, expired Role은 처리하지 않는다.
- Helper가 만든 candidate packet 밖의 ID는 선택하지 않는다.
- `candid` 검색은 read-only이고 명시적 `LIMIT`이 있어야 한다.
- 원래 이름과 profile photo만 표시 identity로 바꾸며 경력·학력 사실은 수정하지 않는다.
- 원래 이메일, 전화번호와 개인 profile URL은 공개 snapshot에 넣지 않는다.
- Slack에는 Good/Bad button을 만들지 않는다. 회사 평가는 Role chat이나 Slack thread의 자연어
  답변으로만 받는다.
- 변경된 Role/Hiring Brief source 때문에 `finish`가 거부되면 오래된 결과를 강제로 저장하지 않는다.
- Routine event run은 deploy, push, migration, source 수정이나 실제 recommendation/fit/contact/
  pipeline 변경을 수행하지 않는다.
- Slack delivery의 HTTPS 인증서는 requirements에 고정한 `certifi` CA bundle로 검증한다. TLS
  검증을 끄거나 인증서 오류를 무시하지 않는다.

## 기존 Scheduled automation

`Company Role Profile Calibration` automation은 event listener rollout 전 fallback 또는 긴급 복구에만
사용한다. Event listener와 동시에 ACTIVE로 두지 않는다. Automation을 다시 사용할 때도 같은 queue,
helper와 canonical runbook을 소비하므로 데이터 계약은 동일하다.
