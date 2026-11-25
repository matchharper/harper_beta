import assert from "node:assert/strict";
import test from "node:test";
import { buildOfficialJobsOneScreenHrefs } from "@/components/jobs/oneScreenLinks";

test("builds the one screen's URLs from a plain posting URL", () => {
  assert.deepEqual(buildOfficialJobsOneScreenHrefs("/jobs/a-role", "/jobs/a-role"), {
    join: "/jobs/a-role?onescreen=1",
    similar: "/jobs/a-role?onescreen=1&mode=similar",
    posting: "/jobs/a-role",
  });
});

test("keeps the rest of the query and drops the hash", () => {
  const hrefs = buildOfficialJobsOneScreenHrefs(
    "/jobs/a-role",
    "/jobs/a-role?utm_source=linkedin&gtm=abc#about"
  );
  assert.equal(hrefs.join, "/jobs/a-role?utm_source=linkedin&gtm=abc&onescreen=1");
  assert.equal(
    hrefs.similar,
    "/jobs/a-role?utm_source=linkedin&gtm=abc&onescreen=1&mode=similar"
  );
  assert.equal(hrefs.posting, "/jobs/a-role?utm_source=linkedin&gtm=abc");
});

test("from the one screen itself, the posting link drops its params", () => {
  const hrefs = buildOfficialJobsOneScreenHrefs(
    "/jobs/a-role",
    "/jobs/a-role?onescreen=1&mode=similar&utm_source=linkedin"
  );
  assert.equal(hrefs.posting, "/jobs/a-role?utm_source=linkedin");
  assert.equal(hrefs.join, "/jobs/a-role?utm_source=linkedin&onescreen=1");
});
