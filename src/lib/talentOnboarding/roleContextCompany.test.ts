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
    includeJd: false,
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
    admin, userId: "example-user", roleIds: ["example-role"], includeJd: true,
    activityOffset: 0, externalFactsOnly: true,
  });
  assert.deepEqual(reads, ["company_roles"]);
  assert.deepEqual(filters, { role_id: ["example-role"], source_type: "external" });
  assert.equal(result.roles[0]?.role?.description, "Complete saved JD");
  assert.equal(result.roles[0]?.role?.salaryRange, "Recorded salary");
  assert.equal(result.roles[0]?.companyDb?.name, "Example");
  assert.equal(result.roles[0]?.companyDb?.description, "Company facts");
});
