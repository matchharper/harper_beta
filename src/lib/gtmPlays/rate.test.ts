import assert from "node:assert/strict";
import test from "node:test";
import { rateWithFormula } from "./rate";

test("a rate shows its formula, and nothing to divide by shows a dash", () => {
  assert.equal(rateWithFormula(1, 3), "33% = 1/3");
  assert.equal(rateWithFormula(2, 2), "100% = 2/2");
  assert.equal(rateWithFormula(0, 4), "0% = 0/4");
  assert.equal(rateWithFormula(0, 0), "–");
});
