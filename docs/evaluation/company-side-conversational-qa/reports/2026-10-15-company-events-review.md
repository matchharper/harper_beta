# 회사 메시지 변경 전반의 후속 점검

문서 기준: 2026-10-15. 로컬 코드 점검·보완이며 배포와 운영 DB·Slack·메일 쓰기는 하지 않았다. 이전 [구현 검증](2026-10-15-company-events.md)의 실패·결과는 보존한다.

## 발견한 문제와 보완

- 일부 Slack 채널만 성공한 뒤 재시도하면 성공 채널에도 다시 보낼 수 있었다. 실제 채널별 응답 timestamp를 기존 회사 메시지 metadata에 순차 저장하고, 재시도는 미전달 채널만 처리한다. 작성본과 전송 식별자는 재사용한다. 저장 실패도 오류로 남긴다.
- 대화의 workspace와 관련 Role, 현재 actor 권한을 실행 전에 확인하고 전달 직전에 다시 확인한다. 다른 job/workspace의 메시지, 누락된 저장본, 다른 Role의 후보 카드는 전달 완료로 인정하지 않는다. 취소되거나 승인 전달 기록이 없는 후보 연락은 관련 대화 문맥에 넣지 않는다.
- 비공개 General 대화에서 시작한 Role 사건은 공유 가능한 Role 대화와 해당 팀 범위의 일반 read tool을 사용한다. Owner의 실제 소속/권한은 변경하지 않고 이번 reader의 범위만 좁힌다. 별도 service client로 조회하는 board도 모델에 넘기기 전에 같은 범위를 적용한다. 다른 팀 정보를 공유 대화에 주입하지 않는다.
- 원래 비공개 대화의 답변은 그대로 보존하고 같은 작성본을 Role 기록에도 한 번 남긴다. 실제 Slack 응답 기록과 정확히 일치하는 native 동기화본은 UI에서만 중복 제외하며, Slack 스레드 문맥에서는 유지한다. 응답 기록이 늦게 저장된 경우에도 이미 동기화된 행을 연결한다.
- 중단된 처리 작업과 발행 실패로 소진된 작업이 이후 대화를 계속 막을 수 있었다. 기존 큐의 만료된 processing lease는 같은 job/시도 횟수로 복구하고, 정상 처리 중 lease는 보존한다. 재시도 소진은 실제 failed 상태로 끝낸다. 원본 작성본·tool 실행 식별자는 바꾸지 않는다.
- 보존할 presentation metadata가 terminal phase/job 식별자를 덮어쓸 수 있었던 순서를 고쳤다. 보존 본문은 유지하고 실행 식별자는 processor가 결정한다.

새 테이블·enum·DB 제약·문구 판정 규칙은 추가하지 않았다. 새 SQL 파일 `20261014174708_company_agent_event_delivery_recovery.sql`은 기존 작업 큐를 복구하는 service-only 함수다. 운영에는 적용하지 않았다.

## 변경하지 않은 소개·범위

정기 회사 선추천과 정기 회사 후보 소개의 Worker writer·전용 프롬프트·본문·카드 payload를 유지한다. beta의 두 소개 전송 경로와 소개 후 사건 migration은 이번 점검 시작본과 동일하다. 요약 테이블도 유지한다. 다른 작업의 온보딩 안내·자동 calibration 종료 변경은 되돌리거나 재구현하지 않았다.

## 실제 코드·SQL 격리 검증

- 웹 관련 단위 테스트 134/134. prompt/context/store, Team 권한, Slack 카드·scope·전송 실패·링크, 원문 연락 계약을 포함한다. import용 환경값은 합성이며 외부 통신을 차단했다.
- Worker 관련 46/46, 추가 subtest 2개. 후보 연락/미팅 전달과 기존 두 소개 writer 계약을 socket 통신 차단 상태에서 검증했다.
- 전체 `tsc --noEmit` 통과. 이전 보고서의 당시 타입 검사 실패는 보존하며 이 결과로 대체해서 읽지 않는다. production build/배포 검증은 하지 않았다.
- `scripts/testCompanyEventProcessor.mjs`: 실제 processor/event 함수로 권한 변경, 저장본 재사용, 미전달 필수 알림의 가짜 성공문구 금지, 선택적 침묵, 승인 원문/첨부, shared read/private output 분리, metadata identity, 발행 소진, fresh-client board 제한을 확인했다.
- `scripts/testCompanyUpdateLocalDelivery.mjs`: 실제 enqueue/전송 함수로 부분 성공의 성공 채널 skip, async 응답 기록 저장 실패, workspace/job/누락 저장본 차단, 정확한 Role 기록 한 번, native Slack/UI 중복과 늦은 응답 기록, 취소 연락 제외를 확인했다.
- `scripts/testUnifiedCompanyContacts.mjs`: 실제 PostgreSQL 함수(PGlite)로 승인·소유권·최신성·첨부·연락 멱등성을 유지하고, lease 복구·소진된 선행 작업 이후 claim·정상 처리 보호를 확인했다. fixture는 운영 DB와 같은 UTC 세션으로 실행한다.
- `scripts/testPresentedCandidateLifecycle.mjs`: 실제 PostgreSQL 함수로 기존 추천 보존, 결정과 사건의 원자성, 전달 후 선택적 호출, rollback/다중 채널/취소 chunk/반복 전달과 기존 본문·blocks 유지가 통과했다.

공통 prompt/capability loop의 추가 검사 24개는 20개 통과·4개 실패다. 두 contact mock은 현재 Role 권한 조회를 제공하지 않고 바로 contact 조회/입력 거절만 기대한다. 다른 두 검사는 전체 prompt의 기존 36,000자 상한과 정확한 정책 문구를 기대한다. 현재 코드의 실제 권한 경계를 약화하거나 prompt를 예전 문자열로 되돌려 이 검사를 맞추지는 않았다. 이 별도 테스트 계약의 정리는 남아 있으며, 위 134개 통과와 혼합해 전체 테스트 성공을 주장하지 않는다.

초기 추가 카드 테스트는 동시에 추가된 `actionLogs` import를 격리 harness에 연결하지 못한 오류였다. 실제 의존성을 분리한 뒤 모두 통과했다. 초기 복구 SQL fixture는 로컬 PGlite가 KST 세션을 사용해 기존 UTC claim 계약과 맞지 않았다. UTC fixture로 바로잡고 복구/후속 claim까지 검증했다. 첫 Worker 실행의 시스템 Python에는 pytest가 없어 저장된 Worker venv로 실행했다. 각 초기 실패 로그는 ignored `.local/`에 보존하며 제품 통과로 집계하지 않는다.

## 모델 의미 검토

Frozen v22/v24 입력과 gold는 수정하지 않았다. 기본 company-side 모델/provider/reasoning/temperature 및 각 source snapshot을 새 owner-only run에 보존한다. 실제 공통 model loop와 event/contact prompt를 사용하며 조회/효과는 합성 adapter다. 모델 호출에 운영 원문·식별자·비밀 정보가 없고 실제 DB·Slack·메일 전달은 하지 않는다.

첫 review r1은 v24 5/5, v22 3/3의 전체 응답·조회·효과 의미 검토를 통과했다. 정확한 승인 대상 연락 1건만 있었으며, 미승인 변경·수락 오해·허위 Calendar/연결 완료는 없었다. 이후 공통 loop/input에 병행 작업의 선택적 scheduled-review 계약이 추가되어 같은 frozen 입력을 새 r2로 재실행했다. r2 v24는 5/5, v22는 2개 응답 검토 통과·거절 1건 provider timeout으로 실행 gate 미완료다. 이후 공통 문체/판단 prompt의 병행 변경을 반영한 r3도 새 source snapshot으로 실행했다. 이전 raw/manifest는 덮어쓰지 않는다. 최신 네트워크 실패를 이전 통과 표본으로 대체하지 않는다.

독립 팀원 검토·운영 분포·실제 Queue/Auth/Slack 전달 E2E는 포함하지 않는다. 모델 표본 통과를 모든 상황에서 오류가 없다는 보장으로 해석하지 않는다.

최신 r3 v24는 침묵·조건부 답변·연결 중 수락의 3개 응답 검토 통과이며, 제안 1건은 연결 종료·승인 작업 1건은 provider timeout으로 실행 gate가 미완료다. 최신 r3 v22도 미팅 부분 실패·설정 변경 2개 응답 검토 통과, 거절 1건은 provider 연결 종료로 미완료다. 실패한 세 단위의 합성 외부 효과는 0이었다. 성공한 응답에는 수락/거절 오해나 실제 발송 완료의 허위 주장이 없었다. 전체 최신 8/8 통과를 주장하지 않는다. 각 원문/실패/review는 해당 ignored run에 보존했다.

## 운영 적용 경계

이전 보고서의 로컬 migration 3개에 복구 함수 1개가 추가됐다. 운영 migration/push/deploy/restart는 수행하지 않았다. DB-first 보류 사건의 실제 Slack 전달 근거 대조와 중복 정리는 이후 명시적으로 승인된 배포의 별도 선행 작업이다.

## 후속 승인: 운영 DB 선반영 (2026-10-15)

사용자의 별도 운영 DB 적용 요청으로 Harper 운영 프로젝트에 아래 4개를 적용했다. 위의 미적용 설명은 이전 코드 점검 시점의 기록이다. 웹·Worker push/deploy/restart는 이번 요청에서 수행하지 않았다.

| 로컬 migration | 실제 운영 migration version | 적용 이름 |
| --- | --- | --- |
| `20261014164639` | `20261014192900` | `company_contact_agent_first` |
| `20261014170504` | `20261014192902` | `company_presentation_agent_followup` |
| `20261014174708` | `20261014192904` | `company_agent_event_delivery_recovery` |
| `20261015001000` | `20261014192906` | `company_intro_acceptance_update` |

운영 함수·관련 컬럼·트리거·선행 함수와 migration 이력을 먼저 대조했다. 기존 함수 본문이 점검 이후 달라졌다면 적용을 멈추는 확인을 포함했다. 네 적용은 성공했으며, 실제 변경 함수 5개의 본문은 준비된 SQL과 정확히 일치한다. public/anon/authenticated 실행 권한은 없고 service_role만 실행 가능하다. 새 트리거 2개와 기존 결정 트리거가 활성 상태다. 기존 보류용 enqueue 함수는 그대로이고 적용 전후 보류·실행 가능 company_update는 각각 0건이다. 기존 작업의 상태 집계도 동일했다. 과거 사건 재발송·복구 함수의 실제 실행·추천/후보 fixture 생성은 하지 않았다. 새 테이블·제약은 없다.

운영 DB 상태는 `ACTIVE_HEALTHY`이며 이번 함수에 해당하는 신규 security advisor 항목은 없다. 기존 항목 7개는 이번 적용 범위와 무관하고 전후 동일한 개수다. 실제 함수·이력·권한 확인 자료와 적용 전 함수 백업은 owner-only `.local/company-events-db-rollout/`에 보존했다.

Notion의 후보자 수락·연결, 역할/후속 연락/인재 상태, 외부·내부 추천 문서를 조회해 적용 범위를 대조했다. 이번 DB 선반영은 기존 수락·거절·연결 규칙이나 소개 본문을 바꾸지 않는다. 새 company-side 안내 실행 코드를 이번 요청에서 배포하지 않았으므로 그 로컬 동작을 운영 설명으로 쓰지 않았고, 이번 준비 단계에 해당하는 팀 문서 수정은 없었다. 초기 Notion 연결 종료는 URL 재조회로 복구했다. 다른 작업의 calibration·결제·추천 정책 문서 변경은 이번 적용에 섞지 않았다.
