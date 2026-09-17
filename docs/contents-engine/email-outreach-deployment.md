# Creator email outreach 배포 체크리스트

상태: 2026-09-17 운영 배포 완료. Workspace 별칭, Gmail domain-wide delegation, Pub/Sub push, Slack 알림, Supabase 원장, Apps Script와 11개 Sheet 탭을 실제 환경에서 확인함

## 고정 발신 계정과 별칭

Gmail API는 실제 Google Workspace 사용자 `daniel@matchharper.com`으로 인증하고, 외부 발신 주소는 이 사용자의 무료 별칭 `harper@matchharper.com`을 사용한다. 별칭은 별도 Google 계정이나 별도 받은편지함이 아니며, 발송 내역과 답장은 실제 사용자 메일함에서 관리한다. Google Group, 전달 전용 주소, `noreply` 주소는 사용하지 않는다.

발신 주소는 중요하다. 수신자가 보는 신원, 회신함, Gmail API 권한 위임, 일일 발송 한도, SPF/DKIM/DMARC와 평판이 모두 이 주소와 도메인에 연결된다. 운영 중 발신 계정을 바꾸려면 기존 진행 건의 회신 수집 기간을 먼저 끝내고 환경 변수와 새 초안의 `sender_email`을 함께 바꾼다.

## Google Workspace와 Google Cloud

1. Workspace 관리자에서 `daniel@matchharper.com` 사용자에게 `harper@matchharper.com` 이메일 별칭을 추가한다. 새 유료 사용자는 만들지 않는다.
2. Google Cloud 프로젝트에서 Gmail API와 Pub/Sub API를 켠다.
3. Gmail 전용 서비스 계정을 만들고 domain-wide delegation을 켠다.
4. Workspace Admin의 domain-wide delegation에 그 서비스 계정 client ID와 아래 scope를 등록한다.
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.modify`
5. 아래 스크립트로 Gmail push topic, 인증된 push subscription, 필요한 IAM을 만든다. Vercel 배포 뒤 실행해야 push endpoint가 응답한다.

```sh
GCP_PROJECT_ID="실제 프로젝트 ID" \
GTM_APP_URL="https://matchharper.com" \
scripts/contents-engine/setup_gmail_pubsub.sh
```

6. Workspace Admin에서 `matchharper.com`의 SPF, DKIM, DMARC가 Google Workspace 발송을 허용하는지 확인한다. DKIM 서명이 활성화되지 않았으면 외부 발송 전에 먼저 활성화한다.

## 운영 환경 변수

다음 값을 Harper Production 환경에 저장한다. private key와 GTM token은 문서, Sheet 셀, Apps Script 소스에 쓰지 않는다.

| 변수 | 값 |
| --- | --- |
| `GTM_OUTREACH_GMAIL_USER` | `daniel@matchharper.com` — Gmail API가 위임받을 실제 사용자 |
| `GTM_OUTREACH_GMAIL_FROM_EMAIL` | `harper@matchharper.com` — 수신자가 보는 Workspace 별칭 |
| `GTM_OUTREACH_GMAIL_FROM_NAME` | `Harper Creator Partnerships` (선택, 기본값) |
| `GTM_OUTREACH_GMAIL_SERVICE_ACCOUNT_EMAIL` | domain-wide delegation 서비스 계정 이메일 |
| `GTM_OUTREACH_GMAIL_PRIVATE_KEY` | 서비스 계정 private key PEM |
| `GTM_OUTREACH_GMAIL_PUBSUB_TOPIC` | `projects/<project>/topics/harper-creator-outreach-replies` |
| `GTM_OUTREACH_GMAIL_PUBSUB_SUBSCRIPTION` | `projects/<project>/subscriptions/harper-creator-outreach-replies-push` |
| `GTM_OUTREACH_GMAIL_PUBSUB_AUDIENCE` | `https://matchharper.com/api/internal/contents-engine/gmail/push` |
| `GTM_OUTREACH_GMAIL_PUBSUB_SERVICE_ACCOUNT` | 인증된 push 호출용 서비스 계정 이메일 |
| `GTM_OUTREACH_SLACK_CHANNEL_ID` | 답장 알림을 받을 Slack 채널 ID |
| `GTM_CONTENTS_ENGINE_SHEET_URL` | 운영 Contents Engine Sheet URL |

기존 `SUPABASE_SERVICE_ROLE_KEY`, `SLACK_BOT_TOKEN`, `CRON_SECRET`도 필요하다. Slack bot을 지정 채널에 초대하고 `chat:write` 권한을 확인한다.

## 배포 순서

1. `20260917075510_gtm_outreach_dispatches.sql` migration을 적용한다.
2. Harper 앱을 배포해 승인 발송, Gmail push, watch renewal endpoint와 5분 복구 cron을 활성화한다.
3. `sheets-bridge.gs`와 `sheet-columns.json`을 운영 Apps Script에 반영한다.
4. Sheet에서 전체 새로고침을 실행해 `Outreach Review` 탭을 만든다.
5. cron secret으로 Gmail watch endpoint를 한 번 호출하거나 첫 일일 cron 성공을 확인한다.
6. 통제된 내부 수신 주소 한 건으로 준비 → `Approve & Send` → Gmail 발송 → 회신 → DB `message_received` → Slack 알림을 확인한다.
7. 같은 Pub/Sub 메시지를 다시 전달해 DB 활동과 Slack 알림이 중복되지 않는지 확인한다.

## 운영 흐름

Agent는 대상, active email template, 선택 이유와 개인화 근거, 정확한 제목·본문, 발신·수신 주소를 `gtm_outreach_prepare`로 준비한다. 이 단계는 발송하지 않는다. 팀원이 `Outreach Review`에서 근거와 최종 제목·본문을 읽고 `Approve & Send`, `Request Revision`, `Skip` 중 하나를 선택한 뒤 메뉴로 저장한다.

승인한 행만 Gmail로 발송된다. 즉시 호출이 실패하거나 결과가 불명확하면 5분 복구 cron이 같은 RFC Message-ID를 먼저 조회하고 같은 logical send를 이어간다. 새 메시지를 무조건 다시 만들지 않는다. 답장은 Gmail history cursor로 수집해 같은 dispatch와 template에 연결하고, DB 중복 제거 뒤 Slack에 한 번 알린다. 매일 watch를 갱신할 때 누락된 history도 함께 대조한다. history cursor가 만료되면 실제 사용자 메일함의 inbox를 전체 대조하고 Gmail message ID로 중복을 제거한다.

Instagram, X, Threads, TikTok DM은 이 연결 범위에 포함되지 않는다.
