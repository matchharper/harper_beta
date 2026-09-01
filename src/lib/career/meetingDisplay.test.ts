import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCareerActivityRelativeTime,
  formatCareerMeetingDateTimeRange,
} from "./meetingDisplay";

test("formats an upcoming meeting in KST for Korean Career UI", () => {
  assert.equal(
    formatCareerMeetingDateTimeRange({
      endAt: "2026-09-03T07:00:00.000Z",
      locale: "ko",
      startAt: "2026-09-03T06:00:00.000Z",
    }),
    "9월 3일 (목) 오후 3:00–오후 4:00 KST"
  );
});

test("returns null for an invalid meeting timestamp", () => {
  assert.equal(
    formatCareerMeetingDateTimeRange({
      endAt: "2026-09-03T07:00:00.000Z",
      locale: "en",
      startAt: "invalid",
    }),
    null
  );
});

test("uses compact relative time for talent role activities from today", () => {
  assert.equal(
    formatCareerActivityRelativeTime(
      "2026-08-31T01:00:00.000Z",
      "ko",
      new Date("2026-08-31T03:15:00.000Z")
    ),
    "2시간 전"
  );
});

test("uses yesterday and compact day labels in KST", () => {
  const now = new Date("2026-08-31T03:00:00.000Z");
  assert.equal(
    formatCareerActivityRelativeTime("2026-08-30T10:00:00.000Z", "ko", now),
    "어제"
  );
  assert.equal(
    formatCareerActivityRelativeTime("2026-08-26T03:00:00.000Z", "ko", now),
    "5d"
  );
});
