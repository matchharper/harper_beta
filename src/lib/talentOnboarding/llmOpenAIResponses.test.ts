import assert from "node:assert/strict";
import test from "node:test";

process.env.OPENAI_API_KEY ||= "test-openai-key";

test("runs talent completions through Luna with high reasoning and JSON mode", async () => {
  const [{ client }, { runTalentAssistantCompletion }] = await Promise.all([
    import("@/lib/llm/llm"),
    import("./llm"),
  ]);
  const responses = client.responses as any;
  const originalCreate = responses.create;
  let receivedBody: Record<string, any> | null = null;
  responses.create = async (body: Record<string, any>) => {
    receivedBody = body;
    return {
      model: "gpt-5.6-luna",
      output: [
        {
          content: [{ text: '{"selected":[]}', type: "output_text" }],
          type: "message",
        },
      ],
      status: "completed",
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    };
  };

  try {
    const result = await runTalentAssistantCompletion({
      jsonMode: true,
      messages: [{ content: "Return JSON", role: "user" }],
      openAIResponsesReasoningEffort: "high",
      primaryModel: "gpt-5.6-luna",
      usageLabel: "test:talent-luna-high",
    });

    assert.equal(result, '{"selected":[]}');
    assert.ok(receivedBody);
    const requestBody = receivedBody as unknown as Record<string, any>;
    assert.deepEqual(requestBody.reasoning, { effort: "high" });
    assert.deepEqual(requestBody.text, {
      format: { type: "json_object" },
    });
  } finally {
    responses.create = originalCreate;
  }
});
