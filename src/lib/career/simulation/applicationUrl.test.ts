import test from "node:test";
import assert from "node:assert/strict";
import { applicationEntryUrl } from "./applicationUrl";

test("Ashby job overview goes directly to application with attribution intact", () => {
  assert.equal(applicationEntryUrl("https://jobs.ashbyhq.com/team/job-id").href, "https://jobs.ashbyhq.com/team/job-id/application");
  assert.equal(applicationEntryUrl("https://jobs.ashbyhq.com/Example%20Company/another-id/?utm_source=harper#overview").href, "https://jobs.ashbyhq.com/Example%20Company/another-id/application?utm_source=harper");
});
test("application routes, company pages and non-Ashby sites remain unchanged", () => {
  for (const url of [
    "https://jobs.ashbyhq.com/team/job-id/application?source=referral",
    "https://jobs.ashbyhq.com/team/job-id/application/",
    "https://jobs.ashbyhq.com/team",
    "https://jobs.ashbyhq.com/team/job-id/other",
    "https://jobs.ashbyhq.com.example.org/team/job-id",
    "https://example.org/team/job-id",
  ]) assert.equal(applicationEntryUrl(url).href, url);
});

 test("Greenhouse stored job links retain their path, query and form anchor", () => {
  for (const url of [
    "https://job-boards.greenhouse.io/example/jobs/123456?gh_src=harper#app",
    "https://boards.greenhouse.io/example/jobs/987654",
    "https://boards.eu.greenhouse.io/example/jobs/456789?source=harper",
  ]) assert.equal(applicationEntryUrl(url).href, url);
});
