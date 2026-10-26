import assert from "node:assert/strict";
import Module from "node:module";
import { before, beforeEach, test } from "node:test";
import type { User } from "@supabase/supabase-js";
import { withOrgRequestScope, deferOrgResponseWork } from "./requestScope.server";

// Isolated Data Cache and DB: these tests never contact Supabase or send notices.
const entries = new Map<string, { value: unknown; tags: string[] }>();
let reads = 0, availableChecks = 0, denied = false;
let cache: typeof import("./permissionCache.server");
let access: typeof import("./teamAccess");
const admin: any = {
  from() {
    return {
      select() { return this; }, eq() { return this; },
      async maybeSingle() {
        reads++;
        return { data: denied ? null : { authority: "owner", access_scope: "organization" }, error: null };
      },
    };
  },
};
const user = { id: "user-a", email: "fixture@example.com" } as User;
const read = (overrides: Partial<Parameters<typeof access.readOrgRoleAccess>[0]> = {}) =>
  access.readOrgRoleAccess({ admin, user, workspaceId: "workspace-a", ...overrides });
const request = <T>(run: () => Promise<T>) => withOrgRequestScope(run, undefined, { cachePermissions: true });

before(async () => {
  const mod = Module as any, original = mod._load;
  mod._load = function (name: string, ...args: unknown[]) {
    if (name === "next/cache") return {
      unstable_cache: (load: () => Promise<unknown>, keys: string[], options: { tags: string[] }) => async () => {
        const key = JSON.stringify(keys);
        const hit = entries.get(key);
        if (hit) return hit.value;
        const value = await load();
        entries.set(key, { value, tags: options.tags });
        return value;
      },
      revalidateTag: (tag: string, options: unknown) => {
        assert.deepEqual(options, { expire: 0 });
        for (const [key, entry] of entries) if (entry.tags.includes(tag)) entries.delete(key);
      },
    };
    if (name === "./workspaceReview.server") return {
      isReviewOnboarding: () => false,
      assertWorkspaceAvailable: async () => { availableChecks++; },
    };
    return original.call(this, name, ...args);
  };
  try {
    cache = await import("./permissionCache.server");
    access = await import("./teamAccess");
  } finally { mod._load = original; }
});
beforeEach(() => { entries.clear(); reads = 0; availableChecks = 0; denied = false; });

test("candidate requests reuse permissions across requests and isolate users/workspaces", async () => {
  await request(() => Promise.all([read(), read()]));
  await request(() => read());
  assert.equal(reads, 1);
  assert.equal(availableChecks, 1);
  await request(() => read({ user: { ...user, id: "user-b" } }));
  await request(() => read({ workspaceId: "workspace-b" }));
  assert.equal(reads, 3);
});

test("half-hour expiry blocks for fresh access instead of returning stale success", async t => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  await request(() => read());
  denied = true;
  now = 30 * 60 * 1000;
  await assert.rejects(request(() => read()), /Workspace access denied/);
  assert.equal(reads, 2);
  denied = false;
  await request(() => read());
  assert.equal(reads, 3); // Failed lookups were not cached.
});

test("permission changes invalidate the workspace across users, preserving other workspaces", async () => {
  await request(() => read());
  await request(() => read({ user: { ...user, id: "user-b" } }));
  await request(() => read({ workspaceId: "workspace-b" }));
  cache.invalidateOrgPermissions("workspace-a");
  denied = true;
  await assert.rejects(request(() => read()), /Workspace access denied/);
  await assert.rejects(request(() => read({ user: { ...user, id: "user-b" } })), /Workspace access denied/);
  await request(() => read({ workspaceId: "workspace-b" }));
  assert.equal(reads, 5);
});

test("fresh checks and default/background callers bypass the permission cache", async () => {
  await request(() => read());
  denied = true;
  await assert.rejects(request(() => read({ fresh: true })), /Workspace access denied/);
  await assert.rejects(read(), /Workspace access denied/);
  await assert.rejects(withOrgRequestScope(() => read()), /Workspace access denied/);
  const scheduled: Array<() => Promise<void>> = [];
  await withOrgRequestScope(async () => {
    await read(); // Still allowed by candidate cache.
    deferOrgResponseWork(() => assert.rejects(read(), /Workspace access denied/));
  }, run => scheduled.push(run), { cachePermissions: true });
  await scheduled[0]();
  assert.equal(reads, 5);
});

test("restricted recipients and setup exceptions cannot consume or populate shared access", async () => {
  await request(() => read());
  const scoped = access.withOrgRoleAudienceScope(admin, ["team-a"]);
  const restricted = await request(() => read({ admin: scoped }));
  assert.equal(restricted.audienceRestricted, true);
  assert.deepEqual(restricted.teamIds, ["team-a"]);
  assert.equal((await request(() => read())).scope, "organization");
  await request(() => read({ allowReviewSetup: true }));
  assert.equal(reads, 3);
});
