import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultMeetingAvailabilityDocument,
  formatMeetingAvailabilitySummary,
  getMeetingAvailabilityIntervalsForDate,
  hasMeetingStartInTimeRange,
  isMeetingTimeRangeAvailable,
  meetingAvailabilityDocumentsEqual,
  meetingDateKeyInTimezone,
  MeetingAvailabilityValidationError,
  normalizeMeetingAvailabilityInput,
  setMeetingTimeRangeAvailability,
} from "./availability";

test("normalizes, sorts, and merges touching weekly intervals", () => {
  const value = normalizeMeetingAvailabilityInput(
    {
      dateOverrides: {},
      timezone: "Asia/Seoul",
      weeklyRules: {
        "1": [
          { end: "12:00", start: "10:00" },
          { end: "19:00", start: "12:00" },
        ],
      },
    },
    { now: new Date("2026-08-25T00:00:00.000Z") }
  );

  assert.deepEqual(value.weeklyRules["1"], [{ end: "19:00", start: "10:00" }]);
  assert.deepEqual(value.weeklyRules["2"], []);
});

test("date override replaces the weekly rule, including a closed day", () => {
  const value = createDefaultMeetingAvailabilityDocument();
  value.dateOverrides["2026-08-27"] = [];

  assert.deepEqual(
    getMeetingAvailabilityIntervalsForDate(value, "2026-08-27", "4"),
    []
  );
  assert.deepEqual(
    getMeetingAvailabilityIntervalsForDate(value, "2026-09-03", "4"),
    [{ end: "19:00", start: "10:00" }]
  );
});

test("drops date overrides older than 30 days and summarizes the profile", () => {
  const value = createDefaultMeetingAvailabilityDocument();
  value.dateOverrides = {
    "2026-07-25": [],
    "2026-08-28": [{ end: "16:00", start: "10:00" }],
  };

  const normalized = normalizeMeetingAvailabilityInput(value, {
    now: new Date("2026-08-25T00:00:00.000Z"),
  });
  assert.deepEqual(Object.keys(normalized.dateOverrides), ["2026-08-28"]);
  assert.equal(
    formatMeetingAvailabilitySummary(normalized),
    "Asia/Seoul · 평일 10:00–19:00 · 예외 1일"
  );
});

test("rejects invalid timezones and non-quarter-hour intervals", () => {
  const value = createDefaultMeetingAvailabilityDocument();
  assert.throws(
    () =>
      normalizeMeetingAvailabilityInput({
        ...value,
        timezone: "Not/A_Timezone",
      }),
    MeetingAvailabilityValidationError
  );
  assert.throws(
    () =>
      normalizeMeetingAvailabilityInput({
        ...value,
        weeklyRules: {
          ...value.weeklyRules,
          "1": [{ end: "11:00", start: "10:10" }],
        },
      }),
    MeetingAvailabilityValidationError
  );
});

test("uses the availability timezone when pruning old date overrides", () => {
  assert.equal(
    meetingDateKeyInTimezone(
      new Date("2026-08-25T16:30:00.000Z"),
      "Asia/Seoul"
    ),
    "2026-08-26"
  );

  const value = createDefaultMeetingAvailabilityDocument("Asia/Seoul");
  value.dateOverrides = {
    "2026-07-26": [],
    "2026-07-27": [],
  };
  const normalized = normalizeMeetingAvailabilityInput(value, {
    now: new Date("2026-08-25T16:30:00.000Z"),
  });

  assert.deepEqual(Object.keys(normalized.dateOverrides), ["2026-07-27"]);
});

test("compares semantically identical date overrides independent of key order", () => {
  const left = createDefaultMeetingAvailabilityDocument();
  left.dateOverrides = {
    "2026-08-28": [],
    "2026-08-29": [{ end: "18:00", start: "14:00" }],
  };
  const right = createDefaultMeetingAvailabilityDocument();
  right.dateOverrides = {
    "2026-08-29": [{ end: "18:00", start: "14:00" }],
    "2026-08-28": [],
  };

  assert.equal(meetingAvailabilityDocumentsEqual(left, right), true);
});

test("finds a 60-minute start inside an hour even when it begins at quarter past", () => {
  assert.equal(
    hasMeetingStartInTimeRange({
      intervals: [{ end: "11:15", start: "10:15" }],
      rangeEnd: "11:00",
      rangeStart: "10:00",
    }),
    true
  );
  assert.equal(
    hasMeetingStartInTimeRange({
      intervals: [{ end: "11:00", start: "10:15" }],
      rangeEnd: "11:00",
      rangeStart: "10:00",
    }),
    false
  );
});

test("marks a time block selected only when the whole block is available", () => {
  assert.equal(
    isMeetingTimeRangeAvailable({
      intervals: [{ end: "12:00", start: "09:00" }],
      rangeEnd: "11:00",
      rangeStart: "10:00",
    }),
    true
  );
  assert.equal(
    isMeetingTimeRangeAvailable({
      intervals: [{ end: "11:15", start: "10:15" }],
      rangeEnd: "11:00",
      rangeStart: "10:00",
    }),
    false
  );
});

test("time block toggles split and merge normalized intervals", () => {
  const removed = setMeetingTimeRangeAvailability({
    available: false,
    intervals: [{ end: "12:00", start: "09:00" }],
    rangeEnd: "11:00",
    rangeStart: "10:00",
  });
  assert.deepEqual(removed, [
    { end: "10:00", start: "09:00" },
    { end: "12:00", start: "11:00" },
  ]);

  assert.deepEqual(
    setMeetingTimeRangeAvailability({
      available: true,
      intervals: removed,
      rangeEnd: "11:00",
      rangeStart: "10:00",
    }),
    [{ end: "12:00", start: "09:00" }]
  );
});
