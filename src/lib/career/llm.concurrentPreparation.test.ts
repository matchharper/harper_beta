import assert from "node:assert/strict";
import test from "node:test";

const sse = (events: unknown[]) =>
  new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });

test("one reply's preparation runs for different applications start together and return in call order", async () => {
  const originalFetch = globalThis.fetch;
  // llm.ts builds both providers' clients when it loads, so both keys must exist (the requests themselves are mocked).
  const keys = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"] as const;
  const previousKeys = keys.map((key) => process.env[key]);
  for (const key of keys) process.env[key] = "test-key";
  let mockFetch: typeof fetch = async () => { throw new Error("Unexpected test request"); };
  globalThis.fetch = (...args) => mockFetch(...args);
  try {
    const { runCareerChatAssistant, runCareerChatAssistantStream } = await import("./llm");
    for (const streaming of [false, true]) {
      const calls = [
        { id: "prepare-a", name: "use_browser", input: { action: "run", mode: "prepare", task: "Read form A", role_refs: ["role-a"] } },
        { id: "prepare-b", name: "use_browser", input: { action: "run", mode: "prepare", task: "Read form B", role_refs: ["role-b"] } },
      ];
      let requests = 0;
      let deliveredOrder: string[] = [];
      mockFetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        requests++;
        const final = requests > 1;
        if (final) {
          const last = body.messages.at(-1);
          deliveredOrder = (Array.isArray(last?.content) ? last.content : []).filter((block: any) => block.type === "tool_result").map((block: any) => block.tool_use_id);
        }
        const content = final ? [{ type: "text", text: "done" }] : calls.map((call) => ({ type: "tool_use", ...call }));
        if (!streaming) return Response.json({ id: `msg-${requests}`, content, stop_reason: final ? "end_turn" : "tool_use", usage: { input_tokens: 1, output_tokens: 1 } });
        return sse([
          { type: "message_start", message: { id: `msg-${requests}`, model: "claude-sonnet-4-6", usage: { input_tokens: 1, output_tokens: 0 } } },
          ...content.flatMap((block, index) => [{ type: "content_block_start", index, content_block: block }, { type: "content_block_stop", index }]),
          { type: "message_delta", delta: { stop_reason: final ? "end_turn" : "tool_use" }, usage: { output_tokens: 1 } },
          { type: "message_stop" },
        ]);
      };
      const started: string[] = [];
      let releaseFirst!: () => void;
      const secondStarted = new Promise<void>((resolve) => { releaseFirst = resolve; });
      let overlapped = false;
      const args = {
        primaryModel: "claude-sonnet-4-6",
        messages: [{ role: "user" as const, content: "Prepare both applications." }],
        systemBlocks: [{ key: "tool_policy", text: "Use available tools." }],
        tools: [{ type: "function" as const, function: { name: "use_browser", description: "use_browser", parameters: { type: "object", properties: {} } } }],
        executeTool: async ({ callId = "" }: { callId?: string; name: string; input: Record<string, unknown> }) => {
          started.push(callId);
          if (callId === "prepare-b") releaseFirst();
          if (callId === "prepare-a") {
            // The first preparation finishes only after the second has started; one at a time would time out here.
            overlapped = await Promise.race([secondStarted.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1_000))]);
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          return { ok: true, modelOutput: `${callId} read` };
        },
        onTextDelta: () => {},
        usageLabel: "test:career-concurrent-preparation",
      };
      const result = await (streaming ? runCareerChatAssistantStream(args) : runCareerChatAssistant(args));
      const label = `streaming=${streaming}`;
      assert.equal(result, "done", label);
      assert.deepEqual(started, ["prepare-a", "prepare-b"], label);
      assert.equal(overlapped, true, `${label}: both preparations were running at once`);
      assert.deepEqual(deliveredOrder, ["prepare-a", "prepare-b"], `${label}: results keep call order`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => {
      const previous = previousKeys[index];
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
});
