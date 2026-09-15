import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCareerPromptCompactDateTime,
  formatCareerPromptMessageTimeLabel,
  normalizeCareerPromptTimeZone,
  sanitizeCareerPromptDateValues,
} from "./promptUtils";

test("formats prompt timestamps as month, day, and Korean local time", () => {
  assert.equal(
    formatCareerPromptCompactDateTime("2026-08-24T01:25:03.102495+00:00"),
    "8월 24일 10:25"
  );
  assert.equal(
    sanitizeCareerPromptDateValues("createdAt=2026-08-25T09:24:05.960Z"),
    "createdAt=8월 25일 18:24"
  );
});

test("formats absolute prompt timestamps in the user's timezone and preferred locale", () => {
  const value = "2026-09-01T02:57:00.000Z";

  assert.equal(
    formatCareerPromptCompactDateTime(value, {
      preferredLocale: "ko",
      timeZone: "Asia/Seoul",
    }),
    "9월 1일 11:57"
  );
  assert.equal(
    formatCareerPromptCompactDateTime(value, {
      preferredLocale: "en",
      timeZone: "America/New_York",
    }),
    "Aug 31, 22:57"
  );
});

test("omits message time labels for messages less than one hour old", () => {
  const now = new Date("2026-09-14T12:00:00.000Z");

  assert.equal(
    formatCareerPromptMessageTimeLabel("2026-09-14T11:00:01.000Z", {
      now,
      preferredLocale: "ko",
      timeZone: "Asia/Seoul",
    }),
    ""
  );
  assert.equal(
    formatCareerPromptMessageTimeLabel("2026-09-14T11:00:00.000Z", {
      now,
      preferredLocale: "en",
      timeZone: "America/New_York",
    }),
    ""
  );
});

test("uses localized hours for messages from the user's current local day", () => {
  const now = new Date("2026-09-14T12:00:00.000Z");

  assert.equal(
    formatCareerPromptMessageTimeLabel("2026-09-14T09:10:00.000Z", {
      now,
      preferredLocale: "ko",
      timeZone: "Asia/Seoul",
    }),
    "2시간 전"
  );
  assert.equal(
    formatCareerPromptMessageTimeLabel("2026-09-14T09:10:00.000Z", {
      now,
      preferredLocale: "en",
      timeZone: "America/New_York",
    }),
    "2 hours ago"
  );
});

test("uses localized calendar days until the tenth local day", () => {
  const now = new Date("2026-09-14T02:00:00.000Z");

  assert.equal(
    formatCareerPromptMessageTimeLabel("2026-09-13T01:30:00.000Z", {
      now,
      preferredLocale: "ko",
      timeZone: "Asia/Seoul",
    }),
    "1일 전"
  );
  assert.equal(
    formatCareerPromptMessageTimeLabel("2026-09-05T02:00:00.000Z", {
      now,
      preferredLocale: "en",
      timeZone: "America/New_York",
    }),
    "9 days ago"
  );
});

test("uses a localized absolute date and time from the tenth local day", () => {
  const now = new Date("2026-09-14T12:00:00.000Z");
  const createdAt = "2026-09-04T12:00:00.000Z";

  assert.equal(
    formatCareerPromptMessageTimeLabel(createdAt, {
      now,
      preferredLocale: "ko",
      timeZone: "Asia/Seoul",
    }),
    "9월 4일 21:00"
  );
  assert.equal(
    formatCareerPromptMessageTimeLabel(createdAt, {
      now,
      preferredLocale: "en",
      timeZone: "America/New_York",
    }),
    "Sep 4, 08:00"
  );
});

test("falls back to Seoul for invalid prompt timezones", () => {
  assert.equal(normalizeCareerPromptTimeZone("Not/A_Timezone"), "Asia/Seoul");
});
