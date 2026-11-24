import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpsUpdateMetrics,
  buildUpdateMetricsBuckets,
  kstMidnightMs,
  updateMetricDisplayValue,
  type UpdateMetricsSignupRow,
} from "@/lib/ops/updateMetrics";

const DAY = 24 * 60 * 60 * 1000;
const deployedAtMs = kstMidnightMs("2026-11-20");
const nowMs = deployedAtMs + 10 * DAY;

function signup(
  userId: string,
  offsetDays: number,
  overrides: Partial<UpdateMetricsSignupRow> = {}
): UpdateMetricsSignupRow {
  return {
    applyWithHarperAt: null,
    costUsd3d: 0,
    disliked3d: 0,
    firstChatAt: null,
    gmailAt: null,
    gmailProposedAt: null,
    hasMaterials: false,
    liked3d: 0,
    llmMs3d: 0,
    onboardingSubmittedAt: null,
    recommendations3d: 0,
    signedUpAt: new Date(deployedAtMs + offsetDays * DAY).toISOString(),
    userId,
    ...overrides,
  };
}

const rowOf = (result: ReturnType<typeof buildOpsUpdateMetrics>, key: string) => {
  const row = result.groups.flatMap((group) => group.rows).find((item) => item.key === key);
  assert.ok(row, key);
  return row;
};

test("weeks are anchored at the release: 4 before, then the weeks after up to now", () => {
  const buckets = buildUpdateMetricsBuckets(deployedAtMs, nowMs);
  assert.deepEqual(
    buckets.map((bucket) => [bucket.side, bucket.partial]),
    [
      ["before", false],
      ["before", false],
      ["before", false],
      ["before", false],
      ["after", false],
      ["after", true],
    ]
  );
  assert.equal(buckets[4]?.start, new Date(deployedAtMs).toISOString());
  assert.equal(buckets.at(-1)?.end, new Date(nowMs).toISOString());
});

test("cohort rates count only what happened in the first 3 days, including talents still in them", () => {
  const signedUp = (days: number) => new Date(deployedAtMs + days * DAY).toISOString();
  const result = buildOpsUpdateMetrics({
    deployedAtMs,
    jobsWithoutRoleUserIds: new Set(["jobs"]),
    landing: [],
    nowMs,
    recommendations: [],
    signups: [
      signup("a", -10, {
        firstChatAt: signedUp(-9.5),
        gmailProposedAt: signedUp(-9),
        recommendations3d: 2,
        liked3d: 1,
        disliked3d: 1,
      }),
      // Chatted and was offered Gmail only on day 5: not within the first 3 days.
      signup("b", -10, {
        firstChatAt: signedUp(-5),
        gmailProposedAt: signedUp(-5),
        recommendations3d: 1,
        disliked3d: 1,
      }),
      signup("jobs", 1, {
        firstChatAt: signedUp(1.1),
        gmailProposedAt: signedUp(1.2),
        recommendations3d: 3,
        hasMaterials: true,
      }),
      // Signed up a day ago: counted with what they did so far.
      signup("late", 9, { firstChatAt: signedUp(9.1) }),
      signup("quiet", 9.5),
    ],
  });
  const chat = rowOf(result, "chatRate");
  assert.equal(updateMetricDisplayValue(chat.values.before), 0.5);
  assert.deepEqual(chat.values.after, { denominator: 3, kind: "rate", numerator: 2 });
  assert.deepEqual(rowOf(result, "feedbackLikeRate").values.before, {
    denominator: 3,
    kind: "rate",
    numerator: 1,
  });
  assert.equal(updateMetricDisplayValue(rowOf(result, "recipientLikeRate").values.before), 0.5);
  assert.equal(updateMetricDisplayValue(rowOf(result, "jobsWithoutRoleRecommended").values.after), 1);
  assert.equal(updateMetricDisplayValue(rowOf(result, "startedWithoutMaterials").values.before), 0.5);
  const gmailProposed = rowOf(result, "gmailProposedRate");
  assert.equal(updateMetricDisplayValue(gmailProposed.values.before), 0.5);
  assert.deepEqual(gmailProposed.values.after, { denominator: 3, kind: "rate", numerator: 1 });
  // Signups count everyone, as a 7-day average.
  const signups = rowOf(result, "signups");
  assert.equal(updateMetricDisplayValue(signups.values.after), (3 / 10) * 7);
});

test("landing visits convert when the browser signs up within a day, counting visits from the last day too", () => {
  const result = buildOpsUpdateMetrics({
    deployedAtMs,
    jobsWithoutRoleUserIds: new Set(),
    landing: [
      { at: new Date(deployedAtMs - 2 * DAY).toISOString(), signedUpAt: new Date(deployedAtMs - 2 * DAY + 3600_000).toISOString() },
      { at: new Date(deployedAtMs - 2 * DAY).toISOString(), signedUpAt: new Date(deployedAtMs).toISOString() },
      { at: new Date(deployedAtMs + DAY).toISOString(), signedUpAt: null },
      // Seen an hour ago and already signed up.
      { at: new Date(nowMs - 3600_000).toISOString(), signedUpAt: new Date(nowMs - 1800_000).toISOString() },
    ],
    nowMs,
    recommendations: [],
    signups: [],
  });
  const landing = rowOf(result, "landingConversion");
  assert.equal(updateMetricDisplayValue(landing.values.before), 0.5);
  assert.equal(updateMetricDisplayValue(landing.values.after), 0.5);
});
