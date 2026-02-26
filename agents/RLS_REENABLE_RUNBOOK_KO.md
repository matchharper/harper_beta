# RLS 재활성화 실행 런북 (중단 허용, 매우 구체적)
작성일: 2026-02-25

이 문서는 **서비스 중단을 감수하고** RLS를 다시 켜는 실행 절차입니다.  
아래 순서를 그대로 따라가면 됩니다.

## 0. 목표
- `public` 테이블 전체에 RLS 적용
- `anon/authenticated` 권한 최소화
- `service_role`은 서버 API에서만 사용
- 필요 시 즉시 롤백 가능

---

## 1. 작업 전 준비 (필수)

### 1-1. 작업 시간 확보
- 최소 1~2시간 확보
- 사용자 공지: 점검 시간 동안 일부/전체 기능 중단

### 1-2. 백업/복구 포인트 만들기
- Supabase Dashboard에서 백업/스냅샷 확인
- 가능하면 `Point-in-time restore` 시점 메모

### 1-3. 앱/워커 중지
- `harper_beta` 배포 중단(maintenance)
- `harper_worker` 중지
- 외부 cron/automation 중지

---

## 2. 현재 상태 진단 SQL (SQL Editor에서 실행)

```sql
-- RLS 상태
select schemaname, tablename, rowsecurity, forcerowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- anon/authenticated 테이블 권한
select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- bucket 공개 여부
select id, name, public
from storage.buckets
order by name;
```

---

## 3. 1차 락다운 (모든 public 테이블 잠금)

다음 SQL을 한 번에 실행:

```sql
begin;

-- 1) 모든 public 테이블 RLS 활성화 + 강제
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schemaname, r.tablename);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 2) anon/authenticated 권한 일괄 회수
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- schema 사용권한은 유지
GRANT USAGE ON SCHEMA public TO anon, authenticated;

commit;
```

이 시점부터 대부분 기능은 당연히 깨집니다(정상).

---

## 4. 정책 생성: 공통 베이스

### 4-1. (선택) 관리자 판별 함수

```sql
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;
```

### 4-2. `user_id` 기반 테이블: 읽기 권한(own row) 일괄 생성

```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'user_id'
  LOOP
    EXECUTE format('GRANT SELECT ON TABLE %I.%I TO authenticated', r.table_schema, r.table_name);

    EXECUTE format('DROP POLICY IF EXISTS select_own ON %I.%I', r.table_schema, r.table_name);
    EXECUTE format(
      'CREATE POLICY select_own ON %I.%I FOR SELECT TO authenticated USING (auth.uid() = user_id)',
      r.table_schema, r.table_name
    );
  END LOOP;
END $$;
```

---

## 5. 정책 생성: 쓰기 필요한 테이블만 명시적으로 열기

아래 SQL은 현재 프론트 코드 기준으로 **클라이언트 쓰기가 필요한 테이블만** 엽니다.

```sql
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'messages',
    'queries',
    'runs',
    'automation',
    'connection',
    'request',
    'unlock_profile',
    'settings',
    'company_users',
    'credit_request'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = t
        AND column_name = 'user_id'
    ) THEN
      EXECUTE format('GRANT INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);

      EXECUTE format('DROP POLICY IF EXISTS insert_own ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS update_own ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS delete_own ON public.%I', t);

      EXECUTE format(
        'CREATE POLICY insert_own ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)',
        t
      );

      EXECUTE format(
        'CREATE POLICY update_own ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
        t
      );

      EXECUTE format(
        'CREATE POLICY delete_own ON public.%I FOR DELETE TO authenticated USING (auth.uid() = user_id)',
        t
      );
    ELSE
      RAISE NOTICE 'skip %, no user_id column', t;
    END IF;
  END LOOP;
END $$;
```

중요:
- `payments`, `credits`, `credits_history`는 **읽기만** 유지 (클라 쓰기 금지)

---

## 6. `runs_pages` 정책 (부모 `runs.user_id` 기반)

```sql
GRANT SELECT ON TABLE public.runs_pages TO authenticated;

DROP POLICY IF EXISTS runs_pages_select_own ON public.runs_pages;
CREATE POLICY runs_pages_select_own
ON public.runs_pages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.runs r
    WHERE r.id = runs_pages.run_id
      AND r.user_id = auth.uid()
  )
);
```

### 6-2. `runs` 쓰기 정책 (채팅/검색 실행 필수)

현재 프론트는 `runs`에 `INSERT`(검색 시작)와 `UPDATE`(중단/상태변경)를 수행합니다.  
아래를 반드시 추가하세요.

```sql
GRANT INSERT, UPDATE ON TABLE public.runs TO authenticated;

DROP POLICY IF EXISTS runs_insert_own ON public.runs;
CREATE POLICY runs_insert_own
ON public.runs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS runs_update_own ON public.runs;
CREATE POLICY runs_update_own
ON public.runs
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

### 6-3. `runs_pages` 업데이트 정책 (페이지 조회 상태 저장용)

```sql
GRANT UPDATE ON TABLE public.runs_pages TO authenticated;

DROP POLICY IF EXISTS runs_pages_update_own ON public.runs_pages;
CREATE POLICY runs_pages_update_own
ON public.runs_pages
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.runs r
    WHERE r.id = runs_pages.run_id
      AND r.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.runs r
    WHERE r.id = runs_pages.run_id
      AND r.user_id = auth.uid()
  )
);
```

---

## 7. 참조 데이터/공개 데이터 정책

### 7-1. 기본 참조 테이블

```sql
-- 요금제: 로그인 전에도 필요하면 anon 포함
GRANT SELECT ON TABLE public.plans TO anon, authenticated;
DROP POLICY IF EXISTS plans_read_all ON public.plans;
CREATE POLICY plans_read_all
ON public.plans
FOR SELECT
TO anon, authenticated
USING (true);

-- 회사 DB, 후보 DB: 우선 authenticated만 허용
GRANT SELECT ON TABLE public.company_db TO authenticated;
DROP POLICY IF EXISTS company_db_read_auth ON public.company_db;
CREATE POLICY company_db_read_auth
ON public.company_db
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON TABLE public.candid TO authenticated;
DROP POLICY IF EXISTS candid_read_auth ON public.candid;
CREATE POLICY candid_read_auth
ON public.candid
FOR SELECT
TO authenticated
USING (true);

-- 후보 상세 하위 테이블 (candid 상세 렌더링에 필요)
GRANT SELECT ON TABLE public.experience_user TO authenticated;
DROP POLICY IF EXISTS experience_user_read_auth ON public.experience_user;
CREATE POLICY experience_user_read_auth
ON public.experience_user
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON TABLE public.edu_user TO authenticated;
DROP POLICY IF EXISTS edu_user_read_auth ON public.edu_user;
CREATE POLICY edu_user_read_auth
ON public.edu_user
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON TABLE public.publications TO authenticated;
DROP POLICY IF EXISTS publications_read_auth ON public.publications;
CREATE POLICY publications_read_auth
ON public.publications
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON TABLE public.extra_experience TO authenticated;
DROP POLICY IF EXISTS extra_experience_read_auth ON public.extra_experience;
CREATE POLICY extra_experience_read_auth
ON public.extra_experience
FOR SELECT
TO authenticated
USING (true);

-- 후보 상세 확장 데이터
GRANT SELECT ON TABLE public.summary TO authenticated;
DROP POLICY IF EXISTS summary_read_auth ON public.summary;
CREATE POLICY summary_read_auth
ON public.summary
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON TABLE public.github_repo_contribution TO authenticated;
DROP POLICY IF EXISTS github_repo_contribution_read_auth ON public.github_repo_contribution;
CREATE POLICY github_repo_contribution_read_auth
ON public.github_repo_contribution
FOR SELECT
TO authenticated
USING (true);

-- unlock_profile는 user_id가 아니라 company_user_id 컬럼을 사용
GRANT SELECT, INSERT, DELETE ON TABLE public.unlock_profile TO authenticated;
DROP POLICY IF EXISTS unlock_profile_select_own ON public.unlock_profile;
CREATE POLICY unlock_profile_select_own
ON public.unlock_profile
FOR SELECT
TO authenticated
USING (auth.uid() = company_user_id);

DROP POLICY IF EXISTS unlock_profile_insert_own ON public.unlock_profile;
CREATE POLICY unlock_profile_insert_own
ON public.unlock_profile
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = company_user_id);

DROP POLICY IF EXISTS unlock_profile_delete_own ON public.unlock_profile;
CREATE POLICY unlock_profile_delete_own
ON public.unlock_profile
FOR DELETE
TO authenticated
USING (auth.uid() = company_user_id);

-- 검색 결과 설명(summary)은 본인 run에 연결된 row만 읽기 허용
GRANT SELECT ON TABLE public.synthesized_summary TO authenticated;
DROP POLICY IF EXISTS synthesized_summary_select_own_run ON public.synthesized_summary;
CREATE POLICY synthesized_summary_select_own_run
ON public.synthesized_summary
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.runs r
    WHERE r.id = synthesized_summary.run_id
      AND r.user_id = auth.uid()
  )
);
```

### 7-2. 마케팅 수집 테이블 (호환 모드)

현재 코드상 비로그인 페이지에서 아래 insert를 사용합니다.
- `landing_logs`
- `harper_waitlist`
- `harper_waitlist_company`

호환 모드(서비스 유지 우선): insert만 허용

```sql
GRANT INSERT ON TABLE public.landing_logs TO anon, authenticated;
DROP POLICY IF EXISTS landing_logs_insert_any ON public.landing_logs;
CREATE POLICY landing_logs_insert_any
ON public.landing_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

GRANT INSERT ON TABLE public.harper_waitlist TO anon, authenticated;
DROP POLICY IF EXISTS harper_waitlist_insert_any ON public.harper_waitlist;
CREATE POLICY harper_waitlist_insert_any
ON public.harper_waitlist
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

GRANT INSERT ON TABLE public.harper_waitlist_company TO anon, authenticated;
DROP POLICY IF EXISTS harper_waitlist_company_insert_any ON public.harper_waitlist_company;
CREATE POLICY harper_waitlist_company_insert_any
ON public.harper_waitlist_company
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
```

`/adminpage`를 **비로그인 상태에서 조회**해야 한다면 아래를 추가:

```sql
GRANT SELECT ON TABLE public.landing_logs TO anon, authenticated;
DROP POLICY IF EXISTS landing_logs_select_any ON public.landing_logs;
CREATE POLICY landing_logs_select_any
ON public.landing_logs
FOR SELECT
TO anon, authenticated
USING (true);

GRANT SELECT ON TABLE public.harper_waitlist_company TO anon, authenticated;
DROP POLICY IF EXISTS harper_waitlist_company_select_any ON public.harper_waitlist_company;
CREATE POLICY harper_waitlist_company_select_any
ON public.harper_waitlist_company
FOR SELECT
TO anon, authenticated
USING (true);
```

엄격 모드(보안 우선): 위 3개 정책도 만들지 말고 서버 API로 이관 후 오픈

---

## 8. 나머지 내부 테이블은 기본 차단 유지

아래 계열은 브라우저 직접 접근 불필요/위험도가 높으므로 정책 없이 유지:
- `new_logs`, `logs`, `documents`, `link_previews`, `profile_shares` (원칙상 서버 API만)
- 결제 웹훅 처리 관련 내부 데이터 경로

정책이 없고 grant도 없으면 차단됩니다.

---

## 9. Storage 잠그기

### 9-1. bucket public 해제

```sql
update storage.buckets
set public = false;
```

### 9-2. 예시 정책 (`resumes` 버킷, 경로 `{user_id}/...`)

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;

DROP POLICY IF EXISTS resumes_read_own ON storage.objects;
CREATE POLICY resumes_read_own
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'resumes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS resumes_insert_own ON storage.objects;
CREATE POLICY resumes_insert_own
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'resumes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS resumes_update_own ON storage.objects;
CREATE POLICY resumes_update_own
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'resumes'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'resumes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS resumes_delete_own ON storage.objects;
CREATE POLICY resumes_delete_own
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'resumes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

---

## 10. 검증 체크리스트 (반드시 직접 확인)

### 10-1. 익명(로그아웃) 상태
- `/` 접속 가능
- (호환 모드라면) 랜딩 로그/웨이틀리스트 insert 성공
- 인증 필요한 페이지는 데이터 조회 실패해야 정상

### 10-2. 로그인 사용자 A
- 내 `queries/messages/runs/runs_pages/settings/company_users` 조회/쓰기 가능
- 내 `payments/credits` 조회 가능, 쓰기 불가

### 10-3. 로그인 사용자 B
- A의 데이터 조회/수정 불가

### 10-4. 서버 API
- 결제/웹훅/공유 링크/스크래핑 API 동작 확인
- service role 경로만 필요한 데이터 접근 가능해야 정상

---

## 11. 즉시 롤백 SQL (장애 시)

```sql
begin;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', r.schemaname, r.tablename);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

commit;
```

---

## 12. 작업 후 바로 할 일 (중요)

1. `harper_beta` 서버 API에서 `body.userId` 신뢰 로직 제거
2. `/adminpage` 클라이언트 비밀번호 방식 제거
3. `dangerouslySetInnerHTML` 경로 sanitize 또는 text 렌더로 전환
4. Supabase SQL을 migration 파일로 고정(`supabase/migrations`)해서 재현 가능하게 관리
