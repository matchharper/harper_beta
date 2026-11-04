# 회사 랜딩 통계

상태: 2026-11-01 운영 DB 반영 완료, 웹 미배포. 운영 migration은 `20261101043117`이며 로컬 정본은 `20261101042259_company_landing_daily_snapshot.sql`이다. 아래 스냅샷 조회·고정 표시 계약은 후속 웹 배포 시 적용된다. 현재 운영 웹의 기존 5분 집계·숫자 증가 표시는 그대로다.

운영의 `current` 스냅샷 초기화, 함수 본문 정본 일치, RLS·읽기 전용 서버 권한, 공개 계정의 읽기·함수 실행 차단을 확인했다. `cron.job.jobid = 2`가 활성 상태이며 한국 시간 매일 오전 5시에 갱신한다. 같은 migration을 재적용하거나 초기 집계를 다시 실행하지 않는다.

회사 페이지와 홈 랜딩 B그룹은 `/api/company/landing-stats`에서 같은 중앙 스냅샷을 읽는다. 숫자를 코드에 하드코딩하거나 개인별 데이터를 반환하지 않는다.

| 화면 지표 | 원본과 집계 기준 |
| --- | --- |
| Harper와 직접 이야기 나눈 인재 | 요청한 기준에 따라 `talent_users` 전체 행 수. 대화 여부와 탈퇴 여부로 필터링하지 않는다. 따라서 실제 대화 참여자 수와는 다르며, 화면의 보충 설명은 ‘전체 등록 인재 기준’이다. |
| 한 명과 주고받은 평균 메시지 | `talent_setting.is_onboarding_done = true`인 온보딩 완료자 중 채팅·음성에서 양쪽 발화가 모두 있는 인재만 집계한다. 해당 인재의 전체 `talent_messages` 기록에서 `chat`, `call_transcript`의 비어 있지 않은 user/assistant 메시지와 user의 `opportunity_feedback_note` 공고 피드백을 건당 1개씩 센다. 온보딩 중의 대화도 포함하며, 인재별 합계의 평균을 정수로 반올림한다. 미완료·완료 여부 없음·피드백만 남긴 계정은 분모에서 제외한다. 시스템 알림, 추천 알림, 이메일 등 다른 종류는 제외한다. 대상자가 없으면 평균은 null이다. |
| 인재와 포지션을 맞춰본 횟수 | `talent_external_fit`의 `(talent_id, role_id)`와 `talent_opportunity_fit`의 `(talent_id, opportunity_id)`를 합친 고유 조합 수. 각 테이블의 기존 unique index를 이용하며, 두 테이블에 함께 있으면 한 번만 센다. `company_roles.information.testOnly = true`인 내부 테스트 포지션은 제외한다. |

대화 시간은 메시지 사이의 대기 시간을 실제 대화 시간과 구분할 수 없어 사용하지 않는다. 매칭 지표는 추천·연결 성공 건수나 재평가를 포함한 총 실행 횟수가 아니라, 현재 저장된 평가 조합 수다. 원본 기록이 삭제되면 집계값도 줄어들 수 있다.

## 중앙 저장과 일일 갱신

- 정본은 `public.company_landing_stats`의 `name = 'current'` 한 행이다. `talent_count`, `average_conversation_messages`, `assessed_pair_count`, `updated_at`을 저장한다.
- `public.refresh_company_landing_stats()`가 위와 같은 원본 집계를 계산하고 한 SQL 문장에서 스냅샷을 교체한다. 계산 실패 시 마지막 성공값과 집계 시각이 유지된다.
- 기존 Supabase `pg_cron`의 `company-landing-stats-daily` 작업이 하루 한 번 실행한다. 운영에서 확인한 cron timezone은 GMT이며 `0 20 * * *`는 한국 시간 매일 오전 5시다.
- migration은 실제 집계로 초기 스냅샷을 만든 뒤 작업을 등록한다. 운영 전환 시 migration을 먼저 적용하고 웹을 배포한다. 로컬 파일을 작성한 것만으로 운영 갱신이 시작되지는 않는다.
- 방문자 API는 저장된 한 행만 조회한다. 스냅샷이 없거나 읽기에 실패하면 503을 반환하며, 방문자 요청으로 원본 집계를 실행하지 않는다.
- API 응답은 집계 숫자 세 개와 집계 시각만 포함한다. CDN 캐시는 60초이고 브라우저 HTTP 캐시는 재검증한다. 중앙 값을 바꾸면 캐시를 거쳐 다음 조회에 반영된다.
- 브라우저는 페이지를 열거나 캐시가 오래된 상태에서 다시 포커스할 때 조회한다. 별도 주기 polling, 초당 증가율, 시간에 따른 숫자 증가 및 숫자 애니메이션은 없다.
- 기존 Career 포지션 조회와 같은 서버 DB 연결 설정을 재사용한다. 서버는 조회만 하며 별도의 Data Cache 일일 집계 경로는 없다.
- 테이블은 RLS를 사용하고 anon/authenticated 접근을 차단한다. `service_role`에는 SELECT만 허용한다. 갱신 함수는 DB 작업 소유자만 실행하며 공개 API에서 호출하지 않는다.

## 중앙 값 수동 관리

Supabase Table Editor에서 `company_landing_stats`의 `current` 행을 수정한다. 필요하면 집계 시각도 함께 수정한다. 이 값은 모든 방문자와 언어가 공유하고 다음 일일 갱신이 성공할 때 실제 집계값으로 바뀐다. 빈 값이나 갱신 실패를 0·예시 숫자로 대체하지 않는다.

## 확인

집계 SQL과 초기화·예약 작업은 `supabase/migrations/20261101042259_company_landing_daily_snapshot.sql`에 있다. 공개 reader는 `src/lib/companyLandingStats.server.ts`에서 스냅샷만 읽는다.

`scripts/testCompanyLandingStats.mjs`는 로컬 PGlite의 합성 데이터에 migration과 실제 reader를 실행한다. 초기화, 기존 인구·메시지 집계 정의, pair 중복 및 test-only 제외, 원본 변경 뒤 값 고정, 다음 갱신 반영, 실패 시 이전 스냅샷 보존, 수동 수정, 공개 계정의 읽기·실행 차단을 확인한다. PGlite에는 background scheduler가 없어 cron 등록을 기록하는 작은 대역을 사용하고 저장된 작업 명령을 직접 실행한다. 실제 예약 시각의 운영 실행은 배포 후 `cron.job_run_details`로 별도 확인한다.

```sh
node --import tsx scripts/testCompanyLandingStats.mjs
```

PGlite가 별도 로컬 runtime에 설치됐다면 `PGLITE_MODULE_PATH`에 해당 `dist/index.js` 경로를 지정한다.
