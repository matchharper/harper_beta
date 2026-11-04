import assert from "node:assert/strict";
import test from "node:test";
import { CareerCapabilityRuntime, CareerReplyContinuation, type CareerReplyCheckpoint } from "../capabilities/runtime";
import { dispatchCareerCheckpoint } from "../agentContinuation";
import { CAREER_DELIVERY_TOOLS } from "./delivery";
import { renderCareerBackgroundInvocation } from "./prompt";
import { DEFAULT_CAREER_TEXT_CHAT_MODEL } from "../textChatModelConfig";
import { CLAUDE_HAIKU_MODEL, GPT_6_LUNA_MODEL } from "@/lib/llm/modelConfig";
import { withToolTrace, type ToolTraceEvent } from "@/lib/llm/toolTrace";

test("internal follow events omit discovery candidates and stale publication instructions", () => {
  const rendered = renderCareerBackgroundInvocation({
    id: "follow-run", talent_id: "owner", conversation_id: "conversation", status: "handed_off",
    trigger: "career_company_follow_changed", created_at: "2026-10-30T01:02:03Z",
    trigger_payload: {
      instruction: "Review the newly assessed roles PRIVATE_GENERATED_INSTRUCTION",
      evaluationId: "evaluation-run", roleIds: ["assessed-role"],
      evaluationEvidence: { source: "internal", evaluationIds: ["saved-evaluation"], privateRaw: "PRIVATE_DB_SENTINEL" },
      sourceEvents: [{ sourceKind: "company_follow", sourceId: "follow", revision: "source-revision", roleSource: "internal", roleIds: ["source-role"], occurredAt: "2026-10-29T01:02:03Z" }],
    },
  });
  assert.doesNotMatch(rendered, /evaluation-run|source=internal|saved-evaluation|Newly assessed|PRIVATE_GENERATED_INSTRUCTION/);
  assert.doesNotMatch(rendered, /assessed-role|source-role/);
  assert.match(rendered, /revision source-revision/);
  assert.match(rendered, /2026-10-30 10:02/);
  assert.ok(!rendered.includes("PRIVATE_DB_SENTINEL"));
  assert.ok(!rendered.includes("T01:02:03Z"));
});

test("follow events without scoring metadata omit internal inventory but preserve external and user-selected references", () => {
  const run: any = {
    id: "run", trigger: "career_company_follow_changed", created_at: "2026-11-04",
    trigger_payload: { instruction: "STALE_DISCOVERY", roleIds: ["unselected-role"],
      sourceEvents: [{ sourceKind: "company_follow", sourceId: "follow", roleIds: ["unselected-role"] }] },
  };
  assert.doesNotMatch(renderCareerBackgroundInvocation(run), /STALE_DISCOVERY|unselected-role/);
  run.trigger_payload.evaluationEvidence = { source: "external" };
  run.trigger_payload.sourceEvents[0].roleSource = "external";
  assert.match(renderCareerBackgroundInvocation(run), /unselected-role/);
  run.trigger = "career_schedule_due";
  run.trigger_payload = { roleIds: ["chosen-role"], instruction: "Prepare the role I chose." };
  assert.match(renderCareerBackgroundInvocation(run), /chosen-role/);
});

// Capture the actual provider request after the common serializer and dynamic
// capability policy have run; no live LLM or mail service is contacted.
for (const model of [DEFAULT_CAREER_TEXT_CHAT_MODEL, CLAUDE_HAIKU_MODEL, GPT_6_LUNA_MODEL]) {
test(`background provider ${model} waits durably and resumes the same model and transcript`, async () => {
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.OPENAI_API_KEY;
  const oldAnthropicKey = process.env.ANTHROPIC_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.ANTHROPIC_API_KEY = "test-key";
  const anthropic = model === CLAUDE_HAIKU_MODEL;
  try {
    const { runCareerChatAssistant } = await import("../llm");
    const tools = ["search_opportunities", "read_matching"].map(name => ({ type: "function" as const, function: { name, description: name, parameters: { type: "object", properties: {} } } }));
    let saved: CareerReplyCheckpoint | undefined, requests = 0;
    const options = {
      mode: "progressive" as const, replyId: "background:owned-run", eligibleTools: tools, preloads: ["opportunities" as const],
      continuation: { channel: "background" as const, backgroundRunId: "owned-run", sourceMessageCursor: 42 },
      promptArgs: () => ({ channel: "chat" as const, backgroundInvocation: true, isOnboardingDone: true, profile: null, structuredProfileText: "Confirmed profile", talentContextSection: "Search Brief: remote", currentPreferences: { preferredLocale: "ko", talentSettingStatus: "passive", recommendationBatchSize: 3 } }),
      checkpoint: async (checkpoint: CareerReplyCheckpoint) => { saved = checkpoint; },
    };
    globalThis.fetch = async (url, init) => {
      if (String(url).includes("/rest/v1/")) return Response.json([]);
      const body = JSON.parse(String(init?.body)); requests++;
      assert.equal(body.model, model);
      if (anthropic) {
        assert.equal(String(url), "https://api.anthropic.com/v1/messages");
        assert.equal(new Headers(init?.headers).get("x-stainless-lang"), "js");
        assert.equal(body.output_config, undefined);
        assert.equal(body.thinking, undefined);
      } else {
        assert.equal(String(url), "https://api.openai.com/v1/responses");
        assert.equal(body.reasoning?.effort ?? body.reasoning_effort, "high");
      }
      const input = body.input ?? body.messages;
      const rendered = JSON.stringify([body.system, input]);
      assert.ok(rendered.includes("Background mode"));
      assert.ok(!rendered.includes("Each message remains visible"));
      assert.ok(!rendered.includes("PRIVATE_DB_SENTINEL"));
      assert.ok(!rendered.includes("현재 기준은 3일마다"));
      assert.ok(!input.some((message: any) => message.role === "user" && typeof message.content === "string"), "a server event must not fabricate a user instruction");
      if (requests === 3) assert.ok(rendered.includes("Evaluation eval-1 queued; read matching match-1 after completion."));
      if (requests === 4) assert.ok(rendered.includes("Matching match-1, revision 2: role-1 evaluated. No recommendation published."));
      const call = requests === 1 ? "load_career_capabilities" : requests === 2 ? "search_opportunities" : "read_matching";
      if (anthropic) return Response.json({ id: `r${requests}`, model, stop_reason: requests < 4 ? "tool_use" : "end_turn",
        content: requests < 4
          ? [{ type: "tool_use", id: `call-${requests}`, name: call, input: requests === 1 ? { capabilities: ["opportunities"] } : {} }]
          : [{ type: "text", text: "No contact needed." }], usage: { input_tokens: 1, output_tokens: 1 } });
      return Response.json({ id: `r${requests}`, model, status: "completed", output: requests < 4
        ? [{ type: "function_call", call_id: `call-${requests}`, name: call, arguments: requests === 1 ? '{"capabilities":["opportunities"]}' : "{}" }]
        : [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "No contact needed." }] }], usage: { input_tokens: 1, output_tokens: 1 } });
    };
    const executed: string[] = [];
    const executeTool = async ({ name }: { name: string }) => {
      executed.push(name);
      return name === "search_opportunities"
        ? { status: "queued", careerContinuation: { kind: "external_evaluation", id: "eval-1" }, nested: { private: "PRIVATE_DB_SENTINEL" }, modelOutput: "Evaluation eval-1 queued; read matching match-1 after completion." }
        : { status: "completed", modelOutput: "Matching match-1, revision 2: role-1 evaluated. No recommendation published." };
    };
    const trace: ToolTraceEvent[] = [];
    const invoke = (runtime: CareerCapabilityRuntime) => {
      const step = runtime.resolveStep(false);
      return withToolTrace(async event => { trace.push(event); }, () => runCareerChatAssistant({ primaryModel: saved ? "claude-sonnet-5-5" : model, anthropicEffort: anthropic ? null : undefined, openAIResponsesReasoningEffort: "high", messages: [], toolRuntime: runtime, tools: step.tools, systemBlocks: step.systemBlocks, executeTool }));
    };
    await assert.rejects(invoke(new CareerCapabilityRuntime(options)), CareerReplyContinuation);
    assert.equal(requests, 2);
    assert.equal(saved?.model, model);
    assert.deepEqual(saved?.waitFor, [{ kind: "external_evaluation", id: "eval-1" }]);
    assert.equal(saved?.continuation?.backgroundRunId, "owned-run");
    assert.equal(await invoke(new CareerCapabilityRuntime({ ...options, resume: saved })), "No contact needed.");
    assert.deepEqual(executed, ["search_opportunities", "read_matching"]);
    assert.deepEqual(trace.filter(event => event.phase === "started").map(event => event.name), ["load_career_capabilities", "search_opportunities", "read_matching"]);
    assert.equal(trace.filter(event => event.phase === "returned").length, 3);
    assert.deepEqual(trace[0].input, { capabilities: ["opportunities"] });
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    if (oldAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldAnthropicKey;
  }
});
}

test("queued child does not wake its parent; completion preserves background delivery ownership", async () => {
  let status = "queued";
  const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { status }, error: null }) };
  const published: unknown[] = [];
  const args = { admin: { from: () => query } as any, userId: "owner", conversationId: "conversation", checkpoint: {
    replyId: "background:run", checkpointId: "saved", waitFor: [{ kind: "external_evaluation", id: "eval-1" }], continuation: { channel: "background", backgroundRunId: "run", textChatModel: "claude-sonnet-5-5" },
  } as CareerReplyCheckpoint, publish: async (job: unknown) => { published.push(job); } };
  assert.deepEqual(await dispatchCareerCheckpoint(args), { waiting: true });
  assert.equal(published.length, 0);
  status = "partial";
  assert.deepEqual(await dispatchCareerCheckpoint(args), { waiting: false });
  assert.deepEqual(published, [{ userId: "owner", conversationId: "conversation", replyId: "background:run", checkpointKey: "saved", backgroundRunId: "run", textChatModel: "claude-sonnet-5-5" }]);
});

test("candidate email requires a trusted background claim and returns new user context without sending", async () => {
  const tool = CAREER_DELIVERY_TOOLS.deliver_career_email;
  await assert.rejects(Promise.resolve().then(() => tool.execute!({ subject: "Subject", body: "Body" }, undefined)), /trusted background invocation/);
  const query: any = { then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: [{ id: 44, content: "오늘은 연락하지 마", created_at: "2026-10-30T01:02:03Z" }], error: null }).then(resolve) };
  for (const key of ["select", "eq", "gt", "order"]) query[key] = () => query;
  const context: any = { admin: { from: (table: string) => { assert.equal(table, "talent_messages"); return query; }, rpc: async (name: string) => { assert.equal(name, "control_career_agent_email"); return { data: null, error: null }; } }, userId: "owner", conversationId: "conversation", backgroundInvocation: { runId: "run", sourceMessageCursor: 42 }, agentClaimId: "claim", resumeRequestId: "reply" };
  const result: any = await tool.execute!({ subject: "Subject", body: "Body" }, context);
  assert.equal(result.status, "context_changed");
  assert.ok(result.modelOutput.includes("오늘은 연락하지 마"));
  assert.ok(result.modelOutput.includes("2026-10-30 10:02"));
  assert.equal(context.backgroundInvocation.sourceMessageCursor, 44);
});
