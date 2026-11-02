import assert from "node:assert/strict";
import test from "node:test";
process.env.OPENAI_API_KEY ||= "test-key";
process.env.ANTHROPIC_API_KEY ||= "test-key";

for (const model of ["gpt-6-luna", "claude-sonnet-4-6"]) {
  test(`${model} saves intermediate prose before tools without streaming`, async () => {
    const { client } = await import("@/lib/llm/llm");
    const { runCareerChatAssistant } = await import("./llm");
    const prototype = Object.getPrototypeOf(client.responses);
    const originalCreate = prototype.create;
    const originalFetch = globalThis.fetch;
    let step = 0;
    const next = () => ({ text: ++step === 1 ? "지원 내용을 확인할게요." : "질문을 준비했어요.", tool: step === 1 });
    prototype.create = async () => {
      const item = next();
      return { id: `response-${step}`, model, status: "completed",
        output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: item.text }] },
          ...(item.tool ? [{ type: "function_call", id: "read", call_id: "read", name: "read_context", arguments: "{}" }] : [])],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
    };
    globalThis.fetch = async (input) => {
      if (!String(input).includes("api.anthropic.com")) return Response.json([]);
      const item = next();
      return Response.json({ id: `response-${step}`, model, type: "message", role: "assistant",
        content: [{ type: "text", text: item.text }, ...(item.tool ? [{ type: "tool_use", id: "read", name: "read_context", input: {} }] : [])],
        stop_reason: item.tool ? "tool_use" : "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
    };
    const order: string[] = [];
    try {
      const result = await runCareerChatAssistant({ primaryModel: model,
        messages: [{ role: "user", content: "지원 준비해줘" }], systemBlocks: [{ text: "Read context as needed." }],
        tools: [{ type: "function", function: { name: "read_context", description: "Read", parameters: { type: "object", properties: {} } } }],
        onAssistantMessage: async text => { order.push(`message:${text}`); },
        executeTool: async () => { order.push("tool"); return { modelOutput: "Context available." }; },
      });
      assert.deepEqual(order, ["message:지원 내용을 확인할게요.", "tool"]);
      assert.equal(result, "질문을 준비했어요.");
    } finally {
      prototype.create = originalCreate;
      globalThis.fetch = originalFetch;
    }
  });
}
