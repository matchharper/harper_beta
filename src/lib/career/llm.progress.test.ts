import assert from "node:assert/strict";
import test from "node:test";

process.env.OPENAI_API_KEY ||= "test-key";
process.env.ANTHROPIC_API_KEY ||= "test-key";

for (const model of ["gpt-6-luna", "claude-sonnet-4-6"]) {
  for (const terminal of [false, true]) {
    test(`${model} commits tool-step messages in order before execution${terminal ? " and preserves the last one at a question handoff" : " including a failed tool"}`, async () => {
      const { client } = await import("@/lib/llm/llm");
      const { runCareerChatAssistantStream } = await import("./llm");
      const prototype = Object.getPrototypeOf(client.responses);
      const originalCreate = prototype.create;
      const originalFetch = globalThis.fetch;
      let step = 0;
      const requests: any[] = [];
      const next = () => {
        step++;
        return { text: ["이력서를 확인할게요.", "경험을 확인했어요. 지원 항목도 살펴볼게요.", "추가 자료에는 접근하지 못했어요."][step - 1],
          tool: step < 3, id: `read-${step}` };
      };
      prototype.create = async (body: any) => {
        requests.push(body);
        const item = next();
        return (async function* () {
          yield { type: "response.output_text.delta", delta: item.text };
          yield { type: "response.completed", response: { id: `response-${step}`, model, status: "completed",
            output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: item.text }] },
              ...(item.tool ? [{ type: "function_call", id: item.id, call_id: item.id, name: "read_context", arguments: "{}" }] : [])],
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } };
        })();
      };
      globalThis.fetch = async (_input, init) => {
        if (!String(_input).includes("api.anthropic.com")) return Response.json([]);
        requests.push(JSON.parse(String(init?.body)));
        const item = next();
        const events = [
          { type: "message_start", message: { id: `response-${step}`, model, usage: { input_tokens: 1 } } },
          { type: "content_block_start", index: 0, content_block: { type: "text", text: item.text } },
          { type: "content_block_stop", index: 0 },
          ...(item.tool ? [
            { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: item.id, name: "read_context", input: {} } },
            { type: "content_block_stop", index: 1 },
          ] : []),
          { type: "message_delta", delta: { stop_reason: item.tool ? "tool_use" : "end_turn" }, usage: { output_tokens: 1 } },
          { type: "message_stop" },
        ];
        return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), {
          headers: { "Content-Type": "text/event-stream" },
        });
      };
      const order: string[] = [];
      let live = "";
      try {
        const result = await runCareerChatAssistantStream({
          primaryModel: model, usageLabel: "test:career-progress", messages: [{ role: "user", content: "이력서와 지원 항목을 확인해줘" }],
          systemBlocks: [{ text: "Read the context as needed." }],
          tools: [{ type: "function", function: { name: "read_context", description: "Read context", parameters: { type: "object", properties: {} } } }],
          onTextDelta: delta => { live += delta; },
          onAssistantMessage: async text => {
            assert.equal(live, text);
            await Promise.resolve();
            order.push(`message:${text}`);
            live = "";
          },
          executeTool: async () => {
            order.push(`tool:${step}`);
            if (terminal) return { awaitingUserInput: true };
            if (step === 2) throw new Error("Source unavailable");
            return { modelOutput: "이력서: 검색 모델 평가 경험이 있습니다." };
          },
        });
        assert.deepEqual(order, terminal
          ? ["message:이력서를 확인할게요.", "tool:1"]
          : ["message:이력서를 확인할게요.", "tool:1", "message:경험을 확인했어요. 지원 항목도 살펴볼게요.", "tool:2"]);
        assert.equal(result, terminal ? "" : "추가 자료에는 접근하지 못했어요.");
        assert.equal(live, result);
        assert.equal(requests.length, terminal ? 1 : 3);
      } finally {
        prototype.create = originalCreate;
        globalThis.fetch = originalFetch;
      }
    });
  }
}
