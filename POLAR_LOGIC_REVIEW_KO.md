# Polar 구독 로직 점검 문서

작성일: 2026-02-19

## 0) 반영한 값

현재 설정 기준:

- `POLAR_API_KEY`
- `POLAR_WEBHOOK_SECRET`
- Billing provider
- Polar server (`sandbox`/`production`)
- Polar success URL
- Polar product IDs (live + test monthly)
- Polar checkout links (live + test monthly)

관련 파일:
- `src/lib/polar/config.ts`
- `.env.local` (API key, webhook secret만 유지)

## 1) 현재 Polar 전체 흐름 (코드 기준)

### 1-1. 체크아웃 생성

- Billing UI에서 하드코딩 provider(`polar`)일 때 `/api/polar/checkout` 호출
- `/api/polar/checkout`은 활성 유료 구독이 이미 있으면 409로 차단(중복 구독 방지)
- 서버에서 `planKey + billing` 조합으로 Polar product ID 선택
- Polar Checkout 생성 시 metadata에 `user_id`, `plan_key`, `billing` 저장
- 성공 시 `checkout.url`로 리다이렉트

코드:
- `src/pages/my/billing.tsx`
- `src/app/api/polar/checkout/route.ts`

### 1-1.1 플랜 변경 (Subscription Update)

- 유료 구독 상태에서 플랜 변경 시 `/api/polar/change-plan` 호출
- Polar `subscriptions.update`로 product 변경 처리
- 현재 구현은 `prorationBehavior = "invoice"`로 호출(즉시 정산)
- UI 안내 문구도 "플랜 즉시 반영 + 즉시 정산 + 결제 완료 후 크레딧 반영" 기준으로 제공

코드:
- `src/pages/my/billing.tsx`
- `src/app/api/polar/change-plan/route.ts`

### 1-2. 성공 리다이렉트

- Success URL: `/billing/success?checkout_id={CHECKOUT_ID}`
- 성공 페이지에서 잠시 안내 후 `/my/billing?checkout_synced=1`로 이동
- Billing 페이지에서 2초/5초/9초 지연 재조회로 구독/크레딧 동기화 지연을 자동 보정

코드:
- `src/pages/billing/success.tsx`
- `src/pages/my/billing.tsx`
- `src/hooks/useCredit.ts`

### 1-3. 웹훅 처리

- `@polar-sh/sdk/webhooks`로 서명 검증
- `subscription.created`/`subscription.active`: 구독 upsert
- `order.paid`: 크레딧 충전 + 구독 정보 동기화
- `subscription.updated`/`subscription.uncanceled`: 상태 갱신
- `subscription.canceled`/`subscription.revoked`: 종료 상태 반영
- plan 매핑은 우선순위로 처리
  1) metadata의 `plan_id` (현재 checkout metadata에는 미포함)
  2) `POLAR_PLAN_MAP_JSON` (옵션)
  3) `plans.ls_variant_id == Polar product/price id` (현재 기본 경로)
  4) 마지막 fallback으로 기존 `payments.plan_id`

코드:
- `src/app/api/polar/webhook/route.ts`

### 1-4. 구독 취소

- 사용자 취소 버튼: `/api/polar/cancel`
- 동작: `cancelAtPeriodEnd=true` (기간 종료 후 해지)

코드:
- `src/pages/my/billing.tsx`
- `src/app/api/polar/cancel/route.ts`

### 1-5. 중복 구독 정리 보호 로직

- 웹훅은 여전히 다중 활성 구독 감지 시 기존 구독 정리(`revoke`) 로직을 유지
- 현재 플랜 변경은 checkout 신규 생성이 아니라 update API를 사용하므로, 정상 경로에서는 다중 구독이 거의 발생하지 않음

코드:
- `src/app/api/polar/webhook/route.ts`

## 2) 요청하신 4개 항목 점검 결과

### 2-1. 구독 취소/변경 로직

판정: **정상 (요구사항 충족)**

- 사용자 취소는 기간 종료 해지로 동작 (`cancelAtPeriodEnd=true`)
- 플랜 변경은 `subscription update`로 처리(기존 cancel + 신규 checkout 방식 제거)
- 월간/연간 변경도 Polar 기본 update 흐름으로 처리

근거:
- `src/app/api/polar/cancel/route.ts`
- `src/app/api/polar/webhook/route.ts`
- `src/pages/my/billing.tsx`

### 2-2. 구독 갱신 시 크레딧 충전

판정: **정상 (요구사항 충족)**

- Polar `order.paid` 이벤트에서 plan을 찾아 `applyCredits` 실행
- 갱신 결제(`subscription_cycle`)가 `order.paid`로 들어오면 동일하게 충전됨

근거:
- `src/app/api/polar/webhook/route.ts`

### 2-3. Free user 로직 유지

판정: **유지됨 (변경 없음)**

- Free refresh/annual refresh API는 수정하지 않음
- 기존 동작 그대로 유지

근거:
- `src/app/api/credits/free-refresh/route.ts`
- `src/app/api/credits/annual-refresh/route.ts`

### 2-4. 현재 plan 기반 UI 변화

판정: **정상 동작 가능 상태**

- UI는 `payments.plan_id`, `plans.cycle`, `cancel_at_period_end`를 기준으로 표시
- Polar 웹훅이 동일한 `payments` 컬럼을 갱신하므로 기존 UI 로직과 호환
- provider가 `polar`일 때 checkout/cancel API만 교체되고 UI 렌더 로직은 동일

근거:
- `src/pages/my/billing.tsx`

## 3) 검증 실행 결과

실행:
- `npm run lint -- --file ...` (Polar 관련 변경 파일)
- `npx tsc --noEmit`
- `npm run build`

결과:
- 타입체크 통과
- 빌드 성공
- 기존 코드 전반의 ESLint Warning은 다수 존재하지만(기존 이슈), 이번 Polar 변경으로 인한 오류는 없음

## 4) 운영 시 확인 포인트

- Polar Dashboard Webhook URL
  - `https://matchharper.com/api/polar/webhook`
- Polar Checkout Success URL
  - `https://matchharper.com/billing/success?checkout_id={CHECKOUT_ID}`
- `plans.ls_variant_id`에 Polar product id가 정확히 저장되어 있어야 plan 매핑이 자동 동작

## 5) 테스트 모드 전환/복귀 위치

현재 테스트용(월간) 설정은 코드 상수로 적용되어 있습니다.

- `src/lib/polar/config.ts`
  - `POLAR_SERVER = "sandbox"`
  - `POLAR_PRODUCT_PROFILE = "test-monthly"`
  - 테스트 월간 product ID 사용

테스트 종료 후 실서비스로 복귀하려면:

1. `src/lib/polar/config.ts`에서 `POLAR_SERVER = "production"`으로 변경
2. `src/lib/polar/config.ts`에서 `POLAR_PRODUCT_PROFILE = "live"`로 변경
3. 서버 재시작

## 6) 결제 테스트 전 체크리스트 (이번 점검 결과)

판정: **월간 테스트 진행 가능**

- 코드 검증
  - `lint`/`tsc`/`build` 통과
  - Polar checkout/change-plan/cancel/webhook 모두 `POLAR_SERVER = "sandbox"` 기준으로 동작
- 데이터 매핑
  - 테스트 product ID 2개를 `plans.ls_variant_id`에 넣었다면 웹훅에서 plan 인식 가능
  - `plans.cycle`은 월간 값(0)으로 맞춰야 billing UI가 월간으로 표기됨
- 운영/테스트 환경
  - 테스트 중 서버를 재시작해 최신 `.env.local` 키를 반영해야 함
  - `SUPABASE_SERVICE_ROLE_KEY`가 없으면(또는 RLS 정책이 엄격하면) 웹훅의 `payments/credits` 업데이트가 거부될 수 있음
  - Polar Dashboard Webhook URL은 실행 중인 서버로 연결되어야 함
  - `POLAR_SUCCESS_URL`이 `matchharper.com`으로 고정되어 있으므로, 로컬 테스트면 결제 완료 후 프로덕션 도메인으로 이동함

## 7) 테이블 변경 필요 여부

- 이번 `subscription update` 전환만으로는 **테이블 변경 불필요**
- 단, "정확히 다음 갱신 시점에만 플랜 자체를 시작"하는 예약 변경을 엄밀히 구현하려면 별도 예약 테이블(예: `pending_plan_changes`)과 스케줄 실행 로직이 필요할 수 있음
