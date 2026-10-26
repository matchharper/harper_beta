import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
import { NextRequest } from "next/server";
import { OrgHttpError } from "@/lib/org/httpError";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const roleId = "20000000-0000-4000-8000-000000000001";
let allowed = true, reads = 0, permission: unknown;
let GET: typeof import("./route").GET;
before(async () => {
  const module = Module as any, load = module._load;
  module._load = function (name: string, ...args: unknown[]) {
    if (name === "@/lib/server/candidateAccess") return {
      requireAuthenticatedUser: async () => ({ id: "viewer" }),
      getSupabaseAdmin: () => ({ from() {
        reads++;
        const query = { select: () => query, eq: () => query, maybeSingle: async () => ({data: {role_id: roleId},error: null}) };
        return query;
      } }),
    };
    if (name === "@/lib/org/server") return { OrgHttpError, assertOrgRoleAccess: async (input: any) => {
      permission = input.permission;
      if (!allowed) throw new OrgHttpError(403, "Forbidden");
    } };
    if (name === "@/lib/companyFirstSearch/activity.server") return { readRoleMatchingActivity: async (input: any) => {
      reads++;
      assert.equal(input.roleId, roleId); assert.equal(input.workspaceId, workspaceId);
      return {ok: true, active: false, activity: {trigger: "scheduled",phase: "searching"}};
    } };
    return load.call(this, name, ...args);
  };
  try { ({ GET } = await import("./route")); } finally { module._load = load; }
});

test("status requires valid scope and current Role view permission before querying work", async () => {
  const request = (role = roleId) => new NextRequest(`https://example.invalid/api/org/agent/matching-search/status?workspaceId=${workspaceId}&roleId=${role}`);
  assert.equal((await GET(request("invalid"))).status, 400);
  assert.equal(reads, 0);
  allowed = false;
  assert.equal((await GET(request())).status, 403);
  assert.equal(reads, 0);
  allowed = true;
  const result = await GET(request());
  assert.equal(result.status, 200);
  assert.equal(permission, "view");
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await result.json(), {ok: true, active: false, activity: {trigger: "scheduled",phase: "searching"}});
});
