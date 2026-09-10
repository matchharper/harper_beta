import assert from "node:assert/strict";
import test from "node:test";
import { parseOpsTalentMetricsRange } from "./talentMetricsServer";

test("normalizes reversed KST date ranges", () => {
  assert.deepEqual(parseOpsTalentMetricsRange("2026-09-08", "2026-09-01"), {
    from: "2026-09-01",
    to: "2026-09-08",
  });
});

test("rejects invalid and oversized metric ranges", () => {
  assert.throws(
    () => parseOpsTalentMetricsRange("2025-01-01", "2026-09-08"),
    /최대 366일/
  );
  assert.throws(
    () => parseOpsTalentMetricsRange("not-a-date", "2026-09-08"),
    /올바르지 않습니다/
  );
});
