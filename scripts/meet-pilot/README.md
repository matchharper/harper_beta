# Career Google Meet 음성 파일럿

상태: 로컬에서 실행하는 운영자 동석 1:1 파일럿. 제품 공개·자동 예약·무인 운영 경로가 아니다.

## 구성

Meet ↔ Recall Output Media 페이지 ↔ 로컬 PCM WebSocket ↔ 기존 `LivePhoneSession` ↔ GPT-Live.

- 기존 `buildCareerLiveSessionConfig`로 모델·음성·delegation LLM·tool 설정을 가져온다.
- 대화 맥락은 기존 `buildCareerRealtimeSessionInstructions`, tool 실행·대화 저장·통화 종료는 기존 Career request handler를 그대로 사용한다. 별도 판단 LLM이나 prompt 복사본을 만들지 않는다.
- 전화는 기존 G.711 8 kHz를 유지하고 Meet만 mono PCM16 little-endian 24 kHz를 사용한다.
- 웹페이지에는 음성과 단일 연결 토큰만 제공한다. 사용자 ID·대화·OpenAI/Recall/DB 키는 서버에 남는다. 토큰은 URL fragment로 전달하고 즉시 주소에서 지운다. WebSocket의 Origin·단일 연결·만료를 검사한다.
- 봇 영상은 기존 Harper 로고다. Recall Output Media는 카메라 영상을 동반하므로 음성만 출력하는 모드는 아니다.
- Recall 녹화는 `recording_config: null`로 요청한다. Harper 대화 텍스트와 통화 기록은 기존 경로로 저장한다. 실제 provider 동작은 통화 검증 결과와 함께 확인한다.

## 실행

기존 `harper_beta/`에서 실행한다. 새 의존성·migration·웹 배포는 필요 없다.

1. `.env.local`의 기존 Harper 서버 설정을 사용한다. `.env.meet.local`은 Git 제외·권한 600으로 저장한다.
2. 필수 설정: `RECALL_API_KEY`, `RECALL_REGION`, `MEET_TEST_EMAIL`. 선택적으로 `MEET_TEST_CONVERSATION_ID`를 지정한다. 생략하면 해당 계정의 가장 최근 대화를 선택한다. 삭제된 계정은 거부하고 auth 이메일·대화 소유권을 확인한다.
3. `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/meet-pilot.ts --check`는 계정·대화·Recall 인증을 읽기 전용으로 확인한다. 모델이나 봇을 실행하지 않는다.
4. `cloudflared tunnel --url http://127.0.0.1:8791 --no-autoupdate` 등으로 로컬 포트를 임시 HTTPS에 연결한다. 이 URL을 `MEET_PUBLIC_URL`로 지정한다. 장기 운영용 배포가 아니다.
5. `MEET_URL`에 전용 테스트 Meet 링크를 넣고 `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/meet-pilot.ts --run`을 터미널에서 실행한다.
6. 게스트 봇은 주최자가 수락한다. 터미널에 `Meet audio connected`가 표시되고 운영자가 의도한 본인과 Harper만 입장한 것을 확인한 뒤 `start`를 입력한다. 이는 파일럿의 계정 연결 절차다. Meet 표시 이름을 신원 증거로 쓰지 않는다.
7. `stop`, Ctrl-C, 연결 종료 또는 통화 제한으로 종료한다. 기본 통화 제한은 10분이며 `MEET_MAX_SECONDS`로 30–1800초를 설정할 수 있다. 연결 대기에도 별도 상한이 있다.
8. 통화 저장·요약이 끝나면 봇 퇴장을 확인하고 임시 터널도 종료한다. 실패는 `.local/meet-pilot/<run>/`의 private 기록에서 확인한다. 생성 응답을 잃었다면 Recall/Calendar에서 기존 생성을 확인하기 전 재실행하지 않는다.

## 방 생성과 초대

`MEET_URL`이 없으면 다음 Google OAuth 설정으로 primary Calendar에 Meet가 포함된 초대를 생성한다.

- `MEET_GOOGLE_CLIENT_ID`
- `MEET_GOOGLE_CLIENT_SECRET`
- `MEET_GOOGLE_REFRESH_TOKEN` (Calendar 이벤트 작성 권한)

초대 대상은 검증된 `MEET_TEST_EMAIL` 하나다. 서버가 임의의 HTTP 요청에서 초대 주소나 계정 ID를 받지 않는다. 현재 코드의 자동 생성 경로와 Codex Calendar 도구로 만든 테스트 일정은 서로 다른 인증 경로이며 별도 검증이 필요하다. Google Calendar 연결만으로 봇 Google 로그인이 되지는 않는다.

## 먼저 입장해 기다리는 Harper

게스트 파일럿에서는 수동 입장 수락이 필요하다. 무인 선입장은 Harper 전용 **비관리자 Google Workspace 계정**과 Recall Google Login Group을 설정한 뒤 `RECALL_GOOGLE_LOGIN_GROUP_ID`를 지정해야 한다. 회의의 host-presence/admission 설정도 실제 외부 참석자 계정으로 확인한다. 계정 표시 이름을 Harper로 지정한다.

공식 가이드: https://docs.recall.ai/docs/google-meet-login-getting-started

## 검증과 아직 남은 작업

```
pnpm exec tsx --tsconfig scripts/tsconfig.json --test scripts/meet-pilot.test.ts scripts/clawops-phone.test.ts
```

이 검증은 음성 framing, Calendar 식별자, URL 경계, 생성 요청 무재시도, 기존 tool 중복 실행 방지와 마지막 발화 보존을 다룬다. 실제 Meet 음질·지연·끼어들기·Google 선입장 성공을 입증하지 않는다.

일반 사용자에게 공개하기 전 필요한 작업:

- 참가자의 Harper 인증과 회의 접근 권한을 연결하고, 예상 밖 참가자 입장 시 개인 맥락·tool을 차단하는 경계. 현재 파일럿은 운영자가 이를 직접 확인한다.
- 사용자별 예약·취소·변경을 기존 영속 통화/일정 기록에 연결하고 예약 봇을 미리 준비한다. 새 영속 사실이 필요한지 기존 기록과 비교한 뒤 결정한다.
- Recall 상태 webhook 검증, 프로세스 장애 복구·중복 봇 방지, 통화 미접속·추가 참가자·연결 끊김 처리. 이 로컬 프로세스는 메모리의 단일 통화만 지원하고 재시작 복구하지 않는다.
- 신뢰할 수 있는 참가자 이벤트 기반 자동 시작. 현 버전의 `start`는 제품 UX가 아니라 파일럿 제어다.
- 기존 Career model assignment를 제품 경로에 반영할지 결정. 파일럿은 요청한 `gpt-live-1`을 명시적으로 사용하며 일반 웹의 모델 배정 정책은 바꾸지 않는다.
- 실제 Meet 양방향 대화, 중간 말 끊기, tool 실행, 통화 note, 퇴장과 개인정보 경계를 검증한다.

자료: [Recall Output Media](https://docs.recall.ai/docs/stream-media), [Google Meet 가입 제한](https://developers.google.com/workspace/meet/media-api/guides/overview), [GPT-Live WebSocket](https://developers.openai.com/api/docs/guides/voice-websockets).

## 2026-10-26 실제 파일럿 확인

Recall 도쿄 리전 인증, 테스트 계정·대화 소유권 확인, Calendar 도구를 통한 Meet 생성, 게스트 봇 대기실 → 승인 후 입장, Output Media WebSocket 연결과 GPT-Live `session.started`까지 확인했다. 참가자 퇴장 후 Recall은 `timeout_exceeded_everyone_left`로 정상 종료했으며 녹화는 0건이었다. 음성 transcript는 0건으로, 실제 양방향 대화·tool 실행·통화 note는 아직 검증되지 않았다. 자동 퇴장 후 중복 leave 요청의 400 응답은 provider의 최종 상태를 조회해 종료가 확인된 경우에만 정상 처리하도록 보완했다. 로컬 검증 9개 통과. 운영 배포 없음.

대기 비용: Recall은 입장 시도부터 종료까지(대기실·무녹화 입장 포함) 과금한다. 봇을 미래 시각으로 예약만 한 기간은 과금하지 않는다. GPT-Live는 세션이 열린 동안 침묵도 과금하므로 대기 단계에서는 시작하지 않는다. 현 파일럿은 운영자의 `start`부터 Live를 열며, 제품 구현에서는 인증된 참가자 입장에 연결해야 한다. 참고: https://docs.recall.ai/docs/calculating-usage 및 https://developers.openai.com/api/docs/guides/voice-latency-cost
