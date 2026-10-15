import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const id = "00000000-0000-4000-8000-000000000001";
function route(options: { denied?: boolean; rpcError?: boolean } = {}) {
  const calls: string[] = [];
  const logs: any[] = [];
  class OrgHttpError extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  }
  const dependencies: Record<string, any> = {
    "next/server": {
      NextResponse: {
        json: (body: unknown, init?: { status: number }) => ({
          body,
          status: init?.status ?? 200,
        }),
      },
    },
    "@/lib/org/server": {
      OrgHttpError,
      async assertOrgWorkspacePermission() {
        calls.push("authorize");
        if (options.denied) throw new OrgHttpError(403, "denied");
      },
    },
    "@/lib/server/candidateAccess": {
      requireAuthenticatedUser: async () => ({ id: "actor" }),
      getSupabaseAdmin: () => ({
        async rpc() {
          calls.push("mutate");
          return {
            data: id,
            error: options.rpcError ? new Error("database failed") : null,
          };
        },
      }),
    },
    "@/lib/org/teamAccess": { fetchOrgTeams: async () => [] },
    "@/lib/org/actionLogs": {
      async recordOrgAction(args: unknown) {
        calls.push("log");
        logs.push(args);
      },
    },
  };
  const compiled = ts.transpileModule(
    readFileSync(new URL("./route.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const loaded = { exports: {} as any };
  vm.runInNewContext(compiled, {
    module: loaded,
    exports: loaded.exports,
    console: { error() {} },
    require(name: string) {
      if (!(name in dependencies)) throw new Error(name);
      return dependencies[name];
    },
  });
  return { ...loaded.exports, calls, logs };
}
const request = (body: unknown) => ({ json: async () => body });

test("team access is logged only after authorized successful mutation", async () => {
  const r = route();
  const response = await r.PATCH(
    request({ workspaceId: id, userId: id, accessScope: "team", teamIds: [id] })
  );
  assert.equal(response.status, 200);
  assert.deepEqual(r.calls, ["authorize", "mutate", "log"]);
  assert.equal(r.logs[0].type, "org_member_access_saved");
  assert.equal(r.logs[0].actorUserId, "actor");
  assert.equal(r.logs[0].metadata.workspaceId, id);
});

test("authorization and mutation failures never create successful-action logs", async () => {
  for (const options of [{ denied: true }, { rpcError: true }]) {
    const r = route(options);
    const response = await r.DELETE(request({ workspaceId: id, teamId: id }));
    assert.ok(response.status >= 400);
    assert.equal(r.logs.length, 0);
    if (options.denied) assert.deepEqual(r.calls, ["authorize"]);
  }
});

test("team create and delete retain resource and action identity", async () => {
  for (const [method, type] of [
    ["POST", "org_team_created"],
    ["DELETE", "org_team_deleted"],
  ]) {
    const r = route();
    const response = await r[method](
      request({
        workspaceId: id,
        teamId: id,
        name: "채용팀",
        userIds: [],
        roleIds: [],
      })
    );
    assert.equal(response.status, 200);
    assert.equal(r.logs[0].type, type);
    assert.equal(r.logs[0].metadata.resourceId, id);
  }
});
