import assert from "node:assert/strict";
import test from "node:test";
import { CareerCapabilityRuntime, CareerReplyContinuation, type CareerReplyCheckpoint } from "./runtime";
import { CAREER_CAPABILITY_LOADER } from "./registry";
import { CAREER_HANDBOOK_LOADER, findCareerHandbook } from "../handbooks/registry";
import { APPLICATION_HANDBOOK } from "../handbooks/application";
import { buildCareerMainPrompt } from "../prompts/mainPrompts";
import { buildCareerOpportunityFeedbackFollowUpTurnInstruction } from "../prompts/cases/lifecyclePrompts";

test("provider receives shared connection guidance before opportunity tools load and after another capability loads", async () => {
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const { runCareerChatAssistant } = await import("../llm");
    for (const preloads of [[], ["documents"], ["opportunities"]] as const) {
      const runtime = new CareerCapabilityRuntime({ mode: "progressive", preloads: [...preloads],
        eligibleTools: ["read_recommended_opportunities", "read_document"].map(name => ({ type: "function" as const,
          function: { name, description: name, parameters: { type: "object", properties: {} } } })),
        promptArgs: () => ({ channel: "chat", isOnboardingDone: true, profile: null,
          structuredProfileText: "Confirmed candidate experience", talentContextSection: "",
          runtimeInstruction: buildCareerOpportunityFeedbackFollowUpTurnInstruction({ preferredLocale: "ko", trigger: "immediate_internal_feedback" }),
        }),
      });
      const step = runtime.resolveStep(false);
      assert.equal(step.offeredNames.has("read_recommended_opportunities"), preloads.some(id => id === "opportunities"));
      let requests = 0;
      globalThis.fetch = async (url, init) => {
        assert.ok(String(url).includes("api.openai.com"));
        const body = JSON.parse(String(init?.body));
        const system = (body.input ?? body.messages).filter((message: any) => ["system", "developer"].includes(message.role))
          .map((message: any) => typeof message.content === "string" ? message.content : message.content.map((block: any) => block.text).join("\n")).join("\n");
        assert.equal(system.split(buildCareerMainPrompt({ outputLanguage: "English", positionsTabLabel: "New opportunities" })).length - 1, 1);
        assert.ok(system.includes("Career turn after a saved opportunity decision"));
        requests++;
        return Response.json({ id: "connection-guide", model: "gpt-6.1-sol", status: "completed",
          output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "확인했습니다." }] }], usage: { input_tokens: 1, output_tokens: 1 } });
      };
      await runCareerChatAssistant({ primaryModel: "gpt-6.1-sol", toolRuntime: runtime, tools: step.tools, systemBlocks: step.systemBlocks,
        messages: [{ role: "user", content: "Continue the user's delegated work using the new execution result supplied in the runtime context." }],
        usageLabel: "test:connection-guide-before-loading", executeTool: async () => { throw new Error("No external execution expected"); },
      });
      assert.equal(requests, 1);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
  }
});

const sse = (events: unknown[]) => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });

test("a saved chat transcript keeps its transport when native Anthropic credentials become available", async () => {
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.ANTHROPIC_API_KEY;
  const oldOpenAI = process.env.OPENAI_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const { runCareerChatAssistant, runCareerChatAssistantStream } = await import("../llm");
    for (const streaming of [false, true]) {
      const options = {
        replyId: "saved-chat", mode: "progressive" as const, eligibleTools: [],
        promptArgs: () => ({ channel: "chat" as const, isOnboardingDone: true, profile: null, structuredProfileText: "Profile", talentContextSection: "" }),
      };
      const original = new CareerCapabilityRuntime(options);
      const step = original.resolveStep(false);
      const resume: CareerReplyCheckpoint = {
        version: 1, checkpointId: "checkpoint", replyId: "saved-chat", transport: "chat", model: "claude-haiku-5-5",
        messages: [{ role: "user", content: "Continue from the saved transcript." }, { role: "assistant", content: "Previously completed document read" }],
        systemBlocks: step.systemBlocks, tools: step.tools, capabilityIds: [], handbooks: [], record: { ...original.completedRecord(), status: "in_progress" },
      };
      const runtime = new CareerCapabilityRuntime({ ...options, resume });
      let requests = 0;
      globalThis.fetch = async (url, init) => {
        if (String(url).includes("/rest/v1/")) return Response.json([]);
        requests++;
        const body = JSON.parse(String(init?.body));
        assert.equal(body.model, "claude-haiku-5-5");
        assert.ok(JSON.stringify(body).includes("Previously completed document read"));
        return body.stream ? sse([
          { id: "continued", choices: [{ index: 0, delta: { content: "이어 완료했습니다." }, finish_reason: null }] },
          { id: "continued", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
        ]) : Response.json({ id: "continued", model: body.model, choices: [{ message: { role: "assistant", content: "이어 완료했습니다." }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
      };
      const args = { primaryModel: "gpt-6.1-sol", toolRuntime: runtime, systemBlocks: step.systemBlocks, tools: step.tools,
        messages: [{ role: "user" as const, content: "A fresh invocation must not replace the transcript." }],
        executeTool: async () => { throw new Error("No completed work should repeat"); }, usageLabel: "test:transport-continuation" };
      const result = streaming ? await runCareerChatAssistantStream({ ...args, onTextDelta: () => {} }) : await runCareerChatAssistant(args);
      assert.equal(result, "이어 완료했습니다.");
      assert.equal(requests, 1);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldKey;
    if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldOpenAI;
  }
});

test("provider system prompts use the single application source for new and carried leases", async () => {
  const originalFetch = globalThis.fetch;
  const oldOpenAI = process.env.OPENAI_API_KEY, oldAnthropic = process.env.ANTHROPIC_API_KEY;
  process.env.OPENAI_API_KEY = "test-key"; process.env.ANTHROPIC_API_KEY = "test-key";
  try {
    const { runCareerChatAssistant } = await import("../llm");
    for (const native of [false, true]) for (const carried of [false, true]) {
      const model = native ? "claude-haiku-5-5" : "gpt-6.1-sol";
      const runtime = new CareerCapabilityRuntime({
        mode: "progressive", eligibleTools: [{ type: "function", function: { name: "read_talent_context", description: "Read context", parameters: { type: "object", properties: {} } } }],
        handbooks: carried ? [{ id: "application", version: "2026-10-29-v1", remainingReplies: 2 }] : [],
        selection: { capabilityIds: [], handbookIds: ["application"], status: "selected", elapsedMs: 0 },
        promptArgs: () => ({ channel: "chat", isOnboardingDone: true, profile: null, structuredProfileText: "Profile", talentContextSection: "" }),
      });
      let requests = 0;
      globalThis.fetch = async (url, init) => {
        assert.ok(String(url).includes(native ? "api.anthropic.com" : "api.openai.com"));
        const body = JSON.parse(String(init?.body));
        requests++;
        const system = native ? body.system.map((block: any) => block.text).join("\n")
          : (body.input ?? body.messages).filter((message: any) => ["system", "developer"].includes(message.role)).map((message: any) => typeof message.content === "string" ? message.content : message.content.map((block: any) => block.text).join("\n")).join("\n");
        const expected = APPLICATION_HANDBOOK;
        assert.equal(system.split(expected).length - 1, 1);
        return native ? Response.json({ id: "handbook-version", model, content: [{ type: "text", text: "확인했습니다." }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } })
          : Response.json({ id: "handbook-version", model, status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "확인했습니다." }] }], usage: { input_tokens: 1, output_tokens: 1 } });
      };
      const step = runtime.resolveStep(false);
      await runCareerChatAssistant({ primaryModel: model, toolRuntime: runtime, tools: step.tools, systemBlocks: step.systemBlocks,
        messages: [{ role: "user", content: "이 지원을 이어가 줘." }], usageLabel: "test:application-handbook-version",
        executeTool: async () => { throw new Error("This check requires no external tool execution"); },
      });
      assert.equal(requests, 1);
      assert.equal(runtime.handbooks.afterDeliveredReply()[0].remainingReplies, carried ? 1 : 2);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldOpenAI;
    if (oldAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldAnthropic;
  }
});

test("actual provider requests include handbook once after loading and receive dedicated tool result text", async () => {
  const originalFetch = globalThis.fetch;
  const originalKeys = [process.env.OPENAI_API_KEY, process.env.ANTHROPIC_API_KEY];
  process.env.OPENAI_API_KEY = "test-key"; process.env.ANTHROPIC_API_KEY = "test-key";
  try {
    const { runCareerChatAssistant, runCareerChatAssistantStream } = await import("../llm");
    for (const native of [false, true]) for (const streaming of [false, true]) {
      const model = native ? "claude-sonnet-4-6" : "gpt-6.1-sol";
      const tools = ["read_talent_context", "read_document"].map(name => ({ type: "function" as const,
        function: { name, description: name, parameters: { type: "object", properties: {} } } }));
      const runtime = new CareerCapabilityRuntime({ mode: "progressive", eligibleTools: tools,
        promptArgs: () => ({ channel: "chat", isOnboardingDone: true, profile: null, structuredProfileText: "Profile", talentContextSection: "", currentPreferences: { preferredLocale: "ko" } }) });
      const initial = runtime.resolveStep(false);
      let requests = 0;
      const executed: string[] = [], shown: string[] = [];
      globalThis.fetch = async (url, init) => {
        if (String(url).includes("/rest/v1/")) return Response.json([]);
        const body = JSON.parse(String(init?.body));
        requests++;
        assert.ok(requests <= 3);
        const system = native ? body.system.map((block: any) => block.text).join("\n")
          : (body.input ?? body.messages).filter((message: any) => ["system", "developer"].includes(message.role)).map((message: any) => typeof message.content === "string" ? message.content : message.content.map((block: any) => block.text).join("\n")).join("\n");
        const handbook = findCareerHandbook("resume")!.body;
        assert.equal(system.split(handbook).length - 1, requests === 1 ? 0 : 1, `${native}/${streaming}/${requests}`);
        if (requests === 3) {
          assert.ok(JSON.stringify(body).includes("Owned document doc-exact, revision 4. Verified content."));
          assert.ok(!JSON.stringify(body).includes("PRIVATE_NESTED_SENTINEL"));
        }
        const calls = requests === 1 ? [
          { id: "load-capability", name: CAREER_CAPABILITY_LOADER, input: { capabilityIds: ["documents"] } },
          { id: "load-handbook", name: CAREER_HANDBOOK_LOADER, input: { handbook_ids: ["resume"] } },
        ] : requests === 2 ? [{ id: "read", name: "read_document", input: { document_id: "doc-exact" } }] : [];
        if (native) {
          const content = requests === 3 ? [{ type: "text", text: "완료" }] : calls.map(call => ({ type: "tool_use", ...call }));
          const response = { id: `m${requests}`, model, content, stop_reason: calls.length ? "tool_use" : "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };
          return streaming ? sse([
            { type: "message_start", message: response },
            ...content.flatMap((block, index) => [{ type: "content_block_start", index, content_block: block }, { type: "content_block_stop", index }]),
            { type: "message_delta", delta: { stop_reason: response.stop_reason }, usage: { output_tokens: 1 } }, { type: "message_stop" },
          ]) : Response.json(response);
        }
        const response = { id: `r${requests}`, model, status: "completed", output: requests === 3
          ? [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "완료" }] }]
          : calls.map(call => ({ type: "function_call", call_id: call.id, name: call.name, arguments: JSON.stringify(call.input) })), usage: { input_tokens: 1, output_tokens: 1 } };
        return streaming ? sse([{ type: "response.completed", response }]) : Response.json(response);
      };
      const args = { primaryModel: model, toolRuntime: runtime, tools: initial.tools, systemBlocks: initial.systemBlocks,
        messages: [{ role: "user" as const, content: "이력서를 읽고 수정해줘." }], usageLabel: "test:career-handbook-projection",
        executeTool: async ({ name }: { name: string }) => { executed.push(name); return {
          ok: true, modelOutput: "Owned document doc-exact, revision 4. Verified content.", nested: { hidden: "PRIVATE_NESTED_SENTINEL" },
        }; },
        onToolStart: ({ name }: { name: string }) => { shown.push(name); }, onTextDelta: () => {},
      };
      assert.equal(await (streaming ? runCareerChatAssistantStream(args) : runCareerChatAssistant(args)), "완료");
      assert.deepEqual(executed, ["read_document"]);
      assert.deepEqual(shown, ["read_document"]);
      assert.equal(runtime.handbooks.afterDeliveredReply()[0].remainingReplies, 2);
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [index, key] of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"].entries()) {
      if (originalKeys[index] === undefined) delete process.env[key]; else process.env[key] = originalKeys[index];
    }
  }
});

test("provider deadline resumes the saved transcript without repeating a completed tool", async () => {
  const originalFetch = globalThis.fetch;
  const oldOpenAI = process.env.OPENAI_API_KEY, oldAnthropic = process.env.ANTHROPIC_API_KEY;
  process.env.OPENAI_API_KEY = "test-key"; process.env.ANTHROPIC_API_KEY = "test-key";
  try {
    const { runCareerChatAssistant } = await import("../llm");
    for (const native of [false, true]) {
      const model = native ? "claude-sonnet-4-6" : "gpt-6.1-sol";
      let requests = 0, executions = 0, saved: CareerReplyCheckpoint | undefined;
      const options = {
        replyId: "message:41", mode: "progressive" as const,
        preloads: ["documents" as const],
        eligibleTools: [{ type: "function" as const, function: { name: "read_document", description: "read", parameters: { type: "object", properties: {} } } }],
        promptArgs: () => ({ channel: "chat" as const, isOnboardingDone: true, profile: null, structuredProfileText: "Profile", talentContextSection: "", currentPreferences: { preferredLocale: "ko" } }),
      };
      globalThis.fetch = async (url, init) => {
        if (String(url).includes("/rest/v1/")) return Response.json([]);
        requests++;
        const body = JSON.parse(String(init?.body));
        if (requests === 2) {
          assert.ok(init?.signal);
          return new Promise<Response>((_resolve, reject) => {
            const keepAlive = setTimeout(() => reject(new Error("Deadline did not interrupt provider")), 1000);
            init!.signal!.addEventListener("abort", () => { clearTimeout(keepAlive); reject(init!.signal!.reason); }, { once: true });
          });
        }
        if (requests === 3) {
          assert.equal(body.model, model, "resume keeps the saved provider model");
          assert.ok(JSON.stringify(body).includes("Previously completed document read"));
        }
        const done = requests === 3;
        if (native) return Response.json({ id: `m${requests}`, model,
          content: done ? [{ type: "text", text: "이어 완료했습니다." }] : [{ type: "tool_use", id: "read-once", name: "read_document", input: {} }],
          stop_reason: done ? "end_turn" : "tool_use", usage: { input_tokens: 1, output_tokens: 1 },
        });
        return Response.json({ id: `r${requests}`, model, status: "completed", output: done
          ? [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "이어 완료했습니다." }] }]
          : [{ type: "function_call", call_id: "read-once", name: "read_document", arguments: "{}" }], usage: { input_tokens: 1, output_tokens: 1 } });
      };
      const run = (runtime: CareerCapabilityRuntime, primaryModel: string) => {
        const step = runtime.resolveStep(false);
        return runCareerChatAssistant({ primaryModel, toolRuntime: runtime, systemBlocks: step.systemBlocks, tools: step.tools,
          messages: [{ role: "user", content: "문서를 읽어줘." }], usageLabel: "test:career-checkpoint",
          executeTool: async () => { executions++; return { ok: true, modelOutput: "Previously completed document read" }; },
        });
      };
      const first = new CareerCapabilityRuntime({ ...options, deadlineAt: Date.now() + 100, checkpoint: async checkpoint => { saved = checkpoint; } });
      await assert.rejects(run(first, model), CareerReplyContinuation);
      assert.ok(saved);
      assert.equal(executions, 1);
      const continued = new CareerCapabilityRuntime({ ...options, resume: saved });
      assert.equal(await run(continued, native ? "gpt-6.1-sol" : "claude-sonnet-4-6"), "이어 완료했습니다.");
      assert.equal(executions, 1);
      assert.equal(requests, 3);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldOpenAI;
    if (oldAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldAnthropic;
  }
});
