import assert from "node:assert/strict";
import test from "node:test";
import {
  SOL_CHAT_PRESETS,
  GPT_61_SOL_MODEL,
  GPT_61_SOL_ULTRAFAST_MODEL,
} from "@/lib/llm/modelConfig";
import { getLlmModelPricing } from "@/lib/llm/pricing";
import { toChatCompletionFromOpenAIResponse } from "@/lib/llm/responsesChatAdapter";
import { logLlmUsageToConsole } from "@/lib/llm/usageLogging";
import {
  careerTextAssistantModelOptions,
  readCareerSourceTextChatModel,
  resolveCareerTextChatModelForRequest,
} from "./textChatModelConfig";

process.env.OPENAI_API_KEY ||= "test-openai-key";

for (const preset of SOL_CHAT_PRESETS) {
  test(`Career ${preset.label} survives saved selection and tool follow-ups in both transports`, async () => {
    const [{ client }, { runTalentAssistantToolLoop }] = await Promise.all([
      import("@/lib/llm/llm"),
      import("@/lib/talentOnboarding/llm"),
    ]);
    const selected = resolveCareerTextChatModelForRequest(
      preset.id,
      true
    );
    const restored = readCareerSourceTextChatModel({
      careerTextChatModel: selected.model,
    });
    assert.ok(restored);
    const { primaryModel, openAIResponsesReasoningEffort } =
      careerTextAssistantModelOptions(restored.model);
    const prototype = Object.getPrototypeOf(client.responses);
    const originalCreate = prototype.create;

    try {
      for (const streaming of [false, true]) {
        const requests: Record<string, any>[] = [];
        const deltas: string[] = [];
        prototype.create = async (body: Record<string, any>) => {
          requests.push(body);
          const response = {
            id: `response-${requests.length}`,
            model: GPT_61_SOL_MODEL,
            service_tier: requests[0].service_tier ?? "default",
            status: "completed",
            output:
              requests.length === 1
                ? [
                    { type: "reasoning", encrypted_content: "opaque" },
                    {
                      type: "function_call",
                      name: "read_context",
                      call_id: "read-1",
                      arguments: "{}",
                    },
                  ]
                : [
                    {
                      type: "message",
                      role: "assistant",
                      content: [{ type: "output_text", text: "확인했어요." }],
                    },
                  ],
          };
          if (!streaming) return response;
          return (async function* () {
            if (requests.length > 1)
              yield { type: "response.output_text.delta", delta: "확인했어요." };
            yield { type: "response.completed", response };
          })();
        };

        const result = await runTalentAssistantToolLoop({
          modelConfig: { primaryModel },
          openAIResponsesReasoningEffort,
          messages: [{ role: "user", content: "저장된 내용을 확인해줘." }],
          tools: [
            {
              type: "function",
              function: {
                name: "read_context",
                description: "Read saved context.",
                parameters: { type: "object", properties: {} },
              },
            },
          ],
          executeTool: async () => "Preferred location: Seoul",
          ...(streaming
            ? {
                onTextDelta: (delta: string) => {
                  deltas.push(delta);
                },
              }
            : {}),
        });

        assert.equal(result, "확인했어요.");
        assert.equal(requests.length, 2);
        for (const request of requests) {
          assert.equal(request.model, GPT_61_SOL_MODEL);
          assert.equal(request.service_tier, preset.tierModel === GPT_61_SOL_ULTRAFAST_MODEL ? "ultrafast" : undefined);
          assert.deepEqual(request.reasoning, { effort: preset.effort });
          assert.equal(Boolean(request.stream), streaming);
        }
        assert.ok(
          requests[1].input.some(
            (item: any) =>
              item.type === "function_call_output" && item.call_id === "read-1"
          )
        );
        assert.ok(
          requests[1].input.some(
            (item: any) =>
              item.type === "reasoning" && item.encrypted_content === "opaque"
          )
        );
        if (streaming) assert.deepEqual(deltas, ["확인했어요."]);
      }
    } finally {
      prototype.create = originalCreate;
    }
  });
}

test("Ultrafast cost estimates do not fall back to standard Sol pricing", () => {
  const price = getLlmModelPricing(GPT_61_SOL_ULTRAFAST_MODEL);
  assert.equal(price?.pricingTier, "ultrafast");
  assert.equal(price?.inputUsdPerMtok, 12);
  assert.equal(price?.outputUsdPerMtok, 60);
  assert.equal(price?.longContextOutputUsdPerMtok, 90);
  assert.equal(getLlmModelPricing(GPT_61_SOL_MODEL)?.outputUsdPerMtok, 10);
});

test("usage receipts price the returned service tier while keeping the actual model", (t) => {
  const logs: any[] = [];
  t.mock.method(console, "log", (_: string, json: string) =>
    logs.push(JSON.parse(json))
  );
  for (const service_tier of ["ultrafast", "default"]) {
    logLlmUsageToConsole({
      model: GPT_61_SOL_ULTRAFAST_MODEL,
      response: toChatCompletionFromOpenAIResponse({
        model: GPT_61_SOL_MODEL,
        service_tier,
        output: [],
        usage: { input_tokens: 1000, output_tokens: 100 },
      }),
    });
  }
  assert.deepEqual(
    logs.map((log) => log.estimatedCostUsd),
    [0.018, 0.003]
  );
  assert.equal(logs[0].model, GPT_61_SOL_MODEL);
  assert.equal(logs[0].costBreakdown.pricingTier, "ultrafast");
  assert.equal(logs[1].costBreakdown.pricingTier, null);
});
