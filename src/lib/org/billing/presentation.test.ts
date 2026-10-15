import assert from "node:assert/strict";
import test from "node:test";
import {
  isLowCreditBalance,
  canUsePendingConnections,
  isEndedBillingSlot,
  creditSlotForRole,
  formatBillingDaysUntil,
  type BillingCreditSlot,
  type BillingSlot,
} from "./types";

test("renewal countdown rounds partial days up and handles elapsed or missing dates", () => {
  const now = Date.parse("2026-10-13T09:00:00Z");
  assert.equal(formatBillingDaysUntil("2026-10-14T09:00:00Z", "ko", now), "1일 뒤");
  assert.equal(formatBillingDaysUntil("2026-10-14T10:00:00Z", "ko", now), "2일 뒤");
  assert.equal(formatBillingDaysUntil("2026-10-13T10:00:00Z", "en", now), "in 1 day");
  assert.equal(formatBillingDaysUntil("2026-10-12T09:00:00Z", "en", now), "in 0 days");
  for (const value of [null, undefined, "invalid"])
    assert.equal(formatBillingDaysUntil(value, "ko", now), "—");
});

test("low-credit notice includes zero and ten, and excludes unlimited or unknown balances", () => {
  for (const balance of [0, 5, 10])
    assert.equal(isLowCreditBalance(balance), true);
  for (const balance of [11, 50, null, undefined, NaN, -1])
    assert.equal(isLowCreditBalance(balance), false);
});

test("pending renewal and incomplete payment never look like an ended subscription", () => {
  const base = {
    active: false,
    status: "active",
    cancelAt: null,
    endedAt: null,
  } as BillingSlot;
  assert.equal(isEndedBillingSlot(base), false);
  assert.equal(isEndedBillingSlot({ ...base, status: "past_due" }), false);
  assert.equal(isEndedBillingSlot({ ...base, status: "incomplete" }), false);
  assert.equal(isEndedBillingSlot({ ...base, status: "canceled" }), true);
  assert.equal(
    isEndedBillingSlot(
      { ...base, cancelAt: "2026-11-01T00:00:00Z" },
      Date.parse("2026-11-01T00:00:00Z")
    ),
    true
  );
});

test("Role balances prefer assigned paid credits, then shared credits, never a different Slot", () => {
  const slots = [
    { id: "free", slotId: null, roleId: null, remaining: 10 },
    { id: "a", slotId: "a", roleId: "engineering", remaining: 0 },
    { id: "b", slotId: "b", roleId: "design", remaining: 50 },
  ] as BillingCreditSlot[];
  assert.equal(creditSlotForRole(slots, "engineering")?.id, "free");
  assert.equal(creditSlotForRole(slots, "design")?.id, "b");
  assert.equal(creditSlotForRole(slots, "new-role")?.id, "free");
  assert.equal(creditSlotForRole(slots, null), undefined);
  assert.equal(creditSlotForRole(undefined, "engineering"), undefined);
  const entitlements = {
    capacity: null,
    activeRoles: 3,
    pendingConnections: true,
    creditSlots: slots,
  };
  assert.equal(
    canUsePendingConnections(entitlements, "engineering"),
    true,
    "exhausted Intros do not hide paid candidates"
  );
  assert.equal(canUsePendingConnections(entitlements, "new-role"), false);
  assert.equal(
    canUsePendingConnections({ ...entitlements, creditSlots: [] }, "new-role"),
    true,
    "legacy/Enterprise access is retained"
  );
  assert.equal(canUsePendingConnections(undefined, "design"), false);
  slots[0].remaining = 0;
  assert.equal(creditSlotForRole(slots, "engineering")?.remaining, 0);
});
