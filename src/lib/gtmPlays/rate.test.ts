import assert from "node:assert/strict";
import test from "node:test";
import { ratePercent } from "./rate";

test("a rate is a rounded percent, and nothing to divide by shows a dash", () => {
  assert.equal(ratePercent(1, 3), "33%");
  assert.equal(ratePercent(2, 2), "100%");
  assert.equal(ratePercent(0, 4), "0%");
  assert.equal(ratePercent(0, 0), "–");
});
