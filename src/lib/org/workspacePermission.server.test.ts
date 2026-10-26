import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import type { User } from "@supabase/supabase-js";
import { withOrgRequestScope } from "./requestScope.server";

test("candidate permission cache never authorizes management; membership writes invalidate before follow-up reads", async t => {
  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: "https://permissions.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-key",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-key",
    OPENAI_API_KEY: "unused-fixture-key",
  })) {
    const old = process.env[key];
    process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  const entries = new Map<string, unknown>();
  const calls: string[] = [];
  let authority = "admin", left = false;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://permissions.invalid", "No production requests allowed");
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
      status, headers: { "Content-Type": "application/json" },
    });
    if (url.pathname === "/rest/v1/company_workspace") return json({ is_reviewing: false });
    if (url.pathname === "/rest/v1/company_user_workspace") {
      if (init?.method === "DELETE") { left = true; calls.push("delete"); return new Response(null, { status: 204 }); }
      if (left) return json({ message: "follow-up read failed" }, 400);
      return json([{ id: "membership", authority, access_scope: "organization" }]);
    }
    if (url.pathname === "/rest/v1/logs") return new Response(null, { status: 204 });
    assert.fail(`Unexpected request: ${url.pathname}`);
  });
  const mod = Module as any, original = mod._load;
  t.mock.method(mod, "_load", function (this: unknown, name: string, ...args: unknown[]) {
    if (name === "server-only") return {};
    if (name === "next/cache") return {
      unstable_cache: (run: () => Promise<unknown>, keys: string[]) => async () => {
        const key = JSON.stringify(keys);
        if (entries.has(key)) return entries.get(key);
        const value = await run(); entries.set(key, value); return value;
      },
      revalidateTag: (tag: string, options: unknown) => {
        assert.equal(tag, "org-permission:workspace");
        assert.deepEqual(options, { expire: 0 });
        calls.push("invalidate"); entries.clear();
      },
    };
    return original.call(this, name, ...args);
  });
  const { assertOrgWorkspacePermission, leaveOrgWorkspace } = await import("./server");
  const { getSupabaseAdmin } = await import("@/lib/server/candidateAccess");
  const user = { id: "actor", email: "fixture@example.com" } as User;
  const base = { admin: getSupabaseAdmin(), user, workspaceId: "workspace" };
  const candidateRequest = <T>(run: () => Promise<T>) => withOrgRequestScope(run, undefined, { cachePermissions: true });
  await candidateRequest(() => assertOrgWorkspacePermission({ ...base, permission: "manage_candidates" }));
  authority = "viewer";
  await candidateRequest(async () => {
    await assertOrgWorkspacePermission({ ...base, permission: "manage_candidates" });
    for (const permission of ["manage_members", "manage_workspace", "manage_integrations"] as const) {
      await assert.rejects(assertOrgWorkspacePermission({ ...base, permission }), { status: 403 });
    }
  });
  // Leaving succeeds in the DB, but retrieving the next workspace fails. Even
  // then the prior authorization must already be invalidated.
  await assert.rejects(leaveOrgWorkspace({ user, workspaceId: "workspace" }));
  assert.deepEqual(calls, ["delete", "invalidate"]);
  assert.equal(entries.size, 0);
});
