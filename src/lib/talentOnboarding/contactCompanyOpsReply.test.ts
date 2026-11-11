import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";

// contact_company to the company's agent (agent mailbox): a candidate message
// that answers an Ops-only private contact keeps the Ops path and never reaches
// the mailbox; a decline note is sent under a key that belongs to the decline.
// No database is configured here, so reaching the mailbox fails with
// "Internal evaluation database is unavailable": that is the observable send.
const stubs: Record<string, unknown> = {
  "server-only": {},
  // Loaded by unrelated Career tools at import time; not used here.
  jsdom: { JSDOM: class {} },
  dotenv: { config: () => ({}) },
};
const nodeModule = Module as unknown as { _load: (name: string, parent: unknown, main: boolean) => unknown };
const originalLoad = nodeModule._load;
nodeModule._load = function (name: string, parent: unknown, main: boolean) {
  return name in stubs ? stubs[name] : originalLoad.call(this, name, parent, main);
};
delete process.env.DATABASE_URL;
delete process.env.CAREER_ROLE_SEARCH_DATABASE_URL;
const toolsPromise = import("./tools");
const MAILBOX = /Internal evaluation database is unavailable/;

function admin(options: { bound: boolean; payload?: Record<string, unknown> }) {
  const calls: Array<{ name: string; args: any }> = [];
  return {
    calls,
    async rpc(name: string, args: any): Promise<any> {
      calls.push({ name, args });
      if (name === "ops_private_contact_for_message_v1") return { data: options.bound ? "ops-request" : null, error: null };
      if (name === "record_ops_candidate_reply_v1")
        return { data: { status: "recorded", idempotent: false, restored: false }, error: null };
      throw new Error(`Unexpected operation: ${name}`);
    },
    from(table: string) {
      const query: any = {
        select: () => query,
        eq: () => query,
        async single() { return query.maybeSingle(); },
        async maybeSingle() {
          if (table === "company_talent_requests") return { data: { recommendation_id: "rec-1" }, error: null };
          if (table === "talent_messages")
            return { data: { id: 10, content: "네, 다시 관심 있어요", role: "user", message_type: "chat", payload: options.payload ?? {} }, error: null };
          return { data: null, error: null };
        },
      };
      return query;
    },
  };
}

const context = (db: ReturnType<typeof admin>) =>
  ({ admin: db, userId: "talent", conversationId: "conversation", userMessageId: 10 }) as never;

async function contactCompany(db: ReturnType<typeof admin>, input: Record<string, unknown>) {
  const { getEnabledTalentTools } = await toolsPromise;
  const tool = getEnabledTalentTools("chat").find((entry) => entry.name === "contact_company");
  assert.ok(tool?.execute);
  return tool.execute(input, context(db)) as Promise<Record<string, unknown>>;
}

test("an answer to an Ops-only private contact stays on the Ops path, by recommendationId or recommendation: connection", async () => {
  for (const target of [{ recommendationId: "rec-1" }, { connectionId: "recommendation:rec-1" },
    { recommendationId: "rec-1", acceptIntroduction: true }]) {
    const db = admin({ bound: true });
    // Resolving (instead of failing at the mailbox) shows nothing was sent to the company's agent.
    const result = await contactCompany(db, { ...target, relayContent: "네, 다시 관심 있어요" });
    assert.equal(result.status, "recorded");
    const recorded = db.calls.find((call) => call.name === "record_ops_candidate_reply_v1");
    assert.equal(recorded?.args.p_request_id, "ops-request");
    assert.equal(recorded?.args.p_source_message_id, 10);
  }
});

test("an Ops-bound answer aimed at another Role or an existing conversation sends nothing", async () => {
  for (const [input, refusal] of [
    [{ recommendationId: "rec-2", relayContent: "관심 있어요" }, /ops_contact_reply_scope_mismatch/],
    [{ introductionRootId: "root", relayContent: "관심 있어요" }, /private check-in/],
  ] as const) {
    const db = admin({ bound: true });
    await assert.rejects(contactCompany(db, input), (error: Error) => refusal.test(error.message) && !MAILBOX.test(error.message));
    assert.equal(db.calls.some((call) => call.name === "record_ops_candidate_reply_v1"), false);
  }
});

test("a message that answers no Ops contact goes to the company's agent", async () => {
  await assert.rejects(contactCompany(admin({ bound: false }), { recommendationId: "rec-1", relayContent: "감사하다고 전해 주세요" }), MAILBOX);
});

test("a decline note request is sent under the decline's own key", async () => {
  const { careerContactSourceFacts } = await toolsPromise;
  const decline = { opportunityDecision: { decision: "decline", recommendationId: "rec-1", roleId: "role",
    decisionAt: "2026-11-11T01:00:00Z", note: "감사하다고 전해 주세요" } };
  const facts = await careerContactSourceFacts(context(admin({ bound: false, payload: decline })), { messageId: 10 }, "rec-1");
  assert.deepEqual(facts, { sourceMessageId: 10, opsContactRequestId: null, declineNoteKey: "decline-note:rec-1:2026-11-11T01:00:00Z" });
  // Another opportunity, or a run that is not this message, keeps the ordinary key.
  assert.equal((await careerContactSourceFacts(context(admin({ bound: false, payload: decline })), { messageId: 10 }, "rec-9")).declineNoteKey, null);
  assert.equal((await careerContactSourceFacts(context(admin({ bound: false, payload: decline })), {}, "rec-1")).declineNoteKey, null);
  assert.equal((await careerContactSourceFacts(context(admin({ bound: false })), { messageId: 10 }, "rec-1")).declineNoteKey, null);
  // An Ops-bound message reports its private contact.
  assert.equal((await careerContactSourceFacts(context(admin({ bound: true })), { messageId: 10 }, "rec-1")).opsContactRequestId, "ops-request");
});
