import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";
import {
  APPLICATION_CHECKPOINT_USER_ID as id,
  APPLICATION_CHECKPOINT_EMAIL as email,
  APPLICATION_CHECKPOINT_SHA256 as checkpoint,
} from "@/lib/career/devApplicationCheckpoint";
test("application reset requires verified exact account, local server and pinned checkpoint", async () => {
  const modules = Module as any,
    original = modules._load,
    env = process.env.NODE_ENV;
  let user: any = null,
    writes = 0;
  const mocks: any = {
    "@/lib/talentOnboarding/admin": {
      getTalentSupabaseAdmin: () => ({
        auth: { getUser: async () => ({ data: { user }, error: null }) },
      }),
    },
    "@/lib/career/devApplicationStart.server": {
      resetApplicationStart: async () => { writes++; return { opportunities: 4, lastMessageId: 472788 }; },
    },
    "@/lib/career/devApplicationCheckpoint.server": {
      loadApplicationCheckpoint: async () => ({}),
      inspectApplicationCheckpoint: async () => ({ available: true }),
      restoreApplicationCheckpoint: async () => {
        writes++;
      },
    },
  };
  modules._load = function (request: string, ...args: any[]) {
    return mocks[request] ?? original.call(this, request, ...args);
  };
  try {
    Object.assign(process.env, { NODE_ENV: "development" });
    const { POST } = await import("./route");
    const req = (body: any = { checkpoint }, token = true) =>
      new NextRequest(
        "http://localhost/api/talent/dev-application-checkpoint",
        {
          method: "POST",
          headers: token ? { authorization: "Bearer verified" } : {},
          body: JSON.stringify(body),
        }
      );
    assert.equal((await POST(req({}, false))).status, 401);
    assert.equal((await POST(req())).status, 401);
    user = { id: "another-user", email };
    assert.equal((await POST(req())).status, 403);
    user = { id, email: "another@example.test" };
    assert.equal((await POST(req())).status, 403);
    user = { id, email };
    assert.equal((await POST(req({ checkpoint: "other" }))).status, 400);
    Object.assign(process.env, { NODE_ENV: "production" });
    assert.equal((await POST(req())).status, 404);
    assert.equal(writes, 0);
    Object.assign(process.env, { NODE_ENV: "development" });
    assert.equal(
      (await POST(req({ checkpoint, userId: "ignored-other-user" }))).status,
      200
    );
    assert.equal(writes, 1);
    const { APPLICATION_TEST_START } = await import("@/lib/career/devApplicationStart");
    const start = (key: string) => new NextRequest(
      "http://localhost/api/talent/dev-application-checkpoint?fixture=application-start", {
        method: "POST", headers: { authorization: "Bearer verified" }, body: JSON.stringify({ checkpoint: key }),
      });
    assert.equal((await POST(start(checkpoint))).status, 400);
    user = { id: "another-user", email };
    assert.equal((await POST(start(APPLICATION_TEST_START.key))).status, 403);
    user = { id, email };
    const restored = await POST(start(APPLICATION_TEST_START.key));
    assert.deepEqual(await restored.json(), { ok: true, opportunities: 4, lastMessageId: 472788 });
    assert.equal(writes, 2);
  } finally {
    modules._load = original;
    if (env === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: env });
  }
});
