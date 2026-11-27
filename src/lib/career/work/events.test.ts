import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";

// The event reader reaches server-only modules on import; this test runs outside Next.js.
const nodeModule = Module as typeof Module & { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = nodeModule._load;
nodeModule._load = function (request, parent, isMain) {
  return request === "server-only" ? {} : originalLoad.call(this, request, parent, isMain);
};

const userId = "00000000-0000-4000-8000-000000000001";
const conversationId = "00000000-0000-4000-8000-000000000002";
const runId = "00000000-0000-4000-8000-000000000003";

function admin(run: Record<string, unknown>) {
  const tables: Record<string, Record<string, unknown>> = {
    talent_messages: { id: 41, user_id: userId, conversation_id: conversationId, role: "user", content: "A사 지원 맡길게", payload: {}, created_at: "2026-11-27T04:00:00Z", message_type: "chat" },
    talent_external_operations: run,
  };
  return {
    from: (table: string) => {
      const chain: any = { select: () => chain, eq: () => chain, single: async () => ({ data: structuredClone(tables[table]), error: null }) };
      return chain;
    },
  } as any;
}
const browserRun = (verificationCode: string) => ({
  id: runId, user_id: userId, conversation_id: conversationId, parent_id: null, kind: "browser_run", status: "completed", revision: 2,
  idempotency_key: "k", request: { mode: "execute" }, provider_refs: {}, created_at: "2026-11-27T04:10:00Z", updated_at: "2026-11-27T04:12:00Z",
  result: { summary: "The site sent a verification mail.", evidence: [], needsUser: false, url: "https://jobs.example.test/apply", submitted: "no", verificationCode },
});
const event = { id: "event-1", request: { source_message_id: 41, kind: "gmail_connected", reference: runId } };

test("a Gmail connection tells a waiting application whether to read a code or a verification link", async () => {
  const { readCareerEventContext } = await import("./events");
  const scope = (verificationCode: string) => ({ admin: admin(browserRun(verificationCode)), userId, conversationId });
  const link = await readCareerEventContext(scope("email_link") as any, [event]);
  assert.match(link, /waited for a verification link the site sent by email/);
  assert.match(link, /open in a new tab/);
  assert.doesNotMatch(link, /one-time code/);
  const code = await readCareerEventContext(scope("email") as any, [event]);
  assert.match(code, /one-time code the site sent by email/);
  assert.doesNotMatch(code, /verification link/);
});
