import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { NextRequest } from "next/server";
import { canInspectCareerAgentMessages } from "@/lib/internalAccess";

test("admin history authenticates before querying and cannot substitute another candidate", async () => {
  const modules = Module as unknown as { _load: (...args: any[]) => any };
  const originalLoad = modules._load;
  let user: { id: string; email: string } | null = null;
  const calls: unknown[][] = [];
  const mocks: Record<string, unknown> = {
    "@/lib/supabaseServer": { getFreshRequestUser: async () => user },
    "@/lib/agentContacts/store": { agentContactDatabase: () => ({ query: "query" }) },
    "@/lib/agentContacts/adminHistory": { readAdminAgentHistory: async (...args: unknown[]) => {
      calls.push(args); return { messages: [], nextOffset: null };
    } },
  };
  modules._load = function (request: string, ...args: any[]) {
    return mocks[request] ?? originalLoad.call(this, request, ...args);
  };
  try {
    const { GET } = await import("./route");
    const request = (suffix = "") => new NextRequest(`http://localhost/api/talent/agent-messages?roleId=10000000-0000-4000-8000-000000000001${suffix}`);
    assert.equal((await GET(request())).status, 401);
    user = { id: "ordinary-user", email: "candidate@example.com" };
    assert.equal((await GET(request())).status, 403);
    assert.equal(canInspectCareerAgentMessages(undefined), false);
    assert.equal(canInspectCareerAgentMessages("fake@matchharper.com.attacker.test"), false);
    assert.equal(calls.length, 0);
    user = { id: "verified-admin", email: "khj6051@optimizerai.xyz" };
    assert.equal((await GET(request("&offset=-1"))).status, 400);
    assert.equal((await GET(request("&offset=1.5"))).status, 400);
    const result = await GET(request("&talentId=another-person&offset=30"));
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(calls, [["query", "verified-admin", "10000000-0000-4000-8000-000000000001", 30]]);
  } finally { modules._load = originalLoad; }
});
