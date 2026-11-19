import assert from "node:assert/strict";
import { test } from "node:test";
import { applicantListCompany, applicantListSource } from "./applicantList";
import { applicantSignal } from "./importRows";

test("a company's applicant list gets its own source id", () => {
  assert.equal(applicantListSource("Acme"), "applicants-acme");
  assert.equal(applicantListSource("  Acme Labs, Inc. "), "applicants-acme-labs-inc");
  // Source ids are ASCII: a name without English letters or digits has none.
  assert.equal(applicantListSource("에이크미"), null);
  assert.equal(applicantListSource(""), null);
  assert.match(applicantListSource("a".repeat(200)) ?? "", /^[a-z0-9][a-z0-9._-]{0,79}$/);
});

test("the list's company is read back from the source id", () => {
  assert.equal(applicantListCompany("applicants-acme"), "Acme");
  assert.equal(applicantListCompany("applicants-acme-labs"), "Acme Labs");
  assert.equal(applicantListCompany(applicantListSource("Acme Labs")), "Acme Labs");
  for (const source of ["linkedin", "hn", "explore", "applicants-", null, undefined]) assert.equal(applicantListCompany(source), null);
});

test("an applicant from a company's list applied to that company's posting", () => {
  const now = new Date("2026-11-19T00:00:00Z");
  assert.deepEqual(applicantSignal({ appliedJob: "Marketing,  Bangkok", appliedAt: null }, now, "Acme"), {
    signalText: "Acme 공고 지원 · Marketing, Bangkok", signalAt: null,
  });
  assert.deepEqual(applicantSignal({ appliedJob: null, appliedAt: null }, now, "Acme"), { signalText: "Acme 공고 지원", signalAt: null });
  // No company: the LinkedIn Recruiter export, as before.
  assert.equal(applicantSignal({ appliedJob: "Backend", appliedAt: null }, now).signalText, "링크드인 공고 지원 시작 · Backend");
});
