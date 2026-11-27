import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpsUpdateMetrics,
  changeMovesChart,
  kstMidnightMs,
  OPS_HEADLINE_CHART,
  OPS_TRACKED_CHANGES,
  trackedChangeComparison,
  UPDATE_METRICS,
  updateMetricChartValue,
  updateMetricPeriodValue,
  updateMetricsWindow,
  type UpdateMetricsSignupRow,
} from "@/lib/ops/updateMetrics";
import { updateMetricPoints } from "@/components/ops/metrics/updateMetricPoints";
import { confirmedApplicationCtes, OVERVIEW_APPLICATIONS_SQL } from "@/lib/ops/talentMetricsOverview.sql";
import { UPDATE_METRICS_APPLICATIONS_SQL } from "@/lib/ops/updateMetrics.sql";

const DAY = 24 * 60 * 60 * 1000;
const day0 = kstMidnightMs("2026-11-20");
// Noon KST on 11/23: that day is half over.
const nowMs = day0 + 3.5 * DAY;

function signup(userId: string, offsetDays: number, overrides: Partial<UpdateMetricsSignupRow> = {}): UpdateMetricsSignupRow {
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
    signedUpAt: new Date(day0 + offsetDays * DAY).toISOString(),
    userId,
    ...overrides,
  };
}

const at = (offsetDays: number) => new Date(day0 + offsetDays * DAY).toISOString();

const empty = {
  applications: [],
  emails: [],
  jobsWithoutRoleUserIds: new Set<string>(),
  landing: [],
  recommendations: [],
  signups: [],
  unseenReplies: [],
};

test("every metric a chart or folded row uses is defined", () => {
  const used = [OPS_HEADLINE_CHART, ...OPS_TRACKED_CHANGES].flatMap((chart) => [
    ...(chart.bars ?? []),
    ...(chart.lines ?? []),
    chart.primary,
  ]);
  for (const key of used) assert.ok(UPDATE_METRICS[key], key);
  // Bars share the left axis and lines the right one, so each side keeps one unit.
  for (const change of OPS_TRACKED_CHANGES) {
    const units = (keys: readonly string[] = []) => new Set(keys.map((key) => UPDATE_METRICS[key as keyof typeof UPDATE_METRICS].unit));
    assert.ok(units(change.bars).size <= 1, change.key);
    assert.ok(units(change.lines).size <= 1, change.key);
  }
  assert.equal(new Set(OPS_TRACKED_CHANGES.map((change) => change.key)).size, OPS_TRACKED_CHANGES.length);
});

test("cohort values sit on the signup day and count only the first 24 hours or 3 days", () => {
  const result = buildOpsUpdateMetrics({
    ...empty,
    from: "2026-11-20",
    nowMs,
    signups: [
      signup("a", 0.1, { firstChatAt: at(0.2), recommendations3d: 2, liked3d: 1 }),
      // Chatted on day 2: inside 3 days, outside 24 hours.
      signup("b", 0.2, { firstChatAt: at(2), recommendations3d: 1 }),
      // Chatted on day 5: too late for both.
      signup("c", 0.3, { firstChatAt: at(5) }),
      signup("d", 3.2, { firstChatAt: at(3.3) }),
    ],
    to: "2026-11-30",
  });
  assert.deepEqual(result.days, ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"]);
  assert.deepEqual(result.metrics.chatRate24h?.[0], { denominator: 3, kind: "rate", numerator: 1 });
  assert.deepEqual(result.metrics.chatRate3d?.[0], { denominator: 3, kind: "rate", numerator: 2 });
  assert.deepEqual(result.metrics.recipientLikeRate?.[0], { denominator: 2, kind: "rate", numerator: 1 });
  assert.deepEqual(result.metrics.chatRate3d?.[3], { denominator: 1, kind: "rate", numerator: 1 });
  // The running day counts as the half that has passed.
  assert.deepEqual(result.metrics.signups?.[3], { days: 0.5, kind: "count", value: 1 });
});

test("mail and unseen-reply rows become counts and rates per day", () => {
  const result = buildOpsUpdateMetrics({
    ...empty,
    emails: [{ choiceActed: 2, choiceEmails: 4, day: "2026-11-21", plainActed: 1, plainEmails: 6 }],
    from: "2026-11-20",
    nowMs,
    to: "2026-11-23",
    unseenReplies: [{ acted: 1, day: "2026-11-22", emailed: 2, reviewed: 5 }],
  });
  assert.deepEqual(result.metrics.emailActionRate?.[1], { denominator: 10, kind: "rate", numerator: 3 });
  assert.equal(updateMetricChartValue(result.metrics.choiceEmailActionRate?.[1]), 0.5);
  assert.equal(updateMetricChartValue(result.metrics.unseenReviewed?.[2]), 5);
  assert.equal(updateMetricChartValue(result.metrics.unseenEmailActionRate?.[2]), 0.5);
  assert.equal(updateMetricChartValue(result.metrics.unseenEmailActionRate?.[0]), null);
});

test("weeks start on Monday and pool their days", () => {
  const result = buildOpsUpdateMetrics({
    ...empty,
    from: "2026-11-15",
    nowMs: kstMidnightMs("2026-11-25"),
    signups: [signup("a", -4, { firstChatAt: at(-3.9) }), signup("b", 0.5), signup("c", 3.5, { firstChatAt: at(3.6) })],
    to: "2026-11-24",
  });
  const weeks = updateMetricPoints(result, { from: "2026-11-16", to: "2026-11-24" }, "week");
  assert.deepEqual(
    weeks.map((point) => [point.startDay, point.endDay, point.label]),
    [
      ["2026-11-16", "2026-11-22", "11.16"],
      ["2026-11-23", "2026-11-24", "11.23"],
    ]
  );
  assert.equal(weeks[0]?.signups, 2);
  assert.equal(weeks[0]?.chatRate3d, 0.5);
});

test("a folded row compares the days since the deploy with the 28 days before it", () => {
  const result = buildOpsUpdateMetrics({
    ...empty,
    from: "2026-10-23",
    nowMs,
    signups: [
      signup("before-1", -10, { firstChatAt: at(-9.9) }),
      signup("before-2", -3),
      signup("after", 1, { firstChatAt: at(1.1) }),
    ],
    to: "2026-11-23",
  });
  const comparison = trackedChangeComparison(result, { deployedOn: "2026-11-20", primary: "chatRate3d" });
  assert.equal(updateMetricPeriodValue(comparison.before), 0.5);
  assert.equal(updateMetricPeriodValue(comparison.after), 1);
  // Counts compare per day: 2 signups over 28 days before, 1 over the 3.5 days since.
  const signups = trackedChangeComparison(result, { deployedOn: "2026-11-20", primary: "signups" });
  assert.equal(updateMetricPeriodValue(signups.before), 2 / 28);
  assert.equal(updateMetricPeriodValue(signups.after), 1 / 3.5);
});

test("the server reads 28 days before the earliest tracked deploy", () => {
  const earliest = OPS_TRACKED_CHANGES.map((change) => change.deployedOn).sort()[0];
  const window = updateMetricsWindow({ from: "2026-11-20", to: "2026-11-24" });
  assert.equal(window.to, "2026-11-24");
  assert.ok(window.from <= earliest);
  assert.equal(
    Date.parse(`${earliest}T00:00:00Z`) - Date.parse(`${window.from}T00:00:00Z`),
    28 * DAY
  );
});

test("a chart marks only the changes that move it", () => {
  const byKey = new Map(OPS_TRACKED_CHANGES.map((change) => [change.key, change]));
  const gmail = byKey.get("2026-11-20-gmail");
  const landing = byKey.get("2026-11-20-landing");
  assert.ok(gmail && landing);
  assert.equal(changeMovesChart(gmail, "gmail"), true);
  assert.equal(changeMovesChart(landing, "gmail"), false);
  assert.equal(changeMovesChart(landing, "signups"), true);
  // The headline marks every tracked change; a change's own chart marks only itself.
  assert.equal(changeMovesChart(landing, "headline"), true);
  assert.equal(changeMovesChart(landing, { change: gmail.key }), false);
  for (const change of OPS_TRACKED_CHANGES) {
    assert.ok(change.links.every((link) => link.url.startsWith("https://")), change.key);
    assert.equal(new Set(change.talentCharts).size, change.talentCharts.length, change.key);
  }
});

test("대신 지원 rows become confirmed and submitted counts and a success rate per confirmation day", () => {
  const result = buildOpsUpdateMetrics({
    ...empty,
    applications: [
      { confirmed: 4, day: "2026-11-20", submitted: 1 },
      // Two rows of one day add up.
      { confirmed: 2, day: "2026-11-21", submitted: 2 },
      { confirmed: 3, day: "2026-11-21", submitted: 0 },
      // Outside the days read: ignored.
      { confirmed: 9, day: "2026-11-30", submitted: 9 },
    ],
    from: "2026-11-20",
    nowMs,
    to: "2026-11-23",
  });
  assert.deepEqual(result.metrics.applyConfirmed?.[0], { days: 1, kind: "count", value: 4 });
  assert.deepEqual(result.metrics.applySubmitted?.[1], { days: 1, kind: "count", value: 2 });
  assert.deepEqual(result.metrics.applySuccessRate?.[1], { denominator: 5, kind: "rate", numerator: 2 });
  assert.equal(updateMetricChartValue(result.metrics.applySuccessRate?.[0]), 0.25);
  // A day with no confirmation draws no rate, and the running day counts as the half that has passed.
  assert.equal(updateMetricChartValue(result.metrics.applySuccessRate?.[2]), null);
  assert.deepEqual(result.metrics.applyConfirmed?.[3], { days: 0.5, kind: "count", value: 0 });
  assert.equal(result.metrics.applyConfirmed?.length, result.days.length);
});

test("a week of 대신 지원 pools its days like the /ops/metrics weekly bars", () => {
  const result = buildOpsUpdateMetrics({
    ...empty,
    applications: [
      { confirmed: 10, day: "2026-11-16", submitted: 4 },
      { confirmed: 6, day: "2026-11-18", submitted: 4 },
      { confirmed: 4, day: "2026-11-23", submitted: 3 },
    ],
    from: "2026-11-16",
    nowMs: kstMidnightMs("2026-11-25"),
    to: "2026-11-24",
  });
  const weeks = updateMetricPoints(result, { from: "2026-11-16", to: "2026-11-24" }, "week");
  assert.equal(weeks[0]?.applyConfirmed, 16);
  assert.equal(weeks[0]?.applySubmitted, 8);
  assert.equal(weeks[0]?.applySuccessRate, 0.5);
  assert.equal(weeks[1]?.applySuccessRate, 0.75);
});

test("대신 지원 daily SQL shares /ops/metrics' application rules with its own parameters", () => {
  // Same fragment, only the sentence placeholders differ: update metrics passes them as $4/$5, /ops/metrics as $5/$6.
  assert.ok(OVERVIEW_APPLICATIONS_SQL.includes(confirmedApplicationCtes({ notSubmitted: "$6", submitted: "$5" })));
  assert.ok(UPDATE_METRICS_APPLICATIONS_SQL.includes(confirmedApplicationCtes({ notSubmitted: "$5", submitted: "$4" })));
  assert.ok(!/\$6\b/.test(UPDATE_METRICS_APPLICATIONS_SQL));
});

test("대신 지원 changes mark only the 대신지원 성공률 chart and read its three metrics", () => {
  const applyChanges = OPS_TRACKED_CHANGES.filter((change) => change.key.includes("-apply-"));
  assert.deepEqual(
    applyChanges.map((change) => [change.key, change.deployedOn]),
    [
      ["2026-11-27-apply-confirm-progress", "2026-11-27"],
      ["2026-11-23-apply-batch", "2026-11-23"],
      ["2026-11-18-apply-login-code", "2026-11-18"],
    ]
  );
  for (const change of applyChanges) {
    assert.deepEqual(change.talentCharts, ["applySuccess"], change.key);
    assert.deepEqual(change.bars, ["applyConfirmed", "applySubmitted"], change.key);
    assert.deepEqual(change.lines, ["applySuccessRate"], change.key);
    assert.equal(change.primary, "applySuccessRate", change.key);
    // Submitted is part of confirmed: stacking the two would count it twice.
    assert.notEqual(change.stackBars, true, change.key);
    assert.equal(changeMovesChart(change, "applySuccess"), true, change.key);
    assert.equal(changeMovesChart(change, "applyDelegation"), false, change.key);
  }
  // Newest deploy first.
  const deployed = OPS_TRACKED_CHANGES.map((change) => change.deployedOn);
  assert.deepEqual(deployed, [...deployed].sort().reverse());
});

test("a change deployed after the last day read has no after period yet", () => {
  const result = buildOpsUpdateMetrics({
    ...empty,
    applications: [{ confirmed: 4, day: "2026-11-22", submitted: 2 }],
    from: "2026-10-30",
    nowMs,
    to: "2026-11-30",
  });
  const comparison = trackedChangeComparison(result, { deployedOn: "2026-11-27", primary: "applySuccessRate" });
  assert.equal(comparison.after, null);
  assert.equal(updateMetricPeriodValue(comparison.before), 0.5);
});

test("posting entrants count as applied for a 맡김 or their own 직접 지원, and as connected only when it reached the company", () => {
  const result = buildOpsUpdateMetrics({
    ...empty,
    from: "2026-11-20",
    jobsUserIds: new Set(["a", "b", "c", "d"]),
    jobsWithoutRoleUserIds: new Set(["a", "b", "c"]),
    nowMs: day0 + 12 * DAY,
    signups: [
      // Applied directly on day 2: applied, not connected.
      signup("a", 0.1, { appliedAt: at(2), onboardingSubmittedAt: at(0.2) }),
      // 대신 지원 submitted on day 3.
      signup("b", 0.2, { appliedAt: at(1), connectedAt: at(3), onboardingSubmittedAt: at(0.3) }),
      // Applied on day 9: too late. Never finished the form.
      signup("c", 0.3, { appliedAt: at(9) }),
      // A role posting, never finished the form, connected by a mail reply on day 4.
      signup("d", 0.4, { appliedAt: at(4), connectedAt: at(4) }),
      // Not from a posting.
      signup("e", 0.5, { appliedAt: at(1), connectedAt: at(1) }),
    ],
    to: "2026-11-20",
  });
  assert.deepEqual(result.metrics.jobsWithoutRoleApplied7d?.[0], { denominator: 3, kind: "rate", numerator: 2 });
  assert.deepEqual(result.metrics.jobsWithoutRoleConnected7d?.[0], { denominator: 3, kind: "rate", numerator: 1 });
  assert.deepEqual(result.metrics.jobsUnfinishedSignups?.[0], { days: 1, kind: "count", value: 2 });
  assert.deepEqual(result.metrics.jobsUnfinishedApplied7d?.[0], { denominator: 2, kind: "rate", numerator: 1 });
  assert.deepEqual(result.metrics.jobsUnfinishedConnected7d?.[0], { denominator: 2, kind: "rate", numerator: 1 });
});
