import assert from "node:assert/strict";
import test from "node:test";
import { directionHint, formatCompanyFacts } from "./discovery";

const signals = {
  companyId: "w1", name: "Orbit", website: null, linkedinUrl: null, checkedAt: "2026-11-19T00:00:00Z", total: 1,
  items: [{ date: "2026-11-03", content: "Building an applied AI team in Seoul.", url: "https://www.linkedin.com/posts/orbit-1" }],
};

test("a company's facts carry its hiring signals with their dates next to its open roles", () => {
  assert.equal(formatCompanyFacts({
    hiring: { openRoles: 0 }, signals,
    profile: { size: { start: 11, end: 50 }, founded: 2021, location: "Seoul" },
  }), "no open role indexed · hiring signals as of 2026-11-19: 2026-11-03 Building an applied AI team in Seoul. (linkedin.com)" +
    " · 11–50 employees, founded 2021, Seoul");
  assert.equal(formatCompanyFacts({ signals: { ...signals, total: 0, items: [] } }), "no public hiring signal found as of 2026-11-19");
  // A company never checked shows no signal line at all.
  assert.equal(formatCompanyFacts({ hiring: { openRoles: 2, relatedTitles: ["Backend Engineer"] } }), "open roles 2 (closest: Backend Engineer)");
});

test("without a search title, open roles are picked by what the person wants: their Brief, else their current title", () => {
  assert.equal(directionHint({ search_brief: [{ label: "Role", content: "AI 제품 백엔드" }, { content: "서울, 연봉 1억 이상" }] }),
    "AI 제품 백엔드\n서울, 연봉 1억 이상");
  assert.equal(directionHint({ search_brief: "Product engineer at a fintech" }), "Product engineer at a fintech");
  assert.equal(directionHint({ search_brief: [], profile: { headline: "Engineer", experiences: [
    { role: "Backend Engineer", end_date: "2024-01-01" }, { role: "Staff Engineer", end_date: null },
  ] } }), "Staff Engineer");
  assert.equal(directionHint({ profile: { headline: "Payments engineer", experiences: [] } }), "Payments engineer");
  assert.equal(directionHint(undefined), undefined);
});
