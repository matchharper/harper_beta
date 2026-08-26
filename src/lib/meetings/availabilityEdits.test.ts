import assert from "node:assert/strict";
import test from "node:test";
import { applyMeetingAvailabilityEdits } from "@/lib/meetings/availabilityEdits";

test("creates an initial every-day recurring schedule from company chat", () => {
  const result = applyMeetingAvailabilityEdits({
    current: null,
    input: {
      timezone: "Asia/Seoul",
      weeklyUpdates: [
        {
          days: ["1", "2", "3", "4", "5", "6", "7"],
          intervals: [{ end: "20:00", start: "07:00" }],
        },
      ],
    },
    now: new Date("2026-08-26T00:00:00.000Z"),
  });

  assert.deepEqual(result.weeklyRules["1"], [{ end: "20:00", start: "07:00" }]);
  assert.deepEqual(result.weeklyRules["7"], [{ end: "20:00", start: "07:00" }]);
});

test("changes only named weekdays and preserves other rules and exceptions", () => {
  const result = applyMeetingAvailabilityEdits({
    current: {
      dateOverrides: { "2026-08-28": [] },
      timezone: "Asia/Seoul",
      updatedAt: "2026-08-25T00:00:00.000Z",
      version: 3,
      weeklyRules: {
        "1": [{ end: "19:00", start: "10:00" }],
        "2": [{ end: "19:00", start: "10:00" }],
        "3": [{ end: "19:00", start: "10:00" }],
        "4": [{ end: "19:00", start: "10:00" }],
        "5": [{ end: "19:00", start: "10:00" }],
        "6": [{ end: "21:00", start: "19:00" }],
        "7": [],
      },
    },
    input: {
      weeklyUpdates: [
        {
          days: ["1", "2", "3", "4", "5"],
          intervals: [{ end: "20:00", start: "07:00" }],
        },
      ],
    },
    now: new Date("2026-08-26T00:00:00.000Z"),
  });

  assert.deepEqual(result.weeklyRules["1"], [{ end: "20:00", start: "07:00" }]);
  assert.deepEqual(result.weeklyRules["6"], [{ end: "21:00", start: "19:00" }]);
  assert.deepEqual(result.dateOverrides["2026-08-28"], []);
});

test("rejects duplicate weekday edits instead of applying order-dependent data", () => {
  assert.throws(
    () =>
      applyMeetingAvailabilityEdits({
        current: null,
        input: {
          weeklyUpdates: [
            { days: ["1"], intervals: [] },
            { days: ["1"], intervals: [] },
          ],
        },
      }),
    /같은 요일/
  );
});

test("rejects adding and removing the same date exception in one edit", () => {
  assert.throws(
    () =>
      applyMeetingAvailabilityEdits({
        current: null,
        input: {
          dateOverrides: [{ date: "2026-08-28", intervals: [] }],
          removeDateOverrides: ["2026-08-28"],
        },
        now: new Date("2026-08-26T00:00:00.000Z"),
      }),
    /추가하고 삭제/
  );
});
