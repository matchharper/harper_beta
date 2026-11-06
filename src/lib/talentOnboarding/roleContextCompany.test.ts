import assert from "node:assert/strict";
import test from "node:test";
import { runGetRoleContext } from "./tools";

test("external role keeps its company identity without company enrichment", async () => {
  const admin = {
    from(table: string) {
      const data = table === "company_roles"
        ? [{
            role_id: "example-role",
            name: "Engineer",
            source_type: "external",
            company_workspace: { company_name: "Example", company_db: null },
          }]
        : [];
      const query = {
        select() { return query; },
        in() { return query; },
        eq() { return query; },
        order() { return query; },
        then(resolve: (value: { data: typeof data; error: null }) => unknown) {
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  const result = await runGetRoleContext({
    admin,
    userId: "example-user",
    roleIds: ["example-role"],
    jd: "skip",
    activityOffset: 0,
  });
  assert.equal(result.roles[0]?.companyDb?.name, "Example");
  assert.match(result.modelOutput, /Example/);
});

test("external facts-only read keeps the same role facts without matching or activity queries", async () => {
  const reads: string[] = [];
  const filters: Record<string, unknown> = {};
  const admin = {
    from(table: string) {
      reads.push(table);
      assert.equal(table, "company_roles");
      const query = {
        select() { return query; },
        in(key: string, value: unknown) { filters[key] = value; return query; },
        eq(key: string, value: unknown) { filters[key] = value; return query; },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ data: [{
            role_id: "example-role", name: "Engineer", description: "Complete saved JD",
            source_type: "external", location_text: "Seoul", salary_range: "Recorded salary",
            company_workspace: {
              company_name: "Fallback", company_db: { name: "Example", description: "Company facts" },
            },
          }], error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  const result = await runGetRoleContext({
    admin, userId: "example-user", roleIds: ["example-role"], jd: "full",
    activityOffset: 0, externalFactsOnly: true,
  });
  assert.deepEqual(reads, ["company_roles"]);
  assert.deepEqual(filters, { role_id: ["example-role"], source_type: "external" });
  assert.equal(result.roles[0]?.role?.description, "Complete saved JD");
  assert.equal(result.roles[0]?.role?.salaryRange, "Recorded salary");
  assert.equal(result.roles[0]?.companyDb?.name, "Example");
  assert.equal(result.roles[0]?.companyDb?.description, "Company facts");
});

test("role context selects localized summary, complete fallback or no JD for a batch", async () => {
  const rows = [
    { role_id: "role-a", name: "Engineer", description: "Full A", summary: { ko: { content: "한국어 요약" }, en: { content: "English summary" } } },
    { role_id: "role-b", name: "Researcher", description: "Full B", summary: { en: { content: "English B" } } },
    { role_id: "private-role", source_type: "internal", name: "Private", description: "PRIVATE JD", summary: { ko: { content: "PRIVATE SUMMARY" } } },
  ].map(row => ({ source_type: "external", company_workspace: { company_name: "Example", company_db: null }, ...row }));
  const admin = {
    rpc: async () => ({ data: null, error: { message: "internal_role_unavailable" } }),
    from(table: string) {
      const query = { select() { return query; }, in() { return query; }, eq() { return query; }, order() { return query; },
        then(resolve: (value: any) => unknown) { return Promise.resolve({ data: table === "company_roles" ? rows : [], error: null }).then(resolve); } };
      return query;
    },
  };
  const args = { admin, userId: "user", roleIds: rows.map(r => r.role_id), activityOffset: 0, responseLocale: "ko" };
  const summary = await runGetRoleContext(args);
  assert.equal(summary.roles[0].role?.summary, "한국어 요약");
  assert.equal(summary.roles[0].role?.description, undefined);
  assert.equal(summary.roles[1].role?.description, "Full B");
  assert.match(summary.modelOutput, /Summary unavailable.*full description/);
  assert.doesNotMatch(summary.modelOutput, /English|Full A|PRIVATE/);
  const en = await runGetRoleContext({ ...args, responseLocale: "en" });
  assert.match(en.modelOutput, /English summary/);
  assert.doesNotMatch(en.modelOutput, /한국어|Full A|Full B/);
  const full = await runGetRoleContext({ ...args, jd: "full" });
  assert.match(full.modelOutput, /Full A/);
  assert.doesNotMatch(full.modelOutput, /한국어 요약|PRIVATE/);
  const skip = await runGetRoleContext({ ...args, jd: "skip" });
  assert.doesNotMatch(skip.modelOutput, /Full A|Full B|Job summary|PRIVATE/);
});
