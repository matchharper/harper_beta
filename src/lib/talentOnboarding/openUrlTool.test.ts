import assert from "node:assert/strict";
import test from "node:test";
import {
  findExactLinkedinJob,
  getLinkedinUrlKind,
  openUrlWithDocumentsCache,
} from "@/lib/talentOnboarding/openUrlTool";

test("routes supported LinkedIn URL families to dedicated readers", () => {
  assert.equal(
    getLinkedinUrlKind("https://www.linkedin.com/in/example-person"),
    "profile"
  );
  assert.equal(
    getLinkedinUrlKind("https://linkedin.com/jobs/view/example-123456789"),
    "job"
  );
  assert.equal(
    getLinkedinUrlKind("https://kr.linkedin.com/company/example-company"),
    "company"
  );
});

test("does not route non-LinkedIn hosts or unrelated LinkedIn paths", () => {
  assert.equal(getLinkedinUrlKind("https://example.com/in/person"), null);
  assert.equal(getLinkedinUrlKind("https://linkedin.com/feed/"), "generic");
});

test("keeps talent-side LinkedIn opening blocked unless company-side opts in", async () => {
  const result = await openUrlWithDocumentsCache({
    admin: {} as never,
    url: "https://www.linkedin.com/jobs/view/example-123456789",
  });
  assert.equal(result.ok, false);
  assert.equal("blocked" in result && result.blocked, true);
  assert.equal(
    "blockedReason" in result && result.blockedReason,
    "linkedin_unsupported"
  );
  assert.equal("provider" in result && result.provider, "linkedin");
});

test("selects only the exact requested LinkedIn job", () => {
  const jobs = [
    {
      jobId: "123456789",
      title: "Wrong job",
      url: "https://www.linkedin.com/jobs/view/wrong-123456789",
    },
    {
      jobId: "987654321",
      title: "Requested job",
      url: "https://www.linkedin.com/jobs/view/requested-987654321?tracking=x",
    },
  ];
  assert.equal(
    findExactLinkedinJob(
      jobs,
      "https://www.linkedin.com/jobs/view/requested-987654321"
    )?.title,
    "Requested job"
  );
  assert.equal(
    findExactLinkedinJob(
      jobs,
      "https://www.linkedin.com/jobs/view/missing-555555555"
    ),
    null
  );
});
