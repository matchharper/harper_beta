# Slack 후보자 검토 로컬 테스트

이 흐름은 웹 프리뷰를 만들지 않고 실제 Slack 클라이언트에서 로컬 코드를 확인한다. 별도 `Harper Local` 개발 App과 Slack Socket Mode를 사용하므로 운영 App의 Request URL을 바꾸거나 로컬 서버를 인터넷에 공개하지 않는다.

## 1. 개발 App 만들기

1. Slack App 관리 화면에서 `From an app manifest`를 선택한다.
2. 테스트할 Slack workspace를 고른다.
3. `slack/harper-local-manifest.yaml` 내용을 붙여 넣어 App을 만든다.
4. OAuth & Permissions에서 workspace에 App을 설치하고 Bot User OAuth Token을 확인한다.
5. Basic Information의 App-Level Tokens에서 `connections:write` scope를 가진 App Token을 만든다.
6. App ID를 Basic Information에서 확인한다.

토큰은 대화나 저장소에 올리지 않고 `.env.local`에만 추가한다.

```dotenv
SLACK_HARPER_LOCAL_APP_ID=A...
SLACK_HARPER_LOCAL_APP_TOKEN=xapp-...
SLACK_HARPER_LOCAL_BOT_TOKEN=xoxb-...
HARPER_SLACK_LOCAL_TEST_CHANNEL_ID=C...
```

테스트 채널은 기존 Harper workspace에 활성 Slack 채널로 등록된 채널이어야 하며 `Harper Local` App도 그 채널에 들어가 있어야 한다.

## 2. 로컬 연결 실행

Next 개발 서버와 Socket Mode 브리지를 각각 실행한다.

```bash
pnpm dev
pnpm dev:slack-socket
```

Socket Mode 브리지는 Slack interactive payload를 로컬 `/api/internal/slack/interactivity` route로 전달한다. 외부 HTTP endpoint는 만들지 않는다.

## 3. 실제 Slack 테스트 메시지 만들기

최근 자동 소개 기록을 이용해 개발 App으로 테스트 메시지 한 건을 보낸다.

```bash
pnpm dev:slack-review-post -- --allow-live-decisions
```

특정 자동 소개 기록을 사용할 때는 다음처럼 지정한다.

```bash
pnpm dev:slack-review-post -- --allow-live-decisions --source-message-id 123
```

Slack에서 `후보자 검토하기`를 누르면 실제 Block Kit 모달이 열린다. 등록된 workspace 멤버 이메일만 후보자 내용을 볼 수 있다.

## 안전 경계

- 후보자 프로필을 성공적으로 열면 운영과 같은 열람 로그가 기록된다.
- 로컬 테스트 메시지는 `--allow-live-decisions`를 명시하지 않으면 생성되지 않는다.
- 수락·거절 버튼은 실제 결정을 위한 확인 모달을 연다.
- 수락 확인 화면은 `CC로 연결`과 `직접 연락`, 연결할 멤버, 선택적 수락 이유를 받는다.
- 거절 확인 화면은 기본 Pass 이유와 선택적 자유 입력을 받는다.
- 최종 `확인`을 누르면 운영과 같은 상태 변경·결정 로그 저장 경로를 실행한다.
- `CC로 연결`을 선택하면 실제 후보자와 선택한 회사 멤버에게 소개 메일이 발송된다.
- 안전한 테스트 후보자와 수신자를 정한 경우에만 최종 `확인`을 누른다.
