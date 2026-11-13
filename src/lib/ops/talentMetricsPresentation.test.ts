import assert from "node:assert/strict";
import test from "node:test";
import type { OpsTalentMetricRetentionPoint } from "./talentMetrics";
import { ACTIVITY_WEEKDAYS, latestObservedWeekday, weeklyActivityChartPoints } from "./talentMetricsPresentation";

const legacyWeek: OpsTalentMetricRetentionPoint = {
  activeTalentCount: 214,
  cohortStart: "2026-11-09",
  fullLabel: "2026-11-09 (진행 중)",
  label: "11.09",
  retainedTalentCount: 70,
  retentionBaseTalentCount: 140,
  retentionRate: 0.5,
};

test("an older RPC response or cached week without weekday counts remains readable", () => {
  for (const week of [legacyWeek, { ...legacyWeek, weekdayCumulativeActiveTalentCounts: null }]) {
    assert.equal(latestObservedWeekday([week]), 6);
    const [point] = weeklyActivityChartPoints([week], 3);
    assert.equal(point.activeTalentCount, 214);
    // The whole-week total cannot supply a per-day breakdown; do not invent zeroes.
    assert.deepEqual(ACTIVITY_WEEKDAYS.map(day => point[day.key]), Array(7).fill(null));
  }
});

test("a mixed response preserves available cumulative counts without inventing missing days", () => {
  const data = [legacyWeek, {
    ...legacyWeek,
    weekdayCumulativeActiveTalentCounts: [98, 148, 179, 214, null, null, null],
  }];
  assert.equal(latestObservedWeekday(data), 3);
  const points = weeklyActivityChartPoints(data, 3);
  assert.deepEqual(ACTIVITY_WEEKDAYS.map(day => points[0][day.key]), Array(7).fill(null));
  assert.deepEqual(ACTIVITY_WEEKDAYS.map(day => points[1][day.key]), [98, 50, 31, 35, null, null, null]);
});
