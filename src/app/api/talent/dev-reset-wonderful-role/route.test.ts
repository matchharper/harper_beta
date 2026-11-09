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
  const resetTargets: string[] = [];
  const mocks: Record<string, unknown> = {
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
    "@/lib/career/devWonderfulRoleReset": {
      CareerRoleResetConflict: class extends Error {},
      resetWonderfulRoleRecommendation: async (
        _query: unknown,
        talentId: string,
        target: string
      ) => {
        resetAccounts.push(talentId);
        resetTargets.push(target);
        return { recommendationId: "new-recommendation" };
      },
    },
  };
  modules._load = function (request: string, ...args: any[]) {
    return mocks[request] ?? originalLoad.call(this, request, ...args);
  };
  try {
    const { POST } = await import("./route");
    const request = (target?: unknown) =>
      new NextRequest("http://localhost/api/talent/dev-reset-wonderful-role", {
        method: "POST",
        body: JSON.stringify({
          talentId: "someone-else",
          roleId: "another-role",
          ...(target === undefined ? {} : { target }),
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
    assert.deepEqual(resetTargets, ["korea-fde"]);
    assert.equal(transactions, 1);
    const marketing = await POST(request("korea-marketing-manager"));
    assert.equal(marketing.status, 200);
    assert.deepEqual(resetAccounts, ["authenticated-owner", "authenticated-owner"]);
    assert.deepEqual(resetTargets, ["korea-fde", "korea-marketing-manager"]);
    for (const invalid of ["another-role", "__proto__", null, {}, 1]) {
      assert.equal((await POST(request(invalid))).status, 400);
    }
    assert.equal(transactions, 2, "invalid targets never start a reset transaction");
  } finally {
    modules._load = originalLoad;
  }
});
