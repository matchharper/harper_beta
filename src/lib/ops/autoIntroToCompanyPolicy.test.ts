import assert from "node:assert/strict";
import test from "node:test";
import { isAutoIntroDeliveryOwnedElsewhere, wasAutoIntroSlackSent } from "./autoIntroToCompanyPolicy";

test("9am introduction leaves pending and failed role-search deliveries to their owner", () => {
  for (const deliveryStatus of ["pending", "failed"]) {
    const metadata = { deliveryOwner: "role_matching_outbox", deliveryStatus, slackSent: false };
    assert.equal(isAutoIntroDeliveryOwnedElsewhere(metadata), true);
    assert.equal(wasAutoIntroSlackSent(metadata), false);
  }
});

test("actual sent receipt and canceled delivery have distinct handling", () => {
  assert.equal(wasAutoIntroSlackSent({ deliveryStatus: "sent" }), true);
  assert.equal(isAutoIntroDeliveryOwnedElsewhere({ deliveryOwner: "role_matching_outbox", deliveryStatus: "canceled" }), false);
  assert.equal(isAutoIntroDeliveryOwnedElsewhere({ deliveryStatus: "pending" }), false);
  for (const value of [null, [], "pending", {}]) assert.equal(isAutoIntroDeliveryOwnedElsewhere(value), false);
});
