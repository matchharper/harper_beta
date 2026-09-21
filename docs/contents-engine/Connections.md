# Connections.md

버전: 2.0 · 적용일: 2026-09-21 · 상태: Supabase 원장과 인증 전환 DB 적용 완료. `/ops/gtm`, Resend 발송, Gmail 회신, Slack 알림 코드는 검증 완료 후 배포 전 · 관리: 데이터 연결 담당

## 팀원을 위한 한눈에 보기

팀원은 `@matchharper.com` 계정으로 `/ops/gtm`을 사용한다. Codex와 Claude Code는 이미 연결된 Supabase plugin으로 같은 `gtm_workspace` 계약을 호출한다. 추가 인증 파일이나 별도 연결 설정은 필요 없다. Agent는 후보 조사·선정·초안·기록을 처리할 수 있고, 실제 이메일은 팀원이 Outreach Review에서 최종 확인한 뒤 발송한다.

## 연결 상태

| 연결 | 현재 범위 | 미설정/경계 |
| --- | --- | --- |
| Supabase 원장 | GTM 업무 원장, 화면 정의, 행 버전, 중복 방지, 감사 기록, UTM, 제품 집계 | 임의 SQL이나 원본 제품 사용자 조회를 GTM 업무 계약으로 간주하지 않음 |
| `/ops/gtm` | 셀 편집, 컬럼 구성, 필터·정렬·색상, 기록 상세, 대화·콘텐츠, 메일 작성·검토 | 웹 코드는 아직 배포 전 |
| Agent + Supabase plugin | `gtm_workspace(action, data)`를 통한 조회·변경·일괄 업무 | plugin은 프로젝트 권한이 넓으므로 GTM 업무에서는 workspace 함수만 사용 |
| Notion | Contents Engine 진입점과 작업별 운영 지침 | 비밀값이나 개인 사용자 데이터 저장 장소가 아님 |
| 크리에이터 조사 | Agent가 접근 가능한 공개 출처와 제공 자료를 조사해 원장에 저장 | 전 플랫폼 전수 발굴 API는 없음 |
| 이메일 | 초안, 팀원 검토, Resend 발송, Gmail 회신 저장, Slack 알림, 반송·실패 억제 | 새 웹·수신 코드는 배포 전. DM 자동화는 없음 |
| 플랫폼 통계 | 공개 자료·제출 통계의 관측값 저장 | YouTube/Meta/TikTok 전용 인증 수집은 없음 |
| 지급 | 비용·증빙·지급/환불 내역 대사 | 실제 송금은 없음 |

## 인증

웹과 Agent에 별도 GTM 인증 체계를 두지 않는다.

- `/ops/gtm`은 기존 Supabase 사용자 세션을 사용하고, DB에서 확인된 `@matchharper.com` 팀원만 허용한다.
- Codex와 Claude Code는 연결된 Supabase plugin의 신뢰된 프로젝트 세션을 사용한다.
- 서버의 메일 발송·수신·Slack 작업은 기존 service role, `CRON_SECRET`, provider 자격 증명을 사용한다.
- 팀원과 Agent용 인증은 기존 Supabase 연결 하나로 통합한다.
- 서비스 역할 키나 DB 비밀번호를 프롬프트, Notion, 셀, 코드 예시에 복사하지 않는다.

Supabase plugin으로 실행한 GTM 변경은 DB 감사 기록에서 `supabase-plugin`으로 표시된다. `/ops/gtm`에서 수행한 변경은 로그인한 팀원의 이메일로 표시된다. Agent별 세부 주체가 필요하면 Supabase 연결의 실행 주체를 감사 로그와 연결한다.

## Agent API

외부 계약은 `public.gtm_workspace(p_action text, p_data jsonb)` 하나다. Agent는 Supabase plugin의 SQL 실행 기능으로 호출한다.

```sql
select public.gtm_workspace('catalog', '{}'::jsonb);

select public.gtm_workspace(
  'query',
  '{"sheet_id":"실제 catalog에서 읽은 UUID","limit":100,"offset":0}'::jsonb
);
```

Agent는 실제 `catalog` 응답에서 시트·원본·컬럼·ID를 읽는다. 아래 action을 사용하며 원본 테이블에 직접 insert/update/delete하지 않는다.

| action | 주요 data | 결과 |
| --- | --- | --- |
| `catalog` | `{}` | 시트, 원본, 컬럼, 연결, 쓰기 가능 범위 |
| `query` | `sheet_id`, 선택적으로 `definition`, `search`, `offset`, `limit`, `period` | 필터·정렬된 행과 전체 수 |
| `get_record` | `source`, `record_id` | 최신 원본, 상세 필드, 하위 항목, 연결 기록 |
| `related_records` | 위 값 + `target_source`, `key`, `offset`, `limit` | FK로 연결된 기록 |
| `activity_history` | `source`, `record_id`, `offset`, `limit` | 실제 활동·대화·근거 |
| `save_record` | `source` 또는 `sheet_id`, `values`, `request_id`, 수정 시 `record_id`, `expected_version` | 생성 또는 부분 수정 |
| `patch_items` | `source`, `record_id`, `expected_version`, `request_id`, `field`, `items` | 연락처·할 일·파일·지급·배분 변경 |
| `issue_link` | 대상 식별·버전·`request_id` + `values` | 고정 UTM 링크 |
| `log_activity` | 대상 식별, `body`, `request_id`, 선택적으로 `kind`, `direction`, `source_ref` | 메모·성과 검토·채택 방향 |
| `archive_record` / `restore_record` | 대상 식별, `expected_version`, `request_id` | 보관·복구 |
| `prepare_outreach` | creator, template, 수신자, 제목, 본문, 선택 근거, `request_id` | 발송하지 않는 검토용 초안 |
| `prepare_email` | creator, 수신자, 제목, 본문, `request_id`, 선택적으로 답장 대상 | 발송하지 않는 직접 작성 |
| `creator_conversation` | creator, `offset`, `limit` | 실제 발신·수신 대화와 미발송 초안 |
| `review_outreach` | dispatch, 버전, 결정, 최종 제목·본문·시각, `request_id` | 검토 결과와 발송 예약 |
| `compensation_estimate` | strategy와 creator IDs | 현재 근거 기반 비용 추정 |
| `recommend_compensation_strategy` | strategy와 이유 | 채택할 가격 전략 기록 |
| `apply_compensation_strategy` | strategy와 dispatch IDs | 검토 대상에 전략 적용 |

새 요청에는 새 UUID `request_id`를 쓴다. 불명확한 재시도에는 같은 request ID와 같은 입력을 유지한다. 수정은 조회한 `row_version`을 `expected_version`으로 전달한다. 충돌하면 최신 값을 읽고 실제 변경을 다시 판단한다. 성공 응답의 record를 다시 확인한다.

## 이메일 Outreach 연결

수신자가 보는 주소는 `harper@matchharper.com`, Gmail API가 읽는 실제 메일함은 `daniel@matchharper.com`이다. Agent의 초안 작성은 발송 권한이 아니다. 팀원의 최종 승인은 `/ops/gtm`의 Outreach Review에서 이루어지며, 서버가 연락처·do-not-contact·행 버전·중복 발송을 다시 확인한 뒤 Resend로 보낸다.

Gmail push는 인증된 Pub/Sub 호출만 받는다. Gmail message/thread/reply header와 원래 수신 주소가 일치하는 발송에만 회신을 연결한다. 같은 Gmail message ID와 Slack 알림은 한 번만 기록한다. Resend 전달 실패·반송·스팸 신고도 같은 발송 원장에 연결한다. 상세 설정은 [email-outreach-deployment.md](email-outreach-deployment.md)를 따른다.

## 복구

- `/ops/gtm` 401/403: 팀원의 로그인 상태와 `@matchharper.com` 계정을 확인한다.
- Supabase plugin 호출 실패: 올바른 Harper Supabase project 연결과 `gtm_workspace(text,jsonb)` 존재 여부를 확인한다.
- `40001`: 최신 행과 차이를 읽고 새 request ID로 재적용한다.
- 응답을 받지 못한 쓰기: 같은 request ID·같은 본문으로 결과를 확인하거나 재시도한다.
- 메일 발송 결과 불명확: dispatch와 provider 결과를 먼저 대조하며 새 발송을 만들지 않는다.

## 변경 이력

| 날짜 | 버전 | 주요 변경 |
| --- | --- | --- |
| 2026-09-21 | 2.0 | 팀원 Supabase 로그인과 Agent Supabase plugin으로 인증을 통합 |
| 2026-09-21 | 1.9 | GTM 웹, Resend 발송, Gmail 회신, Slack 알림과 전달 실패 복구 계약 추가 |
