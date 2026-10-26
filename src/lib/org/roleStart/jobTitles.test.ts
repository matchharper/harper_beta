import assert from "node:assert/strict";
import test from "node:test";
import { isBroadTitle, isInternship, normalizeTitle } from "./jobTitles";

test("titles that name only a rank, a generic function or a team are broad", () => {
  for (const title of [
    "Software Engineer",
    "Senior Software Engineer",
    "선임 / AI이행Asset팀",
    "책임연구원",
    "Manager",
    "Co-Founder",
    "Intern",
    "Technical Lead",
    "",
  ]) {
    assert.equal(isBroadTitle(title), true, title);
  }
});

test("titles that name a specific job are not broad", () => {
  for (const title of [
    "Data Engineer",
    "Senior Data Engineer",
    "데이터 엔지니어",
    "Product Manager",
    "UX Designer",
    "Backend Engineer",
    "선임 / 데이터 엔지니어",
  ]) {
    assert.equal(isBroadTitle(title), false, title);
  }
});

test("internships are recognized from the employment type or the title", () => {
  assert.equal(isInternship("Data Engineer", "Internship"), true);
  assert.equal(isInternship("Data Engineer Intern", null), true);
  assert.equal(isInternship("데이터 엔지니어 인턴", null), true);
  assert.equal(isInternship("International Sales Manager", "Full-time"), false);
  assert.equal(normalizeTitle("  Senior   Data  Engineer "), "senior data engineer");
});
