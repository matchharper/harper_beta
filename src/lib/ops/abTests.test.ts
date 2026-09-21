import assert from "node:assert/strict";
import test from "node:test";
import { compareOpsAbTestRates, makeOpsAbTestRate } from "@/lib/ops/abTests";

test("keeps an experiment in collecting state until both variants have data", () => {
  const result = compareOpsAbTestRates({
    first: makeOpsAbTestRate(0, 0),
    firstVariantId: "a",
    second: makeOpsAbTestRate(2, 10),
    secondVariantId: "b",
  });

  assert.equal(result.state, "collecting");
  assert.equal(result.leaderVariantId, null);
});

test("does not declare a winner when the 95% intervals overlap", () => {
  const result = compareOpsAbTestRates({
    first: makeOpsAbTestRate(50, 100),
    firstVariantId: "a",
    second: makeOpsAbTestRate(54, 100),
    secondVariantId: "b",
  });

  assert.equal(result.state, "no_clear_difference");
  assert.equal(result.leaderVariantId, null);
  assert.ok(result.delta && result.delta > 0);
});

test("declares the second variant only when its interval is clearly higher", () => {
  const result = compareOpsAbTestRates({
    first: makeOpsAbTestRate(300, 1_000),
    firstVariantId: "a",
    second: makeOpsAbTestRate(420, 1_000),
    secondVariantId: "b",
  });

  assert.equal(result.state, "leader");
  assert.equal(result.leaderVariantId, "b");
  assert.ok(result.confidenceLow && result.confidenceLow > 0);
});

test("can identify the first variant as the clear leader", () => {
  const result = compareOpsAbTestRates({
    first: makeOpsAbTestRate(620, 1_000),
    firstVariantId: "a",
    second: makeOpsAbTestRate(500, 1_000),
    secondVariantId: "b",
  });

  assert.equal(result.state, "leader");
  assert.equal(result.leaderVariantId, "a");
  assert.ok(result.confidenceHigh && result.confidenceHigh < 0);
});
