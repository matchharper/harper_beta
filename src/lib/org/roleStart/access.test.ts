import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { withOrgRequestScope } from "@/lib/org/requestScope.server";

test("the small Role reader preserves current workspace, authority, team, expiry and visibility checks", async () => {
  const workspaceId = "w", roleId = "r";
  let authority = "admin", scope = "organization", reviewing = false;
  let teamIds: string[] = [];
  let reads = 0;
  let role = { role_id: roleId, company_workspace_id: workspaceId, source_type: "internal", is_expired: false,
    status: "draft", name: "Fixture", description: "JD", type: [], salary_range: null, location_text: null, work_mode: null,
    company_internal_roles: { team_id: "t1", is_harper_tailored_role: true }, company_role_assignees: [] as unknown[] };
  const admin = { from(table: string) {
    assert.equal(table, "company_roles"); reads++;
    const filters: Array<(value: Record<string, unknown>) => boolean> = [];
    const query = {
      select: () => query,
      eq: (field: string, value: unknown) => { filters.push(row => row[field] === value); return query; },
      not: (field: string, _operator: string, value: unknown) => { filters.push(row => row[field] !== value); return query; },
      maybeSingle: async () => ({ data: filters.every(filter => filter(role)) ? role : null, error: null }),
    };
    return query;
  } };
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  loader._load = function(name, ...args) {
    if (name === "server-only") return {};
    if (name === "@/lib/server/candidateAccess") return { getSupabaseAdmin: () => admin };
    if (name === "@/lib/org/teamAccess") return {
      canAccessOrgRole: (access: { scope: string; teamIds: string[] }, team: string) => access.scope === "organization" || access.teamIds.includes(team),
      readOrgRoleAccess: async (input: { fresh: boolean }) => {
        assert.equal(input.fresh, true);
        if (reviewing) throw Object.assign(new Error("org_workspace_under_review"), { status: 403 });
        return { authority, scope, teamIds };
      },
    };
    return original.call(this, name, ...args);
  };
  let read!: typeof import("./access").readRoleStartAccess;
  try { ({ readRoleStartAccess: read } = await import("./access")); } finally { loader._load = original; }
  const args = { roleId, workspaceId, user: { id: "u" } as never };
  await withOrgRequestScope(async () => {
    await read(args); await read(args);
    assert.equal(reads, 1, "checks are shared only inside one request");
  });
  authority = "viewer";
  await assert.rejects(withOrgRequestScope(() => read(args)), { status: 403 });
  authority = "admin";
  await assert.rejects(read({ ...args, workspaceId: "another" }), { status: 404 });
  scope = "team"; teamIds = ["t2"];
  await assert.rejects(read(args), { status: 404 });
  teamIds = ["t1"];
  assert.equal((await read(args)).name, "Fixture");
  role = { ...role, is_expired: true };
  await assert.rejects(read(args), { status: 404 });
  role = { ...role, is_expired: false, source_type: "external" };
  await assert.rejects(read(args), { status: 404 });
  role = { ...role, source_type: "internal" };
  role = { ...role, company_internal_roles: { ...role.company_internal_roles, is_harper_tailored_role: false },
    company_role_assignees: [{ company_users: { email: "fixture@matchharper.com" } }] };
  await assert.rejects(read(args), { status: 404 });
  reviewing = true;
  await assert.rejects(read(args), { status: 403 });
});
