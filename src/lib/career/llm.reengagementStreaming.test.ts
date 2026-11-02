import assert from "node:assert/strict";
import test from "node:test";

test("native provider fallback preserves incremental text and progress commits", async (t) => {
  process.env.OPENAI_API_KEY ||= "fixture-key";
  process.env.ANTHROPIC_API_KEY ||= "fixture-key";
  const { client } = await import("@/lib/llm/llm");
  const { runCareerChatAssistantStream } = await import("./llm");
  const { CLAUDE_HAIKU_MODEL } = await import("@/lib/llm/modelConfig");
  let step = 0;
  let nativeCalls = 0;
  let live = "";
  const events: string[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes("/rest/v1/")) return Response.json([]);
      assert.match(String(url), /api.anthropic.com/);
      assert.equal(JSON.parse(String(init?.body)).stream, true);
      nativeCalls++;
      return Response.json(
        {
          type: "error",
          error: { type: "overloaded_error", message: "Overloaded" },
        },
        { status: 529 }
      );
    }
  );
  t.mock.method(
    Object.getPrototypeOf(client.responses),
    "create",
    async (body: any) => {
      assert.equal(
        body.stream,
        true,
        "fallback must still use provider streaming"
      );
      step++;
      const chunks =
        step === 1
          ? ["다시 오셨네요. ", "공고를 살펴볼게요."]
          : ["살펴볼 ", "포지션이 있어요."];
      return (async function* () {
        for (const delta of chunks) {
          yield { type: "response.output_text.delta", delta };
          assert.ok(
            live.endsWith(delta),
            "each delta reaches the caller before provider completion"
          );
        }
        events.push(`provider-complete:${step}`);
        yield {
          type: "response.completed",
          response: {
            id: `response-${step}`,
            model: body.model,
            status: "completed",
            output: [
              {
                type: "message",
                role: "assistant",
                content: [{ type: "output_text", text: chunks.join("") }],
              },
              ...(step === 1
                ? [
                    {
                      type: "function_call",
                      id: "read-1",
                      call_id: "read-1",
                      name: "read_context",
                      arguments: "{}",
                    },
                  ]
                : []),
            ],
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
          },
        };
      })();
    }
  );
  const result = await runCareerChatAssistantStream({
    primaryModel: CLAUDE_HAIKU_MODEL,
    temperature: 0.8,
    messages: [{ role: "assistant", content: "다음에 이어서 봐요." }],
    systemBlocks: [{ text: "The user returned after 12 hours." }],
    tools: [
      {
        type: "function",
        function: {
          name: "read_context",
          description: "Read saved opportunities",
          parameters: { type: "object", properties: {} },
        },
      },
    ],
    onTextDelta: (delta) => {
      live += delta;
      events.push(`delta:${step}`);
    },
    onAssistantMessage: (text) => {
      assert.equal(text, live);
      events.push("commit");
      live = "";
    },
    executeTool: async () => {
      events.push("tool");
      return { modelOutput: "A saved opportunity is available." };
    },
    usageLabel: "test:reengagement-stream-fallback",
  });
  assert.equal(nativeCalls, 1);
  assert.equal(result, "살펴볼 포지션이 있어요.");
  assert.deepEqual(events, [
    "delta:1",
    "delta:1",
    "provider-complete:1",
    "commit",
    "tool",
    "delta:2",
    "delta:2",
    "provider-complete:2",
  ]);
});
