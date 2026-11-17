import assert from "node:assert/strict";
import test from "node:test";
import { capLeftUsd, fitsUnderCap, lookupSettleUsd, spendDay } from "./spend";

test("spend counts on the Korea-time day it was spent (UTC + 9)", () => {
  assert.equal(spendDay(new Date("2026-11-17T14:59:59.999Z")), "2026-11-17"); // 23:59:59 in Korea
  assert.equal(spendDay(new Date("2026-11-17T15:00:00.000Z")), "2026-11-18"); // midnight in Korea
  assert.equal(spendDay(new Date("2026-11-16T15:00:00.000Z")), "2026-11-17");
  assert.equal(spendDay(new Date("2026-12-31T15:30:00.000Z")), "2027-01-01");
});

test("the cap: nothing fits at or over it, a call fits while its estimate stays under", () => {
  assert.equal(fitsUnderCap(0, 100), true);
  assert.equal(fitsUnderCap(99.99, 100), true);
  assert.equal(fitsUnderCap(100, 100), false);
  assert.equal(fitsUnderCap(101, 100), false);
  assert.equal(fitsUnderCap(99.9, 100, 0.12), false);
  assert.equal(fitsUnderCap(99.88, 100, 0.12), true);
  assert.equal(fitsUnderCap(0, 0), false);
  assert.equal(capLeftUsd(40.5, 100), 59.5);
  assert.equal(capLeftUsd(120, 100), 0);
});

test("an email lookup: its estimate is logged when it starts, the difference when it ends", () => {
  assert.equal(lookupSettleUsd(0.12, 0.12), 0);
  assert.equal(lookupSettleUsd(0.101, 0.12), -0.019);
  assert.equal(lookupSettleUsd(0.2, 0.12), 0.08);
  // Started before the log existed: the whole cost now.
  assert.equal(lookupSettleUsd(0.1, undefined), 0.1);
  assert.equal(lookupSettleUsd(Number.NaN, 0.12), -0.12);
});
