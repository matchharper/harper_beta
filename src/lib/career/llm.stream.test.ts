import assert from "node:assert/strict";
import test from "node:test";

const toAnthropicStream = (events: unknown[]) =>
  new Response(
    events
      .map((event) => `event: message\ndata: ${JSON.stringify(event)}\n\n`)
      .join(""),
    {
      headers: { "Content-Type": "text/event-stream" },
    }
  );

test("tool detection replaces a streamed preamble and returns only the final answer", async () => {
  const previousApiKey = process.env.ANTHROPIC_API_KEY;
  const previousOpenAiApiKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.OPENAI_API_KEY = "test-key";

  const { runCareerChatAssistantStream } = await import("./llm");

  const responses = [
    toAnthropicStream([
      {
        type: "message_start",
        message: {
          id: "message-tool",
          model: "claude-sonnet-4-6",
          stop_reason: null,
          usage: { input_tokens: 10, output_tokens: 0 },
        },
      },
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "먼저 저장할게요. " },
      },
      { type: "content_block_stop", index: 0 },
      {
        type: "content_block_start",
        index: 1,
        content_block: {
          type: "tool_use",
          id: "tool-1",
          name: "write_talent_context",
          input: { value: "saved" },
        },
      },
      { type: "content_block_stop", index: 1 },
      {
        type: "message_delta",
        delta: { stop_reason: "tool_use" },
        usage: { output_tokens: 5 },
      },
      { type: "message_stop" },
    ]),
    toAnthropicStream([
      {
        type: "message_start",
        message: {
          id: "message-final",
          model: "claude-sonnet-4-6",
          stop_reason: null,
          usage: { input_tokens: 15, output_tokens: 0 },
        },
      },
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "저장했습니다." },
      },
      { type: "content_block_stop", index: 0 },
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 4 },
      },
      { type: "message_stop" },
    ]),
  ];
  globalThis.fetch = async () => {
    const response = responses.shift();
    assert.ok(response, "unexpected Anthropic request");
    return response;
  };

  let visibleText = "";
  const detectedTools: string[] = [];
  const executedTools: string[] = [];

  try {
    const result = await runCareerChatAssistantStream({
      executeTool: async ({ name }) => {
        executedTools.push(name);
        return { ok: true };
      },
      messages: [{ role: "user", content: "이 내용을 기억해줘" }],
      onTextDelta: (delta) => {
        visibleText += delta;
      },
      onToolDetected: (tool) => {
        detectedTools.push(tool.name);
        visibleText = "";
      },
      primaryModel: "claude-sonnet-4-6",
      responseLocale: "ko",
      systemBlocks: [{ key: "tool_policy", text: "Use tools when needed." }],
      tools: [
        {
          type: "function",
          function: {
            name: "write_talent_context",
            description: "Save durable talent context.",
            parameters: { type: "object" },
          },
        },
      ],
      usageLabel: "test:career-chat-tool-preamble",
    });

    assert.equal(result, "저장했습니다.");
    assert.equal(visibleText, "저장했습니다.");
    assert.deepEqual(detectedTools, ["write_talent_context"]);
    assert.deepEqual(executedTools, ["write_talent_context"]);
    assert.equal(responses.length, 0);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousApiKey;
    }
    if (previousOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAiApiKey;
    }
  }
});
