import assert from "node:assert/strict";
import test from "node:test";
import {
  formatProfileDuration,
  formatProfileExperience,
  getProfileCareerSummary,
} from "./profileCareerSummary";

const now = new Date("2026-10-19T12:00:00Z");

test("counts overlapping work only once and includes current employment", () => {
  assert.deepEqual(
    getProfileCareerSummary(
      [
        { companyName: "A", startDate: "2020-01-01", endDate: "2022-01-01" },
        { companyName: "B", startDate: "2021-01-01", endDate: "2023-01-01" },
        { companyName: "C", startDate: "2024-01-01", endDate: null },
      ],
      now
    ),
    { experienceMonths: 69, experienceEstimated: false, lastMoveMonths: 33 }
  );
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
  for (const experience of [
    [],
    [{ startDate: null }],
    [{ startDate: "2027-01" }],
    [{ startDate: "2026-13" }],
    [{ startDate: "2026-02", endDate: "2025-01" }],
  ]) {
    assert.deepEqual(getProfileCareerSummary(experience, now), {
      experienceMonths: null,
      experienceEstimated: false,
      lastMoveMonths: null,
    });
  }
});

test("year-only overlapping roles produce one stable estimate instead of adding years", () => {
  const experience = [
    { startDate: "2024", endDate: "2024" },
    { startDate: "2024", endDate: "2025" },
    { startDate: "2025", endDate: "2025" },
  ];
  const summary = getProfileCareerSummary(experience, now);
  assert.deepEqual(summary, {
    experienceMonths: 18,
    experienceEstimated: true,
    lastMoveMonths: null,
  });
  assert.equal(formatProfileExperience(summary, "ko"), "약 1년 6개월");
  assert.equal(formatProfileExperience(summary, "en"), "Approx. 1 yr, 6 mo");
  assert.deepEqual(
    getProfileCareerSummary([...experience].reverse(), now),
    summary
  );
  assert.deepEqual(
    getProfileCareerSummary([...experience, ...experience], now),
    summary
  );
});

test("precise surrounding roles can fully cover an uncertain role", () => {
  const summary = getProfileCareerSummary(
    [
      { startDate: "2023-01", endDate: "2024-08" },
      { startDate: "2024", endDate: "2024" },
      { startDate: "2024-08", endDate: "2025-01" },
    ],
    now
  );
  assert.equal(summary.experienceMonths, 24);
  assert.equal(summary.experienceEstimated, true);
  assert.equal(formatProfileExperience(summary, "ko"), "약 2년 0개월");
});

test("estimates transition months from the previous end and following start", () => {
  const experience = [
    { companyName: "A", startDate: "2022-01", endDate: "2024-03" },
    { companyName: "B", startDate: "2024", endDate: "2025" },
    { companyName: "C", startDate: "2025-09", endDate: null },
  ];
  // B is estimated as March 2024–September 2025. The union is January
  // 2022–October 2026, not a sum of independently rounded role durations.
  const summary = getProfileCareerSummary(experience, now);
  assert.equal(summary.experienceMonths, 57);
  assert.equal(formatProfileExperience(summary, "ko"), "약 4년 9개월");
  assert.deepEqual(
    getProfileCareerSummary([...experience].reverse(), now),
    summary
  );
  assert.deepEqual(
    getProfileCareerSummary([...experience, ...experience], now),
    summary
  );
});

test("uses neighbouring months within the same year instead of the six-month fallback", () => {
  const summary = getProfileCareerSummary(
    [
      { startDate: "2024-01", endDate: "2024-03" },
      { startDate: "2024", endDate: "2024" },
      { startDate: "2024-10", endDate: "2025-01" },
    ],
    now
  );
  assert.equal(summary.experienceMonths, 12);
  assert.equal(summary.experienceEstimated, true);
});

test("a year-to-year role without neighbouring dates uses consistent mid-year endpoints", () => {
  const experience = [{ startDate: "2024", endDate: "2025" }];
  assert.equal(getProfileCareerSummary(experience, now).experienceMonths, 12);
  assert.equal(
    getProfileCareerSummary([...experience, ...experience], now)
      .experienceMonths,
    12
  );
});

test("mixed precision respects known endpoints without inventing continuous work", () => {
  const summary = getProfileCareerSummary(
    [
      { startDate: "2022-01", endDate: "2023-01" },
      { startDate: "2024", endDate: "2024-03" },
      { startDate: "2024-09", endDate: "2024" },
    ],
    now
  );
  // Known one-year gap remains excluded; neither uncertain entry crosses
  // the known March/September boundary to fill the six-month gap.
  assert.equal(summary.experienceMonths, 15);
  assert.equal(summary.experienceEstimated, true);
  assert.equal(formatProfileExperience(summary, "ko"), "약 1년 3개월");
});

test("same-year work is bounded, and an ongoing year is capped at the current month", () => {
  const sameYear = getProfileCareerSummary(
    [{ startDate: "2024", endDate: "2024" }],
    now
  );
  assert.equal(sameYear.experienceMonths, 6);
  assert.equal(sameYear.experienceEstimated, true);
  assert.equal(formatProfileExperience(sameYear, "ko"), "약 6개월");
  assert.equal(formatProfileExperience(sameYear, "en"), "Approx. 6 mo");
  for (const [endDate, expected] of [
    [null, 4],
    ["2026", 5],
    ["2027-01", 4],
  ] as const) {
    const summary = getProfileCareerSummary(
      [{ startDate: "2026", endDate }],
      now
    );
    assert.equal(summary.experienceMonths, expected);
    assert.equal(summary.experienceEstimated, true);
  }
});

test("a missing or invalid entry does not erase confirmed experience or claim completeness", () => {
  for (const entry of [
    { startDate: null, endDate: "2020" },
    { startDate: "unknown", endDate: null },
    { startDate: "2023-01", endDate: "invalid" },
    { startDate: "2023-02-29", endDate: "2024-01" },
    { startDate: "2024-04-31", endDate: "2025-01" },
    { startDate: "2024-01", endDate: "2023-01" },
  ]) {
    const summary = getProfileCareerSummary(
      [entry, { startDate: "2024-01", endDate: "2025-01" }],
      now
    );
    assert.equal(summary.experienceMonths, 12);
    assert.equal(summary.experienceEstimated, true);
    assert.equal(formatProfileExperience(summary, "ko"), "약 1년 0개월");
    assert.equal(formatProfileExperience(summary, "en"), "Approx. 1 yr, 0 mo");
  }
  assert.equal(
    formatProfileExperience(getProfileCareerSummary([], now), "ko"),
    "—"
  );
  const noLowerBound = getProfileCareerSummary(
    [{ startDate: "2024", endDate: "2024" }, { startDate: null }],
    now
  );
  assert.equal(formatProfileExperience(noLowerBound, "ko"), "약 6개월");
});

test("exact dates retain month arithmetic, overlap removal, gaps, and Seoul month rollover", () => {
  const summary = getProfileCareerSummary(
    [
      { startDate: "2024-01", endDate: "2025-01" },
      { startDate: "2024-01", endDate: "2025-01" },
      { startDate: "2024-02-29", endDate: "2024-06-30" },
      { startDate: "2026-01", endDate: null },
    ],
    new Date("2026-09-30T15:00:00Z")
  );
  assert.deepEqual(summary, {
    experienceMonths: 21,
    experienceEstimated: false,
    lastMoveMonths: 9,
  });
  assert.equal(formatProfileExperience(summary, "en"), "1 yr, 9 mo");
});

test("formats years and months in both locales, including zero and ago", () => {
  assert.equal(formatProfileDuration(26, "ko"), "2년 2개월");
  assert.equal(formatProfileDuration(26, "ko", true), "2년 2개월 전");
  assert.equal(formatProfileDuration(26, "en"), "2 yr, 2 mo");
  assert.equal(formatProfileDuration(26, "en", true), "2 yr, 2 mo ago");
  assert.equal(formatProfileDuration(0, "ko"), "0개월");
  assert.equal(formatProfileDuration(11, "ko", true), "11개월 전");
  assert.equal(formatProfileDuration(11, "en", true), "11 mo ago");
  assert.equal(formatProfileDuration(null, "en", true), "—");
});
