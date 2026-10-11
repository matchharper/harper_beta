import assert from "node:assert/strict";
import test from "node:test";
import {
  isSlotBillingProduct,
  SLOT_PRODUCT_KEY,
  slotPriceId,
  requestedSlotId,
  isSlotPurchase,
} from "./compat";

test("existing Stripe subscriptions and in-flight checkouts survive the Slot rollout", () => {
  assert.equal(isSlotBillingProduct(SLOT_PRODUCT_KEY), true);
  assert.equal(isSlotBillingProduct("workspace_agent_v1"), true);
  assert.equal(isSlotBillingProduct("unrelated_product"), false);
  assert.equal(isSlotBillingProduct(undefined), false);
  assert.equal(isSlotPurchase("agent"), true);
  assert.equal(isSlotPurchase("slot"), true);
  assert.equal(requestedSlotId({ agentId: "old-tab" }), "old-tab");
  assert.equal(
    requestedSlotId({ slotId: "canonical", agentId: "old-tab" }),
    "canonical"
  );
});

test("canonical price configuration wins while unchanged production configuration still works", (t) => {
  for (const key of [
    "STRIPE_SLOT_PRICE_ID",
    "STRIPE_SLOT_ANNUAL_PRICE_ID",
    "STRIPE_AGENT_PRICE_ID",
    "STRIPE_AGENT_ANNUAL_PRICE_ID",
  ]) {
    const before = process.env[key];
    delete process.env[key];
    t.after(() => {
      if (before === undefined) delete process.env[key];
      else process.env[key] = before;
    });
  }
  process.env.STRIPE_AGENT_PRICE_ID = "price_old_month";
  process.env.STRIPE_AGENT_ANNUAL_PRICE_ID = "price_old_year";
  assert.equal(slotPriceId("month"), "price_old_month");
  assert.equal(slotPriceId("year"), "price_old_year");
  process.env.STRIPE_SLOT_PRICE_ID = "price_new_month";
  process.env.STRIPE_SLOT_ANNUAL_PRICE_ID = "price_new_year";
  assert.equal(slotPriceId("month"), "price_new_month");
  assert.equal(slotPriceId("year"), "price_new_year");
});
