# Harper Beta 보안 리스크 리뷰

작성일: 2026-06-01  
대상: `harper_beta` Next.js/Supabase 애플리케이션 전반, 특히 `career` 로그인/온보딩/채팅/관리자/결제 흐름  
검토 방식: 정적 코드 리뷰, 라우트 인증 경계 추적, Supabase server/client 사용 패턴 확인, 파일 업로드/외부 fetch/LLM 프록시 점검, `pnpm audit --prod`, Supabase CLI/API 직접 확인, career 로그인/워크스페이스 브라우저 동작 확인

## 요약

1차 리뷰 이후 Supabase 실제 프로젝트 설정과 API를 추가로 확인했다. 가장 먼저 고쳐야 하는 문제는 다음이다.

1. Supabase `public.execute_raw_sql` / `public.set_timeout_and_execute_raw_sql` RPC가 `anon` role에 열려 있고, anon key만으로 임의 `SELECT` SQL 실행이 검증됐다.
2. Supabase Storage `storage.objects` 정책이 `anon`에게 `SELECT`, `INSERT`, `UPDATE`, `DELETE`를 사실상 전체 허용하고 있다. private bucket list와 `talent-network-cv` probe object upload/download/delete가 anon key만으로 가능했다.
3. `public` schema 106개 테이블 중 10개가 RLS disabled이며, 결제/ATS/내부 talent 관련 테이블이 anon REST로 count/read 가능했다.
4. 관리자 비밀번호가 클라이언트 번들에 하드코딩되어 있고, 서버의 `/api/admin/*`도 그 비밀번호 헤더만 확인한다.
5. Toss 결제/구독 변경/구독 취소 API가 로그인 사용자를 검증하지 않고 body의 `userId`를 신뢰한다.
6. `getRequestUser()`에 서명 검증 없는 JWT payload fallback이 있어 설정 하나로 전체 인증/내부 권한 체계가 우회될 수 있다.
7. `career dev-sql`은 내부 사용자에게 직접 SQL 실행 권한을 열어두며, 현재 validator는 실제 row-level 제한을 보장하지 못한다.

이 항목들은 데이터 유출, 타인 계정 조작, 저장된 결제수단 과금, 파일 삭제/변조, 운영 DB 훼손으로 이어질 수 있으므로 배포 전에 우선 차단해야 한다.

추가로 career 페이지를 실제 사용자가 보는 관점에서 재점검한 결과, `mail`/`email_onboarding` 쿼리 파라미터가 로그인, OAuth redirect, `/career` 탭 이동, analytics pageview까지 계속 전파되는 문제가 가장 눈에 띈다. 사용자가 주소창, 브라우저 히스토리, 개발자도구 Network/Console, 화면 캡처에서 자기 이메일이나 긴 토큰을 보면 Supabase URL 노출보다 더 직접적인 개인정보 노출로 느낄 가능성이 높다. 약관/개인정보 링크 부재, 이력서 storage path 노출, 통화 녹음/전사 안내 부족, 랜딩 로그의 raw email 저장도 같은 사용자 신뢰 리스크다.

## 검토 범위와 한계

확인한 주요 경로:

- 인증/세션: `src/lib/supabase.ts`, `src/lib/supabaseServer.ts`, `src/store/useAuthStore.ts`, `src/hooks/career/useCareerAuth.ts`
- Career API: `src/app/api/talent/**`, `src/lib/talentOnboarding/**`, `src/lib/career/**`
- 관리자 API/UI: `src/lib/admin.ts`, `src/components/admin/AdminAccessGuard.tsx`, `src/app/api/admin/**`, `src/pages/admin/**`
- 결제/크레딧 API: `src/app/api/toss/**`, `src/app/api/credits/**`, `src/lib/billing/**`
- 파일 업로드/외부 fetch/LLM 프록시: `src/app/api/talent/resume/**`, `src/app/api/tool/**`, `src/app/api/pdf/route.ts`, `src/app/api/llm/route.ts`, `src/app/api/linkpreview/route.ts`
- Supabase migration 일부: `supabase/migrations/**`
- Supabase 실제 설정/API:
  - `supabase projects list`
  - `supabase db lint --linked --schema public,storage,auth`
  - `supabase inspect db table-record-counts --linked`
  - `supabase ssl-enforcement get --experimental`
  - `supabase network-restrictions get --experimental`
  - Supabase Management API `/v1/projects/{ref}/config/auth`
  - Supabase Auth `/auth/v1/settings`
  - Supabase Storage `/storage/v1/bucket`, `/storage/v1/object/list/*`
  - Supabase PostgREST `/rest/v1/*`
  - 공개 RPC `/rest/v1/rpc/execute_raw_sql`

한계:

- Supabase Auth 설정은 Management API와 `/auth/v1/settings`로 확인했다. 대시보드 UI를 눈으로 클릭해 확인한 것은 아니지만, dashboard와 같은 project config API를 조회했다.
- Vercel/production 환경변수 값은 별도 Vercel 대시보드 기준으로 확인하지 않았다.
- Storage 테스트는 새 probe object 하나만 업로드/다운로드/삭제했고 기존 사용자 파일은 열람하거나 삭제하지 않았다.
- PostgREST 테스트는 count/header 또는 metadata 중심으로 수행했고, 개인정보 row payload를 출력하지 않았다.
- 이번 재점검에서는 "직접 검증한 사실"과 "현재 정책상 가능한 것으로 판단되는 위험"을 분리해 표현을 일부 수정했다.

## 실제 Supabase 설정 검증 결과

확인된 프로젝트:

- Linked Supabase project: `Harper`
- Region: South Asia, Mumbai
- GoTrue/Auth service: `v2.189.0`
- Storage API: `v1.58.17`
- Postgres: `17.6.1.054`

공식 기준:

- Supabase RLS 문서는 browser에서 안전하게 접근하려면 exposed schema의 테이블에 RLS를 항상 켜야 한다고 안내한다: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase Storage 문서는 private bucket의 다운로드도 `storage.objects` RLS 정책의 영향을 받는다고 설명한다: <https://supabase.com/docs/guides/storage/buckets/fundamentals>
- Supabase Storage Access Control 문서는 Storage가 `storage.objects` RLS와 함께 동작한다고 설명한다: <https://supabase.com/docs/guides/storage/security/access-control>
- Supabase Auth rate limit 문서는 일부 rate limit이 dashboard/Management API에서 조정 가능하다고 안내한다: <https://supabase.com/docs/guides/auth/rate-limits>
- Supabase password security 문서는 8자 이상, 문자 조합, leaked password protection을 권장한다: <https://supabase.com/docs/guides/auth/password-security>

Auth settings 확인 결과:

- Email auth: enabled
- Google OAuth: enabled
- Signup disabled: false
- Email autoconfirm: false
- Anonymous users: false
- Phone auth: false
- SAML: false
- Passkeys: false
- Site URL: `https://matchharper.com`
- Redirect allow list:
  - `http://localhost:3000`
  - `https://matchharper.com`
  - `https://www.matchharper.com`
  - `https://www.matchharper.com/**`
  - `https://app.matchharper.com/**`
  - `https://harper-beta-19jd.vercel.app/**`
  - 기타 localhost callback
- JWT expiry: 3600초
- Password minimum length: 6
- Password required characters: none
- Leaked password protection: false
- CAPTCHA: false
- Password update reauthentication: false
- Password update current password requirement: false
- Secure email change: true
- Password changed notification email: false
- Auth rate limits:
  - `rate_limit_email_sent`: 500
  - `rate_limit_token_refresh`: 150
  - `rate_limit_verify`: 30
  - `rate_limit_otp`: 30
  - `rate_limit_anonymous_users`: 30
- `Sb-Forwarded-For`: false

해석:

- 이메일 인증은 켜져 있어 `mailer_autoconfirm=false`인 점은 좋다.
- `disable_signup=false`라 누구나 가입 시도 가능하다. public consumer 서비스라면 정상일 수 있지만, abuse/rate limit/bot 방어가 필수다.
- anonymous auth는 꺼져 있지만, 현재 문제는 Supabase `anon` database role이 너무 많은 권한을 갖고 있다는 점이다. anonymous users 기능과 anon key/anon role은 다른 개념이다.
- passkeys/MFA는 켜져 있지 않다. 일반 사용자 필수까지는 아니더라도 admin/internal 계정에는 별도 2FA 정책이 필요하다.
- password policy가 약하다. 최소 길이 6자, 문자 조합 제한 없음, leaked password protection off는 credential stuffing에 약하다.
- CAPTCHA가 꺼져 있고 email send rate limit이 500으로 높다. career email onboarding, signup, password reset spam과 결합될 수 있다.
- password 변경 시 reauthentication/current password 요구가 꺼져 있어 세션 탈취 후 계정 장악 위험이 커진다.
- redirect allow list에 wildcard와 특정 Vercel preview URL이 포함되어 있다. 오래된 preview domain이 계속 허용되면 OAuth redirect 공격면이 넓어진다.
- `Sb-Forwarded-For`가 꺼져 있어 서버 사이드 Auth 호출을 많이 하게 되면 end-user IP 기반 rate limit이 기대대로 작동하지 않을 수 있다.

Network/DB settings 확인 결과:

- SSL enforcement: off
- DB allowed CIDRs: `0.0.0.0/0`
- Network bans: abusive traffic으로 보이는 IP 1개가 이미 ban 목록에 존재

해석:

- DB가 전 세계에서 접속 가능한 상태다. DB password가 유출되거나 취약한 계정이 생기면 바로 직접 접속 경로가 열린다.
- SSL enforcement가 꺼져 있으면 클라이언트 설정 실수 시 암호화되지 않은 DB 연결을 허용할 수 있다.
- public API 취약점과 별개로 DB 접근면도 줄여야 한다.

RLS 실제 상태:

- `public` schema: 총 106개 테이블 중 96개 RLS enabled, 10개 RLS disabled
- `storage` schema: 총 8개 테이블 모두 RLS enabled
- 하지만 `storage.objects` 정책이 과도하게 열려 있어 storage RLS enabled가 실질적 보호로 작동하지 않는다.

RLS disabled public tables:

- `billing_sessions`
- `candid_links_index`
- `candidate_outreach`
- `candidate_outreach_message`
- `candidate_outreach_workspace`
- `company_role_liveness`
- `insight_checklist_items`
- `papers`
- `payment_attempts`
- `talent_internal`

anon REST 접근이 확인된 count:

- `billing_sessions`: 47
- `payment_attempts`: 15
- `talent_internal`: 6
- `candidate_outreach`: 39
- `candidate_outreach_message`: 23
- `candidate_outreach_workspace`: 3
- `papers`: 1,593,982
- `company_role_liveness`: 16,593
- `candid_links_index`: 356,962
- `insight_checklist_items`: 1
- `landing_logs`: 13,776
- `harper_waitlist_company`: 48

Storage bucket 확인 결과:

| bucket | public | file size limit | allowed mime types | 판단 |
|---|---:|---:|---|---|
| `crunchbase` | false | none | none | private이나 global storage policy 때문에 보호 불확실 |
| `talent-network-cv` | false | none | none | private인데 anon list와 probe upload/download/delete 확인됨 |
| `match-workspace-logos` | true | 5MB | png, jpeg, webp, svg | public + SVG 허용 |
| `candidates` | true | none | none | public + 제한 없음 |
| `company_logo` | true | none | none | public + 제한 없음, career profile/logo upload 대상 |
| `files` | true | none | none | public + 제한 없음 |
| `talent-resumes` | false | 20MB | pdf, doc, docx, txt | private이나 anon list 가능 |

Storage object count:

- `candidates`: 192,931
- `company_logo`: 46,208
- `talent-resumes`: 90
- `talent-network-cv`: 8

Storage 직접 호출 확인:

- anon key만으로 `talent-network-cv` private bucket에 probe 파일 업로드 성공
- anon key만으로 같은 probe 파일 다운로드 성공
- anon key만으로 같은 probe 파일 삭제 성공
- anon key만으로 `talent-resumes`, `talent-network-cv`, `candidates`, `company_logo`, `files` bucket list 호출 성공

DB lint 결과:

- `public.reset_org_db_seq`: `"company_db" is not a sequence`
- `public.update_repo_ids`: `grc.repo` column does not exist
- `public.execute_raw_sql`: unused parameter warning
- `storage.search_by_timestamp`: OUT variable warning

해석:

- 깨진 maintenance 함수 자체보다 더 중요한 것은 `execute_raw_sql`이 public RPC로 열려 있다는 점이다.
- DB 함수/정책/마이그레이션이 실제 운영 상태와 repo migration 상태가 어긋나 있다. `supabase migration list`에서도 remote migration과 local migration이 맞지 않는다.

## Critical

### 0. 공개 RPC `execute_raw_sql` / `set_timeout_and_execute_raw_sql`이 anon으로 임의 SQL을 실행함

관련 코드/스키마:

- Generated type: `src/types/database.types.ts:5760`
- 사용 지점: `src/lib/talentOnboarding/jobPostingRecommendations.ts:1620-1776`
- 테스트 endpoint: `/rest/v1/rpc/execute_raw_sql`
- 함수 ACL 확인 결과:
  - `anon=X`
  - `authenticated=X`
  - `service_role=X`
  - `public` execute도 포함
- 함수는 `SECURITY DEFINER`는 아니고 caller role로 실행되지만, `anon` role execute 자체가 허용되어 있다.

검증:

- anon key만으로 아래 RPC 호출이 성공했다.

```sql
select current_user as current_user,
       current_setting('role', true) as role_setting,
       auth.uid() as uid
```

결과:

- `current_user = anon`
- `role_setting = anon`
- `auth.uid() = null`

함수 body:

```sql
final_sql text := format(
  'SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s LIMIT %s OFFSET %s) t',
  sql_query,
  limit_num,
  offset_num
);
EXECUTE final_sql INTO result;
RETURN NEXT result;
```

문제:

- 외부 사용자가 anon key만으로 임의 `SELECT` SQL을 실행할 수 있다.
- PostgREST가 노출하지 않는 `pg_tables`, `pg_policies`, `pg_proc`, `information_schema` 같은 metadata도 이 함수로 조회할 수 있었다.
- RLS가 켜진 테이블은 row access가 제한될 수 있지만, RLS disabled 테이블은 anon role 권한대로 그대로 읽힌다.
- SQL 문자열이 그대로 `%s`에 삽입되므로 SQL parser/allowlist가 없다.
- `set_timeout_and_execute_raw_sql`은 50초 timeout만 추가할 뿐 같은 함수를 호출한다.

영향:

- 공격자가 DB 구조, 정책, 함수 ACL, bucket 정책을 익명으로 수집할 수 있다.
- RLS disabled 테이블과 overly permissive policy 테이블에서 실제 데이터를 읽을 수 있다.
- 무거운 SQL로 DB resource exhaustion을 유발할 수 있다.
- 운영 DB에서 어떤 테이블이 노출되는지 공격자가 반복 탐색할 수 있다.

즉시 조치:

```sql
revoke execute on function public.execute_raw_sql(text, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.set_timeout_and_execute_raw_sql(text, integer, integer, integer) from public, anon, authenticated;
```

그 다음 선택지:

- 가능하면 두 함수를 drop한다.
- 정말 필요하면 exposed schema가 아닌 private schema로 옮긴다.
- worker 전용 DB role에서만 실행되게 하고 PostgREST RPC로 노출하지 않는다.
- `jobPostingRecommendations`는 raw SQL RPC 대신 서버 전용 DB connection 또는 검증된 parameterized RPC로 교체한다.
- SQL 문자열을 LLM/사용자 입력에서 만들지 않는다. 필요한 검색 조건은 typed parameter로 받는다.

### 0-1. Storage policy가 anon에게 전역 권한을 주고 private bucket 접근을 허용함

관련 설정:

- `storage.objects` RLS는 enabled
- 하지만 policies:
  - `all_allow 1bourm8_0`: `INSERT`, roles `anon/authenticated/service_role`, `with_check=true`
  - `all_allow 1bourm8_1`: `SELECT`, roles `anon/authenticated/service_role`, `qual=true`
  - `all_allow 1bourm8_2`: `UPDATE`, roles `anon/authenticated/service_role`, `qual=true`
  - `all_allow 1bourm8_3`: `DELETE`, roles `anon/authenticated/service_role`, `qual=true`
  - `all_allow nnaast_0..3`: `anon/authenticated`에 `SELECT/INSERT/UPDATE/DELETE true`
  - `talent_network_cv_select_any`: `anon/authenticated`에 `bucket_id='talent-network-cv'` select
  - `talent_network_cv_insert_any`: `anon/authenticated`에 `bucket_id='talent-network-cv'` insert

검증:

- anon key만으로 `talent-network-cv` private bucket에 새 probe 파일 업로드 성공
- anon key만으로 같은 probe 파일 다운로드 성공
- anon key만으로 같은 probe 파일 삭제 성공
- anon key만으로 bucket list:
  - `talent-resumes`: allowed
  - `talent-network-cv`: allowed
  - `candidates`: allowed
  - `company_logo`: allowed
  - `files`: allowed, 현재 0개 반환
- 기존 사용자 파일 본문 다운로드/삭제는 수행하지 않았다. 다만 `storage.objects`에 anon 대상 `SELECT/UPDATE/DELETE true` 정책이 있어 path를 알거나 추측할 수 있는 object는 같은 위험권 안에 있다.

문제:

- private bucket 설정이 실질적으로 무력화되어 있다. bucket의 `public=false`만으로 보호되지 않고 `storage.objects` RLS policy가 실제 접근을 결정한다.
- `talent-resumes`에는 실제 resume object 90개가 있고, `talent-network-cv`에는 CV object 8개가 있다.
- `candidates`와 `company_logo`는 public bucket인데 object 수가 매우 많고 bucket-level mime/size 제한이 부족하다.
- anon delete/update가 열려 있어 path를 아는 공격자는 파일 삭제/변조도 시도할 수 있다.

영향:

- 이력서/CV 파일명 목록 노출, path 추측, path-known object 다운로드 가능성.
- public/private bucket 모두 storage spam, malware hosting, defacement, 삭제 위험.
- Career profile photo/logo upload에서 public bucket URL을 반환하므로 XSS/SVG 문제와 결합된다.

즉시 조치:

```sql
drop policy if exists "all_allow 1bourm8_0" on storage.objects;
drop policy if exists "all_allow 1bourm8_1" on storage.objects;
drop policy if exists "all_allow 1bourm8_2" on storage.objects;
drop policy if exists "all_allow 1bourm8_3" on storage.objects;
drop policy if exists "all_allow nnaast_0" on storage.objects;
drop policy if exists "all_allow nnaast_1" on storage.objects;
drop policy if exists "all_allow nnaast_2" on storage.objects;
drop policy if exists "all_allow nnaast_3" on storage.objects;
drop policy if exists "talent_network_cv_select_any" on storage.objects;
drop policy if exists "talent_network_cv_insert_any" on storage.objects;
```

필요 정책 예시:

```sql
create policy "talent_resumes_owner_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'talent-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "talent_resumes_owner_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'talent-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

`talent-network-cv`처럼 비로그인 지원자가 업로드해야 하는 bucket은 다음 중 하나로 바꾼다.

- Next.js API가 service role로 업로드하고 Storage policy는 public insert를 닫는다.
- public direct upload가 꼭 필요하면 short-lived signed upload URL만 발급한다.
- read/download는 절대 anon에 열지 않는다.

### 0-2. RLS disabled public tables가 anon REST로 읽힘

검증:

- `public` schema 106개 테이블 중 10개 RLS disabled.
- 아래 테이블은 anon REST request에서 `Content-Range` count가 반환됐다.

| table | anon count |
|---|---:|
| `billing_sessions` | 47 |
| `payment_attempts` | 15 |
| `talent_internal` | 6 |
| `candidate_outreach` | 39 |
| `candidate_outreach_message` | 23 |
| `candidate_outreach_workspace` | 3 |
| `papers` | 1,593,982 |
| `company_role_liveness` | 16,593 |
| `candid_links_index` | 356,962 |
| `insight_checklist_items` | 1 |

추가로 RLS는 켜져 있지만 permissive public policy 때문에:

- `landing_logs`: anon select count 13,776
- `harper_waitlist_company`: anon select/update/delete 정책 존재, count 48

추가 확인:

- `billing_sessions`, `payment_attempts`, `talent_internal`, `candidate_outreach*`에는 anon 대상 `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` 등 broad grant가 존재했다.
- 이번 점검에서는 데이터 변조를 피하기 위해 mutation 요청은 실행하지 않았다. 하지만 RLS disabled + broad grant 조합은 read 노출을 넘어 write/delete 위험으로 봐야 한다.

문제:

- Supabase는 exposed schema의 테이블에 RLS를 항상 켜야 한다.
- 기본 GRANT가 anon/authenticated에 넓게 들어간 상태에서 RLS가 꺼져 있으면 PostgREST로 바로 노출된다.
- 결제 세션, payment attempts, ATS outreach, internal talent table은 민감도가 높다.

영향:

- 결제/구독 흐름 상태, outreach 메시지, 내부 talent allowlist/ops 데이터, 대량 index 데이터가 외부에 노출될 수 있다.
- RLS disabled 테이블에 `INSERT/UPDATE/DELETE/TRUNCATE` grant까지 존재하는 경우 데이터 변조/삭제 위험도 생긴다.

즉시 조치:

```sql
alter table public.billing_sessions enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.talent_internal enable row level security;
alter table public.candidate_outreach enable row level security;
alter table public.candidate_outreach_message enable row level security;
alter table public.candidate_outreach_workspace enable row level security;
alter table public.papers enable row level security;
alter table public.company_role_liveness enable row level security;
alter table public.candid_links_index enable row level security;
alter table public.insight_checklist_items enable row level security;
```

그리고 exposed schema의 민감 테이블에는 기본적으로:

```sql
revoke all on table public.billing_sessions from anon, authenticated;
revoke all on table public.payment_attempts from anon, authenticated;
```

사용자별 접근이 필요한 테이블만 `authenticated` 전용 owner policy를 추가한다. 서버/worker만 사용하는 테이블은 service role 또는 dedicated worker role만 접근하도록 둔다.

### 1. 관리자 비밀번호가 클라이언트에 노출되고 서버 API도 같은 비밀번호만 믿음

관련 코드:

- `src/lib/admin.ts:1`
- `src/components/admin/AdminAccessGuard.tsx:4`, `src/components/admin/AdminAccessGuard.tsx:28`, `src/components/admin/AdminAccessGuard.tsx:60`
- `src/pages/admin/career.tsx:16`, `src/pages/admin/career.tsx:51-56`, `src/pages/admin/career.tsx:82-87`
- `src/app/api/admin/career/route.ts:128-134`, `src/app/api/admin/career/route.ts:893-904`
- 같은 패턴: `src/app/api/admin/metrics/route.ts`, `src/app/api/admin/user-analytics/route.ts`, `src/app/api/admin/bookmark-folders/route.ts`, `src/app/api/admin/career/jobs/route.ts`, `src/app/api/admin/career/utm/route.ts`, `src/app/api/admin/career/top_funnel/route.ts`

문제:

- `ADMIN_PAGE_PASSWORD` numeric value가 `src/lib/admin.ts`에 하드코딩되어 있고 여러 client page/component가 import한다. 이 값은 브라우저 번들에서 누구나 확인할 수 있다.
- `AdminAccessGuard`는 내부 이메일 로그인 여부를 UI에서만 확인하지만, 서버 API는 `Authorization` 사용자를 확인하지 않고 `x-admin-password`만 검사한다.
- 따라서 번들에서 비밀번호를 얻은 사용자는 내부 계정이 없어도 `/api/admin/*`를 직접 호출할 수 있다.
- `AdminAccessGuard`는 통과한 비밀번호를 `localStorage`에 저장한다. XSS가 한 번이라도 발생하면 관리자 비밀번호가 지속적으로 탈취된다.

영향:

- Career 관리자 API는 `talent_users`의 `email`, `name`, `resume_file_name`, `resume_links`, 로그인/온보딩/추천/활동 로그를 service role로 조회한다.
- User analytics/bookmark/admin metrics도 같은 구조라 사용자 행동 로그와 후보자 관련 데이터를 대량 조회할 수 있다.
- `sendSlackSummary` 같은 관리자 액션도 외부에서 트리거될 수 있다.

개선:

- 클라이언트에서 관리자 비밀번호 상수를 완전히 제거한다.
- 모든 `/api/admin/*`에서 공통 `requireAdminUser(req)`를 사용한다.
  - `getRequestUser(req)`로 Supabase access token 검증
  - `isInternalEmail(user.email)` 또는 별도 `admin_users` 테이블/role claim 검사
  - 가능하면 Supabase custom claim 또는 서버 DB role 기반으로 관리
- `x-admin-password` 방식은 삭제한다. 임시 보호가 필요하면 서버 전용 `ADMIN_API_SECRET`을 사용하되 브라우저에 내려보내지 않는다.
- 이미 노출된 비밀번호는 폐기한다. 하드코딩 값은 rotate 개념이 없으므로 해당 인증 방식을 제거해야 한다.
- 관리자 API에는 rate limit, audit log, 최소 응답 필드를 추가한다.

### 2. Toss 결제/구독 변경/구독 취소 API가 body의 `userId`를 신뢰함

관련 코드:

- `src/app/api/toss/payments/prepare/route.ts:35-43`
- `src/app/api/toss/subscriptions/prepare/route.ts:45-69`
- `src/app/api/toss/subscriptions/change-plan/route.ts:43-68`, `src/app/api/toss/subscriptions/change-plan/route.ts:183-193`
- `src/app/api/toss/subscriptions/cancel/route.ts:19-82`
- `src/app/api/credits/free-refresh/route.ts:43-57`, `src/app/api/credits/free-refresh/route.ts:175-211`
- `src/app/api/credits/annual-refresh/route.ts:31-41`, `src/app/api/credits/annual-refresh/route.ts:132-167`

문제:

- 주요 결제/구독 API가 `getRequestUser()`를 호출하지 않는다.
- 요청 body의 `userId`만으로 대상 사용자를 결정한다.
- `subscriptions/cancel`은 로그인 없이 특정 `userId`의 활성 구독을 `cancel_scheduled`로 바꾼다.
- `subscriptions/change-plan`은 로그인 없이 특정 `userId`의 active Toss billing key로 새 플랜 결제를 승인하려고 한다.
- credit refresh API도 로그인 없이 타인의 credits row를 갱신할 수 있다.

영향:

- 공격자가 user UUID를 알거나 추측/유출 로그에서 얻으면 타인의 구독을 취소 예약할 수 있다.
- 저장된 결제수단이 있는 계정은 공격자가 임의로 plan change 과금을 시도할 수 있다.
- 결제/크레딧 상태가 서버 신뢰 데이터이므로 금전/서비스 권한에 직접 영향이 있다.

개선:

- 모든 결제/크레딧 user-facing API에서 다음 순서로 fail closed 처리한다.
  - `const user = await getRequestUser(req); if (!user) 401`
  - body의 `userId`를 없애고 `user.id`만 사용하거나, 반드시 `body.userId === user.id` 검사
  - 구독 변경/취소 전 현재 payment row가 `user.id` 소유인지 재확인
- cron/worker 전용 credit refresh라면 public route가 아니라 `Authorization: Bearer ${CRON_SECRET}` 또는 Vercel Cron secret으로 보호한다.
- 구독 취소/플랜 변경에는 idempotency key, audit log, 사용자 재확인 UX를 둔다.
- 이미 배포되어 있었다면 Toss 결제/구독 변경 로그를 확인해 비정상 userId 호출이 있었는지 점검한다.

### 3. `getRequestUser()`의 unsigned JWT fallback이 인증 우회로 이어질 수 있음

관련 코드:

- `src/lib/supabaseServer.ts:14-16`
- `src/lib/supabaseServer.ts:95-129`
- `src/lib/supabaseServer.ts:160-181`
- `src/lib/supabaseServer.ts:184-205`
- 영향받는 권한 체크: `src/lib/internalApi.ts:22-35`, `src/app/api/talent/**`, `src/app/api/internal/**`, `src/app/api/admin`의 향후 개선 대상

문제:

- `decodeLocalRequestUser()`는 JWT payload를 base64url decode한 뒤 `sub`, `email`만 보고 `User` 객체를 만든다.
- 서명 검증이 없다.
- `TRUST_LOCAL_JWT_FALLBACK`은 `NODE_ENV !== "production"`이면 true이고, production에서도 `TRUST_SUPABASE_JWT_WITHOUT_LOOKUP=true`면 true다.
- `getRequestUser()`는 Supabase `auth.getUser(token)` 호출 전에 local fallback을 먼저 시도한다.
- 따라서 fallback이 켜진 환경에서는 공격자가 임의의 `sub`, `email`을 담은 가짜 JWT 모양 문자열로 로그인 사용자를 위조할 수 있다.

영향:

- `email = someone@matchharper.com`으로 위조하면 `requireInternalApiUser()`를 통과할 수 있다.
- `sub`를 다른 사용자의 UUID로 넣으면 career profile/session/opportunity API에서 타인 계정으로 동작할 수 있다.
- 관리자/ATS/dev-sql 같은 내부 권한이 `getRequestUser()` 위에 쌓여 있어 설정 실수 하나가 전체 권한 우회가 된다.

개선:

- 서명 검증 없는 fallback을 제거한다.
- Supabase 장애 시 인증 실패가 맞다. fail open보다 401/503이 안전하다.
- 정말 로컬 개발 편의가 필요하면:
  - production/preview/staging에서는 절대 켜지지 않게 `if (process.env.NODE_ENV === "development" && process.env.ALLOW_INSECURE_LOCAL_AUTH === "true")`
  - 개발 전용 secret으로 HMAC 서명된 mock token만 허용
  - 코드 주석과 로그에 insecure mode를 명확히 표시
- 자체 검증을 해야 한다면 Supabase JWKS/issuer/audience/exp를 검증하는 라이브러리를 사용한다. payload decode만으로 인증하면 안 된다.
- `TRUST_SUPABASE_JWT_WITHOUT_LOOKUP` 환경변수를 제거하거나 배포 환경에서 차단한다.

### 4. Career dev SQL 도구가 운영 DB 직접 실행 경로가 될 수 있음

관련 코드:

- `src/app/api/talent/dev-sql/route.ts:80-97`, `src/app/api/talent/dev-sql/route.ts:134-156`
- `src/lib/career/devSql.ts:51-62`
- `src/lib/career/devSql.ts:269-370`
- `src/lib/career/devSql.ts:525-546`

문제:

- `canUseCareerDevSql()`은 production에서 `@matchharper.com` 또는 하드코딩된 몇 개 이메일이면 허용한다.
- non-production에서는 모든 로그인 사용자를 허용한다.
- 실행은 `DATABASE_URL`/`POSTGRES_URL` 등 직접 DB URL로 `tx.unsafe(statement)`를 호출한다.
- validator는 `current_setting('app.current_talent_id')` 포함 여부를 검사하지만, 실제로 모든 row를 현재 사용자로 제한하는지 보장하지 않는다.
  - 예: `SELECT ... WHERE current_setting(...) IS NOT NULL` 같은 형태도 통과 가능하다.
  - mutation도 `WHERE current_setting(...) IS NOT NULL`이면 현재 사용자 scope가 아닌 broad update/delete가 가능하다.
- SQL parser가 아니라 regex 기반이라 우회 여지가 크다.

영향:

- 내부 계정 탈취 또는 위 3번 인증 fallback과 결합하면 운영 DB 대량 조회/변경/삭제가 가능하다.
- service role보다 더 위험할 수 있다. DB URL 권한에 따라 RLS도 우회할 수 있다.

개선:

- production에서는 route 자체를 비활성화한다. `if (process.env.NODE_ENV === "production") return 404/403`.
- 운영에서 꼭 필요하면 웹 앱 API가 아니라 VPN/관리자 전용 bastion/승인 workflow 뒤로 옮긴다.
- SQL 직접 실행 대신 서버에 안전한 고정 operation만 둔다.
  - 예: `resetCareerOnboarding(userId)`, `deleteOwnRecentRecommendations(userId, days)`
- 불가피하게 SQL을 허용한다면:
  - read-only DB role과 mutation 전용 최소권한 role 분리
  - Postgres RLS가 적용되는 role로 연결
  - SQL AST parser로 table/column/where clause를 검증
  - 모든 대상 테이블별로 `talent_id = $currentUserId` 또는 `user_id = $currentUserId` predicate를 구조적으로 확인
  - 실행 전 dry-run row count, 승인, audit log 필수

## High

### 4-1. DB SSL enforcement off, DB CIDR `0.0.0.0/0`

관련 설정:

- `supabase ssl-enforcement get --experimental`: `SSL is NOT being enforced`
- `supabase network-restrictions get --experimental`: `DB Allowed CIDRs: [0.0.0.0/0]`

문제:

- Supabase public API의 anon key 노출과 별개로, Postgres 직접 접속면이 전 세계에 열려 있다.
- SSL enforcement가 꺼져 있으면 잘못 설정된 DB client가 암호화되지 않은 연결을 사용할 여지가 생긴다.
- DB password, service role key, worker DB credential, 개발자 노트북/CI secret 중 하나가 유출되면 네트워크 차단 없이 바로 접속 시도가 가능하다.
- network ban 목록에 이미 IP가 존재해 abuse traffic이 있었던 정황도 있다.

영향:

- credential stuffing, leaked secret, 개발 장비 탈취가 곧바로 DB 접속 시도로 이어질 수 있다.
- 현재 `execute_raw_sql`, RLS disabled table, storage policy 문제가 있는 상태에서는 DB/API 둘 다 열린 공격면이 된다.

개선:

- Supabase DB SSL enforcement를 켠다.
- DB network restrictions를 운영/CI/Vercel egress 등 필요한 CIDR로 제한한다. Vercel 고정 egress를 쓰지 않는다면 DB direct connection을 최소화하고 Supabase HTTP API/service role 경로를 서버에서만 사용한다.
- 장기적으로는 direct DB URL 사용 경로를 inventory화하고, production direct DB 접근은 migration/ops 계정으로만 제한한다.
- leaked secret 대응을 위해 service role key, DB password, worker secrets rotation 절차를 만든다.

### 5. Realtime token 발급에서 `conversationId` 소유권 검증이 빠져 있음

관련 코드:

- `src/app/api/realtime/token/route.ts:105-155`
- `src/lib/career/realtimeInstructions.ts:23-55`
- `src/lib/talentOnboarding/messageStore.ts:191-243`

문제:

- `/api/realtime/token`은 로그인 사용자를 확인하지만, body의 `conversationId`가 해당 사용자 소유인지 확인하지 않는다.
- 현재 `buildCareerRealtimeSessionInstructions()`는 `userId`를 받아 profile/insights/settings context에는 사용하지만, message history를 읽을 때는 여전히 `fetchVisibleMessagesPage({ conversationId })`만 호출한다.
- `fetchVisibleMessagesPage()`는 `conversation_id`만 필터링하고 `user_id`를 필터링하지 않는다.

영향:

- 다른 사용자의 `conversationId`를 알게 되면 그 대화의 최근 메시지가 Realtime session instructions에 포함될 수 있다.
- API 응답으로 instructions가 직접 반환되지는 않지만, 발급된 Realtime session에서 모델이 해당 context를 기반으로 답할 수 있어 간접 유출 경로가 된다.

개선:

- `/api/realtime/token`에서 발급 전:
  - `talent_conversations.select("id").eq("id", conversationId).eq("user_id", user.id).maybeSingle()`
  - 없으면 404/403
- `buildCareerRealtimeSessionInstructions()`와 `fetchVisibleMessagesPage()`에도 `userId`를 인자로 받아 `conversation_id + user_id`를 함께 필터링한다.
- helper 자체가 안전한 기본값을 갖도록 `conversationId`만 받는 overload를 제거한다.

### 6. Career 이력서 업로드/파싱이 크기·타입 제한 없이 메모리에 올림

관련 코드:

- `src/app/api/talent/resume/upload/route.ts:23-43`
- `src/app/api/talent/resume/parse/route.ts:13-30`
- `src/app/api/pdf/route.ts:5-29`
- 비교적 나은 구현: `src/app/api/talent/network/apply/route.ts:12-15`, `src/app/api/talent/network/apply/route.ts:129-157`

문제:

- Career resume upload는 파일 크기 제한, 확장자 allowlist, MIME/magic byte 검증이 없다.
- `file.arrayBuffer()`로 전체 파일을 메모리에 올린 뒤 Supabase Storage에 업로드한다.
- resume parse는 PDF 여부를 `file.type` 또는 `.pdf` 확장자로만 판단하고 전체 PDF를 `pdf-parse-fork`에 넘긴다.
- `/api/pdf`는 인증도 없고 크기 제한도 없다.

영향:

- 대용량 파일로 서버 메모리/CPU를 소모시키는 DoS가 가능하다.
- Storage 비용/용량 abuse가 가능하다.
- 악성/비정상 PDF parser 입력으로 parser 취약점이 트리거될 수 있다.
- 이력서에는 PII가 많으므로 업로드 정책이 느슨하면 개인정보 저장면이 커진다.

개선:

- Career resume에도 network apply와 동일하거나 더 엄격한 제한을 둔다.
  - 예: 8-10MB 이하
  - `pdf`, `doc`, `docx`, `txt` 등 명시적 allowlist
  - MIME과 확장자 둘 다 검사하고, 가능하면 magic byte 검사
  - PDF parse page limit과 text output limit 적용
- `req.formData()` 전에 플랫폼 body size limit을 적용할 수 있는지 확인한다.
- Storage path는 사용자별 prefix를 유지하되, bucket policy에서 본인 prefix만 접근 가능하도록 검증한다.
- `/api/pdf`가 더 이상 필요 없다면 제거하고, 필요하면 인증 + 크기 제한 + rate limit을 추가한다.

### 7. 공개 LLM/스크래핑/검색 API가 인증·rate limit 없이 비용과 SSRF 위험을 만듦

관련 코드:

- `src/app/api/tool/scrape/route.ts:206-438`
- `src/app/api/tool/web_search/route.ts:4-30`
- `src/app/api/llm/route.ts:5-24`
- `src/app/api/call/route.ts:28-55`
- `src/app/api/chat/route.ts:109-130`, `src/app/api/chat/route.ts:220-315`
- `src/app/api/chat/candid/route.ts:65-127`, `src/app/api/chat/candid/route.ts:327-360`
- `src/app/api/linkpreview/route.ts:11-23`, `src/app/api/linkpreview/route.ts:103-123`, `src/app/api/linkpreview/route.ts:147-156`
- `src/app/api/search/criteria_summarize/route.ts:90-160`
- `src/app/api/search/start/route.ts:37-65`, `src/app/api/search/run/route.ts:37-65`
- `src/app/api/scout/title/route.ts:82-135`
- `src/app/api/hello/route.ts:9-13`, `src/app/api/hello/usage/route.ts:4-8`

문제:

- `/api/tool/scrape`는 인증 없이 임의 URL을 fetch하고, 필요 시 Apify actor를 실행하며, 결과를 service role client로 `documents`에 저장한다.
- URL scheme/private IP/localhost 차단이 없다. PDF branch도 임의 URL을 다운로드한다.
- `/api/tool/web_search`, `/api/llm`, `/api/call`, legacy `/api/chat*`도 인증/사용량 제한이 없다.
- `/api/search/criteria_summarize`는 인증 없이 LLM을 호출하고 `summary`, `synthesized_summary`에 service role 경로로 insert한다. 클라이언트가 넘긴 `doc`, `criteria`, `queryId`를 그대로 비용 발생/DB write에 사용한다.
- `/api/search/start`와 `/api/search/run`은 인증이 없지만 현재는 anon Supabase client와 RLS 때문에 `runs_pages` read가 방어되는 것으로 확인됐다. 그래도 route 자체가 user ownership을 확인하지 않으므로 제거하거나 authenticated user client로 고쳐야 한다.
- `/api/scout/title`은 body의 `userId`, `queryId`를 받지만 access token을 Supabase client에 전달하지 않는다. 현재 `messages` RLS 때문에 외부 데이터 유출 가능성은 낮지만, 인증 경계가 잘못 구현되어 기능/보안 양쪽 모두 취약한 구조다.
- `/api/hello`, `/api/hello/usage`는 인증 없이 Slack webhook relay로 동작한다.
- `linkpreview`는 일부 사설 IPv4/localhost만 막고, DNS resolve 후 private IP 여부와 redirect 후 목적지를 검사하지 않는다.

영향:

- 외부인이 서버 비용, LLM 비용, Apify 비용을 태울 수 있다.
- SSRF로 metadata endpoint, 내부 서비스, private network 접근을 시도할 수 있다.
- public scrape가 service role로 cache insert를 하므로 DB가 스팸 데이터로 오염될 수 있다.
- Slack 채널 spam, search summary table 오염, 임의 후보 doc 기반 LLM 처리 비용이 발생할 수 있다.

개선:

- public route로 열어야 하는 것과 내부 tool route를 분리한다.
- `/api/tool/scrape`, `/api/tool/web_search`는 직접 public 호출을 막고, 내부 호출에는 `INTERNAL_TOOL_SECRET` 또는 authenticated user quota를 적용한다.
- SSRF 방어:
  - `http`/`https`만 허용
  - hostname DNS resolve 후 모든 A/AAAA가 private/link-local/loopback/metadata 대역이 아닌지 검사
  - redirect마다 재검사
  - 최대 응답 크기와 timeout 강제
  - 필요하면 allowlist 기반으로 축소
- LLM/검색 API에는 사용자별/IP별 rate limit과 월간 quota를 둔다.
- legacy route가 실제로 쓰이지 않으면 제거한다.
- Slack relay는 서버 내부 함수로만 쓰거나 `INTERNAL_TOOL_SECRET`/CSRF 방어/allowlisted origin을 적용한다.

### 8. 프로필 이미지/로고 업로드가 SVG와 사용자 MIME을 허용하고 public bucket URL을 반환함

관련 코드:

- `src/app/api/talent/profile/photo/upload/route.ts:15-23`, `src/app/api/talent/profile/photo/upload/route.ts:40-66`, `src/app/api/talent/profile/photo/upload/route.ts:75-83`
- `src/app/api/talent/profile/logo/upload/route.ts:15-23`, `src/app/api/talent/profile/logo/upload/route.ts:40-66`, `src/app/api/talent/profile/logo/upload/route.ts:75-83`

문제:

- `file.type.startsWith("image/")`만 확인한다.
- `image/svg+xml`을 명시적으로 확장자로 인정한다.
- 실제 파일 내용 magic byte 검증이 없다.
- `company_logo` public bucket에 업로드하고 public URL을 반환한다.

영향:

- SVG는 단독 문서로 열릴 때 script/외부 resource/피싱 UI 문제가 생길 수 있다.
- 사용자가 조작한 MIME으로 non-image payload를 public storage에 올릴 수 있다.
- 프로필 이미지가 여러 화면에서 렌더링되므로 XSS/콘텐츠 스푸핑 표면이 된다.

개선:

- SVG 업로드를 금지한다. 최소 `png`, `jpeg`, `webp`만 허용한다.
- magic byte 검증을 추가한다.
- 서버에서 Sharp 등으로 decode 후 안전한 포맷으로 재인코딩한다.
- public bucket 대신 signed URL 또는 이미지 프록시를 사용한다.
- `contentType`은 사용자 입력이 아니라 서버 검증 결과로 지정한다.

### 9. Supabase service role fallback과 secret 재사용이 많음

관련 코드:

- `src/lib/supabaseServer.ts:131-145`
- `src/lib/billing/server.ts:25-36`
- `src/app/api/chat/route.ts:33-37`
- `src/app/api/credits/free-refresh/route.ts:7-11`
- `src/app/api/credits/annual-refresh/route.ts:7-11`
- `src/lib/careerEmailOnboarding/token.ts:17-27`
- `src/lib/email/security.ts:3-13`
- `src/lib/requestAccess/server.ts:148-160`

문제:

- server/admin client가 `SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY` 패턴을 사용한다.
- admin 기능에서 service role이 없으면 anon으로 동작하거나 일부는 나중에 실패한다. 보안 경계가 환경 설정에 따라 조용히 바뀐다.
- 여러 HMAC token secret이 없을 때 `SUPABASE_SERVICE_ROLE_KEY`로 fallback한다.
- 한 secret이 여러 용도로 재사용되면, 하나의 토큰 검증/로그/운영 경로 유출이 service role 회전 이슈로 번진다.

영향:

- 환경 누락 시 fail closed가 아니라 부분 동작할 수 있어 테스트와 운영 보안이 달라진다.
- service role key가 HMAC 용도로 넓게 사용되면 회전 범위가 커지고 사고 대응이 어려워진다.

개선:

- server admin client는 service role이 없으면 즉시 throw한다.
- anon client가 필요한 서버 경로는 별도 함수명으로 분리한다.
- HMAC 용도별 secret을 분리한다.
  - `CAREER_EMAIL_ONBOARDING_SECRET`
  - `EMAIL_REPLY_TOKEN_SECRET`
  - `REQUEST_ACCESS_REVIEW_SECRET`
  - `TALENT_NETWORK_INVITE_SECRET`
- fallback으로 service role key를 쓰지 않는다.
- secret rotation runbook을 만든다.

### 10. CSP/HSTS가 없어 XSS 피해 반경이 큼

관련 코드:

- `next.config.mjs:40-59`
- Supabase browser client: `src/lib/supabase.ts:4-7`
- 세션 사용: `src/store/useAuthStore.ts:61-99`

문제:

- 현재 보안 헤더는 `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` 정도다.
- `Content-Security-Policy`와 `Strict-Transport-Security`가 없다.
- Supabase browser client는 기본적으로 browser storage에 세션을 보관한다. XSS가 생기면 access token 탈취가 가능하다.
- 코드에 `dangerouslySetInnerHTML` 사용 지점이 여러 곳 있어 CSP가 특히 중요하다.

영향:

- XSS가 한 번 생기면 일반 사용자 career 데이터, admin localStorage password, Supabase access token이 연쇄 유출될 수 있다.

개선:

- CSP를 추가한다. 처음에는 Report-Only로 시작해 필요한 도메인을 수집한 뒤 enforce한다.
  - `default-src 'self'`
  - `script-src 'self'` 중심, 불가피한 provider만 nonce/hash 기반 허용
  - `connect-src`에 Supabase/OpenAI/xAI/Resend 등 실제 필요 origin만 허용
  - `img-src 'self' data: https:`
  - `frame-ancestors 'none'`
- HSTS 추가: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `dangerouslySetInnerHTML` 지점은 sanitize된 HTML만 허용하고, 가능한 React Markdown + rehype-sanitize로 통일한다.

### 10-1. 로그인 중 Supabase URL/anon key 노출과 원문 오류 표시

관련 코드:

- Supabase browser client: `src/lib/supabase.ts:4-7`
- Career login error normalization: `src/hooks/career/useCareerAuth.ts:37-81`
- 일반 로그인 모달 원문 에러 표시: `src/components/Modal/LoginModal.tsx:233-242`, `src/components/Modal/LoginModal.tsx:259-268`
- Invitation 로그인 원문 에러 반환: `src/pages/invitation.tsx:436-442`

판단:

- `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_ANON_KEY`는 Supabase browser SDK를 쓰는 구조에서는 브라우저에 노출되는 것이 정상이다.
- 로그인, OAuth redirect, REST 호출, Storage 호출을 브라우저에서 직접 하면 Supabase project URL은 Network 탭, JS 번들, sourcemap, redirect URL 등에서 확인 가능하다.
- 따라서 "Supabase URL이 보인다"는 사실만으로 secret 유출이나 즉시 침해로 보기는 어렵다. Supabase의 보안 모델은 anon key/public URL을 숨기는 것이 아니라 RLS, Auth, 정책, rate limit로 보호하는 구조다.

문제:

- URL 자체는 공개값이어도 공격자에게 정찰 정보를 제공한다. project ref를 알면 `/auth/v1`, `/rest/v1`, `/storage/v1` 등을 직접 찔러볼 수 있다.
- RLS가 빠진 테이블, public bucket, service-role을 잘못 쓰는 route, 약한 auth 설정이 있으면 Supabase URL 노출이 실제 공격 경로를 찾는 시작점이 된다.
- Career login은 `getCareerEmailAuthErrorMessage()`로 원문 Supabase 오류를 일반 문구로 바꾸고 있어 상대적으로 낫다.
- 반면 일반 `LoginModal`과 invitation 로그인은 `error.message`를 그대로 사용자에게 보여주는 경로가 있다. Supabase 오류가 내부 endpoint, provider 설정, SMTP/Auth 설정 상태, rate limit 상태를 포함하면 불필요한 정보 노출이 된다.
- "서버 주소가 노출되면 타깃이 된다"는 지적은 방향은 맞지만, URL 은폐만으로 해결할 수 있는 문제가 아니다. 이 프로젝트에서는 공개 raw SQL RPC, Storage anon 전역 정책, RLS disabled 테이블, admin secret 노출, body `userId` 신뢰, unsigned JWT fallback이 훨씬 더 직접적인 위험이다.

영향:

- 공격자가 Supabase Auth endpoint에 credential stuffing, signup spam, reset-password spam, email enumeration성 요청을 집중할 수 있다.
- REST/Storage endpoint를 스캔해 RLS 누락, public bucket, object path 추측 가능성을 찾을 수 있다.
- 원문 오류가 화면에 노출되면 설정 실수와 내부 상태를 파악하는 데 도움이 된다.

개선:

- Supabase URL/anon key를 secret처럼 취급해 "숨기려는" 목표를 세우지 않는다. 대신 RLS와 server-side authorization을 완료 기준으로 둔다.
- 모든 사용자-facing auth 오류는 공통 mapper로 일반화한다.
  - 로그인 실패: `이메일 혹은 비밀번호가 올바르지 않습니다.`
  - 가입/비밀번호 재설정 실패: `요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.`
  - rate limit: `요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.`
- `LoginModal`, `invitation` 등에서 `error.message` 직접 표시를 제거하고 career login과 같은 방식의 mapper를 공유한다.
- Supabase dashboard에서 Auth rate limit, signup 정책, allowed redirect URLs, leaked password protection, email OTP/confirmation 정책을 점검한다.
- Supabase RLS를 모든 사용자 데이터 테이블에 강제하고, public bucket은 공개가 필요한 asset만 허용한다.
- 가능하면 데이터 read/write는 브라우저 direct Supabase 호출보다 Next.js API를 통해 server-side ownership 검증을 거치도록 중요 경로부터 전환한다.
- CSP `connect-src`에는 실제 운영 Supabase project URL만 허용하고 wildcard를 피한다.

### 10-2. Supabase Auth password/rate limit/redirect 설정이 약함

확인된 설정:

- Password minimum length: 6
- Password required characters: none
- Leaked password protection: false
- CAPTCHA: false
- Password update reauthentication: false
- Password update current password requirement: false
- `rate_limit_email_sent`: 500
- Redirect allow list에 `https://www.matchharper.com/**`, `https://app.matchharper.com/**`, `https://harper-beta-19jd.vercel.app/**` 포함

문제:

- 6자 비밀번호와 leaked password protection off는 credential stuffing/재사용 비밀번호 공격에 약하다.
- CAPTCHA가 꺼져 있고 email send rate limit이 높으면 signup/password reset/email confirmation abuse 비용이 낮아진다.
- password 변경 시 재인증이나 현재 비밀번호 요구가 없으면 XSS/세션 탈취 후 계정 장악이 쉬워진다.
- OAuth redirect allow list wildcard가 넓으면 오래된 preview domain, 잘못 설정된 sub-app, open redirect와 결합될 때 OAuth code/session redirect 위험이 커진다.

개선:

- Password minimum length를 최소 10-12자로 올린다.
- required characters는 최소 숫자/문자 조합, 가능하면 uppercase/lowercase/symbol 포함으로 강화한다.
- leaked password protection을 켠다.
- signup/reset/email onboarding abuse 방어를 위해 CAPTCHA 또는 Turnstile을 public auth/form entry에 적용한다.
- `security_update_password_require_reauthentication` 또는 current password requirement를 켠다.
- `rate_limit_email_sent`를 운영 메일 발송량에 맞춰 낮추고, public form 쪽 app-level rate limit과 같이 운영한다.
- Redirect allow list에서 불필요한 wildcard와 오래된 Vercel preview URL을 제거한다. preview 배포는 별도 Supabase project 또는 짧은 기간만 허용하는 절차로 관리한다.

### 10-3. Career 사용자 관점 보안/신뢰 UX 리스크

검증 방식:

- 로컬 브라우저에서 `/career_login?mail=person@example.com&email_onboarding=<sample-token>&next=/career` 진입을 확인했다.
- `/career`, `/career_login` 화면과 email/password form, Google login gate, career workspace tab 이동 코드를 확인했다.
- 개발자도구 console에서 Vercel Analytics debug 로그가 full URL query를 포함하는 것을 확인했다.
- 실제 운영 사용자 데이터는 열람하지 않았고, 테스트용 이메일/토큰만 사용했다.

판단:

- 이 섹션은 "즉시 침해 가능성"보다 "사용자가 보안에 문제가 있다고 느낄 수 있는 지점"을 중심으로 정리한다.
- Supabase project URL/anon key는 browser SDK 구조상 공개값이다. 사용자가 봤을 법한 이미지는 Supabase Auth/OAuth 요청, Network 탭의 `*.supabase.co`, 또는 로그인 오류/redirect 화면일 가능성이 높다.
- 다만 현재 career 흐름에서는 Supabase URL 자체보다 `mail`과 `email_onboarding` token이 URL/analytics/브라우저 히스토리에 남는 문제가 더 직접적이다.

#### A. 이메일과 onboarding token이 URL, route 이동, analytics에 오래 남음

관련 코드:

- Email onboarding token 생성: `src/lib/careerEmailOnboarding/token.ts:3-11`, `src/lib/careerEmailOnboarding/token.ts:36-61`
- Email onboarding 로그인 URL 생성: `src/lib/careerEmailOnboarding/server.ts:153-168`, `src/lib/careerEmailOnboarding/server.ts:171-186`
- Career login next path query 보존: `src/pages/career_login.tsx:76-99`, `src/pages/career_login.tsx:121-125`
- OAuth redirect URL query 보존: `src/hooks/career/useCareerAuth.ts:101-149`
- `/career` tab 이동 query 보존: `src/components/career/CareerWorkspacePage.tsx:32-44`, `src/components/career/CareerWorkspacePage.tsx:87-116`
- Career history/timeline 일부 이동에서 `mail` 보존: `src/components/career/chat/CareerTimelineSection.tsx:1094-1104`, `src/components/career/CareerHistoryPanel.tsx:475-486`
- GA pageview full URL 사용: `src/pages/_app.tsx:62-73`
- Vercel Analytics component: `src/pages/_app.tsx:136-140`

문제:

- email onboarding 링크가 `/career_login?next=/career&source=email_onboarding&mail=<email>&email_onboarding=<token>` 형태로 생성된다.
- 로그인 후에도 `buildResolvedNextPath()`, `buildCareerRedirectPath()`, `CareerWorkspacePage.handleChangeTab()`이 `mail`과 `email_onboarding`을 계속 보존한다.
- 브라우저에서 확인했을 때 Vercel Analytics debug 로그가 `/career_login?...mail=...&email_onboarding=...` full URL을 포함했다. GA도 `page_location: window.location.href`, 첫 pageview `pathname + search`를 쓰므로 query가 그대로 전송될 수 있다.
- token payload는 HMAC 서명되어 변조는 어렵지만 암호화되어 있지 않다. base64url payload 안에 `email`, `leadId`, `iat`, `exp`, `purpose`가 들어간다.
- 기본 TTL은 30일이다. URL이 브라우저 히스토리, analytics, proxy/CDN 로그, referrer, support screenshot, 화면 공유에 남으면 장기간 재사용 가능한 링크가 남는다.

사용자가 느낄 문제:

- 주소창에 본인 이메일과 긴 token이 보이면 "로그인 토큰이 노출됐다"고 느낄 수 있다.
- 개발자도구 Network/Console에서 analytics 요청이나 debug log에 같은 URL이 보이면 "개인정보가 외부 분석 도구로 전송된다"고 느낄 수 있다.
- Supabase URL 노출 우려 제보도 실제로는 이 full URL, OAuth redirect URL, 또는 analytics/network 로그를 본 것일 수 있다.

개선:

- email onboarding 링크는 가능한 한 opaque random token만 포함하고, token payload에 email/leadId를 넣지 않는다. DB에는 token hash, lead id, 목적, 만료, 사용 여부를 저장한다.
- TTL을 30일에서 목적별로 줄인다. 예: login claim 24-72시간, calendar CTA 7일 이내.
- `/career_login` 최초 진입 시 server/API에서 token을 검증한 뒤 즉시 short-lived HttpOnly cookie 또는 server-side claim session으로 교환한다.
- token 교환 후 `router.replace()`로 주소창에서 `mail`, `email_onboarding`, `invite` 같은 민감 query를 제거한다. 사용자가 보는 URL은 `/career_login?next=/career` 또는 `/career` 정도로 정리한다.
- `/career` 내부 tab 이동에서는 onboarding claim이 완료된 뒤 query를 보존하지 않는다. 필요한 상태는 server session/profile row로 옮긴다.
- GA/Vercel Analytics로 보내는 `page_location`, `page_path`는 query 제거 또는 allowlist 방식으로 sanitization한다. 최소한 `mail`, `email_onboarding`, `invite`, `token`, `code`, `access_token`, `refresh_token`은 제거한다.
- `Referrer-Policy`는 이미 `strict-origin-when-cross-origin`로 설정되어 있으나, 민감 query가 같은 origin analytics/log로 들어가는 문제는 별도 sanitization으로 막아야 한다.

#### B. Career landing 로그에 raw email이 event type으로 저장됨

관련 코드:

- Login email log type 생성: `src/lib/landingLogTypes.ts:92-101`
- Landing page direct Supabase insert: `src/pages/index.tsx:467-493`, `src/pages/index.tsx:585-606`
- Auth store login log: `src/store/useAuthStore.ts:30-46`
- OAuth callback login log: `src/pages/auths/callback.tsx:63-74`

문제:

- `buildLandingLoginEmailType()`이 `login_email:<email>[:source]` 형태로 raw email을 event type 문자열에 넣는다.
- landing page와 auth callback이 browser에서 Supabase `landing_logs`에 직접 insert한다.
- 실제 Supabase 점검에서 `landing_logs`는 anon REST count 접근이 확인됐다. row payload 전체 read 가능성은 별도 정책 세부 확인이 필요하지만, raw email을 로그 event type에 넣는 설계 자체가 개인정보 최소화 원칙에 맞지 않는다.

사용자가 느낄 문제:

- 개발자도구 Network에서 Supabase insert payload에 `login_email:user@example.com`이 보일 수 있다.
- 사용자는 "로그인 이메일을 분석 로그에 그대로 저장한다"고 받아들일 수 있고, career 서비스 특성상 이직 의향/관심사와 결합된 민감 로그로 보일 수 있다.

개선:

- event type에는 `login_email`만 저장하고, 이메일은 별도 `user_id` 또는 server-side join으로 계산한다.
- 꼭 이메일 기반 집계가 필요하면 HMAC-SHA256(email, dedicated analytics salt) hash를 별도 컬럼에 저장한다. secret fallback으로 service role key를 쓰지 않는다.
- browser direct insert 대신 `/api/landing/log` 같은 server endpoint를 거치고, server에서 schema validation, rate limit, redaction, user/session 매핑을 수행한다.
- `landing_logs` RLS/grant를 재점검해 anon read/select를 막고 insert도 필요한 컬럼만 허용한다.

#### C. 약관/개인정보 처리 고지가 부족하거나 클릭 불가함

관련 코드:

- Career login consent copy: `src/pages/career_login.tsx:357-360`
- Career workspace guest login gate: `src/components/career/CareerLoginGate.tsx:133-145`
- Email onboarding modal: `src/components/landing/career/CareerEmailOnboardingModal.tsx:142-195`
- Onboarding 개인정보 입력: `src/pages/career/onboarding.tsx:1445-1463`

문제:

- `/career_login`에는 "이용 약관 및 개인정보 처리방침에 동의" 문구가 있지만 실제 링크가 아니다.
- `/career` guest login gate에는 privacy/terms 문구가 없다.
- email onboarding modal은 이메일을 수집하지만 개인정보 처리방침/이용약관 링크나 "어떤 목적으로 이메일을 쓰는지"에 대한 짧은 고지가 없다.
- onboarding에서 이름, 이메일, LinkedIn/GitHub/Scholar/웹사이트, 이력서를 받지만 저장 목적, 공유 범위, 삭제/수정 방법을 그 자리에서 명확히 안내하지 않는다.

사용자가 느낄 문제:

- "동의한 것으로 간주"라고 쓰면서 약관/개인정보 링크가 없으면 법적/보안적으로 미완성처럼 보인다.
- career 서비스는 이직 의향, 연봉/비자/회사 관심사, 이력서가 들어가므로 일반 마케팅 폼보다 더 민감하게 받아들여진다.

개선:

- `/career_login`, `/career` login gate, email onboarding modal, onboarding 개인정보 단계에 `/terms`, `/privacy` 링크를 명확히 제공한다.
- 버튼 바로 아래에 짧은 data-use copy를 둔다. 예: "입력한 정보는 매칭, 프로필 생성, 연락, 서비스 개선에 사용되며 설정에서 수정/삭제 요청할 수 있습니다."
- onboarding resume/link 단계에는 "회사에 공유되는 항목"과 "대화 내용은 공유하지 않음"을 구분해 보여준다.
- 개인정보 처리방침에는 resume file, parsed resume text, voice transcript/chat history, analytics event, email onboarding token/log retention을 명시한다.

#### D. 이력서 파일 처리 UI가 내부 storage path와 불일치한 업로드 정책을 보여줌

관련 코드:

- 저장된 resume path 표시: `src/components/career/settings/CareerResumeLinksSettingsSection.tsx:128-154`
- Settings resume accept: `src/components/career/settings/CareerResumeLinksSettingsSection.tsx:169-173`
- Onboarding resume copy/accept: `src/pages/career/onboarding.tsx:650-659`
- Pre-login talent modal resume accept: `src/components/talent/TalentIdentifierModal.tsx:257-283`
- Pre-login localStorage/IndexedDB 임시 저장: `src/lib/talentCapture/client.ts:20-23`, `src/lib/talentCapture/client.ts:51-64`, `src/lib/talentCapture/client.ts:184-230`

문제:

- 설정 화면에서 저장된 이력서 파일명 아래에 `savedResumeStoragePath`를 그대로 보여준다.
- 사용자는 storage path를 내부 bucket/object key로 인식할 수 있고, "내 파일 경로가 노출되어 있다"고 느낄 수 있다.
- onboarding은 `.pdf,.txt,.md`를 허용한다고 보이지만 settings는 `.pdf,.doc,.docx,.txt`, pre-login modal은 "PDF, DOC, DOCX"라고 말한다. 실제 API/Storage 설정과도 파일 크기/타입 제한이 완전히 일치하지 않는다.
- pre-login modal은 Google OAuth 전에 이력서를 IndexedDB에 임시 저장하고 metadata를 localStorage에 저장한다. 로컬 저장 자체는 서버 업로드 전 보존 목적이지만, 사용자에게 "브라우저에 임시 저장된다"는 안내가 없다.

사용자가 느낄 문제:

- settings에서 내부 경로와 download link가 보이면 private storage가 정말 private한지 의심할 수 있다.
- 화면마다 허용 파일 형식이 다르면 validation이 느슨하거나 파일 처리 정책이 정리되지 않았다고 느낄 수 있다.
- 로그인 전 이력서를 선택한 뒤 OAuth로 이동하는 흐름에서, 사용자는 파일이 이미 서버에 업로드됐는지/브라우저에 남는지 알기 어렵다.

개선:

- 사용자 화면에는 파일명, 업로드 일시, 상태만 보여주고 storage path는 숨긴다. support/debug 모드가 필요하면 internal admin 화면에만 둔다.
- signed download link가 있다면 "개인 전용 임시 다운로드 링크"처럼 만료/범위를 설명한다.
- onboarding/settings/pre-login modal/API/Storage bucket의 허용 확장자, MIME, magic byte, 크기 제한을 하나의 상수/정책으로 통일한다.
- resume upload copy에 저장 위치보다 처리 목적을 설명한다. 예: "이력서는 프로필 작성과 매칭 추천에만 사용됩니다. 설정에서 교체하거나 삭제 요청할 수 있습니다."
- pre-login resume 선택 단계에는 "로그인 완료 전까지 이 브라우저에만 임시 저장됩니다" 또는 "로그인 후 업로드됩니다"를 명시한다.

#### E. 통화/음성 기능의 privacy notice가 부족함

관련 코드:

- 통화 환경 안내: `src/components/career/chat/CareerCallEnvironmentNotice.tsx:50-67`
- Voice opening instruction dev log: `src/hooks/career/useCareerOnboardingVoice.ts:174-180`

문제:

- 현재 통화 안내는 주변 소음과 인식 정확도만 설명한다.
- 마이크 권한, 실시간 음성 처리 provider, 전사/요약 저장 여부, 회사 공유 여부, 삭제/중단 방법에 대한 안내가 없다.
- `useCareerOnboardingVoice`는 production build에서는 막혀 있지만, development 환경에서는 opening response instruction 전체를 console에 출력한다. 테스트 데이터에 실제 사용자 이력서/프로필/대화 맥락이 섞이면 DevTools/녹화/로그 수집 도구에 민감 내용이 남을 수 있다.

사용자가 느낄 문제:

- 통화 시작 전 마이크와 전사/저장 범위를 고지하지 않으면 "녹음되는지", "회사에 전달되는지", "어디에 저장되는지"가 불분명하다.
- 사용자가 개발자도구에서 prompt/instruction 로그를 보면 Harper 내부 AI 지시문과 개인 맥락이 그대로 노출된다고 느낄 수 있다.

개선:

- 통화 시작 CTA 근처에 짧은 notice를 추가한다. 예: "마이크 음성은 실시간 답변과 대화 기록 생성을 위해 처리됩니다. 대화 내용은 회사에 공개되지 않으며 설정/문의로 삭제를 요청할 수 있습니다."
- transcript 저장 여부, 저장 기간, 사용 목적을 privacy policy와 제품 화면에 맞춰 정리한다.
- development console log도 explicit debug flag가 있을 때만 출력하고, 기본값은 off로 둔다. instruction 전문 대신 길이/trace id 정도만 남긴다.
- prompt/debug log에는 resume text, email, token, company block list, salary/visa preference 등 민감 필드를 redaction한다.

#### F. 프로필 공유 문구가 페이지마다 다르게 느껴질 수 있음

관련 코드:

- Career onboarding 공유 설정: `src/pages/career/onboarding.tsx:120-125`, `src/pages/career/onboarding.tsx:610-625`
- 기존 talent FAQ: `src/pages/talent.tsx:120-124`
- Profile settings 공유 설정/blocked companies: `src/components/career/CareerProfileSettingsSection.tsx`

문제:

- career onboarding에는 "Harper가 먼저 공유해요" 옵션이 있고, "잘 맞는 기회라고 판단되면 Harper가 먼저 회사에 프로필을 공유해요"라고 안내한다.
- 반면 기존 `/talent` FAQ는 "매칭된 기회를 확인한 뒤 좋아요를 선택한 경우에만 회사가 프로필을 볼 수 있습니다"라고 설명한다.
- 둘 다 의도한 product mode가 다를 수 있지만, 사용자는 같은 Harper career/talent 서비스로 받아들인다.

사용자가 느낄 문제:

- 한 페이지에서는 직접 확인 후 공유, 다른 페이지에서는 Harper가 먼저 공유라고 보이면 "내 동의 없이 회사에 공유될 수 있다"고 느낄 수 있다.
- "대화 내용은 회사에 공개되지 않아요"는 좋은 문구지만, 실제 공유되는 profile fields, resume/link, AI summary, blocked companies 적용 방식을 같이 보여주지 않으면 신뢰가 약하다.

개선:

- career/talent 전체에서 profile sharing mode 문구를 하나로 통일한다.
- 기본값이 `open_to_matches`라면 첫 onboarding에서 더 명확한 confirmation을 받는다. 신뢰를 우선하면 기본값은 `exceptional_only` 또는 "내가 먼저 확인해요"가 더 보수적이다.
- settings에서 "회사에 공유될 수 있는 항목 미리보기"와 "절대 공유하지 않는 항목: 대화 원문, blocked companies, private notes"를 표시한다.
- blocked company 기능은 "이 회사에는 공유하지 않음" 보장을 화면과 서버 정책 양쪽에서 테스트한다.

## Medium

### 11. 공개 marketing/lead API에 abuse 방어가 부족함

관련 코드:

- `src/app/api/talent/network/apply/route.ts:51-236`
- `src/app/api/talent/network/referral/create/route.ts:36-96`
- `src/app/api/talent/network/referral/convert/route.ts:18-79`
- `src/app/api/talent/email-onboarding/request/route.ts:22-41`
- `src/lib/careerEmailOnboarding/server.ts:220-260`
- `src/app/api/feedback/network/route.ts`

문제:

- 일부는 public이어야 하는 랜딩/리드 수집 API지만, 공통 rate limit, bot protection, duplicate suppression, IP/device fingerprint 제한이 일관적이지 않다.
- `career email onboarding`은 email hash/IP 기반 rate limit이 일부 구현되어 있다. 다만 CAPTCHA/bot challenge는 없고, 다른 public lead/referral/feedback API와 같은 공통 방어막으로 묶여 있지 않다.
- `network/apply`는 10MB 파일 제한은 있으나 public route에서 Storage 업로드와 Slack 알림을 실행한다.
- referral visit/convert는 token만 알면 visit/conversion count와 last visitor metadata를 갱신할 수 있고, create는 request host 기반 share URL을 만든다.

영향:

- 리드 DB/Slack 알림/Storage가 spam으로 오염될 수 있다.
- 채용/커리어 쪽은 개인정보가 들어오므로 abuse가 개인정보 처리 리스크로 연결된다.

개선:

- IP + email + localId 기준 sliding-window rate limit.
- Turnstile/reCAPTCHA 등 bot challenge.
- 동일 이메일/동일 campaign 중복 제출 정책.
- Slack 알림은 queue로 넘기고 burst suppression 적용.

### 12. 일부 서명 토큰에 만료/목적/secret 분리가 부족함

관련 코드:

- `src/lib/requestAccess/server.ts:170-224`
- `src/lib/careerEmailOnboarding/token.ts:11-27`, `src/lib/careerEmailOnboarding/token.ts:64-118`

문제:

- request access review token은 payload가 email만 포함하고 만료 시간이 없다.
- career email onboarding token은 만료와 purpose는 있지만 기본 TTL이 30일이고 secret fallback이 service role이다.

영향:

- 링크가 로그/Slack/메일에서 유출되면 장기간 재사용될 수 있다.
- secret 재사용 때문에 사고 시 전체 secret rotation 범위가 넓어진다.

개선:

- 모든 action link token에 `iat`, `exp`, `purpose`, `nonce`를 넣는다.
- DB에 nonce/hash를 저장하고 1회성 또는 revocable token으로 만든다.
- TTL은 목적별로 축소한다. 예: review action 24-72시간, login claim 7일 등.
- HMAC secret은 용도별 전용 secret 사용.

### 13. Host header 기반 URL 생성으로 링크/결제 redirect 오염 가능성

관련 코드:

- `src/app/api/toss/payments/prepare/route.ts:46-60`
- `src/app/api/toss/subscriptions/prepare/route.ts:137-140`
- `src/app/api/share/create/route.ts:29-35`
- `src/app/api/share/folder/_shared.ts:33-41`
- `src/lib/requestAccess/server.ts:133-145`
- `src/app/api/talent/network/referral/create/route.ts:23-30`
- `src/lib/careerEmailOnboarding/server.ts:99-107`, `src/app/api/talent/email-onboarding/calendar-click/route.ts:20-40`

문제:

- 일부 base URL 생성이 request의 `host` 또는 `x-forwarded-host`를 신뢰한다.
- 프록시/배포 플랫폼이 host를 엄격히 정규화하지 않으면 이메일/Slack/결제 success URL이 공격자 도메인으로 생성될 수 있다.
- career email onboarding은 환경변수 `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_SITE_URL`이 없으면 request origin을 fallback으로 쓰므로, 운영 환경변수 누락 시 같은 문제가 생긴다.

영향:

- 피싱 링크 생성, Toss redirect 오염, 공유 링크 도메인 혼동이 가능하다.

개선:

- public base URL은 `NEXT_PUBLIC_SITE_URL` 또는 서버 전용 `APP_BASE_URL`만 사용한다.
- request host를 fallback으로 쓰더라도 allowlist 검증을 한다.
- 결제 success/fail URL은 반드시 고정된 production origin을 사용한다.

### 14. LinkedIn URL 검증이 `includes("linkedin.com")`라 우회 가능

관련 코드:

- `src/app/api/talent/network/apply/route.ts:33-49`

문제:

- `parsed.hostname.toLowerCase().includes("linkedin.com")`는 `notlinkedin.com`, `linkedin.com.evil.com` 같은 host를 통과시킬 수 있다.

영향:

- 사용자 입력이 LinkedIn 프로필이라고 저장되거나 후속 ingestion/fetch 대상이 되어 데이터 품질과 SSRF/피싱 표면을 만든다.

개선:

- host 검증은 exact/suffix 방식으로 한다.
  - 허용: `linkedin.com`, `www.linkedin.com`, `*.linkedin.com`
  - 거부: `notlinkedin.com`, `linkedin.com.evil.com`
- profile path도 `/in/...` 등 필요한 패턴으로 제한한다.

### 14-1. 공유 링크/공유 폴더가 bearer token만으로 service-role 조회를 수행함

관련 코드:

- `src/app/api/share/get/route.ts:26-84`
- `src/app/api/share/folder/get/route.ts:17-220`
- `src/app/api/share/folder/candidate/route.ts:16-128`
- `src/app/api/share/folder/note/route.ts:68-248`
- token 생성: `src/app/api/share/create/route.ts:25-26`, `src/app/api/share/folder/_shared.ts:29-31`

문제:

- 공유 링크 자체는 공개 전달을 위한 bearer token 구조라 정상일 수 있다. 다만 token만 있으면 server-side service role 조회로 후보자 목록/상세/공유 메모에 접근한다.
- profile share는 `include_chat`가 켜진 경우 공유 생성자의 후보자 대화 메시지도 token 접근자에게 반환한다.
- share/folder note의 `viewerKey`는 클라이언트가 보내는 식별자라 강한 인증 수단이 아니다.
- token lookup, candidate detail lookup, note mutation에 rate limit/audit/device binding이 보이지 않는다.

영향:

- 공유 URL이 브라우저 history, analytics, Referer, Slack/메일 forward, 로그에서 노출되면 만료 전까지 후보자 정보와 일부 대화가 접근될 수 있다.
- token brute force 가능성은 낮지만, rate limit이 없으면 대량 token probing과 note spam을 막기 어렵다.

개선:

- 공유 링크 접근/후보 상세/note mutation에 IP별 rate limit과 audit log를 추가한다.
- `include_chat`는 기본 off 유지, 켜는 경우 UI에서 민감도 경고와 짧은 TTL을 적용한다.
- 공유 페이지에는 `noindex`, 강한 `Referrer-Policy`, 불필요한 third-party analytics 제거를 적용한다.
- 외부 협업 메모가 중요하면 viewer별 초대 token 또는 one-time viewer session을 발급하고 `viewerKey`만으로 수정 권한을 판단하지 않는다.

### 15. 로그에 민감 데이터가 남을 가능성

관련 코드:

- `src/app/api/realtime/token/route.ts:157-163`
- `src/hooks/career/useCareerOnboardingVoice.ts:177-180`
- `src/app/api/llm/route.ts:10-19`
- `src/app/api/tool/scrape/route.ts:226`, `src/app/api/tool/scrape/route.ts:348`, `src/app/api/tool/scrape/route.ts:434`
- `src/app/api/tool/web_search/route.ts:16-21`

문제:

- development 조건부 로그도 있지만, 일부 API는 LLM response, URL, scrape 결과, query를 그대로 출력한다.
- career prompt/instructions에는 프로필, 이력서 요약, 대화 내용이 포함될 수 있다.

영향:

- Vercel/서버 로그에 개인정보와 내부 prompt가 남을 수 있다.
- 로그 접근권한이 앱 데이터 접근권한보다 넓으면 우회 유출 경로가 된다.

개선:

- production에서 민감 payload 로그를 금지한다.
- structured logger에 redaction layer를 둔다.
- URL/query/log content는 길이 제한 + hash/preview만 남긴다.
- LLM raw response/thoughts는 저장하지 않거나 별도 보안 로그 저장소에 제한적으로 저장한다.

### 16. Supabase RLS/Policy 상태를 운영 DB와 repo migration 기준으로 동기화해야 함

관찰:

- 운영 DB 기준 RLS/policy는 이번 점검에서 직접 확인했다.
- `public` schema 106개 테이블 중 10개가 RLS disabled였다.
- `storage.objects`는 RLS enabled지만 anon 전역 허용 정책 때문에 실질 보호가 깨져 있었다.
- migration에는 일부 career 신규 테이블의 RLS enable/policy가 보인다.
  - 예: `talent_activity_events`, `talent_conversation_summaries`, `talent_company_recommendation`, `talent_company_follow`
- `supabase migration list` 기준 remote migration과 repo local migration이 맞지 않는다. repo migration만 보고 운영 DB 상태를 재현하거나 검토하기 어렵다.
- 앱 서버가 service role을 많이 사용하므로 API 코드의 소유권 필터가 사실상 주된 방어선이다.

개선:

- Supabase에서 아래 점검 SQL을 CI/운영 점검 항목으로 만든다.
  - 모든 PII/결제/커리어 테이블의 `relrowsecurity`, `relforcerowsecurity`
  - `pg_policies`의 `roles`, `cmd`, `qual`, `with_check`
  - `information_schema.role_table_grants`의 anon/authenticated broad grant
- 운영 DB schema/policy를 migration으로 역정리하거나 baseline migration을 만든다.
- user-facing table은 RLS를 기본 방어선으로 두고, service role API도 소유권 필터를 중복 적용한다.
- service role route는 최소화하고, user-scoped read/write는 access token이 붙은 anon client + RLS로 처리하는 방향을 검토한다.

## Dependency Audit

실행 명령:

```bash
pnpm audit --prod
```

결과:

- 총 34개 취약점
- 심각도: critical 1, high 11, moderate 21, low 1

주요 항목:

- `protobufjs`
  - 경로: `@google/genai@1.44.0 > protobufjs@7.5.4`
  - critical/high/moderate 다수
  - patched: 최소 `protobufjs >= 7.5.8`가 필요한 항목 포함
- `axios`
  - 경로: `@mendable/firecrawl-js@1.21.1 > axios@1.13.6`, `@slack/webhook@7.0.7 > axios@1.13.6`
  - high/moderate/low 다수
  - patched: 항목별로 `>=1.15.1`, `>=1.15.2`, `>=1.16.0`
- `ws`
  - 경로: `@google/genai`, `@mendable/firecrawl-js`, `@supabase/supabase-js` 하위
  - patched: `ws >= 8.20.1`
- `uuid`
  - 직접 의존성 `uuid@10.0.0`
  - patched: `uuid >= 11.1.1`

개선:

- `pnpm update @google/genai @mendable/firecrawl-js @slack/webhook @supabase/supabase-js uuid`
- 그래도 하위 버전이 고정되면 `pnpm.overrides`로 최소 patched 버전을 강제한다.
- 업데이트 후 `pnpm audit --prod`, `pnpm lint`, `pnpm build`를 다시 실행한다.

## 우선순위별 실행 계획

### P0: 즉시 차단

1. `public.execute_raw_sql` / `public.set_timeout_and_execute_raw_sql`의 `public`, `anon`, `authenticated` execute 권한을 즉시 revoke하고, 가능하면 drop한다.
2. `storage.objects`의 `all_allow*`, `talent_network_cv_*_any` 정책을 즉시 제거하고 private bucket read/write를 닫는다.
3. RLS disabled 10개 public table에 RLS를 enable하고, 민감 테이블의 anon/authenticated grant를 revoke한다.
4. `/api/admin/*`에서 `x-admin-password` 제거, server-side internal/admin auth로 교체.
5. `/api/toss/subscriptions/cancel`, `/api/toss/subscriptions/change-plan`, `/api/toss/subscriptions/prepare`, `/api/toss/payments/prepare`, `/api/credits/*refresh`에 인증과 `user.id` 소유권 검사 추가.
6. `getRequestUser()` unsigned fallback 제거.
7. `/api/talent/dev-sql` production 비활성화.
8. `/api/tool/scrape`, `/api/llm`, `/api/call`, `/api/pdf`, `/api/search/criteria_summarize`, `/api/hello*` 등 공개 비용/Slack relay API 임시 차단 또는 rate limit/auth 적용.

### P1: 개인정보/계정 보호 강화

1. Supabase DB SSL enforcement를 켜고 DB allowed CIDR를 `0.0.0.0/0`에서 필요한 CIDR로 축소한다.
2. Career email onboarding/login에서 `mail`/`email_onboarding` query를 token 교환 직후 제거하고, GA/Vercel Analytics pageview에서 민감 query를 redaction한다.
3. `landing_logs`의 `login_email:<raw email>` 저장을 중단하고 server-side pseudonymous id 또는 HMAC hash로 전환한다.
4. Career resume upload/parse에 크기/타입/page/text 제한 추가.
5. Career settings에서 `savedResumeStoragePath`를 사용자 화면에 표시하지 않고, resume download link의 만료/범위를 명확히 한다.
6. Realtime token에서 conversation ownership 검증 추가.
7. SVG 업로드 금지 및 이미지 재인코딩.
8. dedicated HMAC secrets 도입, service role fallback 제거.
9. CSP Report-Only 도입 후 enforce.

### P2: 운영 안정화

1. Supabase migration 상태를 운영 DB와 repo 기준으로 동기화한다.
2. Supabase Auth password policy/rate limit/redirect allow list를 강화한다.
3. public lead/referral/email/share API에 bot/rate limit/duplicate suppression/audit 적용.
4. dependency audit 취약점 업데이트.
5. 민감 로그 redaction.
6. Host allowlist 기반 base URL 생성.
7. 사용자 화면에 Supabase/Auth provider 원문 오류를 그대로 표시하지 않도록 공통 오류 mapper 적용.
8. Career login/email onboarding/onboarding/call 화면에 클릭 가능한 약관/개인정보 링크와 데이터 사용/공유/삭제 안내를 추가한다.
9. Career/talent 전체에서 profile sharing 문구와 기본 공유 설정을 통일한다.

## 권장 공통 헬퍼

관리자 API:

```ts
export async function requireAdminUser(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) throw new ApiError(401, "Unauthorized");
  if (!isInternalEmail(user.email)) throw new ApiError(403, "Forbidden");
  return user;
}
```

소유권 있는 user API:

```ts
export async function requireCurrentUser(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) throw new ApiError(401, "Unauthorized");
  return user;
}
```

결제 API에서는 body userId를 받지 않고:

```ts
const user = await requireCurrentUser(req);
const userId = user.id;
```

내부 worker API:

```ts
requireInternalWorkerSecret(req);
```

외부 공개 API:

- IP/email/localId rate limit
- bot challenge
- payload size limit
- audit log

## 완료 기준

- anon key로 `/rest/v1/rpc/execute_raw_sql`과 `/rest/v1/rpc/set_timeout_and_execute_raw_sql`을 호출하면 401/403 또는 function not found가 나온다.
- anon key로 private Storage bucket을 list할 수 없고, `talent-network-cv` 같은 upload bucket도 signed upload URL 또는 서버 API 외에는 upload/download/delete할 수 없다.
- `storage.objects`에 `anon` 대상 `qual=true` 또는 `with_check=true` 전역 정책이 없다.
- exposed `public` schema의 민감 테이블은 RLS enabled이고 anon/authenticated broad grant가 제거되어 있다.
- anon REST request로 `billing_sessions`, `payment_attempts`, `talent_internal`, `candidate_outreach*` count/read가 되지 않는다.
- Supabase DB SSL enforcement가 켜져 있고 DB allowed CIDR가 `0.0.0.0/0`이 아니다.
- Supabase Auth password policy가 최소 10-12자 이상, leaked password protection on, password update reauth/current password 요구 on으로 강화되어 있다.
- Supabase Auth redirect allow list에서 불필요한 wildcard와 오래된 preview URL이 제거되어 있다.
- 브라우저 번들에서 관리자 secret이 검색되지 않는다.
- 모든 금전/결제/구독/크레딧 mutation route가 로그인 사용자 소유권을 검사한다.
- `getRequestUser()`가 Supabase 검증 또는 서명 검증 없이는 사용자를 만들지 않는다.
- production에서 dev SQL route가 403/404이다.
- public tool/LLM route는 인증 또는 quota 없이 호출할 수 없다.
- resume/image upload는 크기, 타입, magic byte, 출력 길이 제한이 있다.
- 사용자-facing 로그인/가입/비밀번호 재설정 오류가 provider 원문 대신 일반 문구로 표시된다.
- Supabase RLS/Auth/Storage 설정이 공개 URL/anon key 노출을 전제로 검증되어 있다.
- `/career_login?mail=...&email_onboarding=...` 진입 후 token 검증/claim이 끝나면 주소창, `/career` tab 이동 URL, browser history에 `mail`/`email_onboarding`이 남지 않는다.
- GA/Vercel Analytics/landing log로 전송되는 page URL에는 email, onboarding token, invite token, OAuth code/token류 query가 포함되지 않는다.
- `landing_logs.type`에 `login_email:<raw email>` 형태의 raw email이 저장되지 않는다.
- Career login gate, career login page, email onboarding modal, onboarding 개인정보/이력서 단계에 클릭 가능한 약관/개인정보 링크와 짧은 데이터 사용 안내가 있다.
- Career settings 화면은 internal storage path를 노출하지 않고, resume download link가 있다면 signed URL의 만료/범위를 설명한다.
- 통화 시작 전 마이크, 실시간 처리, 전사/대화 저장, 회사 비공개, 삭제 요청 경로가 사용자에게 안내된다.
- development/debug console log에도 resume text, email, onboarding token, prompt 전문이 기본 출력되지 않는다.
- Career/talent 페이지의 profile sharing 문구가 서로 충돌하지 않고, 사용자가 회사 공유 범위와 blocked company 적용 범위를 확인할 수 있다.
- `pnpm audit --prod`가 critical/high 0개가 될 때까지 업데이트하거나 예외 사유가 문서화되어 있다.
