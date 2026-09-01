import assert from "node:assert/strict";
import test from "node:test";
import {
  GOOGLE_CALENDAR_AUTO_SYNC_INTERVAL_MS,
  isFreshGoogleCalendarSync,
} from "./calendarSync";

const nowMs = Date.parse("2026-08-31T12:00:00.000Z");

test("Calendar request-time refreshes reuse a successful read for five minutes", () => {
  assert.equal(
    isFreshGoogleCalendarSync(
      new Date(nowMs - GOOGLE_CALENDAR_AUTO_SYNC_INTERVAL_MS + 1).toISOString(),
      nowMs
    ),
    true
  );
  assert.equal(
    isFreshGoogleCalendarSync(
      new Date(nowMs - GOOGLE_CALENDAR_AUTO_SYNC_INTERVAL_MS).toISOString(),
      nowMs
    ),
    false
  );
});

test("Calendar refreshes do not treat missing or malformed timestamps as fresh", () => {
  assert.equal(isFreshGoogleCalendarSync(null, nowMs), false);
  assert.equal(isFreshGoogleCalendarSync("not-a-date", nowMs), false);
});
