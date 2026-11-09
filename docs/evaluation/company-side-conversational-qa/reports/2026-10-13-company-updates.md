# 회사 업데이트와 기존 Intro 보존 검증 — 2026-10-13

로컬 구현, 운영 DB 변경·발송·배포 없음.

## 상태/도구

- `scripts/testPresentedCandidateLifecycle.mjs`: 실제 새 migration을 PGlite에서 실행. 전체 연락 중단 후 awaiting 보존, 공개 진행 기록, 명시 거절/회사 큐 원자 기록과 중복 방지, 과거 privacy 종료 뒤 거절, 신규 공유 금지와 기존 카드 보존, 연락 중단 뒤 명시 수락, 회사 담당자 부재 시 거절 보존과 발송 실패 기록 통과. 합성 전용 계정과 testOnly 역할만 사용.
- Worker 회사 검색/수락 후보 테스트: 92 tests + 8 subtests 통과. Worker는 채널별 사실을 저장하며 회사 메시지 LLM을 호출하지 않음.
- 웹 관련 84 tests 및 최종 TypeScript 검사 통과. 기존 `webActionTurnContract.test.ts`의 `getEnabledOrgAgentTools(args.surface)` 소스 문자열 검사는 현재 capability resolver와 맞지 않아 실패함. 해당 기존 검사를 통과시키려고 변경하지 않음.

## 실제 모델 검토

Canonical inputs/gold/manifests v22/v23. DB/Slack/메일 차단, 합성 입력만 provider 전송. raw는 ignored owner-only runs에 보존.

- v22 `20261013-company-events-r1`: 2/3 통과. preferences 답변의 ‘정상적으로 검토 중’은 pending에서 확인할 수 없는 활동 추정이라 실패. r2는 잘못된 실행 명령의 server-only module resolution으로 모델 실행 전에 실패.
- 일반 event 증거 계약에 pending은 읽음/검토 중이라는 증거가 아님을 명확히 한 뒤 같은 frozen v22로 `20261013-company-events-r3`: 3/3 통과. 각 실제 응답·도구 trace·effects를 읽어 검토. 거절 이유 추정/미승인 외부 효과 없음, 미팅 시간과 Calendar 실패 구분, 기존 프로필 유지와 미결정 상태 설명.
- v23 `20261013-company-composition-r1`: 2/2 통과. 같은 company-side 생성기가 신규 검토용 후보와 수락 후보의 연결 결정을 구분. 카드 coverage 1/1, 정확한 프로필 URL. 모델의 talent: renderer 식별자는 알려진 카드 URL로 구조적으로 해석하며 prose는 보존한다.

작은 작성자 합성 평가이며 독립 팀원 검토·운영 평균·실제 인증/Slack E2E는 미포함. 추천 카드 최대 chunk 모델 검증은 미포함. queue 재시도 한도 소진/담당자 부재는 실패 기록으로 남으며 성공으로 표현하지 않는다. 미팅 안내 등록은 기존 확정 후 hook이므로 DB enqueue 이전 장애는 기존 hook의 운영 복구 한계가 남는다. 과거 누락된 거절을 자동 추정해 기록하지 않았다.


## 운영 DB 적용과 코드 재검토 — 2026-10-13 21:01 KST

요청 범위: 운영 DB 적용 + 동일 사건 코드 검증. 웹 push/배포와 Worker 재시작은 하지 않았다.

- Supabase 운영 프로젝트 `zzojrniuppueizhnmqfd`에 migration `20261013120149`, name `preserve_presented_candidates_and_intro_decisions` 적용 성공. 로컬 원본은 `supabase/migrations/20261013111553_preserve_presented_candidates_and_intro_decisions.sql`이다. 관리 API가 적용 시점 version을 생성했으며 재적용하지 않는다.
- 운영 함수 본문과 trigger 설치를 재조회했고 내부 함수의 anon/authenticated EXECUTE가 모두 차단됐음을 확인했다. 보안 advisor에서 이번 새/수정 함수 관련 지적 없음; 전체 프로젝트 기존 지적의 해소를 뜻하지 않는다.
- Vercel production READY `dpl_A7tjs4z4LAaf6XfgcYrQp1LayiFj`, commit `dba0125338525b1ea35f4d1275d85ce69e253bc0`. 운영 소스는 `company_update` 전달 분기가 없고 공개 설정을 board read에 적용한다.

### 같은 사건의 경로

| 단계 | 코드/DB 경로 | 확인 결과 및 현재 운영 상태 |
| --- | --- | --- |
| 전체 연락 중단 | `tools.ts` update_setting → talent_setting → close_company_intro_on_privacy_change_v1 | DB trigger는 공개 진행 이력만 추가. Intro·feedback을 바꾸지 않음. 남은 role을 반환하는 tool 결과는 새 웹 배포 필요 |
| 구 Worker 자동 정리 | close_stale_ready_candidates / delivery guard → Intro UPDATE | 새 BEFORE trigger가 preference-only privacy 종료 시도만 보존. 삭제·회사별 차단은 별도 경계 유지. 격리 DB에 구 UPDATE를 직접 실행해 보존 확인 |
| 기존 프로필/종료 이력 조회 | server.ts board/detail → data.ts 일반 company read → promptFormat.ts | 로컬은 closed/passed 포함, route_replaced 제외, 설정 필터 제거, 안전 projection 유지. 현재 운영 웹에는 이전 필터가 남아 있으므로 DB 적용만으로 화면/LLM 조회 문제가 해결되지는 않음 |
| 명시적 거절 | decide_company_intro_request_v2 → v1 → decision progress trigger | 이전 privacy 종료 뒤에도 실제 decline을 기록. 일반 종료·연결 완료는 명시 거절로 오인하지 않음. feedback와 progress/event 같은 transaction, 반복 호출 멱등. 신규 가입/삭제/역할/test-only 경계 유지 |
| 회사 메시지 | trigger enqueue → 새 enqueueCompanyUpdate/releasePendingCompanyUpdates → web-action queue → runOrgAgentWebActionTurn → deliverCompanyContactEventMessages | 구 웹은 새 action을 Slack에 전달하지 않아 DB-first 단계에서 보류. 새 웹의 exact caller/cron만 해제. 구 웹의 기존 정형 거절 안내는 기존대로 실행될 수 있음. 배포 전 보류 event와 기존 Slack 실제 전달을 대조해 중복 방지 필요 |
| 알림 중복/실패 | job event key, terminal message 재사용, Slack idempotency key | 로컬 재시도 계약 확인. 실제 Slack 전송 E2E는 하지 않았으며 Slack 설치/채널/권한에 따른 미전달을 성공으로 주장하지 않음 |
| 승인 정규식/제보 | roleCreationConsent 제거, company-side report_issue 등록/실행 | 로컬 구현과 관련 테스트 확인. 운영 웹에 이 변경은 아직 없음 |

### 원래 사건과 검증 한계

운영에서 원래 가우디오랩 Intro의 발송시각은 유지되어 있고 아직 `closed/privacy_withdrawn`, 결정시각 NULL이다. Migration은 이전 고객의 누락된 거절을 추정해 복구하거나 회사에 소급 메시지를 보내지 않는다.

현재 source 기준 PGlite 재현 통과: 설정 후 대기 유지, 구 Worker 자동 종료 차단, 공유 progress, 명시 거절·재호출·과거 privacy 종료 거절, 신규 공유 금지, 명시 수락, 담당자 부재 시 거절 유지/전달 실패 기록, 회사별 차단 경계. 실제 사용자의 설정/거절 데이터를 수정해서 시험하지 않았다. 관련 웹 테스트 80개와 타입 검사 통과. 추가 제보/승인 경로 8개도 통과하여 이번 관련 테스트 합계는 88개다. 적용 직후 보류 company_update 작업은 0건으로 확인했다.

따라서 결론은 ‘DB 원인 수정 완료, 전체 운영 경로는 웹/Worker 배포 후 검증 필요’다. 앞선 로컬 모델 5건 통과는 실제 운영 배포/전송 성공을 뜻하지 않는다.

## 로컬 재발 시나리오 재검증 — 2026-10-13

사용자 정정에 따라 배포 상태 대신 현재 로컬 실행 경로를 검증했다. 운영 DB/웹/Slack에는 이번 검증으로 새 변경이나 메시지를 보내지 않았다.

- `node scripts/testPresentedCandidateLifecycle.mjs`: 실제 migration을 격리 PGlite에 적용해 설정 변경→대기 유지→명시 거절→공유 progress와 durable company event를 확인했다. 과거 privacy 종료 뒤 거절, 반복 결정, 신규 공유 제한, 명시 수락, owner 부재, 회사별 차단도 통과.
- `scripts/testCompanyUpdateLocalDelivery.mjs`: 실제 enqueue/recovery/Slack delivery 모듈을 합성 DB·전송 adapter로 실행. caller 실패 후 recovery, 완료 event 보존, 실패 후 동일 메시지/키 재사용, workspace/job 범위, 완료 전달 재실행 방지 통과. 모델 생성과 실제 Slack 네트워크는 이 테스트 범위 밖이다.
- `capabilityLoop.test.ts`에 원 사건 순서의 회사 read projection/serializer 회귀 추가. 발송 시각·거절 시각·설정 변경과 거절의 별도 progress가 LLM 입력까지 유지되고 비공개 이유는 제외됨을 실행 검증했다. 관련 projection 테스트 4건 통과.
- board/detail/read query의 closed/passed 포함과 설정 필터 제거, update_setting의 미결 내부 역할 반환, 회사 event의 최신 대화 사용 및 terminal 재사용을 코드 추적했다. 브라우저 E2E 전체를 한 번에 실행한 검증은 아니다.
- 추가 결함 발견/수정: 여러 Slack 채널 중 일부만 성공해도 기존 sender가 성공을 반환했다. durable 회사 event 호출에 `requireAllDeliveries`를 적용해 일부 실패 또는 timestamp 누락을 재시도 대상으로 처리한다. 실제 sender 함수 본문을 분리된 adapter로 실행해 부분 실패→재시도와 채널별 동일 idempotency key를 검증했다. 외부 Slack의 중복 제거 보장은 이 격리 테스트로 검증하지 않는다.
- 타입 검사 통과. 묶음 테스트 20건 중 18건 통과/2건 실패: 기존 contact executor fixture가 현재 teamAccess의 선행 company_user_workspace 조회를 지원하지 않는 실패다. 이 두 fixture는 수정하지 않았고 전체 테스트 통과라고 주장하지 않는다. 이번 projection 테스트를 선택 실행한 결과는 4/4 통과다.

로컬 결론: 원 사건의 설정 변경→프로필/Intro 유지→명시 거절 기록→회사 LLM에 발송/거절 사실 제공→회사 알림 dispatch 경로는 확인됐다. 새 모델 품질 평가는 이번에 추가하지 않았으며 이전 frozen v22/v23 결과와 분리한다. LLM/실제 인증/브라우저/Slack 전체를 묶은 실전 E2E 완료를 뜻하지 않는다.
