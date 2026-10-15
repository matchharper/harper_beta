import assert from "node:assert/strict";
import test from "node:test";
import { createClient, type User } from "@supabase/supabase-js";
import { canAccessOrgRole, assertOrgTeamRoleAccess, scopeOrgRoleQuery, readOrgRoleAccess, resolveOrgRoleAccess, visibleOrgRoleIds, constrainOrgRoleAudience, withOrgRoleAudienceScope } from "./teamAccess";
import { getOrgPermissions } from "./permissions";

test("Owner keeps access across every team; team-scoped Admin and Viewer remain restricted", () => {
  for (const authority of ["owner", "admin", "viewer"]) {
    const access = resolveOrgRoleAccess({ authority, access_scope: "team", team_id: "team-a" });
    assert.equal(canAccessOrgRole(access, "team-a"), true);
    assert.equal(canAccessOrgRole(access, "team-b"), authority === "owner");
    assert.equal(canAccessOrgRole(access, null), authority === "owner");
  }
});
test("Removing the last team does not grant organization access", () => {
  const access = resolveOrgRoleAccess({ authority: "admin", access_scope: "team", team_id: null });
  assert.equal(canAccessOrgRole(access, null), false);
  assert.equal(canAccessOrgRole(access, "another-team"), false);
});
test("Team-scoped hiring access does not allow organization-wide writes", () => {
  const permissions = getOrgPermissions("admin", "team");
  assert.equal(permissions.canManageCandidates, true);
  assert.equal(permissions.canManageWorkspace, false);
  assert.equal(permissions.canManageIntegrations, false);
  assert.equal(permissions.canManageTeams, false);
  assert.equal(getOrgPermissions("owner", "team").canManageTeams, true);
  assert.equal(getOrgPermissions("viewer", "team").canManageCandidates, false);
});
test("Organization access remains explicit and unknown scope fails closed", () => {
  assert.equal(canAccessOrgRole(resolveOrgRoleAccess({ authority: "admin", access_scope: "organization" }), "any"), true);
  assert.equal(canAccessOrgRole(resolveOrgRoleAccess({ authority: "admin", access_scope: "unexpected" }), "any"), false);
});

test("shared company readers restrict an owner to the recipient Team without changing membership", async () => {
  const calls: URL[] = [];
  const admin = createClient("https://team-access.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async input => {
    const url = new URL(String(input)); calls.push(url);
    const data = url.pathname.endsWith("/company_user_workspace")
      ? { authority: "owner", access_scope: "organization", team_id: null }
      : [{ role_id: "role-a" }];
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  } } });
  const user = { id: "user-a", email: "person@example.test" } as User;
  const args = { admin: withOrgRoleAudienceScope(admin, ["team-a"]), user, workspaceId: "workspace-a" };
  const access = await readOrgRoleAccess(args);
  assert.equal(access.authority, "owner");
  assert.equal(access.audienceRestricted, true);
  assert.equal(canAccessOrgRole(access, "team-a"), true);
  assert.equal(canAccessOrgRole(access, "team-b"), false);
  assert.deepEqual(await visibleOrgRoleIds(args), ["role-a"]);
  const roleQuery = calls.find(url => url.pathname.endsWith("/company_roles"))!;
  assert.equal(roleQuery.searchParams.get("company_internal_roles.team_id"), "in.(team-a)");
  assert.equal((await readOrgRoleAccess({ ...args, admin })).scope, "organization");
  const otherTeam = constrainOrgRoleAudience(resolveOrgRoleAccess({ authority: "admin", access_scope: "team", team_id: "team-b" }), ["team-a"]);
  assert.deepEqual(otherTeam.teamIds, []);
  assert.equal(canAccessOrgRole(otherTeam, "team-a"), false);
});
test("Current database membership overrides editable user claims and query filtering is enforced", async () => {
  const calls: URL[] = [];
  const admin = createClient("https://team-access.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async input => {
    const url = new URL(String(input)); calls.push(url);
    const table = url.pathname.split("/").at(-1);
    const data = table === "company_user_workspace" ? { authority: "admin", access_scope: "team", team_id: "team-a" }
      : table === "company_workspace_teams" ? [{ id: "team-a", name: "Engineering" }]
      : [{ role_id: "role-a" }];
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  } } });
  const user = { id: "user-a", email: "person@example.test", user_metadata: { authority: "owner", team_id: "team-b" } } as unknown as User;
  const args = { admin, user, workspaceId: "workspace-a" };
  const access = await readOrgRoleAccess(args);
  assert.equal(access.teamId, "team-a"); assert.equal(access.scope, "team");
  assert.deepEqual(await visibleOrgRoleIds(args), ["role-a"]);
  const roleQuery = calls.find(url => url.pathname.endsWith("/company_roles"))!;
  assert.equal(roleQuery.searchParams.get("company_internal_roles.team_id"), "in.(team-a)");
  assert.equal(roleQuery.searchParams.get("company_workspace_id"), "eq.workspace-a");
});

test("multiple Team assignments grant their union; an empty relation never falls back to a stale default", () => {
  const access = resolveOrgRoleAccess({ authority: "admin", access_scope: "team", team_id: "a",
    company_workspace_team_members: [{team_id:"a"},{team_id:"b"}] });
  assert.equal(canAccessOrgRole(access,"a"),true);
  assert.equal(canAccessOrgRole(access,"b"),true);
  assert.equal(canAccessOrgRole(access,"c"),false);
  assert.equal(canAccessOrgRole(access,null),false);
  const revoked = resolveOrgRoleAccess({authority:"viewer",access_scope:"team",team_id:"a",company_workspace_team_members:[]});
  assert.equal(canAccessOrgRole(revoked,"a"),false);
});


test("team filters require a matching internal row before parent pagination", async () => {
  let request: URL | undefined;
  const admin = createClient("https://team-access.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async input => {
    request = new URL(String(input));
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  } } });
  const query = admin.from("company_roles").select("role_id,company_internal_roles(team_id)").limit(5);
  await scopeOrgRoleQuery(query, resolveOrgRoleAccess({ authority: "admin", access_scope: "team", team_id: "a" }));
  assert.equal(request?.searchParams.get("company_internal_roles.team_id"), "in.(a)");
  assert.equal(request?.searchParams.get("company_internal_roles"), "not.is.null");
  assert.equal(request?.searchParams.get("limit"), "5");
});

test("role authorization reads the extension and denies sibling, unassigned and missing roles", async () => {
  const user = { id: "user-a", email: "person@example.test" } as User;
  for (const [role, allowed] of [
    [{ role_id: "role", company_internal_roles: { team_id: "a" } }, true],
    [{ role_id: "role", company_internal_roles: { team_id: "b" } }, false],
    [{ role_id: "role", company_internal_roles: { team_id: null } }, false],
    [{ role_id: "role", company_internal_roles: null }, false],
    [null, false],
  ] as const) {
    const admin = createClient("https://team-access.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async input => {
      const url = new URL(String(input));
      const table = url.pathname.split("/").at(-1);
      const data = table === "company_user_workspace" ? { authority: "admin", access_scope: "team", team_id: "a" }
        : table === "company_workspace_teams" ? [{ id: "a", name: "Team A" }] : role;
      if (table === "company_roles") assert.equal(url.searchParams.get("select"), "role_id,company_internal_roles(team_id)");
      return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
    } } });
    const result = assertOrgTeamRoleAccess({ admin, user, workspaceId: "workspace", roleId: "role" });
    if (allowed) assert.equal((await result).teamId, "a");
    else await assert.rejects(result, (error: any) => error.status === 404);
  }
});
