# Referral Feature Acceptance Audit

Last updated: 2026-07-16  
Scope: Harper Career referral MVP  
Status: code-level pass, API sequence pass against `.env.local` Supabase

## 목적

이 문서는 referral 기능이 "제대로 구현됐다"고 판단할 객관 기준과, 현재 코드가 그 기준을 충족하는지 점검한 결과를 남긴다. 기준은 취향이 아니라 데이터 무결성, 보안 경계, 실제 사용자 흐름, 배포 가능성으로 판단한다.

## 판정 기준

### 1. 데이터 모델 최소성

통과 기준:

- `talent_users`에 referral 전용 칼럼을 추가하지 않는다.
- `talent_network_referral_links`는 `token`, `referrer_user_id`, `visit_count`, `created_at`만 가진다.
- `talent_network_referral_attributions`는 `referred_user_id`, `token`, `hired_at`만 가진다.
- 가입 수와 채용 수는 counter 컬럼이 아니라 attribution row count로 계산한다.
- 기존 referral link 데이터가 있으면 같은 `talent_network_referral_links` 테이블 안에서 가능한 범위로 백필한 뒤 불필요한 컬럼을 제거한다.

점검 결과:

- 통과. 타입 정의와 migration 모두 최소 모델을 사용한다.
- migration은 기존 broad `talent_network_referral_links`를 rename하지 않고 제자리에서 수정한다. `sharer_email`과 `talent_users.email`을 매칭해 `referrer_user_id`를 백필한 뒤, `token`, `referrer_user_id`, `visit_count`, `created_at` 외 컬럼을 제거한다.
- `talent_users`에는 referral 칼럼을 추가하지 않았다.

### 2. 링크 생성 정확성

통과 기준:

- 링크 생성은 로그인한 Harper Career 사용자만 가능하다.
- 클라이언트가 referrer identity를 전달하지 않는다. 서버가 bearer token의 user id를 사용한다.
- 사용자당 링크는 최대 1개다.
- token은 예측하기 어려운 서버 생성 값이어야 한다.
- 반환 URL은 `/career?ref={token}` 형태다.

점검 결과:

- 통과. `POST /api/talent/network/referral/create`와 `GET /api/talent/network/referral/me` 모두 `getRequestUser`로 인증한다.
- `getOrCreateTalentNetworkReferralLink`는 서버에서 24 byte random `base64url` token을 만들고, `referrer_user_id` unique index로 사용자당 1개를 보장한다.
- URL은 `buildReferralUrl`에서 `/career?ref=`로만 만든다.

### 3. 방문 기록 정확성

통과 기준:

- `ref` query token을 `/career`, `/career_login`에서 캡처한다.
- 방문 수 증가는 DB에서 단일 update/RPC로 원자적으로 처리한다.
- 로그인한 사용자가 자기 링크를 방문하면 방문 수를 늘리지 않는다.
- 같은 브라우저의 반복 방문은 클라이언트에서 과도하게 중복 집계하지 않는다.
- invalid token은 localStorage에 저장하지 않는다.
- dedupe된 방문이라도 현재 token과 다른 저장 token을 반환하지 않는다.

점검 결과:

- 통과. `record_talent_network_referral_visit` RPC가 atomic update를 수행한다.
- `captureTalentNetworkReferralFromCurrentLocation`은 token별/일자별 dedupe key를 사용하고, 저장 token이 현재 token과 일치할 때만 stored referral을 반환한다.
- `/career_login`에서 먼저 캡처하고, 로그인 후 `/career`로 이어질 때 같은 token/day는 중복 증가하지 않는다.

### 4. 가입 귀속 정확성

통과 기준:

- signup/bootstrap 시점에 referral token이 서버로 전달된다.
- 신규 talent user에게만 attribution을 만든다.
- 자기 추천, 내부 계정, invalid token은 귀속하지 않는다.
- 이미 attribution이 있는 사용자는 다른 token으로 덮어쓰지 않는다.
- attribution 실패가 로그인/가입 자체를 깨뜨리지 않는다.

점검 결과:

- 통과. `getCareerSignupAttributionPayload`가 URL 또는 localStorage token을 bootstrap payload에 포함한다.
- `/api/talent/auth/bootstrap`은 `existingTalentUser`가 없을 때만 `attributeTalentNetworkReferralSignup`을 호출한다.
- 서버는 self-referral, internal email, missing token, duplicate attribution을 제외한다.
- duplicate는 unique violation을 `already_attributed`로 처리한다.
- bootstrap에서는 attribution error를 catch/log 처리해 가입 흐름을 막지 않는다.

### 5. 집계와 개인정보 경계

통과 기준:

- 추천자에게 노출하는 값은 `visits`, `signups`, `hires` 세 가지 집계 숫자다.
- 추천받은 사람의 이름, 이메일, 채용 진행 상태 등 개인별 정보는 UI/API 응답에 포함하지 않는다.
- 가입 수는 attribution row count, 채용 수는 `hired_at is not null` count로 계산한다.

점검 결과:

- 통과. `GET /api/talent/network/referral/me`는 `url`, `token`, `createdAt`, `stats`만 반환한다.
- modal은 링크 방문, 회원가입, 채용 확정 집계만 표시한다.

### 6. 채용 확정 처리

통과 기준:

- 채용 확정은 internal user만 호출할 수 있다.
- 지급 자동화는 하지 않는다.
- referred user id는 UUID여야 한다.
- `hiredAt`이 들어오면 유효한 date여야 하며, 없으면 서버 시각을 사용한다.
- 이미 `hired_at`이 있으면 idempotent하게 `already_marked`를 반환한다.

점검 결과:

- 통과. `/api/internal/talent/referrals/mark-hired`와 legacy-compatible `/api/talent/network/referral/convert` 모두 internal email만 허용한다.
- `markTalentNetworkReferralHired`에서 UUID/date를 검증하고, `hired_at is null` 조건으로 한 번만 업데이트한다.

### 7. 사용자 진입점과 UI

통과 기준:

- index footer의 `For Talent` 아래에 초대 진입점이 있다.
- `/career` profile dropdown 안에 `초대하기`가 있다.
- footer에서 비로그인 사용자는 login 후 referral modal intent로 이어진다.
- modal에는 설명, `Read full terms here`, How it works 1-2-3, share link, 리워드 범위, 세 가지 stats가 있다.
- copy/share 버튼은 실제 링크를 사용한다.
- UI는 기존 career modal/button/input/token 스타일을 사용하고, 과한 card nesting, eyebrow, uppercase 장식을 새로 추가하지 않는다.

점검 결과:

- 통과. footer는 `/career_login?next=%2Fcareer%3Fintent%3Dreferral`로 이동한다.
- profile dropdown은 event bridge로 `CareerReferralModal`을 연다.
- modal은 `TalentCareerModal`, shared `Button`, shared `Input`, semantic tokens를 사용한다.

### 8. 법무 문서와 버전 관리

통과 기준:

- referral terms와 privacy는 `public/docs/legal` 아래 markdown version file로 관리한다.
- manifest가 latest version을 가리킨다.
- `/referral-terms`, `/privacy`는 같은 versioned legal shell을 사용한다.
- 왼쪽 rail에 `Take a copy`, `Print`, `Save as PDF`, version/effective date가 있다.
- `/referral-terms`는 index와 같은 AppBar/Footer를 사용하고, 문서 locale 기준으로 문구가 맞아야 한다.
- 문서는 Harper/KR 맥락으로 작성되어 있고 공개 페이지에 draft placeholder가 노출되지 않는다.

점검 결과:

- 통과. `public/docs/legal/index.json`, `referral-terms/v1.0.0.ko.md`, `privacy-policy/v1.0.0.ko.md`가 source of truth다.
- `/privacy`는 Notion fetch 대신 versioned local markdown을 사용한다.
- `/referral-terms`는 landing AppBar/Footer를 사용하며, `locale: "ko"` 문서 기준으로 한국어 문구가 렌더링된다.
- 공개 문서에서 `draft`, `초안`, `배포 전` placeholder는 제거했다.

### 9. 기존 코드 회귀 방지

통과 기준:

- 새 referral 구현 때문에 기존 career login/session/bootstrap 흐름이 깨지지 않는다.
- 예전 `/network?ref=` 방문 캡처가 남아 있어도 없어진 `sharer_email` 필드에 의존하지 않는다.
- 계정 삭제 시 referrer link와 referred attribution이 같이 정리된다.

점검 결과:

- 통과. `/network`의 referral capture 저장 조건을 token 기반으로 바꿨다.
- account deletion은 `talent_network_referral_attributions.referred_user_id`와 `talent_network_referral_links.referrer_user_id`를 삭제한다.

### 10. 검증 명령

통과 기준:

- TypeScript compile 통과.
- referral 관련 targeted lint 통과.
- legacy `/network` referral capture 변경은 단독 lint에서 error가 없어야 한다. 기존 unrelated warning은 별도 network page 정리 과제로 분리한다.
- production build 통과.
- `/referral-terms`, `/privacy`, referral login entry URL이 브라우저에서 렌더링된다.

점검 결과:

- 통과. 아래 명령을 실행했다.

```bash
pnpm exec tsc --noEmit
pnpm exec eslint src/components/career/referral/CareerReferralModal.tsx src/components/career/referral/careerReferralEvents.ts src/components/career/CareerProfileMenu.tsx src/components/career/CareerWorkspacePage.tsx src/components/landing/VersionedLegalDocumentPage.tsx src/components/landing/CareerLandingFooter.tsx src/lib/talentNetworkReferral.ts src/lib/talentNetworkReferralServer.ts src/lib/legalDocs.server.ts src/lib/career/signupAttribution.ts src/hooks/career/useCareerAuth.ts src/pages/career_login.tsx src/pages/privacy.tsx src/pages/referral-terms.tsx src/app/api/talent/network/referral/create/route.ts src/app/api/talent/network/referral/visit/route.ts src/app/api/talent/network/referral/convert/route.ts src/app/api/talent/network/referral/me/route.ts src/app/api/talent/network/referral/attribute-signup/route.ts src/app/api/internal/talent/referrals/mark-hired/route.ts src/app/api/talent/auth/bootstrap/route.ts src/app/api/talent/account/route.ts
pnpm exec eslint src/pages/network.tsx
pnpm build
```

`src/pages/network.tsx` 단독 lint는 exit code 0이다. 남은 warning은 기존 static-components/set-state-in-effect 경고이며, 이번 referral capture 변경에서 새 error는 없다.

## 이번 감사에서 고친 문제

1. Internal 계정 제외가 `@matchharper.com` 도메인만 보던 문제를 `isInternalEmail` helper 재사용으로 고쳤다.
2. 같은 token/day dedupe 시 localStorage의 다른 token을 잘못 반환할 수 있는 문제를 고쳤다.
3. `/network?ref=` legacy capture가 더 이상 존재하지 않는 `sharerEmail`에 의존하던 문제를 token 기반 저장으로 고쳤다.
4. 채용 확정 API에 UUID/date validation을 추가했다.
5. migration을 기존 `talent_network_referral_links` 제자리 alter/drop-column 방식으로 바꿨다. 운영 DB에 links 테이블이 이미 있으면 새로 추가되는 테이블은 `talent_network_referral_attributions` 하나뿐이다.

## 실제 시퀀스 테스트

2026-07-16에 `.env.local` Supabase와 로컬 dev 서버(`http://localhost:3000`)를 대상으로 임시 auth user 3명을 만들어 API 시퀀스를 직접 실행했다. 테스트 데이터는 마지막에 삭제했다.

통과한 시퀀스:

- referrer 임시 auth/talent user 생성
- referred 임시 auth/talent user 생성
- internal 임시 auth/talent user 생성
- `POST /api/talent/network/referral/create`
- `GET /api/talent/network/referral/me`
- anonymous `POST /api/talent/network/referral/visit`
- referrer self-visit no increment 확인
- referred `POST /api/talent/network/referral/attribute-signup`
- duplicate signup idempotency 확인
- internal user signup ignored 확인
- internal `POST /api/internal/talent/referrals/mark-hired`
- duplicate hire idempotency 확인
- final stats `{ visits: 1, signups: 1, hires: 1 }` 확인
- referral rows, talent users, auth users cleanup 확인

## 운영상 남은 주의점

기능 시퀀스는 통과했지만, Supabase CLI migration history는 여전히 remote/local mismatch 상태다. 그래서 향후 `supabase db push`를 안정적으로 쓰려면 별도로 migration history를 정리해야 한다.

`supabase migration repair` 또는 `--include-all`은 기존 migration history를 변경할 수 있으므로 별도 확인 없이 실행하지 않는다.
