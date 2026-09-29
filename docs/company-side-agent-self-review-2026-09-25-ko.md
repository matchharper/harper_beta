# Company-side Agent 자체 리뷰와 보완

기준: 2026-09-25 KST. `codex/company-agent-capabilities`의 미커밋 구현을 리뷰했다.
사용자 요청에 따라 **대화 시나리오 evaluation과 실제 후보자 발송은 실행하지 않았다.**
DB migration만 명시적 승인으로 적용했으며 앱·Worker 배포, push, 서비스 재시작은 하지 않았다.

## 판단

방향은 유지한다. 짧은 기능 개요는 항상 제공하고 상세 policy/schema는 함께 지연 로딩한다.
연락은 내용에 관계없이 `contact_talent` 하나로 처리하며, 명확하게 맡긴 일은 바로 보내고
문구 검토를 요청했을 때만 초안 승인을 거친다. 별도 분류 모델·후속 연락 전용 도구·판단 테이블은 필요하지 않다.

다만 앞선 구현은 실제 실행부보다 합성 도구를 사용한 대화 검증에 근거가 치우쳐 있었다.
지연 로딩 구조가 작동한다는 것과 실제 연락의 재시도·공유 경계가 안전하다는 것은 별도 문제다.
또한 지침을 기능별 파일로 옮겨도 공통 설명에 상세 절차가 남으면 중복과 장황함은 남는다.
현재 구현을 대화 품질까지 검증된 배포 완료본으로 보지 않는다.

## 확인한 결함과 수정

| 문제 | 수정 | 확인 방법 |
| --- | --- | --- |
| DB의 blocking-contact 조회가 queued/failed 연락에도 초안 본문·revision을 반환해 executor가 초안으로 재표시할 수 있었다 | 실제 draft에서만 초안 필드를 반환한다 | 실제 reader를 호출하는 상태별 단위 검사 |
| 같은 요청 재시도에서 기존 연락 충돌 처리와 문구 생성이 DB idempotency보다 먼저 실행됐다 | workspace·role·talent·원본 메시지로 기존 결과를 먼저 찾는다. 저장된 본문/상태를 돌려주며 다시 생성하거나 보내지 않는다. 동시 요청은 DB 원자적 검사를 유지한다 | 실제 executor에서 DB read만 허용하고 재생성·발송·초안 표시가 없는지 검사 |
| 새 연락 권한 함수에서 `closed + like`만으로 과거 회사 공유를 추정할 수 있었다 | 실제 전달 또는 회사 단계 변경 이력을 요구한다. 이미 전달된 정상 연락의 관계는 유지한다 | 실제 SQL을 실행해 공유 없는 종료와 확인된 관계를 구분 |
| 격리 DB의 unique index가 운영 DB와 일부 달랐다 | source-message/target, queue/request/type, 미해결 연락 index를 운영 계약에 맞췄다 | 운영 schema read-only 확인 + 격리 SQL 재검사 |
| 후보자 전달 내용이 native assistant 메시지에 그대로 섞일 수 있었다 | 원문과 relay 참조를 보존한 명시적 후보자 연락 자료로 감싼다. 실제 회사 지시·Harper 자신의 주장과 구분한다 | 입력 조립 단위 검사 |
| 공통 서비스 설명과 상세 연결 정책이 겹쳤다. 역할 인계 안내에는 꼭 설명할 항목이 과도하게 많았다 | 공통 설명은 두 경로의 의미만 유지하고 상세 절차는 capability policy에 둔다. 인계는 정확한 링크와 필요한 다음 행동 중심으로 정리한다 | prompt 조립 계약 검사. 실제 문체 개선은 아직 미평가 |

새 source-result 조회는 같은 원본 메시지·같은 role·같은 talent에 대한 기존 작업의 복구다.
다른 지시나 다른 대상의 연락을 의미 유사도로 합치지 않는다. 기존 draft/failed/cancelled는
발송 성공으로 바꾸지 않으며, 수정·재시도는 원래 도구 계약으로 처리한다.

## DB 적용 기록

- 프로젝트: Harper (`zzojrniuppueizhnmqfd`). 로컬 custom auth domain의 CNAME으로 대상 일치를 확인했다.
- 적용 migration: `20260924151548_company_contact_direct_delivery.sql`.
  원격 적용 이력의 version과 로컬 파일명을 맞췄다. 이전 개발 파일명은 `20260924142420_…`였다.
- 기존 연락/전달 테이블을 사용한다. 테이블 추가, 데이터 backfill, 테스트 데이터 삽입, 실제 연락 발송은 없다.
- 적용 전 실제 함수·index·constraint·trigger를 확인했다. 변경 전후 조건을 미완료 연락 4건에
  읽기 전용으로 대입했으며 새로 차단되거나 허용되는 건은 0건이었다.
- 적용 후 함수 5개 전체의 저장된 SQL 본문이 migration과 정확히 일치함을 확인했다.
  `anon`/`authenticated` 실행 불가, `service_role` 실행 가능을 확인했다.
- Supabase security/performance advisor의 반환 항목·개수는 적용 전후 같았다.
  기존 search_path, 공개 definer 함수, RLS 성능 등 경고를 이번 작업이 해결했다는 뜻은 아니다.
  [Supabase database linter](https://supabase.com/docs/guides/database/database-linter) 참조.

DB 기능은 적용됐지만 **새 company-side 앱 구현은 미배포**다.
DB 반영을 근거로 새 Gemini 대화·지연 로딩·회사 연락 UX가 운영에 출시됐다고 표현하지 않는다.
팀용 Notion에 미배포 앱 동작을 출시된 기능으로 기재하지 않았다.

## 검증 결과와 남은 범위

- 관련 단위 테스트 **139개 통과**: 기존 관련 134개에 입력 경계·실제 executor 재시도·연락 상태 reader 5개 추가.
- `scripts/testCompanyContactDirectDelivery.mjs`: PGlite 격리 PostgreSQL 검사 통과.
  준비 중/미전달 제안 차단, 원자적 등록, 같은 원본 중복 방지, 수락 전 회신,
  문서 소유권/공개 여부, testOnly allowlist, 종료·삭제·후보자 거절 태그 경계를 확인했다.
- `git diff --check` 통과.
- 전체 TypeScript 검사는 기존 오류로 실패했다: 생성된 Next validator의 삭제 페이지 참조,
  ignored private 검증 파일의 Supabase RPC 타입, 기존 `growthTalentGtmReport.test.ts` 타입 오류.
  이번 수정 파일의 오류는 출력되지 않았지만 전체 typecheck 성공으로 보고하지 않는다.
- **대화 시나리오 평가 0회, 실 모델 실험 0회.** 이번 prompt 수정이 실제 응답을 더 자연스럽게
  만들거나 선제적 제안 실패를 해결했다는 결론은 유보한다. 앞선 평가의 실패 기록은 유지한다.
- 실제 이메일·Slack 전달, 전체 Role 생성, 실제 PostgreSQL 다중 연결 경쟁 실행은 이번에 검증하지 않았다.
  격리 SQL 검사는 운영 전체 schema·transport E2E의 대체물이 아니다.

다음 품질 검증에서는 새 규칙을 더 붙이기보다, 같은 동결 입력에서 기존 실패가 실제로 줄었는지 확인해야 한다.
이번 작업에는 그 평가를 포함하지 않는다.
