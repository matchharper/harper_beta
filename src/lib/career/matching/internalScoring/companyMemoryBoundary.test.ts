import assert from "node:assert/strict";
import test from "node:test";
import { loadRoleContext } from "./inputs";
import type { Query } from "./database";

test("Career-side scoring never reads company Memory", async () => {
  const statements: string[] = [];
  const query: Query = async (sql) => {
    statements.push(sql);
    return [
      {
        role_id: "role",
        company_workspace_id: "workspace",
        name: "FDE",
        request: "Hiring Brief",
        criteria: [],
        team_id: "team",
        company_name: "회사",
        company_description: "",
        version: "brief-version",
        brief_snapshot: {},
      },
    ];
  };
  const context = await loadRoleContext(query, "workspace", "role");
  assert.deepEqual(context.companyMemory, []);
  assert.equal(statements.length, 1);
  assert.ok(
    statements.every(
      (sql) => !/company_memory_entries|company_memories|internal\.memory/.test(sql)
    )
  );
  assert.equal("legacy_role_memory" in context.role, false);
});
