import assert from "node:assert/strict";
import test from "node:test";
import { createClient, type User } from "@supabase/supabase-js";
import { withOrgReadScope } from "./requestScope.server";
import { assertOrgWorkspacePermission, fetchRoleRowsForWorkspace } from "./server";
import { readOrgRoleAccess, withOrgRoleAudienceScope } from "./teamAccess";
import { fetchOrgAgentRoles } from "./agent/data";

test("43 candidate reads share common queries but subsequent tools recheck revoked membership", async () => {
  const calls: URL[] = [];
  let revoked = false;
  const admin = createClient("https://read-scope.invalid", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async input => {
      const url = new URL(String(input)); calls.push(url);
      const table = url.pathname.split("/").at(-1);
      const role = { role_id: "role-a", company_workspace_id: "workspace", name: "Engineer", status: "active",
        source_type: "internal", created_at: "2026-11-01", updated_at: "2026-11-01", company_internal_roles: { team_id: "team-a" } };
      const data = table === "company_workspace" ? { is_reviewing: false, company_workspace_id: "workspace", company_name: "Company" }
        : table === "company_user_workspace" ? revoked ? null : { authority: "owner", access_scope: "organization" }
        : table === "company_roles" ? [role]
        : table === "company_internal_roles" ? [{ role_id: "role-a", request: "Hiring Brief", criteria: [] }]
        : [];
      return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
    } },
  });
  const user = { id: "actor", email: "reader@example.test" } as User;
  const args = { admin, user, workspaceId: "workspace" };
  const read = async () => {
    await assertOrgWorkspacePermission({ ...args, permission: "view" });
    const roles = await fetchOrgAgentRoles(args);
    assert.equal(roles[0].request, "Hiring Brief");
    assert.equal((await fetchRoleRowsForWorkspace(admin, "workspace", user))[0].role_id, "role-a");
    await readOrgRoleAccess(args);
    return roles;
  };
  const count = (table: string) => calls.filter(url => url.pathname.endsWith(`/${table}`)).length;
  const original = await Promise.all(Array.from({ length: 43 }, read));
  assert.equal(count("company_workspace"), 172);
  assert.equal(count("company_user_workspace"), 172);
  assert.equal(count("company_roles"), 86);
  calls.length = 0;
  const shared = await withOrgReadScope(() => Promise.all(Array.from({ length: 43 }, read)));
  assert.deepEqual(shared, original);
  assert.equal(count("company_workspace"), 1);
  assert.equal(count("company_user_workspace"), 2); // setup-compatible view and ordinary Role read
  assert.equal(count("company_roles"), 2); // agent and board projections, once each
  assert.equal(count("company_internal_roles"), 1);
  revoked = true;
  await assert.rejects(withOrgReadScope(read), /Workspace access denied/);
  await assert.rejects(read(), /Workspace access denied/);

  revoked = false;
  await withOrgReadScope(async () => {
    const scoped = withOrgRoleAudienceScope(admin, ["team-a"]);
    assert.equal((await readOrgRoleAccess(args)).scope, "organization");
    assert.deepEqual((await readOrgRoleAccess({ ...args, admin: scoped })).teamIds, ["team-a"]);
    assert.equal((await readOrgRoleAccess(args)).scope, "organization");
  });
});
