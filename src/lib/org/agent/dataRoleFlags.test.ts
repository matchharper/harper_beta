import assert from "node:assert/strict";
import test from "node:test";
import { fetchOrgAgentRoles } from "./data";

test("default Role reader preserves canonical enabled/disabled search and promotion flags", async () => {
  const roles = ["enabled", "disabled"].map(role_id => ({ role_id, company_workspace_id: "workspace", name: role_id,
    status: "active", source_type: "internal", created_at: "2026-10-01", updated_at: "2026-10-01",
    company_internal_roles: { team_id: null } }));
  const tables: Record<string, any[]> = {
    company_user_workspace: [{ company_user_id: "actor", company_workspace_id: "workspace", authority: "owner", access_scope: "organization" }],
    company_roles: roles,
    company_internal_roles: roles.map((r, i) => ({ role_id: r.role_id, request: "Existing brief", criteria: [],
      is_company_first_search: i === 0, is_promote: i === 0, is_anonymous: i !== 0,
      intro_search_date: ["Tue"], intro_search_time: 14 })),
    company_memories: [],
  };
  const admin: any = { from(table: string) {
    assert.ok(Object.hasOwn(tables, table), table);
    let rows = structuredClone(tables[table]);
    let single = false;
    const q: any = {
      select(fields: string) {
        if (table === "company_internal_roles") for (const field of ["is_company_first_search", "is_promote", "is_anonymous"]) assert.ok(fields.split(",").map(v => v.trim()).includes(field), `Missing canonical ${field}`);
        return q;
      },
      eq(key: string, value: unknown) { rows = rows.filter(row => row[key] === value); return q; },
      in(key: string, values: unknown[]) { rows = rows.filter(row => values.includes(row[key])); return q; },
      not(key: string, operator: string, value: unknown) { assert.equal(operator, "is"); rows = rows.filter(row => row[key] !== value); return q; },
      order() { return q; },
      maybeSingle() { single = true; return q; },
      then(resolve: (v: unknown) => unknown) { return Promise.resolve(resolve({ data: single ? rows[0] ?? null : rows, error: null })); },
    };
    return q;
  } };
  const result = await fetchOrgAgentRoles({ admin, user: { id: "actor", email: "reader@example.invalid" } as any, workspaceId: "workspace" });
  const byId = new Map(result.map(role => [role.roleId, role]));
  assert.equal(byId.get("enabled")?.isCompanyFirstSearch, true);
  assert.equal(byId.get("disabled")?.isCompanyFirstSearch, false);
  assert.equal(byId.get("enabled")?.isPromote, true);
  assert.equal(byId.get("disabled")?.isPromote, false);
  assert.equal(byId.get("enabled")?.isAnonymous, false);
  assert.equal(byId.get("disabled")?.isAnonymous, true);
  assert.deepEqual(byId.get("enabled")?.introSearchDate, ["Tue"]);
  assert.equal(byId.get("enabled")?.introSearchTime, 14);
});
