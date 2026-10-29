import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";

test("closure preview checks role permission first, pages every recipient, and never writes", async t => {
  let authorized = true;
  let fixture = false;
  let failedRead = false;
  const reads: string[] = [];
  const recommendations = Array.from({ length: 501 }, (_, i) => ({
    talent_id: `fixture-${i}`, feedback: "like", saved_stage: "accepted",
    created_at: "2026-10-28T00:00:00Z", updated_at: "2026-10-28T00:00:00Z",
  }));
  const admin = { from(table: string) {
    reads.push(table);
    const query = {
      select: () => query, eq: () => query, or: () => query, order: () => query, not: () => query,
      single: async () => ({ data: { source_type: "internal", information: { testOnly: fixture } }, error: null }),
      range: async (from: number, to: number) => ({
        data: table === "talent_opportunity_recommendation" ? recommendations.slice(from, to + 1) : [],
        error: failedRead ? new Error("read failed") : null,
      }),
    };
    return query;
  } };
  const nodeModule = Module as any;
  const load = nodeModule._load;
  class OrgHttpError extends Error { constructor(public status: number, message: string) { super(message); } }
  t.mock.method(nodeModule, "_load", function (this: unknown, name: string, ...args: unknown[]) {
    if (name === "@/lib/server/candidateAccess") return { getSupabaseAdmin: () => admin };
    if (name === "./server") return {
      OrgHttpError,
      assertOrgRoleAccess: async (args: any) => {
        assert.equal(args.workspaceId, "workspace");
        assert.equal(args.roleId, "role");
        assert.equal(args.user.id, "user");
        if (!authorized) throw new OrgHttpError(403, "Forbidden");
      },
    };
    return load.call(this, name, ...args);
  });
  const { fetchOrgRoleClosurePreview } = await import("./roleClosurePreview.server");
  const args = { user: { id: "user" } as any, workspaceId: "workspace", roleId: "role" };
  assert.deepEqual(await fetchOrgRoleClosurePreview(args), { recipientCount: 501 });
  assert.equal(reads.filter(table => table === "talent_opportunity_recommendation").length, 2);
  reads.length = 0;
  authorized = false;
  await assert.rejects(fetchOrgRoleClosurePreview(args), /Forbidden/);
  assert.equal(reads.length, 0);
  authorized = true;
  fixture = true;
  assert.deepEqual(await fetchOrgRoleClosurePreview(args), { recipientCount: 0 });
  assert.deepEqual(reads, ["company_roles"]);
  fixture = false;
  failedRead = true;
  await assert.rejects(fetchOrgRoleClosurePreview(args), /read failed/);
});
