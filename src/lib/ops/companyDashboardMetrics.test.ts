import test from "node:test";
import assert from "node:assert/strict";
import {
  createCompanyMetricAccumulator,
  kstDay,
} from "./companyDashboardMetrics";
test("Korean calendar days include the UTC previous-day evening", () => {
  assert.equal(kstDay("2026-10-18T15:00:00.000Z"), "2026-10-19");
  assert.equal(kstDay("2026-10-18T14:59:59.999Z"), "2026-10-18");
});
test("metrics keep company boundaries, count repeated events and deduplicate only explicit identities", () => {
  const a = createCompanyMetricAccumulator("2026-10-19", "2026-10-19");
  a.add("a", "presented", "2026-10-18T15:00:00Z", "run:candidate");
  a.add("a", "presented", "2026-10-19T02:00:00Z", "run:candidate");
  a.add("b", "presented", "2026-10-19T02:00:00Z", "run:candidate");
  a.add("a", "chats", "2026-10-19T03:00:00Z");
  a.add("a", "chats", "2026-10-19T03:00:00Z");
  a.add("a", "chats", "2026-10-19T15:00:00Z");
  assert.deepEqual(
    a.values().map((p) => [p.workspaceId, p.metric, p.value]),
    [
      ["a", "presented", 1],
      ["b", "presented", 1],
      ["a", "chats", 2],
    ]
  );
});
test("a channel retry after the range boundary is not a new recommendation", () => {
  const a = createCompanyMetricAccumulator("2026-10-19", "2026-10-19");
  a.add("a", "presented", "2026-10-18T14:59:00Z", "same-run:person");
  a.add("a", "presented", "2026-10-18T15:01:00Z", "same-run:person");
  assert.deepEqual(a.values(), []);
});
