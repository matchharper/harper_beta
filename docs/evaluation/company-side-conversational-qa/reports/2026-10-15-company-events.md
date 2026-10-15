# 회사 공통 사건과 소개 후 후속 행동 — 로컬 검증

문서 기준: 2026-10-15. 미배포이며 운영 DB·Slack·메일에 쓰지 않았다.

## 구현 범위

후보자의 회사 연락은 원본/승인한 첨부 링크를 보존하면서 첫 전달 전에 기존 company-side 대화 loop를 호출한다. 회사측 에이전트가 실제 회사 지시·일반 조회/실행 도구로 필요한 설명과 작업을 판단한다. 원문은 저장·전송 코드가 그대로 인용해 붙이며, 실패하면 기존 작업 큐에서 같은 작성본과 전송 식별자를 재사용한다. 이미 전달한 과거 연락은 다시 작성/발송하지 않는다.

후보자의 회사 제안 수락과 거절은 실제 상태 변경과 안내 사건을 같은 DB transaction에서 저장한다. 수락·연결 중·메일 전송 완료·미팅 확정은 서로 다른 근거다. 일반 조회 도구가 현재 상태를 제공한다. 미팅/Calendar 결과, 회사가 요청한 후보 탐색 결과·연락 제한, 기준 검토용 익명 예시 소개·후속 검토 결과도 같은 company-side turn과 전송 processor를 사용한다. 일반 Web action 후 유용한 최종 응답도 같은 전달 경로를 사용한다.

정기 회사 선추천과 정기 연결 대기 후보 소개의 기존 작성·본문·카드·전송은 유지한다. 전달과 진행 기록 저장 뒤 기존 큐에 선택적 후속 사건만 기록한다. 해당 호출은 사전 승인된 유용한 작업을 수행하거나 필요한 도움을 구체적으로 제안하고, 추가로 할 일이 없으면 침묵한다. 채용 현황·역할별 요약 테이블과 미구현 첫 팀원 안내는 제외한다. 역할 채용 시작·채널 진입 등 정형 시스템 공지도 유지한다.

## 격리 검증

- 관련 단위 테스트 53/53, 회사 문맥·저장·Slack 링크/원문 유지 테스트 30/30.
- `scripts/testCompanyEventProcessor.mjs`: 실제 processor와 event-turn 함수에 transport/model/storage adapter만 주입했다. 전달 후 완료, 재시도·최대 시도·busy lease·완료 replay, 현재 권한·원래 작성자 언어, 미전달 필수 알림에 가짜 성공문구를 만들지 않는 경계, 선택적 침묵, 승인 원문·첨부 보존, 원래 Slack 스레드 기록, Web/Slack 공동 대화 조회를 확인했다.
- `scripts/testCompanyUpdateLocalDelivery.mjs`: 실제 enqueue/release 및 sender의 작성본 보존, 재전송 ID, 다른 workspace/job의 메시지 차단, 부분 채널 실패를 확인했다.
- `scripts/testUnifiedCompanyContacts.mjs`: 실제 PostgreSQL 함수로 source 소유권/최신성·문서·큐·정확한 처리 중 actor의 후보 동의·취소/오래된 동의 거절·기존 전달 trigger 중복 억제를 확인했다.
- `scripts/testPresentedCandidateLifecycle.mjs`: 실제 SQL의 기존 프로필 보존, 수락/거절 안내 transaction, 실제 전달 뒤 선택적 사건, rollback·여러 채널·마지막 취소 chunk·같은 사건 재처리, 원본 본문/blocks 유지와 기록을 확인했다.
- Git 기준의 기존 정기 소개 전송 본문, 일반 소개 sender와 요약 테이블 sender 구간이 동일한지 확인했다.

초기 context-test 두 실행은 import 시 테스트용 API/DB 환경값이 없어 실패한 `invalid_harness`다. 외부 통신을 차단한 dummy 환경으로 최종 30/30 통과했다. 초기 processor harness의 다른 VM Error realm도 수정 후 통과했다. 제품 오류로 집계하지 않는다.

전체 TypeScript 검사는 기존 가입·Career·Contents/Workflow 등의 오류와 동시에 변경 중인 연락 도구/test의 타입 오류 때문에 통과하지 못했다. 이번 수정 경로에서 발생한 profile-block 타입 오류는 보완했으며, 최종 검사에서 해당 변경 경로의 추가 오류는 없다. 전체 build 성공이나 운영 배포 성공을 주장하지 않는다.

## 실제 모델 검증

기존 frozen v22와 새 frozen v24를 현재 기본 `google/gemini-3.8-flash` company-side loop로 실행했다. provider/reasoning/temperature, 입력·source hash와 원문은 owner-only run manifest에 보존했다. 모델 호출에는 합성 자료만 사용했고 실제 DB/Slack/메일은 차단했다.

| 입력 | 최종 실행 | 의미 검토 | 실제 변경 효과 |
| --- | --- | --- | --- |
| v22 거절·미팅 부분 실패·기존 추천 보존 | `20261015-company-events-r3` | 3/3 | 추가 write 없음 |
| v24 소개 후 침묵·제안·사전 승인 작업·조건부 연락·수락 | `20261015-company-events-followup-r4` | 5/5 | 승인된 정확한 대상의 연락 1건만 |

초기 v24 r1은 1건 provider timeout으로 전체 gate 미완료다. r2는 실행 5/5이나 중요한 미확인 사항의 후속 제안을 누락해 의미 4/5다. 공통 delivery prompt에서 의미 있는 제안도 유용한 다음 행동임을 명확하게 한 r3/r4는 5/5였다. v22 r2에서는 이벤트의 대상과 다른 조회 후보를 임의 alias로 연결한 문제가 있었다. 새 사건 facts에 식별자를 보강하고 공통 prompt에서 exact identity/미확인 이름 경계를 강화한 r3는 3/3이다. 실패와 중간 실행은 덮어쓰지 않았다.

수락 답변의 미래형 기본 소개 메일 설명은 기존 service knowledge 및 실제 `authorizedCompanyIntroTransition` → `sendOrgIntroEmail` 경로와 대조했다. 발송 완료를 주장하지 않아 허위 완료로 세지 않는다. 최종 v24의 한 Role 링크 marker가 불완전했지만 기존 identifier renderer가 plain label로 처리한다. 이를 링크 완성도 100%로 주장하지 않는다.

검토는 구현자 Codex의 비맹검 소규모 challenge다. 운영 평균, 독립 팀원 검토, provider/Queue/Auth 및 실제 Slack·메일 전달을 증명하지 않는다.

## 운영 적용 전 남은 작업

현재 로컬에 다음 migration을 준비했으며 운영에는 적용하지 않았다. 새 테이블·enum·DB 제약은 추가하지 않았다. 기존 함수/trigger와 기존 회사 작업 큐만 이용한다.

- `20261014164639_company_contact_agent_first`: 첫 전달 전 처리 중인 정확한 회사 actor/job에 한해 최신 후보 동의를 사용하도록 기존 DB 경계를 확장한다.
- `20261014170504_company_presentation_agent_followup`: 실제 소개 전달과 선택적 후속 사건을 원자적으로 기록한다.
- `20261015001000_company_intro_acceptance_update`: 실제 수락과 회사 안내를 원자적으로 기록하며 거절 source identifier도 보강한다.

이전 DB-first 보류 event는 배포 시 실제 Slack 전달 근거와 대조해야 한다. 이번 작업은 해당 운영 보류 사건의 재발송/정리나 배포를 수행하지 않았다.
