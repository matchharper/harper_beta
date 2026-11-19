import assert from "node:assert/strict";
import { test } from "node:test";
import { applicantListCompany } from "./applicantList";

test("a company's applicant list is read back from the source id", () => {
  assert.equal(applicantListCompany("applicants-acme"), "Acme");
  assert.equal(applicantListCompany("applicants-acme-labs"), "Acme Labs");
  // The usual sources (the LinkedIn Recruiter export, searches) are not a company's list.
  for (const source of ["linkedin", "hn", "explore", "applicants-", null, undefined]) assert.equal(applicantListCompany(source), null);
});
