import assert from "node:assert/strict";
import test from "node:test";
import { CareerTurnCancelled, assertCareerTurnActive, cancelCareerTurnWork, watchCareerTurnCancellation } from "./turnCancellation.server";
import { formatTalentMessageContentForLlmPrompt } from "./opportunityFeedbackNote";
import { CareerCapabilityRuntime } from "./capabilities/runtime";
import { internalEvaluationBackend } from "./matching/internalScoring/backend";

function fixture() {
  const messages = [{ id: 42, user_id: "owner", conversation_id: "chat", role: "user", payload: {} as any }];
  const external = [
    { id: "child", talent_id: "owner", conversation_id: "chat", variant: "career_agent", status: "running", request: { replyId: "message:42" }, evaluation_ids: ["saved"] },
    { id: "done", talent_id: "owner", conversation_id: "chat", variant: "career_agent", status: "completed", request: { replyId: "message:42" } },
    { id: "other-turn", talent_id: "owner", conversation_id: "chat", variant: "career_agent", status: "queued", request: { replyId: "message:43" } },
    { id: "other-owner", talent_id: "other", conversation_id: "chat", variant: "career_agent", status: "running", request: { replyId: "message:42" } },
  ];
  const internal = [{ id: "internal-child", talent_id: "owner", conversation_id: "chat", trigger: "career_internal_evaluation", status: "queued", trigger_payload: { parentReplyId: "message:42" } }];
  const calls: Array<{ name: string; args: any }> = [];
  const tables: Record<string, any[]> = { talent_messages: messages, external_recommendation_runs: external, opportunity_discovery_run: internal };
  const admin: any = {
    from: (table: string) => {
      const filters: Array<(row: any) => boolean> = [];
      let patch: any;
      const value = (row: any, key: string) => key.split("->>").reduce((v, part) => v?.[part], row);
      const result = () => {
        const rows = (tables[table] ?? []).filter(row => filters.every(filter => filter(row)));
        if (patch) rows.forEach(row => Object.assign(row, patch));
        return { data: rows, error: null };
      };
      const q: any = {
        select: () => q, update: (p: any) => { patch = p; return q; },
        eq: (key: string, v: any) => { filters.push(row => value(row, key) === v); return q; },
        in: (key: string, values: any[]) => { filters.push(row => values.includes(value(row, key))); return q; },
        maybeSingle: async () => ({ ...result(), data: result().data[0] ?? null }),
        then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
      };
      return q;
    },
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      return { data: name === "claim_career_agent_turn" ? { accepted: true, state: { handbooks: [{ id: "resume", version: "v", remainingReplies: 2 }] } } : true, error: null };
    },
  };
  const scope = { admin, userId: "owner", conversationId: "chat", sourceMessageId: 42 };
  return { scope, messages, external, internal, calls };
}

test("durable Stop is scoped to the original owner, conversation and request", async () => {
  const { scope, messages } = fixture();
  messages[0].payload.careerTurnStopped = true;
  await assert.rejects(assertCareerTurnActive(scope), CareerTurnCancelled);
  messages.push({ ...messages[0], id:43, payload:{} });
  await assertCareerTurnActive({ ...scope, sourceMessageId: 43 });
  await assert.rejects(assertCareerTurnActive({ ...scope, userId: "other" }), CareerTurnCancelled);
  await assert.rejects(assertCareerTurnActive({ ...scope, conversationId: "other-chat" }), CareerTurnCancelled);
  await assert.rejects(assertCareerTurnActive({ ...scope, sourceMessageId: 404 }), CareerTurnCancelled);
});

test("another executor observes Stop during a provider call and releases its watcher", async () => {
  const { scope, messages } = fixture();
  const monitor = watchCareerTurnCancellation(scope);
  await monitor.check();
  messages[0].payload.careerTurnStopped = true;
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Stop was not propagated")), 3000);
      monitor.signal.addEventListener("abort", () => { clearTimeout(timeout); resolve(); }, { once: true });
    });
    assert.ok(monitor.signal.reason instanceof CareerTurnCancelled);
  } finally { monitor.dispose(); }
});

test("a failed cancellation read is an error, not a fabricated user Stop", async () => {
  const { scope } = fixture();
  const from = scope.admin.from;
  const failure = new Error("Read unavailable");
  scope.admin.from = (table: string) => {
    const query = from(table);
    query.maybeSingle = async () => ({ data: null, error: failure });
    return query;
  };
  const monitor = watchCareerTurnCancellation(scope);
  try {
    await assert.rejects(monitor.check(), failure);
    assert.equal(monitor.signal.aborted, false);
  } finally { monitor.dispose(); }
});

test("child cancellation preserves completed output and does not cancel another request", async () => {
  const { scope, external, calls } = fixture();
  await cancelCareerTurnWork(scope);
  assert.equal(external[0].status, "cancelled");
  assert.deepEqual(external[0].evaluation_ids, ["saved"]);
  assert.deepEqual(external.slice(1).map(row => row.status), ["completed", "queued", "running"]);
  assert.deepEqual(calls, [{ name: "control_career_internal_evaluation", args: { p_talent: "owner", p_run: "internal-child", p_action: "cancel" } }]);
});

test("Stop routes beta handed-off evaluations to their owner without the legacy Worker RPC", async t => {
  const { scope, internal, calls } = fixture();
  Object.assign(internal[0], { status: "handed_off", trigger_payload: { parentReplyId: "message:42", executor: "career_internal_beta_v1" } });
  const cancelled: unknown[] = [];
  t.mock.method(internalEvaluationBackend, "control", async (...args: unknown[]) => { cancelled.push(args); return {}; });
  await cancelCareerTurnWork(scope);
  assert.deepEqual(cancelled, [["owner", "internal-child", "cancel"]]);
  assert.deepEqual(calls, []);
});

test("a cancelled queued reply is settled without a model call or handbook consumption", async () => {
  process.env.OPENAI_API_KEY ??= "test-only";
  const { prepareCareerAgentTurn } = await import("./agentTurnRuntime.server");
  const { scope, messages, calls } = fixture();
  messages[0].payload.careerTurnStopped = true;
  await assert.rejects(prepareCareerAgentTurn({ ...scope, sourceMessage: messages[0] as any,
    mode: "progressive", eligibleTools: [], promptArgs: { channel: "chat", isOnboardingDone: true, profile: null,
      structuredProfileText: "", talentContextSection: "", careerCoachingActivity: null },
  }), CareerTurnCancelled);
  const finish = calls.find(call => call.name === "finish_career_agent_turn")!;
  assert.equal(finish.args.p_record.status, "cancelled");
  assert.deepEqual(finish.args.p_record.injectedHandbooks, []);
  assert.deepEqual(finish.args.p_handbooks, [{ id: "resume", version: "v", remainingReplies: 2 }]);
});

test("the next actual provider request receives the original request and the Stop fact", async () => {
  const oldFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY ??= "test-only";
  const { runCareerChatAssistant } = await import("./llm");
  let requests = 0;
  globalThis.fetch = async (_url, init) => {
    requests++;
    const input = JSON.stringify(JSON.parse(String(init?.body)).input);
    assert.ok(input.includes("이력서 저장하고 지원해줘"));
    assert.ok(input.includes("The user requested Stop for this request."));
    assert.ok(input.includes("Completed effects were retained."));
    return Response.json({ id: "next-turn", model: "gpt-6.1-sol", status: "completed", usage: {},
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Saved work is available." }] }] });
  };
  try {
    await runCareerChatAssistant({ primaryModel: "gpt-6.1-sol", tools: [], systemBlocks: [], executeTool: async () => { throw new Error("No effect expected"); },
      messages: [{ role: "user", content: formatTalentMessageContentForLlmPrompt({ content: "이력서 저장하고 지원해줘", payload: { careerTurnStopped: true } }) },
        { role: "user", content: "어디까지 했어?" }] });
    assert.equal(requests, 1);
  } finally { globalThis.fetch = oldFetch; }
});

test("Stop between tool calls prevents the second effect and any fallback response", async () => {
  const oldFetch = globalThis.fetch, oldKey = process.env.OPENAI_API_KEY, oldAnthropic = process.env.ANTHROPIC_API_KEY;
  process.env.OPENAI_API_KEY = process.env.ANTHROPIC_API_KEY = "test-only";
  try {
    const { runCareerChatAssistant, runCareerChatAssistantStream } = await import("./llm");
    for (const native of [false, true]) for (const streaming of [false, true]) {
      const controller = new AbortController();
      let requests = 0, effects = 0;
      const tools = ["read_talent_context", "write_talent_context"].map(name => ({ type: "function" as const,
        function: { name, description: name, parameters: { type: "object", properties: {} } } }));
      const runtime = new CareerCapabilityRuntime({ mode: "full", eligibleTools: tools, abortSignal: controller.signal,
        promptArgs: () => ({ channel: "chat", isOnboardingDone: true, profile: null, structuredProfileText: "", talentContextSection: "" }) });
      globalThis.fetch = async (url, init) => {
        if (!String(url).includes(native ? "api.anthropic.com" : "api.openai.com")) return Response.json([]);
        requests++;
        const blocks = tools.map((tool, i) => ({ type: "tool_use", id: `call-${i}`, name: tool.function.name, input: {} }));
        if (native && streaming) return new Response(blocks.flatMap((block, index) => [
          { type: "content_block_start", index, content_block: block }, { type: "content_block_stop", index },
        ]).concat([{ type: "message_delta", delta: { stop_reason: "tool_use" } } as any, { type: "message_stop" } as any])
          .map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
        if (native) return Response.json({ content: blocks, stop_reason: "tool_use", usage: {} });
        const response = { id: "response", model: "gpt-6.1-sol", status: "completed", output: blocks.map(block => ({
          type: "function_call", call_id: block.id, name: block.name, arguments: "{}",
        })), usage: {} };
        return JSON.parse(String(init?.body)).stream
          ? new Response(`data: ${JSON.stringify({ type: "response.completed", response })}\n\n`, { headers: { "Content-Type": "text/event-stream" } })
          : Response.json(response);
      };
      const step = runtime.resolveStep(false);
      const run = streaming ? runCareerChatAssistantStream : runCareerChatAssistant;
      await assert.rejects(run({ toolRuntime: runtime, primaryModel: native ? "claude-haiku-5-5" : "gpt-6.1-sol",
        tools: step.tools, systemBlocks: step.systemBlocks, messages: [{ role: "user", content: "Work" }], onTextDelta: () => {},
        executeTool: async () => { effects++; controller.abort(new CareerTurnCancelled()); return { ok: true }; },
      }), CareerTurnCancelled);
      assert.equal(effects, 1);
      assert.equal(requests, 1);
    }
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    if (oldAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldAnthropic;
  }
});
