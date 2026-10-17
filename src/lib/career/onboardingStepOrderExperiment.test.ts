import assert from "node:assert/strict";
import test from "node:test";
import { getCareerOnboardingStepOrder } from "./onboardingStepOrderExperiment";

test("uses visibility before profile for all onboarding after retiring the experiment", () => {
  assert.deepEqual(getCareerOnboardingStepOrder(), [
    "basic",
    "engagement",
    "visibility",
    "profile",
  ]);
});
