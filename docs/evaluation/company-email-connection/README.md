# Company email connection preview

## 2026-10-16 최종 확인

- 관련 코드 검사 27/27 통과. 시간 의미를 context에 보완한 뒤 변경 경로 12/12 재확인.
- 폐기 가능한 로컬 PostgreSQL에서 실제 migration/RPC, 동시 확보, 수신 거부·연결 변경, 재시도, 최대 횟수·간격, 권한 경계 통과. 검사 후 전용 로컬 DB 종료. 운영 DB 쓰기와 실제 이메일 발송 0건.
- 실제 기본 모델 수신 거부 선택 `optout-20261016-r1`: 합성 2/2에서 loader 없이 요청 범위의 도구 선택. 저장은 DB 검사로 별도 검증.
- 작성 `20261016-runtime-1`에서 정기 알림을 실시간으로 표현한 사례를 발견해 제공 사실에 시간 기준을 보완했다. 같은 frozen 입력의 `20261016-runtime-2` 2건 본문 전체 검토: 인원·소개 사실, 빈 후보의 연결 가치, 설정 링크 보존. 주기 설명이 다소 길며 광범위 문체 품질·실제 메일함 렌더링 검증은 아니다.
- 타입 검사에서 src 오류는 없지만 기존 삭제된 billing/Toss route를 참조하는 Next 생성 validator 때문에 전체 명령은 실패한다. 관련 없는 코드는 수정하지 않았다.
- 운영 읽기 전용 기준 2026-10-16 07:59:47 KST. 현재 상태 불변·10월 16일 첫 슬롯 전 적용 가정: 대상 2명, 다음 7일 각 2회/총 4통. 개인정보 포함 결과는 ignored `runs/forecast-20261016/`에만 보관.
- 미배포 상태다. 아래 migration과 회사 이메일 답장 선행 조건을 실제 적용하는 별도 배포가 필요하다.

2026-10-16 자동 실행·영속 발송 연결까지 로컬 구현. 운영 배포·DB 적용·실제 발송 없음.

- 목적/단위: Slack 연결 안내 이메일 한 통의 실제 company-side 모델 출력과 수신자별 발송 정책. 실제 회사 현황·추천 품질·전달/재시도 성능은 평가하지 않는다.
- 동결 입력/gold: `cases-v1.json`, `gold-v1.json`, `manifest-v1.json`. 전부 합성, 사용자 요청 회사명 SBVA는 실행 옵션으로만 적용한다. 실제 팀원/후보/주소/Role/DB를 읽지 않는다.
- 입력 계약: 본인의 수신 자격, 모든 Workspace의 안내 발송 영수증, 접근 가능한 active non-test Role의 실제 전달 가능 여부, 누락 설정, 공유 가능한 집계, 검증된 설정 URL. 빈 후보 목록도 발송 대상이다. 최근 실제 대화/이전 메일은 선택적 native context.
- canonical runner: `scripts/previewCompanyConnectionEmail.ts`, 실제 `planSlackConnectionReminder`, `composeCompanyUpdateEmail` → 공통 `buildCompanyUpdatePrompt`/`buildOrgAgentSystemPrompt`/`runOrgAgentCompletion`을 재사용.
- 실행: `TSX_TSCONFIG_PATH=scripts/tsconfig.json node --import tsx scripts/previewCompanyConnectionEmail.ts <fresh-run-id> SBVA`.
- 모델: 현재 `resolveOrgAgentModel` 기본 company-side 모델과 해당 reasoning, 공통 temperature 0.5, 90초 timeout, maxTokens 2000(공통 budget 조정 적용), fallback 없음. actual model/usage/prompt·source hash를 run에 저장.
- 개인정보 경계: `.env.local`은 모델 인증만 사용. 네트워크는 모델 API 호스트만 허용, DB/Slack/Resend 차단. 모델 API에 합성 입력만 제공. raw output은 ignored `runs/`, directory 0700/file 0600. 테스트에서도 실제 발송 함수 호출 없음.
- 지표/gate: 숫자/전달 사실의 정확성, 없는 후보를 만들지 않는지, 현재 필요한 설정 안내, 자연스러운 문체, 압박 없는 후속 안내를 사람이 전체 본문으로 확인. critical 0. 정책 tests는 수신자 범위, 48h/72h, 최대3회, 빈 후보, opt-out, test-only, 이메일 기본 capability를 확인.
- 한계: 운영 API를 통한 실제 발송 E2E는 사용자의 금지에 따라 실행하지 않았다. 로컬 PostgreSQL에서 실제 migration/RPC를 실행하고 transport를 대체한 생산 orchestration을 검증한다. 운영 migration과 배포는 별도로 필요하다.

정책: 수신자 ID 기준 누적 최대 3회(Workspace 변경으로 초기화하지 않음), 월수금 KST 점검에서 첫 회/48시간 뒤/이후72시간 뒤. 횟수와 간격은 수신자 전체에서 공유한다. 답장이 다른 회사 대화로 유입되지 않도록 한 통에는 한 Workspace의 모든 미연결 Role을 담고, 여러 Workspace가 있으면 안정적인 ID 순서로 회차마다 순환한다. 회사 사용자 email_preferences는 수신자 선택의 영속 사실이며, RPC는 기존 executor의 현재 본인만 변경한다. DB 값 목록/횟수 제약은 추가하지 않는다.

## 2026-10-15 실행 결과

- `20261015-preview-1`: 실제 company-side 기본 모델 `google/gemini-3.8-flash`, OpenRouter/Google. 숫자는 보존했으나 빈 후보 안내가 장황하고 불필요한 결과 보장 부인까지 본문에 드러났다. 실패를 문장 후처리로 숨기지 않고 artifact에 보존했다.
- `20261015-preview-2`: 같은 frozen 입력/gold로 fact projection의 후보 의미를 명확히 하고 불필요한 부인 문구를 context에서 제거했다. 공통 문체를 유지하며 목적 지침의 간결성을 개선했다. 2건 전체 본문을 검토해 후보 관심·선정·실제 전달의 구분, 설정 단계, 빈 후보의 연결 가치가 보존됨을 확인했다. 독립 blind review 및 실제 운영 검증은 아니다.
- 두 실행 모두 DB/Slack/Resend 차단, 실제 이메일 0통. 출력의 SBVA 명칭 외 역할·인원·일정·링크는 가정이다. 입력과 본문은 ignored runs 아래에 보관한다.
- 정책/기본 노출 6개와 기존 공통 prompt 10개 검사 통과. 타입 점검에서는 기존 삭제된 결제 route를 가리키는 Next 생성물 문제가 남아 별도로 기록한다.


## 2026-10-16 운영 연결과 검증 계약

- 기존 `enqueueCompanyUpdate` 이메일 분기를 통해 수신자 작업을 확보한다. 새 Vercel cron은 5분마다 호출되지만 실제 처리 창은 월·수·금 10:00–18:00 KST이며 한 호출당 최대 2명이다. 이메일 답장 runtime이 비활성화되었거나 `EMAIL_REPLY_DRY_RUN=true`/`COMPANY_EMAIL_DRY_RUN=true`이면 DB/발송 작업을 시작하지 않는다.
- `company_connection_email_snapshot_v1`은 인증된 이메일과 현재 Owner/Admin, 팀 접근 범위, internal/active/non-test/non-expired Role, 현재 Slack 설치 및 채널 제외 설정, 현재 연결 대기·ready·실제 Slack 영수증을 읽는다. 이는 저장된 연결 설정이며 Slack 서비스의 실시간 정상 작동을 검사하는 기능은 아니다.
- 새 `company_email_outbox`는 복원할 수 없는 실제 발송 사실(고정 초안/전송 payload/최초 시도/수신자/회차/provider 영수증)과 실행 lease를 저장한다. reader는 cron·발송기·예측·수신 거부 RPC다. 유일 제약은 동일 수신자·주제·회차의 중복 발송 작업 방지에만 사용한다. private RLS, anon/authenticated 테이블·함수 접근 차단.
- 본인의 수신 설정과 발송 허가가 같은 사용자 행 lock을 사용한다. 수신 거부가 먼저 확정되면 미시도 작업을 취소하고 transport를 호출하지 않는다. 이미 발송 허가를 받아 외부 전송을 시작한 메일은 회수할 수 없다. 이후 새 메일/재시도는 차단한다.
- 최초 요청 직전 정확한 payload를 저장한다. 영수증 저장 실패 등 불확실한 결과는 23시간 안에 같은 key/payload로만 재시도한다. 그 이후, 또는 권한·설정·현황 변화로 안전한 재시도를 할 수 없으면 `delivery_unknown`으로 보존하고 이후 안내도 막는다. provider idempotency 보존 기간 밖에서 재발송하지 않는다. 한 작업 최대 5번 실행 시도 후 실패 또는 불확실 상태로 보존한다.
- 같은 frozen `cases-v1.json`을 실제 공통 회사 모델로 재실행한다. 추가 `reply-cases-v1.json`은 실행 전에 동결한 합성 수신 거부 2건과 command gold다. canonical runner `scripts/evalCompanyEmailOptOut.ts`는 실제 첫 completion의 기본 도구 선택·범위만 검증하고 도구는 실행하지 않는다. model/usage와 input/prompt hash를 `runs/`에 기록한다. 실제 preference 저장은 로컬 SQL 통합 검사에서 별도로 확인한다.
- `scripts/testCompanyConnectionEmailDb.py`는 고정 loopback PostgreSQL 55489의 폐기 가능한 fixture DB만 사용한다. 실제 migration/RPC, 동시 claim, 수신 거부·연결 변경 race, 동일 payload 복구, 최대 횟수/간격, 24시간 불확실성, 권한 회수를 검사한다. 실제 provider 요청은 없다.
- `scripts/captureCompanyConnectionEmail.py`는 Worker의 canonical `connect_read_only`로 migration에 표시된 **SELECT 본문만** 운영 DB에서 실행한다. 상태 변경·모델·메일 호출 없음. 실제 이름·주소·집계는 owner-only ignored private에만 저장한다. `scripts/forecastCompanyConnectionEmail.ts`는 이 snapshot과 실제 순수 정책으로 7일을 재생하며 네트워크를 차단한다. 현 상태 불변·첫 슬롯 전 배포·성공 발송을 가정한 예상이며 실제 예약이 아니다.
- 필요한 적용 파일: `supabase/migrations/20261015130959_company_connection_email_delivery.sql`. 기존 미적용 prototype `20261015173000_company_email_preferences.sql`을 여기에 통합했다. 회사 이메일 답장 migration `20261015120000_company_email_replies.sql`과 기존 `EMAIL_RUNTIME_TARGET=vercel_queue`, Resend/Reply-To 인증 설정이 선행해야 한다. 실제 적용 여부를 확인하고 운영 권한 없이 실행하지 않는다.
