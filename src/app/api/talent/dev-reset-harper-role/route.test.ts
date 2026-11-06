import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { NextRequest } from "next/server";

test("reset API requires dev access and always uses the authenticated account", async () => {
  const modules = Module as unknown as { _load: (...args: any[]) => any };
  const originalLoad = modules._load;
  let user: { id: string; email: string } | null = null;
  let allowed = false;
  let transactions = 0;
  const resetAccounts: string[] = [];
  const mocks: Record<string, unknown> = {
    "@/lib/career/devWonderfulRoleReset": {
      CareerRoleResetConflict: class extends Error {},
    },
    "@/lib/career/simulation/browserUseAgents": {
      browserUseAgents: { stop: async () => {} },
    },
    "@/lib/supabaseServer": { getRequestUser: async () => user },
    "@/lib/internalAccess": { canUseCareerDevControls: () => allowed },
    "@/lib/career/devSql": {
      getCareerDevSqlClient: () => ({
        begin: async (callback: (tx: unknown) => Promise<unknown>) => {
          transactions++;
          return callback(
            Object.assign(async () => [], { unsafe: async () => [] })
          );
        },
      }),
    },
    "@/lib/career/devHarperRoleReset": {
      CareerRoleResetConflict: class extends Error {},
      resetHarperTestRoleRecommendation: async (
        _query: unknown,
        talentId: string
      ) => {
        resetAccounts.push(talentId);
        return { recommendationId: "new-recommendation" };
      },
    },
  };
  modules._load = function (request: string, ...args: any[]) {
    return mocks[request] ?? originalLoad.call(this, request, ...args);
  };
  try {
    const { POST } = await import("./route");
    const request = () =>
      new NextRequest("http://localhost/api/talent/dev-reset-harper-role", {
        method: "POST",
        body: JSON.stringify({
          talentId: "someone-else",
          roleId: "another-role",
        }),
      });
    assert.equal((await POST(request())).status, 401);
    user = { id: "authenticated-owner", email: "owner@example.test" };
    assert.equal((await POST(request())).status, 403);
    assert.equal(transactions, 0);
    allowed = true;
    const response = await POST(request());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      recommendationId: "new-recommendation",
    });
    assert.deepEqual(resetAccounts, ["authenticated-owner"]);
    assert.equal(transactions, 1);
  } finally {
    modules._load = originalLoad;
  }
});
