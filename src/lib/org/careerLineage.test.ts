import assert from "node:assert/strict";
import test from "node:test";
import { buildCareerLineage, monthsBetween } from "./careerLineage";

const now = new Date("2026-10-29T00:00:00+09:00");

test("time spent counts months when both dates have them", () => {
  assert.equal(monthsBetween("2023-03", "2025-02", now), 23);
  assert.equal(monthsBetween("2023-03-01", "2023-03-20", now), null);
  // Still there: counted up to now.
  assert.equal(monthsBetween("2025-01", null, now), 21);
});

test("a year-only date counts whole years", () => {
  assert.equal(monthsBetween("2019", "2023", now), 48);
  assert.equal(monthsBetween("2019-03", "2023", now), 48);
  assert.equal(monthsBetween("2025", "2025", now), null);
  assert.equal(monthsBetween(null, "2023", now), null);
});

test("the line runs schools then jobs, oldest first, with time spent", () => {
  const steps = buildCareerLineage({
    educations: [
      {
        degree: "학사",
        description: null,
        endDate: "2023",
        field: "컴퓨터공학",
        memo: null,
        school: "가나대학교",
        startDate: "2019",
        url: null,
      },
    ],
    experiences: [
      {
        companyLocation: null,
        companyLogo: "https://example.com/logo.png",
        companyName: "다라전자",
        description: null,
        employmentType: null,
        endDate: null,
        memo: null,
        role: "Backend Engineer",
        startDate: "2023-03",
      },
    ] as never,
    now,
  });
  assert.deepEqual(
    steps.map((step) => [step.name, step.detail, step.months, step.logoUrl]),
    [
      ["가나대학교", "학사 · 컴퓨터공학", 48, null],
      ["다라전자", "Backend Engineer", 43, "https://example.com/logo.png"],
    ]
  );
});
