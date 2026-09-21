# Creator email outreach 배포 체크리스트

상태 (2026-09-21 확인): GTM 웹, Resend 발송, Gmail watch·회신 수신, Slack 알림,
수신 재시도와 Resend 전달 이벤트 처리가 운영 중이다. 숫자 Gmail historyId 수정도 운영 배포됐고,
배포 뒤 watch 갱신과 0건 처리·0건 알림 대기를 확인했다.

## 고정 발신 계정

현재 발송/회신 주소는 `harper@matchharper.com`, Gmail API가 읽는 실제 Workspace 사용자 메일함은 `daniel@matchharper.com`이다. `GTM_OUTREACH_GMAIL_USER`와 `GTM_OUTREACH_GMAIL_FROM_EMAIL`을 구분한다. 외부 발송은 Resend를 사용한다. Gmail은 답장과 메일함에 도착한 DSN 반송을 수집하고, Resend webhook은 지연·반송·발송 실패·스팸 신고를 수집한다.

발신 주소는 중요하다. 수신자가 보는 신원, 회신함, Gmail API 권한 위임, 일일 발송 한도, SPF/DKIM/DMARC와 평판이 모두 이 주소와 도메인에 연결된다. 운영 중 발신 계정을 바꾸려면 기존 진행 건의 회신 수집 기간을 먼저 끝내고 환경 변수와 새 초안의 `sender_email`을 함께 바꾼다.

## Google Workspace와 Google Cloud

다음은 새 환경을 처음 연결할 때의 절차다. 이미 연결된 운영 환경에 다시 적용하지 않는다.

1. 실제 Workspace 사용자 메일함과 발신 별칭의 수신 경로를 확인한다.
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

다음 값을 Harper Production 환경에 저장한다. private key와 provider 자격 증명은 문서나 프롬프트에 쓰지 않는다.

| 변수 | 값 |
| --- | --- |
| `GTM_OUTREACH_GMAIL_USER` | `daniel@matchharper.com` |
| `GTM_OUTREACH_GMAIL_FROM_EMAIL` | `harper@matchharper.com` |
| `RESEND_API_KEY` | 기존 발송 자격 증명 |
| `GTM_WORKSPACE_URL` | 새 웹 배포 후 `https://matchharper.com/ops/gtm` |
| `GTM_OUTREACH_GMAIL_FROM_NAME` | `Harper Creator Partnerships` (선택, 기본값) |
| `GTM_OUTREACH_GMAIL_SERVICE_ACCOUNT_EMAIL` | domain-wide delegation 서비스 계정 이메일 |
| `GTM_OUTREACH_GMAIL_PRIVATE_KEY` | 서비스 계정 private key PEM |
| `GTM_OUTREACH_GMAIL_PUBSUB_TOPIC` | `projects/<project>/topics/harper-creator-outreach-replies` |
| `GTM_OUTREACH_GMAIL_PUBSUB_SUBSCRIPTION` | `projects/<project>/subscriptions/harper-creator-outreach-replies-push` |
| `GTM_OUTREACH_GMAIL_PUBSUB_AUDIENCE` | `https://matchharper.com/api/internal/contents-engine/gmail/push` |
| `GTM_OUTREACH_GMAIL_PUBSUB_SERVICE_ACCOUNT` | 인증된 push 호출용 서비스 계정 이메일 |
| `GTM_OUTREACH_SLACK_CHANNEL_ID` | 답장 알림을 받을 Slack 채널 ID |

기존 `SUPABASE_SERVICE_ROLE_KEY`, `SLACK_BOT_TOKEN`, `CRON_SECRET`도 필요하다. Slack bot을 지정 채널에 초대하고 `chat:write` 권한을 확인한다.

## Resend 도메인과 전달 이벤트

`matchharper.com` 발송 도메인은 2026-09-21 기준 verified이고 sending capability가 enabled다. 업무 메일에 필요하지 않은 open/click tracking은 꺼 두었다. `reply.matchharper.com`도 verified 상태다.

현재 운영 webhook은 `email.received`, `email.opened`와 아래 네 전달 이벤트를 함께 구독한다.
route 코드 배포를 확인한 뒤 기존 구독을 유지한 채 추가했다.

- `email.bounced`
- `email.delivery_delayed`
- `email.failed`
- `email.complained`

새 처리기는 정확히 `harper@matchharper.com`에서 발송한 이벤트만 GTM 원장에 연결한다. Resend email ID와 수신 주소가 발송 기록과 일치해야 하며, 발송 기록보다 webhook이 먼저 도착하면 500을 반환해 Resend 재시도를 요청한다. 영구 반송은 해당 연락처를 `bounced`, 스팸 신고는 `revoked` 및 do-not-contact로 바꾼다. 실패 알림은 크리에이터 패널로 바로 가는 `/ops/gtm?creator=<UUID>` 링크를 Slack에 남긴다.

## GTM 웹·메일 최초 배포 순서

현재 GTM 웹의 적용·검증 상태와 추가 migration은 [gtm-workspace.md](gtm-workspace.md)를 따른다. 아래 초기 절차를 이미 적용한 운영 DB에 반복하지 않는다.

1. `20260917075510_gtm_outreach_dispatches.sql` migration을 적용한다.
2. Harper 앱을 배포해 승인 발송, Gmail push, watch renewal endpoint와 5분 복구 cron을 활성화한다.
3. `/ops/gtm`의 Outreach Review가 로그인한 팀원 세션으로 조회·수정·발송되는지 확인한다.
4. cron secret으로 Gmail watch endpoint를 한 번 호출하거나 첫 일일 cron 성공을 확인한다.
5. 통제된 내부 수신 주소 한 건으로 준비 → `발송` → Resend 발송 → Gmail 회신 → DB `message_received` → Slack 알림을 확인한다.
6. 같은 Pub/Sub 메시지를 다시 전달해 DB 활동과 Slack 알림이 중복되지 않는지 확인한다.
7. Resend webhook에 위 네 전달 이벤트를 추가하고, 통제된 provider test event로 지연·영구 반송의 DB 기록과 Slack 중복 방지를 확인한다.

## 운영 흐름

Agent는 Supabase plugin에서 `gtm_workspace`의 `prepare_outreach` 또는 `prepare_email`로 대상, active email template, 선택 이유와 개인화 근거, 정확한 제목·본문, 발신·수신 주소를 준비한다. 이 단계는 발송하지 않는다. 팀원이 `/ops/gtm`의 Outreach Review에서 근거와 최종 제목·본문을 읽고 `발송`, 수정 요청, 건너뛰기 중 하나를 선택한다.

`Final Email Body`는 HTML fragment를 지원한다. 승인된 HTML을 escape하지 않고 발송 payload의 HTML 본문으로 사용하며 plain-text fallback은 자동 생성한다. 일반 텍스트의 줄바꿈도 유지한다. 태그, 링크, 표, 이미지와 inline style을 사용할 수 있지만, 수신 메일 앱이 지원하지 않는 HTML·CSS·script·원격 콘텐츠는 제거되거나 다르게 렌더링될 수 있다. 운영 전에는 통제 주소로 실제 렌더링을 확인한다.

승인한 행만 Resend로 발송한다. 즉시 호출과 예약 복구는 동일 dispatch ID 기반의
idempotency key를 사용한다. Resend email ID, 실제 RFC Message-ID, Gmail message/thread ID는
서로 다른 식별자다. Gmail 답장은 RFC In-Reply-To/References 또는 확인된 thread로 원본 발송과
연결한다. 숫자 Gmail historyId를 처리하지 못하던 운영 오류는 2026-09-21 배포로 수정했다.

새 구현에서는 받은 원문 저장과 Slack 재시도를 분리한다. Slack 실패가 이미 저장한 답장을
유실시키지 않도록 미완료 알림을 DB에서 다시 읽는다. 숫자 historyId, 아카이브된 수신 메일,
발신 별칭과 실제 메일함의 차이를 처리한다. Gmail DSN과 Resend 전달 이벤트는 같은 발송 원장에 기록하고, 영구 반송·스팸 신고 주소는 다음 발송 대상에서 제외한다.
최초 전송 후 23시간을 넘긴 불명확한 발송은 자동 재전송하지 않고 결과 확인이 필요한 실패로
남긴다. 자세한 UI 및 API 계약은 GTM 웹 문서를 참고한다.

Instagram, X, Threads, TikTok DM은 이 연결 범위에 포함되지 않는다.
