import assert from "node:assert/strict";
import test from "node:test";
import {
  assignCareerOnboardingStepOrder,
  getCareerOnboardingStepOrder,
  PROFILE_FIRST_VARIANT,
  VISIBILITY_FIRST_VARIANT,
} from "./onboardingStepOrderExperiment";

test("keeps a user's assignment stable and splits user buckets evenly", () => {
  const userIds = Array.from({ length: 10_000 }, (_, index) => `user-${index}`);
  const assignments = userIds.map(assignCareerOnboardingStepOrder);
  const visibilityFirstCount = assignments.filter(
    (variant) => variant === VISIBILITY_FIRST_VARIANT
  ).length;

  assert.deepEqual(userIds.map(assignCareerOnboardingStepOrder), assignments);
  assert.ok(visibilityFirstCount > 4_700 && visibilityFirstCount < 5_300);
});

test("moves sharing choice immediately after opportunity type only in B", () => {
  assert.deepEqual(getCareerOnboardingStepOrder(PROFILE_FIRST_VARIANT), [
    "basic",
    "engagement",
    "profile",
    "visibility",
  ]);
  assert.deepEqual(getCareerOnboardingStepOrder(VISIBILITY_FIRST_VARIANT), [
    "basic",
    "engagement",
    "visibility",
    "profile",
  ]);
});
