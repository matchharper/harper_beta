import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { companyEmailTopicEnabled } from "../../../../lib/email/companyPreferencesContract";

function harness(
  options: {
    denied?: boolean;
    anonymous?: boolean;
    preferences?: Record<string, unknown>;
    failed?: boolean;
  } = {}
) {
  const filters: unknown[][] = [];
  const writes: any[] = [];
  let reads = 0;
  class OrgHttpError extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  }
  const authorize = async () => {
    if (options.denied) throw new OrgHttpError(403, "Forbidden");
  };
  const admin = {
    from(table: string) {
      reads++;
      const result = {
        data:
          table === "company_users"
            ? { email_preferences: options.preferences ?? {} }
            : [{ role_id: "my-role" }],
        error: options.failed ? Error("read failed") : null,
      };
      const query = {
        select() {
          return query;
        },
        eq(field: string, value: unknown) {
          filters.push([table, field, value]);
          return query;
        },
        single: async () => result,
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(result).then(resolve);
        },
      };
      return query;
    },
    async rpc(name: string, args: any) {
      writes.push({ name, ...args });
      return {
        data: { ...options.preferences, [args.p_topic]: args.p_enabled },
        error: options.failed ? Error("write failed") : null,
      };
    },
  };
  const dependencies: Record<string, unknown> = {
    "next/server": {
      NextResponse: {
        json: (
          body: unknown,
          init?: { status?: number; headers?: unknown }
        ) => ({ body, status: init?.status ?? 200, headers: init?.headers }),
      },
    },
    "@/lib/org/server": {
      OrgHttpError,
      assertOrgWorkspacePermission: authorize,
    },
    "@/lib/server/candidateAccess": {
      getSupabaseAdmin: () => admin,
      requireAuthenticatedUser: async () => {
        if (options.anonymous) throw Error("Unauthorized");
        return { id: "signed-in-user" };
      },
    },
    "./companyPreferencesContract": { companyEmailTopicEnabled },
    "@/lib/email/companyPreferencesContract": { companyEmailTopicEnabled },
  };
  function load(path: URL) {
    const output = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const loaded = { exports: {} as any };
    vm.runInNewContext(output, {
      Error,
      module: loaded,
      exports: loaded.exports,
      console: { error() {} },
      require: (name: string) => {
        if (!(name in dependencies)) throw Error(name);
        return dependencies[name];
      },
    });
    return loaded.exports;
  }
  dependencies["@/lib/email/companyPreferences"] = load(
    new URL("../../../../lib/email/companyPreferences.ts", import.meta.url)
  );
  return {
    ...load(new URL("./route.ts", import.meta.url)),
    filters,
    writes,
    readCount: () => reads,
  };
}

const request = (body: unknown = {}) => ({
  nextUrl: new URL(
    "https://fixture.invalid/api/org/personal-settings?workspaceId=my-workspace"
  ),
  json: async () => body,
});

test("reads only the signed-in user's assignments in the requested workspace and the saved opt-out", async () => {
  const app = harness({ preferences: { all_proactive: false } });
  const response = await app.GET(request());
  assert.equal(response.status, 200);
  assert.equal(response.body.emailEnabled, false);
  assert.deepEqual(JSON.parse(JSON.stringify(response.body.assignedRoleIds)), [
    "my-role",
  ]);
  assert.deepEqual(app.filters, [
    ["company_users", "user_id", "signed-in-user"],
    ["company_role_assignees", "company_user_id", "signed-in-user"],
    [
      "company_role_assignees",
      "company_roles.company_workspace_id",
      "my-workspace",
    ],
  ]);
  assert.equal(response.headers["Cache-Control"], "no-store");
});

test("email toggle uses the existing atomic preference RPC for self, ignoring supplied recipient and scope", async () => {
  for (const enabled of [false, true]) {
    const app = harness();
    const response = await app.PATCH(
      request({
        workspaceId: "my-workspace",
        emailEnabled: enabled,
        userId: "someone-else",
        scope: "other",
      })
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.emailEnabled, enabled);
    assert.deepEqual(app.writes, [
      {
        name: "set_company_email_preference_v1",
        p_user_id: "signed-in-user",
        p_topic: "all_proactive",
        p_enabled: enabled,
      },
    ]);
  }
});

test("authentication and workspace access failures cannot read or change settings", async () => {
  for (const options of [{ anonymous: true }, { denied: true }]) {
    const app = harness(options);
    for (const method of ["GET", "PATCH"]) {
      const response = await app[method](
        request({ workspaceId: "my-workspace", emailEnabled: false })
      );
      assert.equal(response.status, options.anonymous ? 401 : 403);
    }
    assert.equal(app.readCount(), 0);
    assert.equal(app.writes.length, 0);
  }
});

test("invalid input and database failures never report a saved preference", async () => {
  const app = harness();
  for (const body of [
    null,
    {},
    { workspaceId: "my-workspace", emailEnabled: "false" },
    { workspaceId: " ", emailEnabled: true },
  ]) {
    assert.equal((await app.PATCH(request(body))).status, 400);
  }
  assert.equal(app.writes.length, 0);
  const failed = harness({ failed: true });
  assert.equal((await failed.GET(request())).status, 500);
  assert.equal(
    (
      await failed.PATCH(
        request({ workspaceId: "my-workspace", emailEnabled: false })
      )
    ).status,
    500
  );
});
