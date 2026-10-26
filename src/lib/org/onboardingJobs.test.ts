import assert from "node:assert/strict";
import test from "node:test";
import { findOnboardingJobs } from "./onboardingJobs.server";
import { onboardingJobMessage, readOnboardingJobs } from "./onboardingJobs";
import type { ExaSearchClient } from "@/lib/tools/exaClient";
import type { OrgWorkspace } from "./server";

test("onboarding jobs use one structured search and at most two distinct safe links", async () => {
  const calls: unknown[][] = [];
  const jobs = [
    { title: "Invalid", url: "javascript:alert(1)" },
    { title: "Research Engineer", url: "https://example.com/jobs/research" },
    { title: "Duplicate", url: "https://example.com/jobs/research" },
    { title: "Product Designer", url: "https://example.com/jobs/design" },
    { title: "Third role", url: "https://example.com/jobs/third" },
  ];
  const exa = { search: async (...args: unknown[]) => {
    calls.push(args);
    return { output: { content: JSON.stringify({ jobs }) } };
  } } as unknown as ExaSearchClient;
  const result = await findOnboardingJobs({
    companyName: "Example", companyProfile: { homepageUrl: "https://example.com" },
  } as OrgWorkspace, exa);
  assert.equal(calls.length, 1);
  const options = calls[0][1] as { type: string; numResults: number; outputSchema: { type: string } };
  assert.equal(options.type, "auto");
  assert.equal(options.numResults, 10);
  assert.equal(options.outputSchema.type, "object");
  assert.deepEqual(result, [jobs[1], jobs[3]]);
  assert.equal(onboardingJobMessage(result[0], "ko"), "https://example.com/jobs/research\n\nResearch Engineer 역할을 채용하고 싶어요.");
  assert.equal(onboardingJobMessage(result[0], "en"), "https://example.com/jobs/research\n\nI'd like to hire for this role: Research Engineer.");
  assert.deepEqual(readOnboardingJobs(null), []);
});
