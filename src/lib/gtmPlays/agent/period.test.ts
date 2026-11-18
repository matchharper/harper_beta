import assert from "node:assert/strict";
import test from "node:test";
import { addDays, kstDay, periodDate, periodLength, resolveAgentPeriod } from "./period";

const today = "2026-11-17";

test("presets end today and count today in", () => {
  assert.deepEqual(resolveAgentPeriod({ days: 30 }, today), { from: "2026-10-19", to: today, days: 30, label: "최근 30일" });
  assert.deepEqual(resolveAgentPeriod({ days: 1 }, today), { from: today, to: today, days: 1, label: "최근 1일" });
  assert.equal(resolveAgentPeriod({}, today).days, 30);
  assert.equal(resolveAgentPeriod(null, today).label, "최근 30일");
  assert.equal(resolveAgentPeriod({ days: 9999 }, today).days, 365);
  assert.equal(resolveAgentPeriod({ days: 0 }, today).days, 30);
});

test("a custom range: both ends in, swapped when reversed, never past today, at most 365 days", () => {
  assert.deepEqual(resolveAgentPeriod({ from: "2026-11-01", to: "2026-11-17", days: 7 }, today),
    { from: "2026-11-01", to: "2026-11-17", days: null, label: "11. 1. ~ 11. 17." });
  assert.equal(resolveAgentPeriod({ from: "2026-11-17", to: "2026-11-01" }, today).from, "2026-11-01");
  assert.equal(resolveAgentPeriod({ from: "2026-11-10", to: "2026-12-31" }, today).to, today);
  assert.equal(resolveAgentPeriod({ from: "2026-12-01", to: "2026-12-31" }, today).from, today);
  const long = resolveAgentPeriod({ from: "2024-01-01", to: "2026-11-17" }, today);
  assert.equal(periodLength(long.from, long.to), 365);
  assert.equal(resolveAgentPeriod({ from: "2025-12-01", to: "2026-01-05" }, today).label, "2025. 12. 1. ~ 1. 5.");
  // Not real dates: the preset.
  assert.equal(resolveAgentPeriod({ from: "2026-02-30", to: "2026-03-01", days: 7 }, today).label, "최근 7일");
  assert.equal(resolveAgentPeriod({ from: "11/1", to: "2026-11-17" }, today).days, 30);
});

test("day helpers", () => {
  assert.equal(periodDate("2026-02-29"), null);
  assert.equal(periodDate("2028-02-29"), "2028-02-29");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(periodLength("2026-11-17", "2026-11-17"), 1);
  // 15:30 UTC is already the next day in Korea.
  assert.equal(kstDay(new Date("2026-11-16T15:30:00Z")), "2026-11-17");
});
