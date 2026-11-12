# 내부 채용 액션 알림

로컬 구현, 미배포. 내부 목적지는 `C0AKK93FMH8`로 고정한다. 회사용 Slack,
company-side LLM, 회사 이메일의 목적지·문구·전송은 바꾸지 않는다.

표현은 `회사 / 역할 / 후보자 | 실행자 | 행동·결과 | 사건 시각 KST` 한 줄이다.
회사/역할은 기존 Role 화면 링크다. 회사 결정에는 저장된 팀원 이름·이메일을,
후보자 결정에는 후보자 이름을, 자동 발송에는 Harper 시스템을 표시한다.

| 사건 | 알림을 기록하는 실행 사실 |
| --- | --- |
| 회사 연결 수락 | `talent_progress`의 연결 대기 → 연결/후속 단계 변경 |
| 회사 연결 거절 | 연결 대기 → 진행 종료. 이미 연결된 후보의 진행 종료와 구분 |
| 기존 채용 진행 종료 | 그 외 진행 단계 → 진행 종료 |
| 후보자의 추천 수락 | `candidate_role_recommendation_accepted`; 회사 결정 대기라고 표시 |
| 회사 Intro 후보 패스 | `company_decision_events`의 회원 후보 Intro `pass`; 후보자에게 요청하지 않았다고 표시 |
| 회사 Intro 요청 | `company_intro_candidates.requested_at`이 처음/새로 저장됨. 발송 전이라고 표시 |
| 후보자에게 Intro 발송 | `candidate_sent_at`의 실제 전달 기록 |
| 후보자 Intro 수락/거절 | `talent_decision_at`과 실제 수락/거절 상태 |
| Intro 수락 후 자동 연결 | 회사 수락으로 잘못 표시하지 않고 Harper 시스템의 연결 완료로 표시 |
| 회사·후보자 소개 이메일 발송 | `career_email_messages`의 `org_intro`가 provider 영수증과 함께 `sent`로 전환 |
| 미팅 확정/변경/취소 | `meeting_schedules`의 확정 상태/시작·종료 시각 변경. 캘린더 초대 발송을 의미하지 않음 |

미팅은 시작·종료 시각과 IANA 시간대를 표시한다. 조율 도구는 실행자 라벨을
해당 변경의 `calendarMutation`에 저장한다. 예약 링크 제출 경로는 같은 transaction의
round 제출 기록으로 후보자 제출을 식별한다. 변경자 기록이 없는 경로는
`Harper 시스템(일정 기록·변경자 미기록)`으로 명시한다. 주최자는 별도 표시하며
주최자를 변경자로 추정하지 않는다. 이전 변경자의 기록을 재사용하지 않는다.

## 전송과 복구

기존 사업 상태 변경 transaction의 AFTER trigger가 내부 알림만 저장한다.
`internal_hiring_notifications`는 이 전송의 재시도·영수증을 위한 outbox이며
모델 판단이나 새 사업 상태를 저장하지 않는다. 기존 billing outbox는 결제 전용이고,
회사 대화 작업은 고객 목적지 전용이므로 이를 내부 목적지로 재사용하지 않는다.

알림 저장 직후 DB의 `pg_net` 비동기 HTTP 요청으로
`/api/internal/slack/hiring-notification`을 호출해 즉시 발송을 시작한다.
HTTP 요청은 사업 상태 변경 transaction이 commit된 뒤 시작한다. rollback되면
알림과 HTTP 요청도 함께 사라진다. 회사 액션 응답이 Slack 네트워크를 기다리지 않는다.
수신 API는 비공개 outbox에 생성된 사건별 임의 토큰을 확인하고 해당 ID의 저장된
알림만 발송한다. 호출자가 본문이나 Slack 목적지를 지정할 수 없으며,
공용 인증키를 추가하거나 DB와 환경변수 사이에 동기화할 필요가 없다.

기존 `/api/internal/slack/queue-dispatch` cron은 5분마다 **실패·누락만 복구**한다.
정상 발송은 이 주기를 기다리지 않는다. 복구 작업만 60초 route 예산 안에서
최대 20개를 채널당 초당 1개 속도로 처리한다.
동일 사건 키의 중복 저장, 동시 worker claim, 발송 완료 영수증을 검사하고
안정적인 Slack `client_msg_id`를 사용한다. provider 성공과 DB 영수증 저장은
단일 transaction이 아니므로 불명확한 응답 뒤의 정확히 한 번 전송까지 보장하지는 않는다.

기존 즉시 Intro 요청/수락 알림은 제거하여 같은 사건을 두 경로에서 보내지 않는다.
알림 실패로 회사 액션이나 회사 Slack 답장을 실패 처리하지 않는다. 실패 원인은
outbox `last_error`, 성공은 `slack_ts`와 `sent_at`로 확인한다.

공개 API 역할은 outbox/내부 함수를 호출하거나 읽을 수 없다. 시험용 Role
(`information.testOnly`)은 제외하고 로컬 E2E/worker test mode에서는 전송하지 않는다.

## 적용 및 검증

`20261111113000_internal_hiring_notifications.sql`,
`20261111120000_internal_hiring_immediate_dispatch.sql`과 웹 변경을 함께 배포해야 한다.
후자는 Supabase의 `pg_net` 확장을 활성화한다. 고정 운영 도메인의 엔드포인트가
준비된 뒤 이벤트 수집을 활성화하고, 즉시 발송 영수증을 확인한다.
신규 사건부터 수집하며 과거 사건은 backfill/재발송하지 않는다. 구 웹의 즉시
Intro 알림과 신 DB trigger가 동시에 운영되는 전환 구간에는 중복 가능성이 있으므로
전환 시점을 맞춰야 한다. 배포와 운영 적용은 별도 승인 대상이다.

검증: PGlite에서 실제 trigger 실행·transaction rollback·동일 사건 중복·공개 권한 차단·
test-only 격리, 즉시 호출의 사건별 인증·전송·재호출 중복 방지,
모의 Slack에서 목적지·발송 영수증·실패 재시도·동시 claim을 확인한다.
PGlite는 `pg_net`을 지원하지 않아 HTTP 큐 삽입 함수만 로컬 모형으로 대체한다.
실제 pg_net 네트워크 전달은 배포 후 확인할 항목이다.
실제 Slack 발송이나 운영 migration 없이 로컬에서 검증한다.
