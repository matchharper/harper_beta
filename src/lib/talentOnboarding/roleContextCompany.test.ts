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
