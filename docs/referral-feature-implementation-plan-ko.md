# Harper Referral Feature Implementation Plan

Status: implemented engineering plan; legal review recommended before major policy changes  
Last updated: 2026-07-16  
Owner: Harper product/engineering  

## Executive Summary

`/career` 사용자가 자신의 초대 링크를 만들고 공유할 수 있게 한다. 링크 방문, 회원가입, 채용 확정 숫자는 실제 데이터로 집계한다. 리워드 지급은 이번 범위에서 자동화하지 않고, 약관과 관리자 검토를 전제로 한 수동 운영 상태로 둔다.

이번 구현의 핵심은 테이블과 컬럼 수를 최대한 작게 유지하면서도 귀속과 중복 집계를 신뢰할 수 있게 만드는 것이다. `talent_network_referral_links`는 링크 소유자와 방문 수만 책임지고, 가입/채용 귀속은 `talent_network_referral_attributions`에 가입자 1명당 1행으로 기록한다. `talent_users`에는 referral 컬럼을 추가하지 않는다.

법무 문서는 `public/docs/legal` 아래의 버전 파일을 source of truth로 둔다. 현재 문서는 Harper/KR 맥락에 맞춘 공개용 v1이며, 리워드 지급/세금/사업자 정보가 바뀌면 새 버전으로 갱신한다.

## Scope

### 포함

1. `talent_network_referral_links` 테이블 단순화.
2. `/career` 프로필 드롭다운과 index footer의 "초대하기" 진입점.
3. 초대 모달: 프로그램 설명, 약관 링크, How it works 1-2-3, 공유 링크, 리워드 범위, 링크 방문/가입/채용 숫자.
4. referral token 방문 캡처, 가입 귀속, 채용 확정 수동 집계.
5. `/referral-terms`, `/privacy` 문서의 versioned static source.

### 제외

- 리워드 자동 지급.
- 세금 원천징수/지급명세서 자동화.
- 추천받은 사람의 개인별 목록 노출.
- 부정행위 탐지를 위한 상세 이벤트 로그 대시보드. 필요하면 Phase 2로 추가한다.

## Current Code Context

- `src/lib/talentNetworkReferral.ts`에 링크 생성, 방문 기록, 전환 기록 클라이언트 helper가 있다.
- API는 `src/app/api/talent/network/referral/create`, `visit`, `convert`로 나뉘어 있다.
- 현재 `talent_network_referral_links` 타입은 방문/전환의 first/last 세부 컬럼까지 포함해 과하게 넓다.
- `/network`에는 `?ref=` 토큰 방문을 캡처하고 localStorage에 저장하는 흐름이 있다.
- `/career` 프로필 드롭다운은 `src/components/career/CareerProfileMenu.tsx`에 있다.
- 랜딩 footer는 `src/components/landing/CareerLandingFooter.tsx`에 있다.
- 기존 `/privacy`, `/terms`는 Notion 문서를 가져오는 방식이다. referral/privacy 문서는 `public/docs` 버전 파일을 source of truth로 두고, 필요하면 Notion은 운영 편집용이 아니라 legacy fallback으로만 둔다.

## Recommended Data Model

### `talent_network_referral_links`

링크 테이블은 링크 소유자와 방문 수만 저장한다. 가입 수와 채용 수는 attribution 테이블에서 count 한다.

```sql
create table public.talent_network_referral_links (
  token text primary key,
  referrer_user_id uuid not null references public.talent_users(user_id) on delete cascade,
  visit_count integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index talent_network_referral_links_referrer_user_id_key
  on public.talent_network_referral_links (referrer_user_id);
```

컬럼은 4개다.

- `token`: 공유 URL에 들어가는 공개 토큰. 예: `/career?ref=...`
- `referrer_user_id`: 링크 소유자. 이메일/이름은 `talent_users` 또는 auth profile에서 읽는다.
- `visit_count`: 링크 방문 수. 마케팅 참고 지표이며 지급 기준이 아니다.
- `created_at`: 링크 생성 시각.

`visit_count` 업데이트는 반드시 단일 SQL update로 원자적으로 처리한다. 클라이언트에서 기존 값을 읽고 `+1` 한 뒤 update하면 동시 요청에서 카운트가 유실될 수 있다.

권장 update:

```sql
update public.talent_network_referral_links
set visit_count = visit_count + 1
where token = p_token;
```

### `talent_network_referral_attributions`

가입/채용 귀속은 별도 attribution 테이블에 저장한다. 가입자 1명당 최대 1행만 허용하면 중복 signup/hire count를 막을 수 있다.

```sql
create table public.talent_network_referral_attributions (
  referred_user_id uuid primary key references public.talent_users(user_id) on delete cascade,
  token text not null references public.talent_network_referral_links(token) on delete cascade,
  hired_at timestamptz
);

create index talent_network_referral_attributions_token_idx
  on public.talent_network_referral_attributions (token);
```

컬럼은 3개다.

- `referred_user_id`: 추천 링크로 가입한 사용자. primary key라 사용자당 1회만 귀속된다.
- `token`: 어떤 추천 링크로 들어왔는지.
- `hired_at`: Harper를 통해 채용 확정된 시각. null이면 아직 채용 확정 전이다.

가입 시각이 필요하면 attribution 테이블에 컬럼을 추가하지 않고 `talent_users.created_at`을 조인해서 본다.

집계 방식:

```sql
select
  l.token,
  l.visit_count as visits,
  count(a.referred_user_id) as signups,
  count(a.referred_user_id) filter (where a.hired_at is not null) as hires
from public.talent_network_referral_links l
left join public.talent_network_referral_attributions a on a.token = l.token
where l.referrer_user_id = p_referrer_user_id
group by l.token, l.visit_count;
```

중복 방지 규칙:

- `referred_user_id` primary key로 가입 귀속은 사용자당 한 번만 허용한다.
- 이미 attribution이 있으면 새 token 클릭으로 덮어쓰지 않는다.
- referrer와 referred가 같은 user면 귀속하지 않는다.
- 내부 계정, 테스트 계정, 운영자 계정은 귀속/집계에서 제외한다.
- referral token이 localStorage에 있어도 가입 시점에 서버에서 유효성을 다시 확인한다.
- 채용 확정은 같은 row의 `hired_at`을 한 번만 채운다. 이미 `hired_at`이 있으면 다시 증가시키지 않는다.

### Excluded unless needed later

이벤트 로그, payout 테이블, 리워드 금액 테이블은 이번 범위에서 만들지 않는다. 분쟁/감사/부정행위 대응이 필요해지면 그때 `talent_network_referral_events` 또는 payout ledger를 별도로 추가한다.

## Referral Flow

### 1. Link creation

- 로그인한 `/career` 사용자가 프로필 메뉴 또는 footer에서 "초대하기"를 누른다.
- 서버는 해당 `referrer_user_id`에 이미 링크가 있으면 기존 토큰을 반환한다.
- 없으면 cryptographically random token을 생성하고 insert한다.
- 기본 URL은 `/career?ref={token}`이다.
- footer에서 비로그인 사용자가 누르면 `/career_login?next=/career&intent=referral`로 보낸다. 로그인 완료 후 `/career`에서 모달을 자동으로 연다.

### 2. Visit capture

- `/career`, `/career_login`, 필요한 경우 `/`에서 `ref` query를 읽는다.
- 토큰이 유효하고 본인 링크가 아니면 localStorage에 referral token을 저장한다.
- 서버는 `visit_count += 1`을 원자적으로 처리한다.
- 방문 수는 마케팅/참고용 수치다. 봇, 새 브라우저, 쿠키 삭제 등으로 정확도가 제한될 수 있으므로 UI 문구도 "링크 방문"으로 둔다.
- 같은 브라우저에서 반복 방문을 과하게 세지 않도록 `{token}:{date or session}` dedupe key를 localStorage에 둔다.

### 3. Signup attribution

- 신규 사용자가 가입 또는 `/api/talent/auth/bootstrap` 완료 시 저장된 referral token을 서버로 보낸다.
- 서버는 token, self-referral, 기존 귀속, 내부 계정 제외 여부를 확인한다.
- 조건이 맞으면 `talent_network_referral_attributions`에 `{ referred_user_id, token }`을 insert한다.
- 가입 귀속은 한 번만 발생한다. 사용자가 나중에 다른 referral link를 클릭해도 기존 귀속을 덮어쓰지 않는다.

### 4. Hire confirmation

- 지급 자동화는 하지 않는다.
- ops가 채용 확정을 검토한 뒤 referred user 기준으로 `hired_at`을 채운다.
- 권장 endpoint: `POST /api/internal/talent/referrals/mark-hired`
- 입력: `referredUserId`, `hireConfirmedAt`, `notes`, `confirmedBy`.
- 서버는 `talent_network_referral_attributions`에서 `referred_user_id`를 찾고 `hired_at`이 비어 있으면 채운다.
- 채용 확정 수는 `hired_at is not null` count로 계산한다. 별도 hire count 컬럼은 만들지 않는다.

## UI Entrypoints

### Index footer

`src/components/landing/CareerLandingFooter.tsx`의 `For Talent` 아래에 추가한다.

- 시작하기
- How it works
- Success stories
- Invite friends

footer 진입점은 로그인 상태를 모를 수 있다.

- 로그인 상태면 referral modal을 연다.
- 비로그인 상태면 `/career_login?next=/career&intent=referral`로 이동한다.
- 로그인 후 intent query를 유지하거나 sessionStorage에 저장해 `/career` 진입 시 모달을 자동으로 연다.

### `/career` profile dropdown

`src/components/career/CareerProfileMenu.tsx`에 `Gift` 또는 `UserPlus` 아이콘과 함께 "초대하기"를 추가한다.

권장 위치:

- 문의하기
- 초대하기
- 언어 설정
- About
- 로그아웃

프로필 메뉴 안 액션은 이미 `ActionDropdownItem` 패턴을 쓰므로 같은 컴포넌트를 사용한다.

## Referral Modal

모달은 `/career` 내부 공통 modal 스타일인 `TalentCareerModal`을 사용한다.

필수 내용:

- Header: "친구를 Harper에 초대하고 리워드를 받으세요"
- 설명: Harper를 통해 초대한 인재가 가입하고, Harper를 통해 채용까지 이어지면 감사 리워드를 받을 수 있다는 내용.
- `Read full terms here` 버튼: `/referral-terms`로 이동.
- How it works 1-2-3:
  1. 초대 링크를 공유한다.
  2. 초대받은 사람이 Harper에 가입하고 프로필을 완성한다.
  3. 그 사람이 Harper를 통해 채용되면 리워드 검토 대상이 된다.
- Share your link:
  - read-only link input
  - copy button
  - Web Share API button, supported browsers only
- Reward:
  - "채용 포지션의 연봉/계약 조건에 따라 200만~500만원"
  - "지급 조건과 시점은 약관 및 Harper 검토 기준에 따름"
- Stats:
  - 링크 방문
  - 회원가입
  - 채용 확정

Stats API는 `GET /api/talent/network/referral/me`로 분리한다.

```json
{
  "url": "https://matchharper.com/career?ref=abc",
  "token": "abc",
  "stats": {
    "visits": 12,
    "signups": 3,
    "hires": 1
  }
}
```

UI 문구에서 개인별 유입자 목록은 제공하지 않는다. 추천받은 사람의 이름, 이메일, 회사 진행 상황은 본인 동의 없이는 노출하지 않는다.

## Public Legal Documents

문서는 `public/docs/legal` 아래의 버전 파일을 source of truth로 둔다.

```text
public/docs/legal/index.json
public/docs/legal/referral-terms/v1.0.0.ko.md
public/docs/legal/privacy-policy/v1.0.0.ko.md
```

`index.json`은 latest version, status, effective date, reviewed-against metadata를 가진다. 나중에 문서가 바뀌면 새 버전 파일을 추가하고 manifest의 `latest`만 바꾼다.

## Legal Page UI

`/referral-terms`와 `/privacy`는 같은 shell을 공유한다.

- 상단: Legal eyebrow, 문서 제목, 한 줄 설명.
- 본문: 넓은 article column.
- 왼쪽 rail: `Take a copy`, `Save as PDF`, `Print`, 문서 버전, 문의 이메일.
- 문서 상단/하단에 print button을 둔다.
- `window.print()`로 PDF 저장을 지원한다.
- 별도 PDF 생성은 MVP에서 제외한다.

Jack & Jill 페이지의 레이아웃은 참고하되 텍스트와 컴포넌트는 Harper용으로 새로 작성한다. 원문 복제는 하지 않는다.

## Implementation Sequence

1. DB migration:
   - 기존 `talent_network_referral_links` 테이블은 rename/recreate하지 않고 그대로 쓴다.
   - 기존 토큰 중 유지할 수 있는 데이터는 같은 테이블 안에서 새 구조로 백필한다.
   - 링크 테이블은 `token`, `referrer_user_id`, `visit_count`, `created_at`만 남기고 나머지 컬럼을 drop 한다.
   - 새로 추가하는 테이블은 `talent_network_referral_attributions` 하나만 둔다.
   - `talent_users`에는 referral 컬럼을 추가하지 않는다.
2. Server API:
   - `GET /api/talent/network/referral/me`
   - `POST /api/talent/network/referral/visit`
   - `POST /api/talent/network/referral/attribute-signup`
   - `POST /api/internal/talent/referrals/mark-hired`
   - 기존 `/convert`는 signup attribution 또는 ops hire endpoint로 의미를 분리한다.
3. Client helper:
   - `src/lib/talentNetworkReferral.ts`를 `/career` 기준으로 변경.
   - localStorage payload는 token, capturedAt, source 정도로 단순화한다.
   - `source` enum에 `career_profile_menu`, `landing_footer`, `career_login`을 명시한다.
4. UI:
   - footer `Invite friends`
   - career profile menu `초대하기`
   - referral modal
   - `intent=referral` 자동 open
5. Document pages:
   - `public/docs/legal` manifest reader
   - `/referral-terms`
   - `/privacy`를 새 static doc source로 전환하거나, `/privacy`는 기존 Notion fallback과 충돌하지 않게 결정한다.
6. QA:
   - 비로그인 footer 클릭 -> 로그인 -> 모달 자동 open
   - 로그인 유저 링크 생성/복사
   - referral link 방문 카운트 증가
   - self visit 미집계
   - 같은 신규 유저 가입 1회만 signup 집계
   - 기존 귀속이 새 링크 클릭으로 덮어써지지 않음
   - ops hire count 중복 방지
   - 모바일 프로필 메뉴와 모달 overflow 확인
   - print/PDF 레이아웃 확인

## Privacy and Compliance Notes

- 개인정보 처리방침에는 운영 법인명, 주소, 개인정보 보호책임자, 열람청구 접수처, 처리위탁, 국외이전, 행태정보, 자동화된 결정/AI 처리, 정보주체 권리 행사 방법이 필요하다.
- 2026년 4월 개인정보 처리방침 작성지침은 생성형 AI 서비스에서 프롬프트 수집 여부, AI 학습 활용 여부, 학습 거부 방법, 외부 AI API 연계 구조 안내를 강조한다. Harper privacy policy는 이 항목을 실제 운영 방식이 바뀔 때마다 새 버전으로 갱신한다.
- 추천받은 사람 목록을 referrer에게 노출하면 개인정보 이슈가 생긴다. MVP는 숫자만 노출한다.
- 리워드 지급에는 세금, 원천징수, 기타소득/사업소득 분류, 내부 이해상충 문제가 생길 수 있다. 자동 지급은 법무/회계 검토 후 별도 범위로 분리한다.

## Open Decisions

- 운영 법인명, 주소, 개인정보 보호책임자, 법무 문의 이메일.
- 리워드 지급 시점: 채용 시작 후 90일, 수습기간 종료 후, 또는 고객사 정산 후 중 무엇으로 확정할지.
- 채용 확정 시 ops endpoint를 어디에 붙일지: 기존 ops career 화면 vs 별도 internal API only.
- `/privacy` 기존 Notion 기반 페이지를 대체할지, `/privacy-v2`로 먼저 검수할지.
- 기존 `/network` referral 로직을 유지할지 `/career` referral로 흡수할지.

## References

- Jack & Jill referral terms: `https://www.jackandjill.ai/referral-terms`
- Jack & Jill privacy policy: `https://www.jackandjill.ai/privacy`
- 개인정보보호위원회 2026 개인정보 처리방침 작성지침: `https://www.privacy.go.kr/front/bbs/bbsView.do?bbsNo=BBSMSTR_000000000049&bbscttNo=20885`
- 개인정보보호위원회 2026 작성지침 설명회 보도자료: `https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&mCode=C020010000&nttId=12030`
