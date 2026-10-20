import assert from "node:assert/strict";
import test from "node:test";
import { compareOrgCandidates } from "./candidateBoardSort";

function candidate(id: string, score: number | null, date: string) {
  return {
    recommendationId: id,
    recommendationScore: score,
    recommendedAt: "2026-01-01",
    companyPresentedAt: date,
    source: "recommendation" as const,
    stage: "pending_connection" as const,
  };
}

test("recommended uses stored scores, breaks ties by introduction date, and keeps missing scores last", () => {
  const items = [
    candidate("missing", null, "2026-10-19"),
    candidate("older", 90, "2026-10-17"),
    candidate("lower", 70, "2026-10-19"),
    candidate("newer", 90, "2026-10-18"),
    candidate("zero", 0, "2026-10-18"),
  ];
  assert.deepEqual(
    items
      .toSorted((a, b) => compareOrgCandidates(a, b, "recommended"))
      .map((item) => item.recommendationId),
    ["newer", "older", "lower", "zero", "missing"]
  );
});

test("latest follows the displayed introduction date regardless of score", () => {
  const old = candidate("old", 99, "2026-10-01");
  const recent = candidate("recent", 20, "2026-10-19");
  old.recommendedAt = "2026-10-20";
  assert.ok(compareOrgCandidates(recent, old, "latest") < 0);
});

test("equal dates and absent or invalid scores retain a deterministic order", () => {
  const a = candidate("a", null, "");
  const b = candidate("b", Number.NaN, "");
  assert.ok(compareOrgCandidates(a, b, "recommended") < 0);
  assert.ok(compareOrgCandidates(b, a, "recommended") > 0);
});
