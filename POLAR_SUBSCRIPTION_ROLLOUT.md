# Polar Subscription Rollout

## 1. Initial Plan

- Goal: Add Polar subscription flow without removing existing Lemon Squeezy code paths.
- Scope:
  - Add new backend endpoint for Polar webhook handling.
  - Add new backend endpoint for Polar cancellation request.
  - Add `/billing/success` page for Polar checkout return URL.
  - Keep existing Lemon Squeezy endpoints unchanged.
- Constraints:
  - Reuse existing `payments`, `plans`, `credits`, `credits_history`, `new_logs` logic as much as possible.
  - Avoid schema migration for now.
- Technical direction:
  - Verify Polar webhook signature using official `@polar-sh/sdk/webhooks` helper.
  - Use Polar webhook events (`subscription.created`, `subscription.updated`, `subscription.revoked`, `order.paid`) to keep subscription and credit state in sync.
  - Continue using `payments.ls_subscription_id` and `payments.ls_customer_id` for provider-agnostic storage in this phase.

## 2. Plan Review

- Decision review:
  - Keep Lemon route and logic intact to allow rollback.
  - Add Polar routes in parallel under `/api/polar/*`.
- Risk review:
  - Risk: user mapping missing in webhook payload.
    - Mitigation: support multiple payload paths and allow metadata-based mapping.
  - Risk: plan mapping mismatch between Polar product/price IDs and internal `plans.plan_id`.
    - Mitigation: support environment-based mapping (`POLAR_PLAN_MAP_JSON`) and metadata fallback.
  - Risk: webhook arrives before/after checkout redirect.
    - Mitigation: success page instructs user that activation can take a short delay; source of truth is webhook.
- Validation plan:
  - TypeScript check on changed files.
  - Manual endpoint sanity checks (no runtime execution of external API calls).

## 3. Implementation Checklist

- [x] Add `src/app/api/polar/webhook/route.ts`.
- [x] Add `src/app/api/polar/cancel/route.ts`.
- [x] Add `src/app/api/polar/checkout/route.ts`.
- [x] Add `src/app/api/polar/change-plan/route.ts`.
- [x] Add `src/pages/billing/success.tsx`.
- [x] Install `@polar-sh/sdk` dependency.
- [x] Set billing provider to hardcoded Polar in `src/lib/polar/config.ts`.
- [x] Run lint/ts check for touched files.
- [x] Update this checklist with completion status.

## Required Polar Setup Inputs

- `.env.local`
  - `POLAR_API_KEY`: Organization access token with subscription write permissions.
  - `POLAR_WEBHOOK_SECRET`: Webhook secret from Polar dashboard.
- Hardcoded config file:
  - `src/lib/polar/config.ts`
    - `BILLING_PROVIDER`
    - `POLAR_SERVER`
    - `POLAR_PRODUCT_PROFILE`
    - `POLAR_SUCCESS_URL`
    - `POLAR_PRODUCT_IDS` (live/test product IDs)
    - `POLAR_CHECKOUT_LINKS` (reference links)
- Optional fallback mapping:
  - `POLAR_PLAN_MAP_JSON` can still be used in webhook if `plans.ls_variant_id` mapping is incomplete.
- Checkout success URL:
  - `https://matchharper.com/billing/success?checkout_id={CHECKOUT_ID}`
- Webhook URL:
  - `https://matchharper.com/api/polar/webhook`
