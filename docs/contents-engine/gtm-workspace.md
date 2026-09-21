# GTM 웹 워크스페이스 구현 계약

2026-09-21. 운영 Supabase의 GTM workspace·operations·메일·인증 통합 마이그레이션과
웹 배포를 완료했다. 운영 주소는 `https://matchharper.com/ops/gtm`이다.
Notion의 [GTM Workspace 운영 가이드](https://app.notion.com/p/3e27277d26df81208635e61eda1a9d85)는
현재 운영 동작을 기준으로 한다.

## 원칙

업무 데이터의 원본은 기존 `public.gtm_*` 원장이다. 웹과 Agent는 같은 변경 함수의
행 버전, 재시도 중복 방지, 감사 기록, 금액·연결 검증을 사용한다. 화면 정의에 업무
레코드를 다른 업무 저장소에 복제하거나 별도 동기화 대상을 추가하지 않는다.

`gtm_view.sources`는 공개할 GTM 데이터 원본·변경 경로·컬럼 라벨을 등록한다.
`gtm_view.sheets`는 팀원이 만든 시트 이름·원본·표시 컬럼·순서·너비·행 높이·필터·정렬·색상
규칙을 저장한다. 이 구성은 원본에서 재구성할 수 없는 팀의 화면 설정이며 웹과 Agent가 읽는다.

컬럼의 자료형과 수정 가능 여부, 연결 가능한 FK는 PostgreSQL 메타데이터에서 읽는다.
프런트엔드에는 시트별 컬럼 목록이 없다. 새 시트는 등록된 원본에서 만들고, 컬럼 선택기에서
원본 컬럼과 FK로 연결된 원장의 컬럼을 추가한다. 연결 컬럼은 1단계의 단일 레코드 조회이며
읽기 전용이다. 1:N 원장을 임의로 합쳐 기본 행 수를 늘리지 않는다.

Zustand/localStorage에는 계정별 마지막 시트와 저장 중인 구성만 보관한다. 업무 데이터와
인증 정보는 저장하지 않는다. 컬럼·보기 구성은 변경 즉시 중앙 정의에 자동 저장하고, 버전이
바뀌었으면 다른 팀원의 설정을 덮어쓰지 않는다. 시트 삭제·컬럼 제거는 원본 데이터를 삭제하지 않는다.

## 화면

- `/ops`의 시스템·매칭 관리·디버깅·회사 다음에 GTM 탭, 주소 `/ops/gtm`.
- 흰 배경, 상단 시트 선택, 전체 너비의 셀 경계선이 있는 표.
- 셀 더블클릭/Enter/F2 편집, Enter 저장, Shift+Enter 줄바꿈, Esc 취소.
- 컬럼 드래그 순서 변경, 키보드/포인터 너비 조절, 행 번호 경계로 높이 조절.
- 컬럼 선택·숨김·제거·이름 변경, 필터와 복수 정렬, 기본 색상과 조건별 색상.
- 시트 추가·복제·이름 변경·삭제, 새 행 추가, 행 상세, FK 기록 검색/선택.
- 필터·정렬·검색은 DB에서 전체 결과에 적용한 뒤 100행 단위로 가져온다.
- Outreach Review의 발송본 검토는 기존 `gtm_outreach_review`를 호출한다. 승인 버튼은
  외부 발송 예약을 만들 수 있다. 표 셀 편집만으로 승인하지 않는다.

기존 업무 범위를 옮긴 18개 보기를 초기 정의로 등록한다. Pricing Strategies와 콘텐츠
성과·비용 컬럼은 2026-09-21 실제 운영 DB 기준이다.
성과 집계는 기존 `gtm_performance`를 사용하며 빈 측정값을 0으로 바꾸지 않는다.
통화가 섞이거나 비용 기록이 불완전한 집계의 비용/전환당 비용은 빈값으로 남긴다.

범위 선택/다중 셀 붙여넣기, 수식, 임의 SQL 조인, 엑셀 워크북 기능은 현재 범위에 없다.

## API

웹: `POST /api/internal/gtm`, `{ "action": "catalog", "data": {} }`.
기존 Ops 내부 인증을 검사하고 검증된 사용자 JWT를 DB로 전달한다. DB도 현재 확인된
`@matchharper.com` 계정을 검사한다. 프런트에 서비스 역할 키를 전달하지 않는다.

Agent: 연결된 Supabase plugin에서 `public.gtm_workspace(p_action, p_data)`를 호출한다. 추가 인증 설정은 없다. 예:

```sql
select public.gtm_workspace('catalog', '{}'::jsonb);
```

Supabase plugin은 프로젝트 전체에 더 넓은 권한을 가질 수 있으므로 GTM 업무에서는 이 함수만 사용하고 원본 테이블을 직접 수정하지 않는다.

| action | 주요 data | 결과 |
| --- | --- | --- |
| `catalog` | `{}` | 시트, 원본, 컬럼/연결 메타데이터, 쓰기 권한 |
| `query` | `sheet_id`, 선택적으로 `definition`, `search`, `offset`, `limit`, `period` | 전체 필터 결과 수와 페이지 행 |
| `reference_options` | `source`, `search` | 연결할 기록의 ID와 이름, 최대 100개 |
| `save_sheet` | `name`, `definition`, 수정 시 `id`, `expected_version` | 중앙 시트 정의 |
| `delete_sheet` | `id`, `expected_version` | 삭제한 시트 ID; 원본 보존 |
| `save_record` | `sheet_id`, `values`, `request_id`, 수정 시 `record_id`, `expected_version` | 기존 GTM 변경 함수 결과 |
| `review_outreach` | `sheet_id`, `record_id`, `expected_version`, `request_id`, `decision`, 최종 제목/본문/시각 | 기존 발송 검토 결과 |

`definition.columns[].key`는 catalog의 컬럼 key 또는 `<FK 컬럼>.<연결 컬럼>`이다.
쿼리 요청으로 원본을 바꿀 수 없으며 임의 테이블/SQL/수정 필드를 허용하지 않는다.

## DB 적용 경계

마이그레이션: `supabase/migrations/20260921120000_gtm_workspace.sql`.
현재 운영 DB에 존재하는 GTM 원장·운영 View·가격 전략 RPC를 전제로 한다. 저장소의 초기
Contents Engine migration 이후 운영에 추가된 가격 전략/콘텐츠 View가 있으므로, 빈 DB에
초기 migration만 적용한 상태를 현재 운영 스키마로 간주하면 안 된다.

기존 함수의 업무 로직을 과거 사본으로 덮어쓰지 않도록 현재 함수 정의에서 인증 조회
부분만 공통 인증 함수로 연결한다. 확인된 인증 구간이 달라졌으면 migration은 실패한다.
`20260921180000_gtm_remove_access_tokens.sql`과 `20260921181000_gtm_service_role_auth.sql`은 인증을 기존 Supabase 사용자·plugin·서버 연결로 통합한다. 웹 사용자는 로그인 이메일로, Supabase plugin 실행은 `supabase-plugin`, 서버 실행은 `supabase-service-role`로 감사 기록에 남는다. GTM 설정 schema의 테이블과 내부 함수는 직접 공개하지 않는다.

2026-09-21 사용자의 명시적 DB 적용 승인으로 workspace와 operations 두 마이그레이션을
운영 Supabase에 하나의 트랜잭션으로 적용하고 이력을 기록했다. 기존 함수 정의는 적용 전
별도로 보관했다. 같은 날 `main`의 웹 코드를 Vercel production에 배포하고 운영 주소의
응답과 `gtm_workspace('catalog', '{}')`의 18개 시트·21개 원본을 확인했다. 이 완료 기록만으로
마이그레이션을 다시 적용하지 않는다.

## 검증

운영 데이터는 복제하지 않는다. schema-only export를 격리된 PGlite에 로드해서 새 SQL과
실제 기존 GTM 변경 함수를 함께 실행한다. 다음 테스트는 외부 발송/게시를 하지 않는다.

```sh
python3 scripts/gtm/export_test_schema.py --output /tmp/gtm-schema-test
npm install --prefix /tmp/gtm-pglite @electric-sql/pglite
GTM_PGLITE_MODULE=/tmp/gtm-pglite/node_modules/@electric-sql/pglite/dist/index.js \
  node scripts/gtm/test_workspace.mjs /tmp/gtm-schema-test
node --import tsx --test src/lib/gtm/grid.test.ts
```

브라우저 검증은 Playwright에서 실제 `/ops/gtm` 페이지를 열고 요청만 격리 DB로 연결한다.
로그인·접근 제어를 우회하는 preview route나 fixture API는 제품 코드에 추가하지 않는다.

2026-09-21 검증 결과: 격리 DB 검증 54개, 셀 값/컬럼 처리 단위 테스트 4개 통과.
GTM 범위 TypeScript와 ESLint 통과. 브라우저에서는 한글 셀 저장, 컬럼 드래그·너비,
행 높이, 색상 규칙, 숨김, 구성 자동 저장과 복원, 필터·정렬, 시트 생성·삭제를 확인했다.
전체 저장소 TypeScript 검사는 기존 evaluation fixture와 GTM 일일 리포트 테스트의
무관한 타입 오류로 통과하지 못했다.

## 업무를 끝까지 연결하는 후속 개선

시트 조작만으로는 연락·제작·측정·다음 실행이 이어지지 않는다. 표는 대상을 찾고 비교하는
곳으로 유지하고, 행 상세에서 현재 기록과 연결된 업무를 처리한다. 자동 Agent 실행이나
새로운 고정 단계 상태 머신은 추가하지 않았다.

- **할 일**: 기존 `gtm_today`의 미완료 항목을 읽는 추가 시트. 담당·기한·기한 초과를
  표시하고 해당 협업/콘텐츠/집행의 할 일 편집으로 바로 연다. 별도 할 일 원장은 없다.
  기존 17개 탭은 보존되어 초기 시트는 총 18개다.
- **기록 상세**: 최신 원본과 행 버전을 읽는다. 연락처, 후속 할 일, 제작 파일,
  지급/환불 기록, 비용 배분을 JSON 대신 필드로 편집한다. 기존 항목 ID를 보존하며
  지급 기록은 수정하지 못한다. 기존 배분 항목의 제거는 현재 공통 API가 지원하지 않는다.
- **연결 기록**: 실제 FK로 연결된 원장을 찾아 페이지 단위로 조회한다. 같은 화면에서
  상위 기록을 열거나 하위 기록을 만든다. 협업에서 콘텐츠/비용을 만들 때 크리에이터와
  집행 같은 공통 연결을 이어받고, 최종 일관성은 기존 변경 함수가 검사한다.
- **활동·성과 검토**: 대화 메모, 성과 검토, 실제 채택한 방향을 원래 대상의 활동 이력에
  추가한다. 제안과 채택을 선택해서 기록하며 수치로 다음 방향을 자동 판정하지 않는다.
- **추적 링크**: 연결된 콘텐츠에서 기존 `issue_link`를 호출하고 고정 URL을 복사한다.
- **연락 준비**: 등록된 이메일과 active 이메일 템플릿을 골라 정확한 제목·본문을 준비한다.
  저장은 `ready_for_review`까지만 만든다. 별도 발송본 검토에서 승인해야 예약된다.
  발송 전 승인된 건도 기존 RPC가 허용하는 상태에서는 수정 요청/제외할 수 있다.
- **보관과 복구**: 기본 목록에서 숨기고 복구할 수 있다. 금전 의무가 있는 비용의 보관은
  기존 DB 검증이 거절한다. 원본 이력을 삭제하지 않는다.
- **작업 유지**: 미저장 변경 중 다른 기록/탭으로 넘어가는 것을 막고, 닫을 때 버림 여부를
  확인한다. 다른 팀원과 충돌하면 초안을 유지한 채 최신 기록을 다시 읽을 수 있다.

새 계약도 웹의 `POST /api/internal/gtm`과 Agent의 `gtm_workspace` 양쪽에서 같다.
시트가 없는 보조 원장도 등록된 `source`를 지정해 접근한다. 외부 계약은 `gtm_workspace` 하나이며 내부 변경 함수는 직접 노출하지 않는다.

| action | data | 용도 |
| --- | --- | --- |
| `get_record` | `source`, `record_id` | 최신 원본, 필드, 하위 항목 계약, 연결 관계, 실행 가능 작업 |
| `related_records` | 위 값 + `target_source`, `key`, 선택적으로 `offset`, `limit` | 실제 FK로 연결된 기록 |
| `activity_history` | `source`, `record_id`, 선택적으로 `offset`, `limit` | 해당 대상의 활동 원문과 근거 |
| `save_record` | `source` 또는 기존 `sheet_id`, `values`, `request_id`, 수정 시 `record_id`, `expected_version` | 원본 생성·수정 |
| `patch_items` | `source`, `record_id`, `expected_version`, `request_id`, `field`, `items` | 연락처·할 일·파일·지급·배분의 ID 기반 변경 |
| `issue_link` | 위 식별·버전·요청 값 + `values` | 기존 UTM 계약으로 링크 발급 |
| `log_activity` | `source`, `record_id`, `request_id`, `body`, 선택적으로 `source_ref`, `kind`, `direction` | 메모, `performance_review`, `review_adopted` |
| `archive_record`, `restore_record` | `source`, `record_id`, `expected_version`, `request_id` | 보관·복구 |
| `prepare_outreach` | `source: creators`, `record_id`, `template_id`, `recipient_email`, `subject`, `body`, `selection_reason`, `request_id` | 발송하지 않고 검토용 초안 생성 |

추가 마이그레이션은 `20260921123000_gtm_operations.sql`이며 workspace 마이그레이션 다음에
적용한다. 두 파일 모두 2026-09-21 운영 DB에 적용했다. 격리 테스트는 두 파일을 순서대로
로드하고 합성 데이터만 사용한다.

이 화면이 자동 조사·콘텐츠 생성·플랫폼 통계 수집·게시·송금까지 수행하는 것은 아니다.
팀원은 연결된 기록에서 준비·검토·기록·후속 업무를 처리하고, Agent는 같은 API와 기존
작업 지침을 사용한다. 별도 외부 실행의 연결 상태와 권한은 기존 운영 계약을 따른다.

후속 개선 검증: 두 마이그레이션과 실제 기존 GTM 함수를 함께 실행한 격리 DB 검증
77개, 그리드 단위 테스트 4개, GTM 범위 TypeScript/ESLint가 통과했다. 브라우저에서는
연락처 등록 → 연결 협업 생성 → 할 일 추가 → 할 일 보기에서 완료, 성과 방향 기록 →
연락 초안 준비 → 정확한 발송본 검토 → 수정 요청을 확인했다. 다른 팀원의 선행 수정을
만들어 충돌을 발생시키고, 초안을 유지한 최신 값 비교와 재저장도 확인했다. 모든 업무
쓰기는 합성 데이터가 있는 로컬 격리 DB에만 수행했고 실제 이메일/송금/게시를 하지 않았다.

운영 연결 확인: Supabase plugin 세션으로 `gtm_workspace`의 catalog와 18개 시트 query를
모두 조회했다. 등록 원본은 21개, 시트는 18개이며 Creator Directory는 430건이었다.
기존 내부 계정으로 로그인된 실제 브라우저에서도 로컬 화면의 시트와 데이터가 표시된다.

## 크리에이터 대화와 메일 (2026-09-21)

Creator Directory의 이름을 누르면 오른쪽 패널이 열린다. `대화 · 메일`에서는 실제 발송과
수신 기록만 보여주며, 아직 보내지 않은 초안은 별도로 표시한다. `콘텐츠`는 같은 크리에이터의
콘텐츠 원장을 조회한다. `?creator=<UUID>` 링크로 대화를 바로 열 수 있다.

메일은 Editable Documents에서 사용하던 Tiptap `MarkdownRichTextEditor`를 HTML 모드로
재사용한다. 굵게·밑줄·기울임·제목·목록·링크를 편집할 수 있고, 기존 문서 편집의 Markdown
기본값은 유지한다. 받은 원문은 텍스트로, 보낸 HTML은 script와 외부 리소스를 차단한 iframe으로
표시한다. 첨부파일, CC/BCC는 현재 메일 작성 범위에 없다.

- `메일 작성` → 수신자·제목·본문 작성 → `발송 검토`는 초안만 저장한다.
- `승인하고 발송`은 그 dispatch 한 건만 즉시 Resend에 전달하고 실제 저장된 결과를 보여준다.
  미래 시각이면 예약으로 남긴다. Provider 오류를 예약 성공으로 표시하지 않는다.
- `답장`은 선택한 실제 메일의 RFC Message-ID를 서버에서 확인하고 In-Reply-To/References를
  연결한다. 다른 크리에이터의 메일을 참조할 수 없고 현재 유효한 등록 이메일에만 보낸다.
- 승인 후 발송을 시도한 메일은 동일 idempotency key로만 재시도한다. 내용 변경은 새 초안으로
  작성해야 한다. 최초 시도 후 23시간이 지나도 결과가 불명확한 건은 자동 재발송을 멈춘다.
- Resend가 수락한 뒤 Message-ID 조회에 실패해도 발송 실패로 바꾸지 않는다. 별도 복구가
  실제 RFC ID를 채운다. Resend email ID와 Gmail thread ID를 섞어 저장하지 않는다.
- Gmail Pub/Sub의 숫자 historyId를 지원한다. 수신 수집과 Slack 알림 재시도를 분리하며,
  메일함 단위 lease와 알림 영수증으로 동시 실행·완료된 알림의 재전송을 억제한다.
  실제 RFC Message-ID가 아직 준비되지 않았으면 cursor를 진행하지 않아 빠른 답장을 잃지 않는다.
- Gmail DSN과 Resend의 `email.bounced`, `email.delivery_delayed`, `email.failed`,
  `email.complained`를 같은 발송 원장에 연결한다. 영구 반송은 연락처를 `bounced`, 스팸
  신고는 `revoked` 및 do-not-contact로 바꾸며 Slack 링크는 해당 크리에이터 패널을 연다.
  Resend webhook 구독 변경은 이 route가 배포된 뒤에만 실행한다.

| action | data | 범위 |
| --- | --- | --- |
| `creator_conversation` | `record_id`, 선택적으로 `offset`, `limit` | 웹/Agent 공통 실제 대화와 미발송 초안 |
| `prepare_email` | `record_id`, `recipient_email`, `subject`, `body`, `request_id`, 선택적으로 `reply_to_activity_id` | 웹/Agent 공통, 발송 없는 직접 작성 |
| `sync_mail` | `{}` | 내부 인증된 웹 API만; Gmail 동기화와 미완료 Slack 재시도 |

Agent의 RPC 승인은 DB 예약을 만들며 기존 승인 발송 endpoint/cron이 실행한다. 웹의 승인
API는 즉시 발송 helper까지 호출한다. 외부 발송·Slack은 서버 자격 증명을 사용한다.

세 번째 migration `20260921150000_gtm_creator_mail.sql`, 전달 실패 복구 migration
`20260921160000_gtm_outreach_delivery_recovery.sql`, Resend 전달 이벤트 migration
`20260921163000_gtm_resend_delivery_events.sql`, Gmail·Resend 내부 활동 보호 migration
`20260921164000_gtm_delivery_activity_guard.sql`을 운영 DB에 적용했다.
운영 조사에서 잘못 분류된 Resend 발송 4건의 실제 식별자를 확인해 복구했고, Gmail 원본과
발송 RFC ID가 일치한 누락 답장 1건을 기존 수신 RPC로 복구하고 Slack 알림 영수증을 기록했다.
기존 Gmail 연결을 통한 로컬 `메일 동기화`도 성공했다.

**웹/수신 코드는 2026-09-21 운영 배포했다.** 숫자 Gmail historyId 처리와 새 자동 복구
경로가 운영에서 활성화됐다. Resend webhook은 기존 수신·열람 이벤트를 유지하면서 지연·반송·
실패·스팸 신고 이벤트를 추가했다. 배포 뒤 Gmail watch를 갱신하고 신규 처리·알림 대기 건이
없음을 확인했다. 로컬 개발은 운영 watch endpoint를 `GTM_OUTREACH_REMOTE_SYNC_URL`로
사용할 수 있으며 운영 Gmail private key를 로컬로 복사하지 않는다.

검증: 격리 DB 103개 검사, 현재 운영 스키마 대상 트랜잭션 통합 검증 36개, 메일/그리드
단위·모의 전송 21개와 GTM 범위 ESLint가 통과했다. Next production build는 컴파일을
통과했고 전체 저장소 TypeScript 단계는 무관한 기존 evaluation fixture 오류에서 중단됐다. 실제 브라우저에서
오른쪽 패널, 복구된 대화, 콘텐츠 탭, 굵게·밑줄·제목 HTML, 실제 메일 동기화를 확인했다.
테스트용 외부 메일은 보내지 않았다. 수신자 메일 앱의 최종 렌더링까지 새 전송으로 검증한
것은 아니며, 복구 Slack 알림 1건은 실제 채널에 전송했다.
그 복구 알림 외에 운영 업무 레코드를 수정하거나 추가 외부 메시지를 보내지 않았다.
