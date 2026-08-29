import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultMeetingAvailabilityDocument } from "./availability";
import { calculateMeetingCandidateSlots, meetingLocalTimeToUtc } from "./slots";

function availability(timezone = "Asia/Seoul") {
  return {
    ...createDefaultMeetingAvailabilityDocument(timezone),
    updatedAt: "2026-08-25T00:00:00.000Z",
    version: 3,
  };
}

test("calculates half-hour starts and subtracts overlapping Harper meetings", () => {
  const result = calculateMeetingCandidateSlots({
    availability: availability(),
    busyRanges: [
      {
        endAt: "2026-08-26T03:00:00.000Z",
        source: "harper",
        startAt: "2026-08-26T02:00:00.000Z",
      },
    ],
    durationMinutes: 60,
    windowEnd: new Date("2026-08-26T06:00:00.000Z"),
    windowStart: new Date("2026-08-26T00:00:00.000Z"),
  });

  assert.deepEqual(
    result.map((slot) => slot.startAt),
    [
      "2026-08-26T01:00:00.000Z",
      "2026-08-26T03:00:00.000Z",
      "2026-08-26T03:30:00.000Z",
      "2026-08-26T04:00:00.000Z",
      "2026-08-26T04:30:00.000Z",
      "2026-08-26T05:00:00.000Z",
    ]
  );
});

test("date overrides replace weekly hours before slots are generated", () => {
  const value = availability();
  value.dateOverrides["2026-08-26"] = [{ end: "15:00", start: "14:00" }];
  const result = calculateMeetingCandidateSlots({
    availability: value,
    durationMinutes: 60,
    windowEnd: new Date("2026-08-26T15:00:00.000Z"),
    windowStart: new Date("2026-08-25T15:00:00.000Z"),
  });
  assert.deepEqual(
    result.map((slot) => slot.startAt),
    ["2026-08-26T05:00:00.000Z"]
  );
});

test("converts local time with the correct daylight-saving offset", () => {
  assert.equal(
    meetingLocalTimeToUtc({
      dateKey: "2026-03-09",
      minutes: 9 * 60,
      timezone: "America/New_York",
    })?.toISOString(),
    "2026-03-09T13:00:00.000Z"
  );
  assert.equal(
    meetingLocalTimeToUtc({
      dateKey: "2026-11-02",
      minutes: 9 * 60,
      timezone: "America/New_York",
    })?.toISOString(),
    "2026-11-02T14:00:00.000Z"
  );
});

test("drops local times that do not exist during a DST jump", () => {
  assert.equal(
    meetingLocalTimeToUtc({
      dateKey: "2026-03-08",
      minutes: 2 * 60 + 30,
      timezone: "America/New_York",
    }),
    null
  );
});
