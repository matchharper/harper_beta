import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOfficialJobsCareerHref,
  buildOfficialJobsInitialChatDraft,
  buildOfficialJobsInitialChatMentionLabel,
  buildOfficialJobsLoginHref,
} from "@/lib/officialJobs";

const JOB = {
  companyName: "[Harper]",
  roleTitle: "Forward Deployed Engineer",
  slug: "harper-forward-deployed-engineer",
};

test("official job href carries company identity into Career", () => {
  assert.equal(
    buildOfficialJobsCareerHref(JOB),
    "/career?source=official_jobs&job=Forward+Deployed+Engineer&job_company=%5BHarper%5D&job_slug=harper-forward-deployed-engineer"
  );
});

test("official job href disambiguates the Harper company before the DB rename", () => {
  assert.equal(
    buildOfficialJobsCareerHref({
      ...JOB,
      companyName: "Harper",
    }),
    "/career?source=official_jobs&job=Forward+Deployed+Engineer&job_company=%5BHarper%5D&job_slug=harper-forward-deployed-engineer"
  );
});

test("official job login href preserves company identity", () => {
  const careerHref = buildOfficialJobsCareerHref(JOB);
  const loginHref = buildOfficialJobsLoginHref(null, careerHref);
  const loginUrl = new URL(loginHref, "https://matchharper.com");

  assert.equal(loginUrl.searchParams.get("next"), careerHref);
  assert.equal(loginUrl.searchParams.get("job_company"), "[Harper]");
});

test("official job chat draft includes role and company", () => {
  assert.equal(
    buildOfficialJobsInitialChatDraft(
      JOB.roleTitle,
      JOB.companyName,
      "ko"
    ),
    "Harper 내부 기회인 Forward Deployed Engineer at [Harper] 포지션에 관심 있어요."
  );
  assert.equal(
    buildOfficialJobsInitialChatDraft(
      JOB.roleTitle,
      JOB.companyName,
      "en"
    ),
    "I'm interested in the Harper internal opportunity: Forward Deployed Engineer at [Harper]."
  );
});

test("legacy official job links retain the role-only chat draft", () => {
  assert.equal(
    buildOfficialJobsInitialChatDraft("Forward Deployed Engineer", null, "ko"),
    "Harper 내부 기회인 Forward Deployed Engineer 포지션에 관심 있어요."
  );
});

test("official job chat mention wraps the full visible opportunity phrase", () => {
  assert.equal(
    buildOfficialJobsInitialChatMentionLabel(
      JOB.roleTitle,
      JOB.companyName,
      "ko"
    ),
    "Forward Deployed Engineer at [Harper] 포지션"
  );
  assert.equal(
    buildOfficialJobsInitialChatMentionLabel(
      JOB.roleTitle,
      JOB.companyName,
      "en"
    ),
    "Forward Deployed Engineer at [Harper]"
  );
});
