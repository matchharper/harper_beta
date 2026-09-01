# 회사 후보자 Role 이동 실제 E2E 검증 — 2026-08-31

## 검증 범위

- 환경: 운영 Harper internal Workspace의 격리 fixture
- 회사 Workspace: `Harper` (`720254d7-aeb7-4709-a56f-7b822f89eac5`)
- Slack: `z-test-harper` (`C0BLRJ96GSJ`)
- fixture talent: `khj605123@gmail.com`
- fixture marker: `company-candidate-role-move-live-e2e-v1`
- 실행 경로: 실제 Slack 사용자 메시지 → 격리된 로컬 company-side LLM worker → 운영 DB RPC
- 배포·운영 서비스 재시작: 수행하지 않음
- Slack 증거: [Role 이동 E2E 스레드](https://match-harper.slack.com/archives/C0BLRJ96GSJ/p1788173574982299)

두 Role은 INSERT 시점부터 `information.testOnly=true`, 안정적인 `testFixture`, 지정 talent만 담은
`testTalentIds`를 가졌다. 추천은 해당 fixture talent에만 직접 만들었고 모든 단계에서 fit, 다른 talent 추천,
context run이 없는지 확인했다.

## 실행 결과

| 순서 | 조건 | 요청 | 결과 |
| --- | --- | --- | --- |
| 1 | target `active`, target에 과거 거절 기록, source에 답변 대기 질문과 준비 중 미팅 존재 | Role A `연결됨` → Role B custom `기술 인터뷰` | 성공. 과거 거절 상태를 정리하고 custom stage에 연결했다. 질문 1건과 미팅 1건은 Role A에 유지됐다. |
| 2 | target `paused`, target에 직전 archive 기록 존재 | Role B `기술 인터뷰` → Role A `최종 오퍼` | 성공. `paused`는 새 자동 매칭만 멈춘 상태로 취급하고 명시적인 이동은 허용했다. |
| 3 | target `ended` | Role A `최종 오퍼` → Role B `연결됨` | `target_role_unavailable`로 차단했다. 후보 상태, progress, 알림 outbox는 변하지 않았다. |
| 4 | target을 `paused`로 변경, talent locale을 일시적으로 `en-US`로 설정 | Role A `최종 오퍼` → Role B `연결됨` | 성공. 알림 payload locale이 `en`으로 생성됐다. talent locale은 즉시 기존 `ko`로 복구했다. |

성공한 세 번의 이동은 서로 다른 transfer ID를 만들었고 각각 source/out progress 두 행을 남겼다.
네 번째 Slack 메시지와 같은 source message ID로 RPC를 다시 호출했을 때는
`idempotentReplay=true`와 기존 transfer ID를 반환했다. progress 6행과 outbox 3행은 증가하지 않았다.

## Slack 응답 품질

- 이미 논의했으며 바로 이동하라는 요청에는 동의를 다시 묻지 않고 실행했다.
- 성공 시 출발 Role·출발 stage·도착 Role·도착 stage를 모두 설명했다.
- 세 성공 응답 모두 회사가 알 필요 없는 후보자 안내 전달 상태를 덧붙인 문제가 있었다.
  후속 코드에서는 이 상태를 tool result와 final-writing context에서 제거했다.
- source 질문·미팅은 유지되며 새 미팅이 생성되지 않았다는 사실을 설명했다.
- `ended` Role 이동 실패 시 실제 tool result를 기준으로 후보 위치가 변하지 않았다고 안내했다.
- `paused` Role에서는 자동 매칭이 멈춰 있어도 이번 명시적 이동은 반영됐다고 설명했다.

## DB 확인 결과

- source recommendation: `saved_stage=closed`, `processed_stage=archived`, tag `내부:아카이브`
- target recommendation: `feedback=like`, `saved_stage=connected`, 요청한 exact stage와 일치하는 tag
- 과거 target 거절 상태: 이동 성공 시 현재 연결 상태로 교체
- 답변 대기 질문과 준비 중 미팅: source Role ID와 원래 상태를 유지
- 이동 progress: 성공 3회 × source/out 2행 = 6행
- 이동 알림 outbox: 성공 3회에만 3행, locale 순서 `ko`, `ko`, `en`
- 차단된 1회: progress와 outbox 추가 없음
- test-only Role fit: 항상 0행
- 다른 talent의 fixture 추천: 항상 0행

## 발견한 문제와 조치

### 1. test-only Role의 context-run 진입 경계

Role을 처음부터 `active`로 만들면 `testOnly=true`여도 내부 확장 행의 초기 `is_auto=true`와 insert trigger
순서 때문에 `company_context_runs`가 생성되는 것을 재현했다. 검증 transaction이 이를 감지해 fixture와 run을
모두 롤백했다. 실제 E2E fixture는 Role을 `paused`로 만들고 `is_auto=false`를 확정한 뒤 활성화해 누수를
막았다.

로컬에는 `20260831160000_test_only_company_context_run_guard.sql`을 추가했다. 이 마이그레이션은 다음을
모두 차단한다.

1. 개별 자동·수동 enqueue
2. 주기 enqueue
3. worker claim
4. service-role 직접 INSERT 또는 queued/running 상태 변경

기존 queued test-only run은 `test_only_role` 사유로 취소한다. 운영 DB에는 이번 작업에서 적용하지 않았다.

### 2. 후보자 Role 변경 알림 워커 버전

RPC는 세 이동 모두 올바른 한·영 locale snapshot과 함께 새 outbox type을 만들었다. 그러나 아직 배포되지
않은 운영 워커는 이 새 lifecycle type을 모르는 구버전이어서 세 행을 `onboarding_done`으로 취소했다.
따라서 이번 실제 E2E에서는 이메일 발송 완료를 검증하지 못했다. 로컬 새 워커의 lifecycle 예외 처리와
한·영 문구 테스트 15개는 통과했다.

배포 시 새 알림 타입을 처리하는 워커를 먼저 준비한 뒤 Role 이동 RPC와 앱을 노출해야 한다.

### 3. Slack 테스트 채널 이름과 로컬 설정

실제 Harper 채널 ID `C0BLRJ96GSJ`는 Slack에서 `z-test-harper`였지만 DB의 캐시 이름은 `test`, 로컬
`HARPER_SLACK_LOCAL_TEST_CHANNEL_ID`는 Wonderful의 `z-test-wonderful`을 가리키고 있었다. DB 캐시 이름과
로컬 환경변수를 실제 Harper 채널로 수정했다.

## 정리 결과

아래 fixture DB 행을 exact ID로 삭제했다.

- Role 2, internal-role extension 2, assignee 2, custom stage 1
- recommendation 2, tag 2, move progress 6, unsent contact queue 3
- 답변 대기 request 1, 준비 중 meeting 1
- fixture conversation 1, fixture message 1

정리 후 두 fixture Role ID를 참조하는 모든 `role_id`·`opportunity_id` 열은 0행이었다. fit 0행,
context run 0행, fixture marker Role 0행도 다시 확인했다. Slack의 테스트 대화와 완료된 Slack job 4건은
검증 증거로 보존했다. 채널 worker target은 원래 `vercel_queue`, talent locale은 원래 `ko`로 복구했다.

## 로컬 검증

- 후보 이동·대화·격리 계약 테스트: 65개 통과
- 후보 알림·한영 문구 워커 테스트: 15개 통과
- TypeScript typecheck: 통과
- diff whitespace 검사: 통과
- 임시 PostgreSQL 통합 테스트 코드는 추가했지만 로컬 PostgreSQL/Supabase 런타임이 없어 실행하지 못했다.
  테스트 러너는 운영 DB 사용을 거부하고 안전하게 종료했다.
