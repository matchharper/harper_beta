# HARPER_BETA 보안 개선 리포트
작성일: 2026-02-25

## 범위
- 대상: `harper_beta/src`, `harper_beta/next.config.mjs`
- 방식: 정적 코드 리뷰(인증/인가, XSS, SSRF, 민감 API 남용, 입력 검증, 운영 보안 설정)
- 참고: DB RLS/인프라 WAF 설정은 코드에서 확인 불가하므로, 아래 일부 항목은 "RLS에 의존 중일 가능성"을 전제로 위험도를 평가함

## 요약
- 확인된 주요 이슈: `Critical 3`, `High 4`, `Medium 2`
- 가장 먼저 막아야 할 것:
  1. 결제/크레딧 API의 인증·인가 부재
  2. `/adminpage` 클라이언트 하드코딩 비밀번호
  3. `dangerouslySetInnerHTML` 기반 Stored/Reflected XSS 경로

---

## 상세 진단

### 1) [Critical] 결제/크레딧 API 인증·인가 부재 (임의 userId 조작 가능)
증거:
- `harper_beta/src/app/api/polar/checkout/route.ts:19` (`SUPABASE_SERVICE_ROLE_KEY` 사용)
- `harper_beta/src/app/api/polar/checkout/route.ts:46` (`userId = String(body?.userId ?? "")`)
- `harper_beta/src/app/api/polar/cancel/route.ts:44`
- `harper_beta/src/app/api/polar/change-plan/route.ts:53`
- `harper_beta/src/app/api/lemonsqueezy/cancel/route.ts:28`
- `harper_beta/src/app/api/credits/free-refresh/route.ts:33`
- `harper_beta/src/app/api/credits/annual-refresh/route.ts:26`

리스크:
- 공격자가 본인 세션 없이 임의 `userId`로 구독 취소/변경/크레딧 갱신을 시도할 수 있음
- 특히 service role 키를 사용하는 라우트는 RLS 우회를 전제로 동작할 수 있어 영향이 매우 큼

개선:
- 모든 민감 API에서 `body.userId`를 신뢰하지 말고 서버 세션에서 user id를 강제 추출
- 패턴 통일: `const authUser = await getServerAuthUser(req)` 후 `authUser.id`만 사용
- 본인 자원 접근 검증(ownership check)을 공통 유틸로 강제
- 결제/크레딧 엔드포인트에 rate limit + audit log(요청자 userId, ip, ua) 추가

---

### 2) [Critical] `/adminpage`가 클라이언트 비밀번호 기반 보호 (사실상 무방비)
증거:
- `harper_beta/src/pages/adminpage.tsx:57` (`const PASSWORD = "39773977"`)
- `harper_beta/src/pages/adminpage.tsx:115` (`localStorage.getItem("admin_password")`)
- `harper_beta/src/pages/adminpage.tsx:246` (클라이언트 비교로 통과)
- `harper_beta/src/pages/adminpage.tsx:138` (`landing_logs` 조회)
- `harper_beta/src/pages/adminpage.tsx:196` (`harper_waitlist_company` 조회)

리스크:
- 번들/소스 확인만으로 누구나 비밀번호를 획득 가능
- 로컬스토리지 값 주입만으로 우회 가능
- 내부 로그/이메일 등 민감 데이터 노출 위험

개선:
- `/adminpage`를 서버 인증 기반(예: Supabase auth + admin role claim)으로 전환
- 클라이언트 비밀번호/로컬스토리지 인증 로직 즉시 제거
- 관리자 데이터 조회는 서버 API에서 role check 후 제공

---

### 3) [Critical] Stored/Reflected XSS: 비신뢰 데이터를 `dangerouslySetInnerHTML`로 직접 렌더
증거:
- `harper_beta/src/components/chat/ChatMessageList.tsx:162`
- `harper_beta/src/components/toast/ToastProvider.tsx:93`
- `harper_beta/src/components/information/SummaryCell.tsx:98`
- `harper_beta/src/components/CandidatesList.tsx:223`
- `harper_beta/src/pages/my/p/components/ProfileBio.tsx:63`
- `harper_beta/src/pages/my/billing.tsx:252`~`274` (외부/서버 에러 문자열이 Toast 메시지로 주입 가능)

추가 경로:
- `harper_beta/src/components/chat/SharedChatPanel.tsx:47`~`55`가 메시지 DB 값을 hydrate
- 공유 페이지에서 채팅 메시지가 렌더되므로 Stored XSS가 3자에게 전파될 가능성 존재

리스크:
- 계정 탈취(토큰 탈취), 세션 오용, UI 위변조, 악성 링크 주입

개선:
- 원칙: 비신뢰 데이터는 HTML 렌더 금지, text node 렌더가 기본
- HTML 허용이 필요하면 `DOMPurify` + 허용 태그 최소화(`b`, `strong`, `br`, `a[href]` 등)
- Toast는 HTML 미허용 컴포넌트로 변경(문자열 escape 렌더)
- CSP(`script-src 'self'`, inline 제한) 도입

---

### 4) [High] URL fetch 계열 API의 SSRF 방어 미흡
증거:
- `harper_beta/src/app/api/tool/scrape/route.ts:65` (사용자 입력 URL 수신)
- `harper_beta/src/app/api/tool/scrape/route.ts:100` (`axios.get(url)` 직접 호출)
- `harper_beta/src/app/api/linkpreview/route.ts:11`~`22` (단순 hostname regex만 차단)
- `harper_beta/src/app/api/linkpreview/route.ts:103` (직접 fetch)

리스크:
- 내부망/메타데이터 엔드포인트 접근 시도 가능
- DNS rebinding, IPv6, 우회 표기(정수형 IP 등)로 단순 정규식 차단 우회 가능

개선:
- URL allowlist 기반(허용 도메인만) 또는 egress proxy 강제
- DNS resolve 후 private/link-local/loopback 대역 차단
- redirect hop마다 재검증
- 요청 크기/시간/콘텐츠 타입 제한 강화

---

### 5) [High] 비용 유발 API 남용(무인증/무제한 호출)
증거:
- `harper_beta/src/app/api/llm/route.ts:5`~`9`
- `harper_beta/src/app/api/chat/route.ts:340`~`356` (인증 체크 없음)
- `harper_beta/src/app/api/chat/candid/route.ts:372`
- `harper_beta/src/app/api/tool/web_search/route.ts:5`
- `harper_beta/src/app/api/tool/scrape/route.ts:63`
- `harper_beta/src/app/api/hello/route.ts:10`~`12` (Slack webhook relay)

리스크:
- API 비용 폭증, Slack 스팸, 서비스 품질 저하

개선:
- 로그인 필수 + 사용자별/IP별 rate limit
- 작업별 quota(일/시간 호출량)
- `/api/hello`는 내부 전용으로 격리(서명키/allowlist) 또는 제거

---

### 6) [High] IDOR 가능성: body 파라미터 기반 리소스 접근
증거:
- `harper_beta/src/app/api/search/create/route.ts:9`
- `harper_beta/src/app/api/search/run/route.ts:27`
- `harper_beta/src/app/api/search/start/route.ts:27`
- `harper_beta/src/app/api/memory/update/route.ts:81`
- `harper_beta/src/app/api/scout/title/route.ts:84`
- `harper_beta/src/app/api/share/create/route.ts:35`~`39` (코드 주석으로도 취약 인정)

리스크:
- 다른 사용자의 query/run/memory/title 데이터 접근 또는 갱신 가능성

개선:
- 요청의 식별자(`userId`, `createdBy`)를 모두 서버 세션 기반으로 대체
- `runId/queryId/candidId` 조회 시 반드시 `owner = authUser.id` 조건 추가

---

### 7) [Medium] 파일 업로드 파싱 DoS 가능성
증거:
- `harper_beta/src/app/api/pdf/route.ts:15` (`file.arrayBuffer()` 전체 메모리 적재)
- `harper_beta/src/app/api/pdf/route.ts:18` (크기 제한 없이 파싱)

리스크:
- 대용량/악성 PDF로 메모리 압박, 처리 지연

개선:
- 업로드 크기 상한(예: 10MB) 강제
- 페이지 수/처리 시간 제한
- 필요 시 queue 비동기 처리

---

### 8) [Medium] 보안 헤더/CSP 기본 설정 부재
증거:
- `harper_beta/next.config.mjs:2`~`13` (headers 설정 없음)

리스크:
- XSS/Clickjacking/콘텐츠 스니핑 방어층 부족

개선:
- `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` 적용

---

## 우선순위 실행 계획

### P0 (오늘 ~ 48시간)
- 결제/크레딧 API에 서버 세션 인증 강제, `body.userId` 제거
- `/adminpage` 임시 차단 또는 서버 role 기반으로 즉시 전환
- `ToastProvider`, `ChatMessageList` 등 핵심 렌더 경로에서 HTML 렌더 제거 또는 sanitize

### P1 (1주)
- URL fetch 계열 SSRF 방어 고도화(DNS/IP 검증, redirect 재검증)
- `/api/llm`, `/api/chat*`, `/api/tool/*`, `/api/hello` 인증/레이트리밋 적용
- IDOR 점검: 모든 라우트에 owner check 추가

### P2 (2~4주)
- 공통 보안 모듈 도입: `requireAuth()`, `requireOwner()`, `safeHtml()`
- CSP/보안 헤더 적용 및 모니터링
- 보안 테스트 자동화(정적 스캔 + 위험 라우트 통합 테스트)

---

## 권장 코드 표준(팀 룰)
- 서버 라우트에서 `userId`를 body/query로 받지 않는다
- `dangerouslySetInnerHTML`은 리뷰 승인 없이는 금지
- 외부 URL fetch는 중앙 유틸(`safeFetchExternal`)만 사용
- 서비스 키 사용 라우트는 인증/인가 테스트 케이스를 반드시 포함

---

## RLS 재활성화(무중단) 실행 가이드

전제:
- 현재 `public` 스키마 테이블과 Storage가 사실상 공개 상태이며, RLS가 꺼져 있음
- 목표: 서비스 동작을 깨지 않으면서 RLS를 단계적으로 켜기

핵심 원칙:
1. **정책을 먼저 만들고, 그 다음 RLS를 켠다**
2. **브라우저(anon/authenticated)와 서버(service_role) 경로를 분리한다**
3. **`body.userId` 신뢰를 제거하고 `auth.uid()` 기반으로 통일한다**
4. **테이블 단위로 순차 적용하고, 테이블 단위 롤백이 가능해야 한다**

### 1) 먼저 해야 하는 코드 정리 (RLS 켜기 전)

RLS를 켜면 장애가 나는 지점은 대부분 \"서버 라우트가 anon 키로 DB를 직접 때리는 코드\"입니다.  
아래 원칙으로 먼저 수정합니다.

- 서버 API 라우트
  - 사용자 컨텍스트가 필요한 라우트: `createRouteHandlerClient` 등으로 세션 user 확인 후 실행
  - 내부 전용 라우트: `service_role` 클라이언트로만 접근, 별도 인증/서명 검증 필수
- 클라이언트에서 직접 읽는 테이블
  - 반드시 \"내 데이터만\" 혹은 \"의도된 공개 데이터만\" 읽도록 정책 설계
- 현재 위험 패턴 제거
  - `body.userId`/`body.createdBy` 의존 로직 제거

### 2) 접근 모델 정의 (테이블 분류)

`harper_beta/src` 기준 사용 테이블:
`automation`, `automation_results`, `calls`, `candid`, `company_code`, `company_db`, `company_users`, `connection`, `credit_request`, `credits`, `credits_history`, `documents`, `feedback`, `harper_waitlist`, `harper_waitlist_company`, `landing_logs`, `link_previews`, `logs`, `memory`, `messages`, `new_logs`, `payments`, `plans`, `profile_shares`, `queries`, `request`, `resumes`, `runs`, `runs_pages`, `settings`, `summary`, `synthesized_summary`, `unlock_profile`, `users`

권장 분류:
- 사용자 소유 데이터(행 소유권 필요):  
  `queries`, `messages`, `memory`, `runs`, `runs_pages`, `settings`, `credits`, `credits_history`, `payments`, `company_users`, `connection`, `request`, `unlock_profile`, `resumes`, `calls`
- 서버 내부 전용(브라우저 직접 접근 금지):  
  `landing_logs`, `harper_waitlist_company`, `new_logs`, `logs`, `automation`, `automation_results`, `documents`, `link_previews`, `profile_shares`(원칙상 서버 API만), 결제 웹훅 연동 테이블
- 공개/준공개 참조 데이터(필요 시 read-only 공개):  
  `plans`, `company_db`, `summary`(정말 공개가 맞을 때만)

### 3) 정책 템플릿

#### 3-1. `user_id` 컬럼이 있는 테이블 (가장 흔함)

```sql
alter table public.messages enable row level security;

create policy messages_select_own
on public.messages
for select
to authenticated
using (auth.uid() = user_id);

create policy messages_insert_own
on public.messages
for insert
to authenticated
with check (auth.uid() = user_id);

create policy messages_update_own
on public.messages
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy messages_delete_own
on public.messages
for delete
to authenticated
using (auth.uid() = user_id);
```

#### 3-2. 부모 테이블 소유권을 따라가는 테이블 (`runs_pages`)

```sql
alter table public.runs_pages enable row level security;

create policy runs_pages_select_own
on public.runs_pages
for select
to authenticated
using (
  exists (
    select 1
    from public.runs r
    where r.id = runs_pages.run_id
      and r.user_id = auth.uid()
  )
);
```

#### 3-3. 공개 read-only 테이블 (`plans` 예시)

```sql
alter table public.plans enable row level security;

create policy plans_select_all
on public.plans
for select
to anon, authenticated
using (true);
```

주의:
- `service_role`은 RLS를 우회하므로, 내부 작업은 서버에서만 실행하도록 분리해야 함
- \"아무나 읽어도 되는 데이터\"가 아니라면 `using (true)` 정책은 금지

### 4) Storage 정책

권장:
- 모든 bucket을 기본 `private`로 전환
- 필요한 bucket만 최소 권한 정책 적용

예시(사용자별 폴더 접근):
```sql
-- bucket: resumes, 경로: {user_id}/filename.pdf
create policy resumes_read_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy resumes_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

### 5) 무중단 롤아웃 순서

1. **스테이징에서 정책 생성(아직 RLS OFF)**  
   정책 SQL을 먼저 모두 적용하고 시나리오 테스트
2. **코드 배포 1차**  
   서버 라우트의 `userId` 신뢰 제거 + 세션 기반 인증 강제
3. **저위험 테이블부터 RLS ON**  
   `plans` 같은 읽기 전용/영향 적은 테이블부터
4. **사용자 소유 테이블 RLS ON**  
   `messages`, `queries`, `runs`, `memory`, `settings` 등
5. **내부 전용 테이블 RLS ON + 브라우저 차단 확인**  
   `landing_logs`, `harper_waitlist_company`, `new_logs` 등
6. **Storage private 전환 + 정책 적용**
7. **운영 모니터링**  
   401/403, PostgREST permission 에러, 결제/검색 플로우 실패율 확인

### 6) 롤백 플랜 (테이블 단위)

장애 시 전체 롤백이 아니라 **테이블 단위**로 되돌립니다.

```sql
alter table public.messages disable row level security;
-- 또는 문제 정책만 drop policy
```

운영 원칙:
- 한번에 전체 테이블 RLS ON 금지
- 반드시 단계별 적용 + 체크리스트 완료 후 다음 단계 진행

### 7) 지금 바로 실행할 최소 작업 (추천)

P0:
1. 결제/크레딧/메모리/검색 API에서 `body.userId` 제거
2. `/adminpage` 서버 권한 체크로 전환
3. `messages`, `queries`, `runs`, `runs_pages`, `memory`, `settings` 정책 작성
4. 위 6개 테이블부터 스테이징에서 RLS ON 검증

P1:
1. 내부 전용 테이블(`landing_logs`, `new_logs`, `harper_waitlist_company`) RLS ON
2. Storage bucket private + 정책 반영
3. 공개 필요 테이블만 read-only 익명 정책 허용
