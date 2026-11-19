import assert from "node:assert/strict";
import { test } from "node:test";
import { gtmMailIdFromOnboarding } from "./onboardingClaim";

test("keeps a mail id sent with the onboarding submit", () => {
  assert.equal(gtmMailIdFromOnboarding("873b9e2a-e018-47b7-93ad-25565acb6362"), "873b9e2a-e018-47b7-93ad-25565acb6362");
  assert.equal(gtmMailIdFromOnboarding(" 873B9E2A-E018-47B7-93AD-25565ACB6362 "), "873b9e2a-e018-47b7-93ad-25565acb6362");
});

test("ignores a missing or malformed mail id", () => {
  for (const value of [undefined, null, "", "not-a-uuid", 42, "873b9e2a-e018-47b7-93ad", "873b9e2a-e018-47b7-93ad-25565acb6362x"]) {
    assert.equal(gtmMailIdFromOnboarding(value), null);
  }
});
