import assert from "node:assert/strict";
import test from "node:test";
import { formatCareerDate } from "./dateFormat";

test("formats career dates consistently with the selected UI locale", () => {
  const date = new Date(2026, 0, 8, 12);

  assert.equal(formatCareerDate(date, "ko"), "2026년 1월 8일");
  assert.equal(formatCareerDate(date, "en"), "Jan 8, 2026");
});

test("returns null for missing or invalid dates", () => {
  assert.equal(formatCareerDate(null, "ko"), null);
  assert.equal(formatCareerDate("not-a-date", "en"), null);
});
