import assert from "node:assert/strict";
import test from "node:test";
import { kstDayWindow } from "./sendLimit";

test("the day is Korea's: 00:00 KST is 15:00 UTC the day before", () => {
  // 2026-11-16 10:12 KST
  assert.deepEqual(kstDayWindow(new Date("2026-11-16T01:12:00Z")), {
    start: "2026-11-15T15:00:00.000Z", end: "2026-11-16T15:00:00.000Z",
  });
  // 2026-11-16 23:59:59 KST is still the 16th
  assert.deepEqual(kstDayWindow(new Date("2026-11-16T14:59:59.999Z")).start, "2026-11-15T15:00:00.000Z");
  // 2026-11-17 00:00 KST starts the next day
  assert.deepEqual(kstDayWindow(new Date("2026-11-16T15:00:00Z")), {
    start: "2026-11-16T15:00:00.000Z", end: "2026-11-17T15:00:00.000Z",
  });
  // Late evening UTC is already the next morning in Korea
  assert.equal(kstDayWindow(new Date("2026-12-31T20:00:00Z")).start, "2026-12-31T15:00:00.000Z");
});
