import assert from "node:assert/strict";
import test from "node:test";
import { CLAUDE_HAIKU_MODEL } from "@/lib/llm/modelConfig";

test("Haiku event replies call Anthropic directly, including tool continuations", async () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.ANTHROPIC_API_KEY;
  const previousOpenAIKey = process.env.OPENAI_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  process.env.OPENAI_API_KEY = "test-openai-key";
  const requests: any[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/rest/v1/")) return Response.json([]);
    assert.equal(String(url), "https://api.anthropic.com/v1/messages");
    assert.equal(new Headers(init?.headers).get("x-api-key"), "test-anthropic-key");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, CLAUDE_HAIKU_MODEL);
    requests.push(body);
    const useTool = requests.length === 2;
    return Response.json({
      id: `haiku-${requests.length}`, model: CLAUDE_HAIKU_MODEL,
      content: useTool
        ? [{ type: "tool_use", id: "read-event", name: "read_document", input: {} }]
        : [{ type: "text", text: "확인한 내용을 기억해 두었어요." }],
      stop_reason: useTool ? "tool_use" : "end_turn",
      usage: { input_tokens: 100, output_tokens: 20 },
    });
  };
  try {
    const { runCareerChatAssistant } = await import("./llm");
    const { getLlmChatProviderForModel } = await import("@/lib/llm/llm");
    assert.equal(getLlmChatProviderForModel(CLAUDE_HAIKU_MODEL), "anthropic");
    let toolCalls = 0;
    for (const withTools of [false, true]) {
      const result = await runCareerChatAssistant({
        primaryModel: CLAUDE_HAIKU_MODEL,
        systemBlocks: [{ key: "event", text: "Report the saved facts to the user." }],
        messages: [{ role: "user", content: "The company interest was saved." }],
        tools: withTools ? [{ type: "function", function: {
          name: "read_document", description: "Read saved facts.", parameters: { type: "object" },
        } }] : [],
        executeTool: async () => { toolCalls += 1; return { ok: true, content: "Company interest is saved." }; },
        usageLabel: "test:haiku-event-reply",
      });
      assert.equal(result, "확인한 내용을 기억해 두었어요.");
    }
    assert.equal(requests.length, 3);
    assert.equal(toolCalls, 1);
    assert.ok(requests[2].messages.some((message: any) =>
      Array.isArray(message.content) && message.content.some((block: any) => block.type === "tool_result")));
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
    if (previousOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAIKey;
  }
});
