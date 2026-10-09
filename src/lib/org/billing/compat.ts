import type { BillingInterval } from "./types";

export const SLOT_PRODUCT_KEY = "workspace_slot_v1";

// Existing Stripe subscriptions and in-flight checkouts keep their identifiers.
// Keep the previous product tag and configuration readable across the rollout.
export function isSlotBillingProduct(value: unknown) {
  return value === SLOT_PRODUCT_KEY || value === "workspace_agent_v1";
}

export function slotPriceId(interval: BillingInterval) {
  return interval === "year"
    ? process.env.STRIPE_SLOT_ANNUAL_PRICE_ID ||
        process.env.STRIPE_AGENT_ANNUAL_PRICE_ID
    : process.env.STRIPE_SLOT_PRICE_ID || process.env.STRIPE_AGENT_PRICE_ID;
}

export function isSlotPurchase(value: unknown) {
  return value === "slot" || value === "agent";
}

export function requestedSlotId(body: Record<string, unknown>) {
  return body.slotId ?? body.agentId;
}
