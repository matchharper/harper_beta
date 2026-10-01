import assert from "node:assert/strict";
import test from "node:test";
import { filterPublicOfficialJobRows } from "./visibility";

const baseRole = {
  role_id: "role-1",
  source_type: "internal",
  status: "active",
  is_expired: false,
  expires_at: null,
  information: {},
};
const baseSetting = {
  role_id: "role-1",
  is_promote: true,
  is_anonymous: false,
};

test("linked jobs are hidden when promotion or role availability ends", () => {
  const jobs = [{ role_id: "role-1", slug: "linked" }, { role_id: null, slug: "standalone" }];

  for (const role of [
    { ...baseRole, status: "ended" },
    { ...baseRole, status: "deleted" },
    { ...baseRole, is_expired: true },
    { ...baseRole, information: { testOnly: true } },
  ]) {
    assert.deepEqual(
      filterPublicOfficialJobRows(jobs, [role], [baseSetting]).map((job) => job.slug),
      ["standalone"]
    );
  }

  assert.deepEqual(
    filterPublicOfficialJobRows(jobs, [baseRole], [{ ...baseSetting, is_promote: false }]).map((job) => job.slug),
    ["standalone"]
  );
});

test("paused roles remain visible and anonymous role ids are removed", () => {
  const [job] = filterPublicOfficialJobRows(
    [{ role_id: "role-1", slug: "linked" }],
    [{ ...baseRole, status: "paused" }],
    [{ ...baseSetting, is_anonymous: true }]
  );

  assert.equal(job?.slug, "linked");
  assert.equal(job?.role_id, null);
});
