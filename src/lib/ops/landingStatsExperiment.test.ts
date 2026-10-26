import assert from "node:assert/strict";
import test from "node:test";
import {
  LANDING_STATS_ABTEST_A as A,
  LANDING_STATS_ABTEST_B as B,
  LANDING_STATS_EXPOSURE,
} from "@/lib/landingStatsExperiment";
import {
  buildLandingStatsExperiment,
  type LandingStatsLog,
  type LandingStatsSubmission,
} from "./landingStatsExperiment";

const HOUR = 3_600_000;
const origin = Date.parse("2026-10-21T00:00:00Z");
const at = (hour: number) => new Date(origin + hour * HOUR).toISOString();
function row(
  localId: string,
  type: string,
  hour = 0,
  variant = A
): LandingStatsLog {
  return {
    local_id: localId,
    type,
    created_at: at(hour),
    abtest_type: variant,
  };
}
const exposure = (id: string, variant = A, hour = 0) =>
  row(id, LANDING_STATS_EXPOSURE, hour, variant);
const build = (
  rows: LandingStatsLog[],
  signups: { localId: string; createdAt: string; userId: string }[] = [],
  submissions: LandingStatsSubmission[] = []
) =>
  buildLandingStatsExperiment({
    rows,
    signups,
    submissions,
    now: origin + 48 * HOUR,
    excludeEmail: (email) => email.endsWith("@internal.test"),
  });

test("joins actual signup across independent signup-flow experiments and deduplicates", () => {
  const result = build(
    [
      exposure("a"),
      exposure("a", A, 1),
      exposure("b", B),
      row("a", "click_start:threads", 1, "career_signup_flow_v1_control"),
      row("a", "click_start:threads", 2, "career_signup_flow_v1_control"),
      row(
        "b",
        "login_email:existing@example.test:direct",
        1,
        "career_signup_flow_v1_control"
      ),
    ],
    [
      { localId: "a", createdAt: at(2), userId: "new-user" },
      { localId: "a", createdAt: at(3), userId: "new-user" },
    ]
  );
  assert.deepEqual(
    result.variants.map((v) => v.sampleCount),
    [1, 1]
  );
  assert.deepEqual(
    result.variants.map((v) => v.primary.rate),
    [1, 0]
  );
  assert.equal(result.metricLayout, "summary");
  assert.deepEqual(result.variants[0].metrics, []);
  assert.deepEqual(
    result.variants[0].summaryMetrics?.map((metric) => metric.label),
    ["진입 대비 회원가입 비율", "진입 대비 제출 완료 비율"]
  );
});

test("conversions outside 24 hours do not count; current rates include immature cohorts", () => {
  const result = build(
    [
      exposure("early"),
      exposure("late"),
      exposure("pending", B, 40),
      row("early", "click_start", -1),
      row("late", "click_start", 25),
      row("no-exposure", "click_start", 1),
    ],
    [
      { localId: "early", createdAt: at(-1), userId: "early" },
      { localId: "late", createdAt: at(25), userId: "late" },
      { localId: "pending", createdAt: at(41), userId: "pending" },
    ]
  );
  assert.deepEqual(result.variants[0].primary, {
    numerator: 0,
    denominator: 2,
    rate: 0,
  });
  assert.deepEqual(result.variants[1].primary, {
    numerator: 0,
    denominator: 0,
    rate: null,
  });
  assert.deepEqual(
    result.variants[1].summaryMetrics?.map((metric) => metric.value),
    [1, 0]
  );
});

test("submission rate uses entry denominator and actual submissions after signup within 24 hours", () => {
  const result = build(
    [
      exposure("submitted"),
      exposure("signup-only"),
      exposure("no-signup"),
      exposure("late", B),
      exposure("before-signup", B),
      exposure("pending", B, 40),
      row("signup-only", "email_capture_sent", 3),
    ],
    [
      { localId: "submitted", userId: "submitted", createdAt: at(1) },
      { localId: "signup-only", userId: "signup-only", createdAt: at(1) },
      { localId: "late", userId: "late", createdAt: at(1) },
      { localId: "before-signup", userId: "before-signup", createdAt: at(2) },
      { localId: "pending", userId: "pending", createdAt: at(41) },
    ],
    [
      { userId: "submitted", createdAt: at(2) },
      { userId: "submitted", createdAt: at(3) },
      { userId: "unlinked", createdAt: at(2) },
      { userId: "late", createdAt: at(25) },
      { userId: "before-signup", createdAt: at(1) },
      { userId: "pending", createdAt: at(42) },
    ]
  );
  assert.deepEqual(
    result.variants.map((variant) =>
      variant.summaryMetrics?.map((metric) => metric.value)
    ),
    [
      [2 / 3, 1 / 3],
      [1, 1 / 3],
    ]
  );
});

test("first assignment wins, internal emails and internal signup identities are excluded", () => {
  const result = buildLandingStatsExperiment({
    rows: [
      exposure("switch", A),
      exposure("switch", B, 1),
      exposure("internal"),
      row("internal", "login_email:team@internal.test", 1),
      exposure("signup-internal", B),
    ],
    signups: [
      { localId: "switch", createdAt: at(2), userId: "new-user" },
      { localId: "signup-internal", createdAt: at(1), userId: "excluded" },
    ],
    excludedUserIds: new Set(["excluded"]),
    excludeEmail: (email) => email.endsWith("@internal.test"),
    now: origin + 48 * HOUR,
  });
  assert.deepEqual(
    result.variants.map((v) => v.sampleCount),
    [1, 0]
  );
  assert.equal(result.variants[0].primary.rate, 1);
});

test("both arms stay in the denominator even with no clicks or loaded stats", () => {
  const result = build([exposure("a"), exposure("b", B)]);
  assert.deepEqual(
    result.variants.map((v) => v.primary.denominator),
    [1, 1]
  );
  assert.deepEqual(
    result.variants.map((v) => v.primary.numerator),
    [0, 0]
  );
  assert.equal(build([]).status, "awaiting_data");
});
