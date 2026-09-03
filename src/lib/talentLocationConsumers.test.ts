import assert from "node:assert/strict";
import test from "node:test";
import { canShowReferralEntryPoints } from "./referralEligibility";

test("referral eligibility ignores stale signup geography when location exists", () => {
  assert.equal(
    canShowReferralEntryPoints({
      currentLocation: "South Korea",
      location: "San Francisco, USA",
      preferredLocale: "en",
    }),
    false
  );
});

test("referral eligibility falls back to signup geography without location", () => {
  assert.equal(
    canShowReferralEntryPoints({
      currentLocation: "South Korea",
      location: null,
      preferredLocale: "en",
    }),
    true
  );
});
