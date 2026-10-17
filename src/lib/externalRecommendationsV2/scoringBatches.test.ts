import test from "node:test";
import assert from "node:assert/strict";
import { type Fit } from "./contract";
import { runScoringBatches, scoringStopCounts } from "./scoringBatches";
const fit = (mutualFit: number, constraintPass = 99): Fit => ({
  mutualFit, constraintPass, candidateInterest: 80, companyInterest: 80,
  roleFit: 80, evidence: "sufficient",
});
const cached = (high: number, medium: number) => new Map(
  Array.from({ length: high + medium }, (_, i) => [String(i), fit(i < high ? 60 : 50)])
);

test("inclusive score boundaries count high scores in both tiers, excluding hard conflicts", () => {
  assert.deepEqual(scoringStopCounts([fit(60), fit(50), fit(59.99), fit(49.99), fit(100, 50)]),
    { atLeast60: 1, atLeast50: 3 });
});
test("both thresholds are required; existing caches can avoid all new calls", async () => {
  for (const [high, medium, expectedCalls] of [[20, 30, 0], [19, 31, 1], [20, 29, 1]]) {
    let calls = 0;
    const result = await runScoringBatches([1], cached(high, medium), async () => { calls++; });
    assert.equal(calls, expectedCalls);
    assert.equal(result.earlyStopped, expectedCalls === 0);
  }
});
test("stop unscheduled batches but drain every started batch and retain its evaluations", async () => {
  const fits = new Map([...cached(20, 29)].map(([id, value]) => [`cache-${id}`, value]));
  const release: Array<() => void> = [];
  let completed = 0;
  const pending = runScoringBatches(Array.from({ length: 100 }, (_, i) => i), fits, async (batch) => {
    await new Promise<void>((resolve) => release.push(resolve));
    for (const id of batch) fits.set(String(id), fit(id < 20 ? 60 : 50));
    completed++;
  });
  assert.equal(release.length, 6);
  // Cached 49 plus the first completed batch meets both thresholds.
  release[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(release.length, 6);
  assert.equal(completed, 1);
  release.slice(1).forEach((resolve) => resolve());
  const result = await pending;
  assert.equal(completed, 6);
  assert.equal(fits.size, 109);
  assert.equal(result.scoringSkippedRoleCount, 40);
  assert.equal(result.earlyStopped, true);
});
