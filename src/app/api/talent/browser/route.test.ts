import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { NextRequest } from "next/server";

test("Done uses authenticated ownership and the viewed revision without submitting a chat message", async () => {
  const modules = Module as unknown as { _load: (...args: any[]) => any };
  const originalLoad = modules._load;
  let user: { id: string } | null = null;
  let available = true;
  const sessionId = "00000000-0000-4000-8000-000000000003";
  const returned: unknown[] = [];
  const mocks: Record<string, unknown> = {
    "@/lib/supabaseServer": { getRequestUser: async () => user },
    "@/lib/talentOnboarding/admin": { getTalentSupabaseAdmin: () => ({}) },
    "@/lib/career/externalOperations/store": { readOperation: async (context: any, id: string) => {
      assert.equal(context.userId, user?.id);
      assert.equal(id, sessionId);
      return available ? { id, kind: "browser_session", conversation_id: "conversation", status: "human" } : null;
    } },
    "@/lib/career/browser/tool": { executeUseBrowser: () => assert.fail("Done must not dispatch a browser task itself") },
    "@/lib/career/browser/control": { returnBrowserControl: async (scope: any, id: string, revision: number) => {
      returned.push({ userId: scope.userId, conversationId: scope.conversationId, id, revision });
      return { status: "idle" };
    } },
  };
  modules._load = function (request: string, ...args: any[]) { return mocks[request] ?? originalLoad.call(this, request, ...args); };
  try {
    const { POST } = await import("./route");
    const request = (revision?: number) => new NextRequest("http://localhost/api/talent/browser", {
      method: "POST", body: JSON.stringify({ action: "resume", sessionId, revision, userId: "untrusted" }),
    });
    assert.equal((await POST(request(4))).status, 401);
    user = { id: "owner" };
    available = false;
    assert.equal((await POST(request(4))).status, 404);
    available = true;
    assert.equal((await POST(request())).status, 400);
    const response = await POST(request(4));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "idle" });
    assert.deepEqual(returned, [{ userId: "owner", conversationId: "conversation", id: sessionId, revision: 4 }]);
  } finally { modules._load = originalLoad; }
});
