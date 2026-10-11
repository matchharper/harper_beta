import assert from "node:assert/strict";
import test from "node:test";
import { CareerCapabilityRuntime } from "./runtime";
import {
  getLlmUsageContext,
  withLlmUsageContext,
  setCareerCapabilityUsageStep,
} from "@/lib/llm/usageContext";

test("usage attribution remains isolated between concurrent user turns", async () => {
  const run = (userId: string, delay: number) =>
    withLlmUsageContext({ userId, requestId: userId }, async () => {
      setCareerCapabilityUsageStep({ mode: "progressive", step: delay });
      await new Promise((resolve) => setTimeout(resolve, delay));
      assert.equal(getLlmUsageContext()?.userId, userId);
      assert.equal(getLlmUsageContext()?.careerCapability?.step, delay);
    });
  await Promise.all([run("first", 10), run("second", 1)]);
  assert.equal(getLlmUsageContext(), undefined);
});

test("provider failure after a successful write recovers tool-free from results, never replays the write", async () => {
  const originalFetch = globalThis.fetch;
  let handler: typeof fetch;
  globalThis.fetch = (...args) => handler(...args);
  const previous = [process.env.ANTHROPIC_API_KEY, process.env.OPENAI_API_KEY];
  process.env.ANTHROPIC_API_KEY = process.env.OPENAI_API_KEY = "test-key";
  try {
    const { runCareerChatAssistant, runCareerChatAssistantStream } =
      await import("../llm");
    for (const stream of [false, true]) {
      let native = 0,
        writes = 0,
        recovery = 0;
      const tools = [
        {
          type: "function" as const,
          function: {
            name: "write_talent_context",
            description: "Save context",
            parameters: { type: "object", properties: {} },
          },
        },
      ];
      const runtime = new CareerCapabilityRuntime({
        mode: "progressive",
        eligibleTools: tools,
        promptArgs: () => ({
          channel: "chat",
          isOnboardingDone: true,
          profile: null,
          structuredProfileText: "",
          talentContextSection: "",
        }),
      });
      const step = runtime.resolveStep(false);
      handler = async (url, init) => {
        if (String(url).includes("/rest/v1/")) return Response.json([]);
        const body = JSON.parse(String(init?.body));
        if (String(url).includes("api.anthropic.com")) {
          native++;
          if (native > 1)
            return Response.json(
              { error: "synthetic provider failure" },
              { status: 500 }
            );
          const block = {
            type: "tool_use",
            id: "write-1",
            name: "write_talent_context",
            input: {},
          };
          if (!stream)
            return Response.json({
              content: [block],
              stop_reason: "tool_use",
              usage: { input_tokens: 1, output_tokens: 1 },
            });
          return new Response(
            [
              { type: "content_block_start", index: 0, content_block: block },
              { type: "content_block_stop", index: 0 },
              {
                type: "message_delta",
                delta: { stop_reason: "tool_use" },
                usage: { output_tokens: 1 },
              },
              { type: "message_stop" },
            ]
              .map((event) => `data: ${JSON.stringify(event)}\n\n`)
              .join(""),
            { headers: { "Content-Type": "text/event-stream" } }
          );
        }
        recovery++;
        assert.equal(body.tools?.length ?? 0, 0);
        assert.ok(JSON.stringify(body).includes("saved-fact-1"));
        return Response.json({
          id: "recovered",
          status: "completed",
          model: "gpt-5.6-terra",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                { type: "output_text", text: "저장한 조건을 반영했어요." },
              ],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        });
      };
      const args = {
        modelConfig: {
          primaryModel: "claude-sonnet-4-6",
          fallbackModel: "gpt-5.6-terra",
          anthropicOverloadFallbackModel: "gpt-5.6-terra",
        },
        messages: [{ role: "user" as const, content: "이 조건을 기억해 줘." }],
        tools: step.tools,
        systemBlocks: step.systemBlocks,
        toolRuntime: runtime,
        executeTool: async () => {
          writes++;
          return { ok: true, saved: "saved-fact-1" };
        },
        onTextDelta: () => {},
        usageLabel: "test:career-recovery",
      };
      assert.equal(
        await (stream
          ? runCareerChatAssistantStream(args)
          : runCareerChatAssistant(args)),
        "저장한 조건을 반영했어요."
      );
      assert.equal(writes, 1);
      assert.equal(recovery, 1);
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [i, key] of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"].entries())
      previous[i] === undefined
        ? delete process.env[key]
        : (process.env[key] = previous[i]);
  }
});
