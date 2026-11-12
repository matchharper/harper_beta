import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/** Exercise the actual orchestration with isolated DB/provider boundaries.
 * SQL locking and idempotency are exercised separately in database.test.ts. */
function fixture(options: { busy?: boolean; fail?: boolean; successor?: boolean } = {}) {
  const calls: Array<{ name: string; args: any }> = [];
  const reads: string[] = [];
  const turns: any[] = [];
  const invocations = ["first", "second"].map((id, index) => ({ id, user_id: "owner", conversation_id: "conversation",
    kind: "career_invocation", parent_id: null, status: "ready", request: { source_message_id: index + 1, input_message_ids: [index + 1] } }));
  const sources = [1, 2].map(id => ({ id, user_id: "owner", conversation_id: "conversation", role: "user", content: `Input ${id}` }));
  const admin = {
    from(table: string) {
      reads.push(table);
      let id: unknown;
      const query: any = { select: () => query, eq: (key: string, value: unknown) => { if (key === "id") id = value; return query; },
        maybeSingle: async () => ({ error: null, data: table === "talent_messages" ? sources.find(source => source.id === id) : invocations.find(invocation => invocation.id === id) }) };
      return query;
    },
    async rpc(name: string, args: any) {
      calls.push({ name, args });
      if (name === "claim_career_inbox") return { data: { accepted: !options.busy, state: { handbooks: [], completedReplyIds: {} } }, error: null };
      if (name === "finish_career_invocation") return { data: options.successor && args.p_invocation_id === "first" ? "second" : null, error: null };
      if (name === "claim_career_invocations") throw new Error("Unexpected queue publication while the immediate executor can continue");
      return { data: true, error: null };
    },
  };
  class ControlError extends Error {}
  const dependencies: Record<string, unknown> = {
    ownsCareerExecution: () => true,
    readCareerInbox: async () => ({ messages: [], deliveredIds: [], completed: false }),
    readCareerInboxContext: async (_scope: unknown, id: string) => ({
      inbox: { messages: [], deliveredIds: [], completed: false },
      context: { setting: { is_onboarding_done: true, invocationId: id }, conversation: { id: "conversation" }, gmail: null, summary: null, messages: [] },
    }),
    readBrowserControlReturns: async () => "",
    careerCheckpointIsReady: async () => true,
    createCareerInvocationActivity: () => ({ start: async () => {}, record() {}, checkpoint: async () => {}, flush: async () => {} }),
    CareerReplyContinuation: ControlError, CareerTurnCancelled: class extends Error {}, CareerAgentReplyUnavailable: class extends Error {},
    runCareerChatTurn: async () => { throw new Error("Durable invocation must not build an unused HTTP response"); },
    executeCareerChatTurn: async (args: any) => { turns.push(args); if (options.fail) throw new Error("Preparation unavailable"); await args.onAgentTurnStarted(args.claimedInbox.claimId); args.onInvocationCompleted(options.successor && args.inboxId === "first" ? "second" : null); },
  };
  const compiledModule = { exports: {} as typeof import("./invocations") };
  vm.runInNewContext(ts.transpileModule(readFileSync("src/lib/career/work/invocations.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: compiledModule, exports: compiledModule.exports, crypto: globalThis.crypto, Date, console,
    require: () => new Proxy({}, { get: (_, key) => dependencies[String(key)] }),
  });
  const scope = { admin: admin as any, userId: "owner", conversationId: "conversation" };
  return { ...compiledModule.exports, scope, calls, reads, turns,
    delivery: { initialInvocation: invocations[0] as any, initialSourceMessage: sources[0] as any,
      initialSetting: { is_onboarding_done: true } as any, initialConversation: { id: "conversation" } as any } };
}

test("idle input reuses admission reads, obtains one claim and runs without publishing a queue job", async () => {
  const f = fixture();
  await f.processCareerInvocation(f.scope, "first", f.delivery);
  assert.equal(f.turns.length, 1);
  assert.deepEqual(f.reads, [], "neither the invocation nor source is read again");
  assert.equal(f.calls.filter(call => call.name === "claim_career_inbox").length, 1);
  assert.equal(f.calls.filter(call => call.name === "finish_career_invocation").length, 0);
  assert.equal(f.calls.filter(call => call.name === "release_career_agent_turn").length, 0);
  assert.ok(!f.calls.some(call => call.name === "claim_career_invocations"));
});

test("a busy conversation does not enter preparation or start another model", async () => {
  const f = fixture({ busy: true });
  assert.equal(await f.processCareerInvocation(f.scope, "first", f.delivery), false);
  assert.equal(f.turns.length, 0);
  assert.deepEqual(f.calls.map(call => call.name), ["claim_career_inbox"]);
});

test("the completion/admission race continues the successor directly without a competing queue executor", async () => {
  const f = fixture({ successor: true });
  await f.processCareerInvocation(f.scope, "first", f.delivery);
  assert.deepEqual(f.turns.map(turn => turn.existingSourceMessage.id), [1, 2]);
  assert.equal(f.turns[0].initialSetting.invocationId, "first");
  assert.equal(f.turns[1].initialSetting.invocationId, "second", "successors refresh server facts");
  assert.deepEqual(f.reads, ["talent_external_operations", "talent_messages"]);
  assert.equal(f.calls.filter(call => call.name === "release_career_agent_turn").length, 0);
});

test("a failed preparation releases its own claim without completing the admitted input", async () => {
  const f = fixture({ fail: true });
  await assert.rejects(f.processCareerInvocation(f.scope, "first", f.delivery), /Preparation unavailable/);
  const claim = f.calls.find(call => call.name === "claim_career_inbox")!.args.p_claim_id;
  assert.equal(f.calls.find(call => call.name === "release_career_agent_turn")!.args.p_claim_id, claim);
  assert.ok(!f.calls.some(call => call.name === "finish_career_invocation"));
});
