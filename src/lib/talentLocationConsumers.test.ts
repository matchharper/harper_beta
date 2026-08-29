import assert from "node:assert/strict";
import test from "node:test";
import { canShowReferralEntryPoints } from "./referralEligibility";
import { getCountryScopedOnboardingCountry } from "./talentOnboarding/insightChecklist";

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

test("country-scoped onboarding uses location before signup geography", () => {
  assert.equal(
    getCountryScopedOnboardingCountry({
      current_location: "Singapore",
      location: "San Francisco, USA",
    }),
    null
  );
  assert.equal(
    getCountryScopedOnboardingCountry({
      current_location: "Singapore",
      location: null,
    }),
    "SG"
  );
});
