import assert from "node:assert/strict";
import test from "node:test";
import { formatProfileDuration, getProfileCareerSummary } from "./profileCareerSummary";

const now = new Date("2026-10-19T12:00:00Z");

test("counts overlapping work only once and includes current employment", () => {
  assert.deepEqual(getProfileCareerSummary([
    { companyName: "A", startDate: "2020-01-01", endDate: "2022-01-01" },
    { companyName: "B", startDate: "2021-01-01", endDate: "2023-01-01" },
    { companyName: "C", startDate: "2024-01-01", endDate: null },
  ], now), { experienceMonths: 69, lastMoveMonths: 33 });
});

test("uses the company joining date across consecutive roles, but not a rehire", () => {
  const experience = [
    { companyName: "A", startDate: "2020-01", endDate: "2021-01" },
    { companyName: "A", startDate: "2023-01", endDate: "2024-01" },
    { companyName: "A", startDate: "2024-01", endDate: null },
  ];
  assert.equal(getProfileCareerSummary(experience, now).lastMoveMonths, 45);
});

test("does not manufacture durations from missing, invalid, or future dates", () => {
  for (const experience of [[], [{ startDate: null }], [{ startDate: "2027-01" }], [{ startDate: "2026-13" }], [{ startDate: "2026-02", endDate: "2025-01" }]]) {
    assert.deepEqual(getProfileCareerSummary(experience, now), { experienceMonths: null, lastMoveMonths: null });
  }
});

test("formats years and months in both locales, including zero and ago", () => {
  assert.equal(formatProfileDuration(26, "ko"), "2년 2개월");
  assert.equal(formatProfileDuration(26, "ko", true), "2년 2개월 전");
  assert.equal(formatProfileDuration(26, "en"), "2 yr, 2 mo");
  assert.equal(formatProfileDuration(26, "en", true), "2 yr, 2 mo ago");
  assert.equal(formatProfileDuration(0, "ko"), "0년 0개월");
  assert.equal(formatProfileDuration(null, "en", true), "—");
});
