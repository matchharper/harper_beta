import assert from "node:assert/strict";
import test from "node:test";
import {
  CAREER_ONBOARDING_STEP_ORDER_EXPERIMENT,
  CAREER_ONBOARDING_STEP_ORDER_EXPOSURE_EVENT,
  PROFILE_FIRST_VARIANT,
  VISIBILITY_FIRST_VARIANT,
} from "@/lib/career/onboardingStepOrderExperiment";
import {
  buildOnboardingStepOrderExperiment,
  type OnboardingStepOrderLog,
} from "./onboardingStepOrderExperiment";

function log(
  id: number,
  userId: string,
  type: string,
  metadata: OnboardingStepOrderLog["meta_data"] = null
): OnboardingStepOrderLog {
  return {
    created_at: new Date(Date.UTC(2026, 9, 6, 0, 0, id)).toISOString(),
    id,
    meta_data: metadata,
    type,
    user_id: userId,
  };
}

function exposure(id: number, userId: string, variant: string) {
  return log(id, userId, CAREER_ONBOARDING_STEP_ORDER_EXPOSURE_EVENT, {
    experiment: CAREER_ONBOARDING_STEP_ORDER_EXPERIMENT,
    variant,
  });
}

function submission(id: number, userId: string, choice?: string) {
  return log(
    id,
    userId,
    "career_onboarding_submitted",
    choice === undefined ? null : { profileVisibility: choice }
  );
}

test("counts the first valid exposure per user and only later successful submissions", () => {
  const rows = [
    submission(1, "a", "exceptional_only"),
    exposure(2, "a", PROFILE_FIRST_VARIANT),
    exposure(3, "a", VISIBILITY_FIRST_VARIANT),
    submission(4, "a", "open_to_matches"),
    submission(5, "a", "exceptional_only"),
    exposure(6, "b", VISIBILITY_FIRST_VARIANT),
    exposure(7, "excluded", VISIBILITY_FIRST_VARIANT),
    submission(8, "excluded", "open_to_matches"),
    log(9, "wrong-experiment", CAREER_ONBOARDING_STEP_ORDER_EXPOSURE_EVENT, {
      experiment: "other_experiment",
      variant: PROFILE_FIRST_VARIANT,
    }),
    exposure(10, "wrong-variant", "unknown"),
    submission(11, "unexposed", "open_to_matches"),
  ].reverse();

  const result = buildOnboardingStepOrderExperiment(
    rows,
    new Set(["excluded"])
  );

  assert.equal(result.variants[0].sampleCount, 1);
  assert.deepEqual(result.variants[0].primary, {
    denominator: 1,
    numerator: 1,
    rate: 1,
  });
  assert.equal(result.variants[1].sampleCount, 1);
  assert.deepEqual(result.variants[1].primary, {
    denominator: 1,
    numerator: 0,
    rate: 0,
  });
  assert.equal(
    result.firstObservedAt,
    rows.find((row) => row.id === 2)?.created_at
  );
  assert.equal(
    result.lastObservedAt,
    rows.find((row) => row.id === 6)?.created_at
  );
});

test("uses only recorded choices at submission time for the sharing rate", () => {
  const result = buildOnboardingStepOrderExperiment(
    [
      exposure(1, "a", PROFILE_FIRST_VARIANT),
      submission(2, "a", "open_to_matches"),
      exposure(3, "b", PROFILE_FIRST_VARIANT),
      submission(4, "b", "exceptional_only"),
      exposure(5, "c", PROFILE_FIRST_VARIANT),
      submission(6, "c"),
      exposure(7, "d", VISIBILITY_FIRST_VARIANT),
      submission(8, "d", "unknown"),
      exposure(9, "e", VISIBILITY_FIRST_VARIANT),
      submission(10, "e", "open_to_matches"),
    ],
    new Set()
  );

  assert.equal(result.variants[0].primary.numerator, 3);
  assert.equal(result.variants[0].metrics[1].value, 2);
  assert.equal(result.variants[0].metrics[2].value, 0.5);
  assert.equal(result.variants[1].primary.numerator, 2);
  assert.equal(result.variants[1].metrics[1].value, 1);
  assert.equal(result.variants[1].metrics[2].value, 1);
});

test("keeps the experiment visible while neither group has exposure", () => {
  const result = buildOnboardingStepOrderExperiment([], new Set());
  assert.equal(result.conclusion.state, "collecting");
  assert.equal(result.variants[0].primary.rate, null);
  assert.equal(result.variants[1].primary.rate, null);
  assert.equal(result.firstObservedAt, null);
});
