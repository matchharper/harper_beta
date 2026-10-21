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
  signups: { localId: string; createdAt: string; userId: string }[] = []
) =>
  buildLandingStatsExperiment({
    rows,
    signups,
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
  assert.equal(
    result.variants[0].metrics.find((m) => m.label.startsWith("시작 클릭률"))
      ?.value,
    1
  );
  assert.equal(
    result.variants[1].metrics.find((m) => m.label.startsWith("로그인 전환율"))
      ?.value,
    1
  );
});

test("conversions before enrollment or after 24 hours do not count; immature cohorts stay pending", () => {
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
  assert.equal(result.variants[1].metrics[0].value, 1);
  assert.equal(result.variants[1].metrics[1].value, 1);
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
