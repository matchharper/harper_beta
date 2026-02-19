# Polar 플랜 변경별 결제/크레딧 시점 정리

작성일: 2026-02-19

## 기준 (현재 코드)

- 플랜 변경 API: `src/app/api/polar/change-plan/route.ts`
  - `subscriptions.update({ productId, prorationBehavior: "invoice" })` 호출
  - 즉, 플랜 변경 차액은 즉시 인보이스로 정산
- 플랜 상태 반영: `src/app/api/polar/webhook/route.ts`
  - `subscription.updated` 이벤트에서 `payments.plan_id` 즉시 업데이트
- 크레딧 충전: `src/app/api/polar/webhook/route.ts`
  - **`order.paid` 이벤트에서만** `credits`/`credits_history` 갱신

즉, 공통적으로:
- **플랜 변경 자체는 즉시**
- **크레딧은 결제가 실제 발생한 시점(`order.paid`)에 충전**

---

## 변경 유형별 시점

| 변경 유형 | 결제 시점 | 크레딧 충전 시점 |
|---|---|---|
| `Pro Monthly ↔ Max Monthly` (같은 주기) | **즉시 정산** | 즉시 정산 직후 `order.paid` 시점 |
| `Pro Yearly ↔ Max Yearly` (같은 주기) | **즉시 정산** | 즉시 정산 직후 `order.paid` 시점 |
| `Pro Monthly ↔ Pro Yearly` (주기 변경) | **즉시 정산** | 즉시 정산 직후 `order.paid` 시점 |
| `Max Monthly ↔ Max Yearly` (주기 변경) | **즉시 정산** | 즉시 정산 직후 `order.paid` 시점 |
| `Pro Monthly ↔ Max Yearly` (주기+플랜 동시 변경) | **즉시 정산** | 즉시 정산 직후 `order.paid` 시점 |
| `Max Monthly ↔ Pro Yearly` (주기+플랜 동시 변경) | **즉시 정산** | 즉시 정산 직후 `order.paid` 시점 |

---

## 핵심 해석

1. `pro ↔ max`만 바꾸고 결제주기를 유지해도  
   현재 코드에서는 `invoice`로 고정되어 즉시 정산됩니다.

2. `monthly ↔ yearly`처럼 결제주기가 바뀌는 경우도  
   즉시 정산이 발생하고, 크레딧도 그 결제(`order.paid`) 시점에 반영됩니다.

3. 따라서 “플랜은 바뀌었는데 크레딧이 아직 이전 값”인 구간이 잠깐 생길 수 있습니다.  
   (웹훅 순서/지연으로 `subscription.updated`가 먼저, `order.paid`가 나중에 도착 가능)

---

## 현재 테스트 환경 주의사항

- 현재 `src/lib/polar/config.ts`가 `POLAR_PRODUCT_PROFILE = "test-monthly"`라서
  - 연간 Product ID가 `null`
  - 즉, 실제로는 월간 관련 변경만 테스트 가능합니다.
