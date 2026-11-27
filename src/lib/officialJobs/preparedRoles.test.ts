import assert from "node:assert/strict";
import test from "node:test";

import { livePreparedRoles, type PreparedRoleRead } from "./preparedRoles";
import {
  buildPreparedRolesInput,
  parsePreparedRolesPick,
  preparedRoleRows,
} from "./preparedRolesBuild";
import { buildOfficialJobPreparedRoles, type PreparedRolesSources } from "./preparedRoles.server";

const HARPER = "11111111-1111-4111-8111-111111111111";
const plan = {
  searchIntentSummary: "서울 AI 에이전트 엔지니어",
  ftsKeywords: [],
  role_titles: ["AI Agent Engineer", "Forward Deployed Engineer"],
  include_contract: false,
  include_parttime: false,
  include_intern: false,
  includeRemote: true,
  remoteOnly: false,
  is_prefer_entry: 0,
  countries: [{ countryCode: "KR", weight: 1, remoteOnly: false }],
  postingRecency: null,
};

test("the pick keeps only listed Harper Roles, once each, at most three, and postings of the last 90 days", () => {
  const pick = parsePreparedRolesPick({
    defaultAction: "explore",
    targetSalaryKrw: null,
    plan,
    harperRoles: [
      { roleId: HARPER, reason: "  같은   일이에요 " },
      { roleId: HARPER, reason: "again" },
      { roleId: "not-listed", reason: "made up" },
      { roleId: "r2", reason: "b" }, { roleId: "r3", reason: "c" }, { roleId: "r4", reason: "d" },
    ],
  }, new Set([HARPER, "r2", "r3", "r4"]));
  assert.deepEqual(pick.harperRoles, [
    { roleId: HARPER, reason: "같은 일이에요" }, { roleId: "r2", reason: "b" }, { roleId: "r3", reason: "c" },
  ]);
  assert.deepEqual(pick.plan.roleTitles, ["AI Agent Engineer", "Forward Deployed Engineer"]);
  assert.equal(pick.plan.postingRecency?.maxAgeDays, 90);
  assert.throws(() => parsePreparedRolesPick({ defaultAction: "explore", targetSalaryKrw: null, plan: null }, new Set()));
});

test("the planner reads the posting's public text and each Harper Role's own description", () => {
  const input = buildPreparedRolesInput(
    { id: "job-1", slug: "s", companyName: "High-Growth AI Startups", roleTitle: "Software Engineer, AI Agents", location: "Seoul", vertical: "B2B AI", employmentType: "Full-time", seniority: null, shortDescription: "One conversation with Harper", roleDescription: "Build agents." },
    [{ roleId: HARPER, companyName: "Company A", title: "Agent Engineer", location: "Seoul", description: "Builds the agent runtime." }]
  );
  assert.match(input, /<brief>\nPosting title: Software Engineer, AI Agents\nShown as: High-Growth AI Startups\nLocation: Seoul/);
  assert.match(input, /- roleId 11111111-1111-4111-8111-111111111111 \| Company A \| Agent Engineer \| Seoul\n {2}Builds the agent runtime\./);
});

test("one build's rows rank each kind on its own and keep a Role once", () => {
  const rows = preparedRoleRows({
    postingId: "job-1",
    harperRoles: [{ roleId: HARPER, reason: "같은 일" }],
    publicRoleIds: ["p1", "p2", HARPER, ...Array.from({ length: 30 }, (_, i) => `x${i}`)],
    preparedAt: "2026-11-26T18:00:00.000Z",
  });
  assert.deepEqual(rows.slice(0, 3).map((row) => [row.role_id, row.kind, row.rank]), [[HARPER, "harper", 0], ["p1", "public", 0], ["p2", "public", 1]]);
  assert.equal(rows.filter((row) => row.kind === "public").length, 19);
  assert.ok(rows.every((row) => row.prepared_at === "2026-11-26T18:00:00.000Z" && row.official_job_id === "job-1"));
});

test("reading back leaves out Roles that closed since the build and test Roles", () => {
  const role = (over: Partial<NonNullable<PreparedRoleRead["role"]>>) => ({
    name: "Engineer", status: "active", is_expired: false, expires_at: null, source_type: "external", external_jd_url: null,
    location_text: null, information: {}, company: { company_name: "Co" }, ...over,
  });
  const at = "2026-11-26T18:00:00Z";
  const live = livePreparedRoles([
    { role_id: "a", kind: "public", rank: 1, reason: null, prepared_at: at, role: role({ expires_at: "2026-11-27T00:00:00Z" }) },
    { role_id: "b", kind: "public", rank: 0, reason: null, prepared_at: at, role: role({ status: "closed" }) },
    { role_id: "c", kind: "public", rank: 2, reason: null, prepared_at: at, role: role({ information: { testOnly: "true" } }) },
    { role_id: "d", kind: "harper", rank: 0, reason: null, prepared_at: at, role: role({ source_type: "internal", status: "paused" }) },
    { role_id: "e", kind: "harper", rank: 1, reason: null, prepared_at: at, role: role({ source_type: "internal", status: "draft" }) },
  ], { nowMs: Date.parse("2026-11-28T00:00:00Z") });
  assert.deepEqual(live?.harperRoles.map((r) => r.roleId), ["d"]);
  assert.deepEqual(live?.publicPostings, []);
  assert.equal(livePreparedRoles([], {}), null);
});

function fakeSources(over: Partial<PreparedRolesSources> = {}) {
  const written: Array<{ postingId: string; rows: number }> = [];
  const pruned: string[][] = [];
  const posting = (id: string) => ({ id, slug: `slug-${id}`, companyName: null, roleTitle: id, location: null, vertical: null, employmentType: null, seniority: null, shortDescription: null, roleDescription: null });
  const sources: PreparedRolesSources = {
    postings: async () => [posting("a"), posting("b"), posting("c")],
    harperCandidates: async () => [{ roleId: HARPER, companyName: "Company A", title: "Agent Engineer", location: null, description: "x" }],
    pick: async (p) => {
      if (p.id === "b") throw new Error("planner failed");
      return { plan: parsePreparedRolesPick({ defaultAction: "explore", targetSalaryKrw: null, plan }, new Set()).plan, targetSalaryKrw: null, harperRoles: [{ roleId: HARPER, reason: "같은 일" }] };
    },
    searchPublic: async () => ["p1", "p2"],
    write: async (_admin, postingId, rows) => { written.push({ postingId, rows: rows.length }); },
    prune: async (_admin, keep) => { pruned.push([...keep]); },
    ...over,
  };
  return { sources, written, pruned };
}

test("a posting whose build fails keeps its list; the others are replaced and gone postings pruned", async () => {
  const { sources, written, pruned } = fakeSources();
  const result = await buildOfficialJobPreparedRoles({ admin: {} as never, sources, now: new Date("2026-11-26T18:00:00Z") });
  assert.deepEqual(written, [{ postingId: "a", rows: 3 }, { postingId: "c", rows: 3 }]);
  assert.deepEqual(pruned, [["a", "b", "c"]]);
  assert.equal(result.prepared, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.postings[1].error, "planner failed");
});

test("a dry run or a one-posting build writes nothing it should not", async () => {
  const dry = fakeSources();
  await buildOfficialJobPreparedRoles({ admin: {} as never, sources: dry.sources, dryRun: true });
  assert.deepEqual([dry.written, dry.pruned], [[], []]);
  const one = fakeSources();
  await buildOfficialJobPreparedRoles({ admin: {} as never, sources: one.sources, slugs: ["slug-a"] });
  assert.equal(one.pruned.length, 0);
});
