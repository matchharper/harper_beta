# Polar 플랜 변경별 결제/크레딧 시점 정리

작성일: 2026-02-19

## 기준 (현재 코드)

- 플랜 변경(업그레이드) API: `src/app/api/polar/checkout/route.ts`
  - `checkouts.create`로 **새 구독 결제**를 시작
  - `allowSubscriptionSwitch=true`면 기존 활성 구독이 있어도 checkout 허용
- 구독 정리: `src/app/api/polar/webhook/route.ts`
  - 새 구독 이벤트(`subscription.created`/`subscription.active`/`order.paid`) 처리 시
  - 같은 유저의 이전 활성 구독을 revoke하여 단일 구독 상태로 수렴
- 플랜 상태 반영: `src/app/api/polar/webhook/route.ts`
  - 새 구독 기준으로 `payments.plan_id` 업데이트
- 크레딧 충전: `src/app/api/polar/webhook/route.ts`
  - **`order.paid` 이벤트에서만** `credits`/`credits_history` 갱신

즉, 공통적으로:
- **업그레이드는 새 checkout 결제 후 즉시 시작**
- **기존 구독은 새 구독 시작 이벤트 처리 시 자동 종료**
- **크레딧은 새 결제가 실제 발생한 시점(`order.paid`)에 충전**

---

## 변경 유형별 시점

| 변경 유형 | 결제 시점 | 크레딧 충전 시점 |
|---|---|---|
| 업그레이드 (`Pro -> Max`, `Monthly -> Yearly`) | **즉시 새 checkout 결제** | 새 결제의 `order.paid` 시점 |
| 다운그레이드 (`Max -> Pro`, `Yearly -> Monthly`) | 즉시 변경하지 않음 (권장 UX) | 기존 구독 취소 후 갱신일 이후 새 구독 결제 시 `order.paid` |

---

## 핵심 해석

1. `subscription update` API는 플랜 변경 경로에서 사용하지 않습니다.
2. 업그레이드는 Lemon Squeezy 때와 같은 방식으로, 새 결제를 통해 즉시 시작됩니다.
3. 다운그레이드는 UI에서 안내 모달을 띄우고,
   현재 구독 취소 후 갱신일 이후 새 플랜 결제를 권장합니다.

참고:
- 웹훅 순서/지연으로 구독 상태 반영과 크레딧 반영(`order.paid`) 사이에 짧은 지연이 있을 수 있습니다.

---

## 현재 테스트 환경 주의사항

- 현재 `src/lib/polar/config.ts`가 `POLAR_PRODUCT_PROFILE = "test-monthly"`라서
  - 연간 Product ID가 `null`
  - 즉, 실제로는 월간 관련 변경만 테스트 가능합니다.
