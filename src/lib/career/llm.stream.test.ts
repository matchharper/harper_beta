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

test("Sonnet 5.5 streaming preserves signed and redacted thinking through tool continuation", async () => {
  const previousApiKey = process.env.ANTHROPIC_API_KEY;
  const previousOpenAiApiKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.OPENAI_API_KEY = "test-key";
  const requests: Record<string, any>[] = [];
  const responses = [
    toAnthropicStream([
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "thinking", thinking: "", signature: "" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "signature_delta", signature: "signed-" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "signature_delta", signature: "continuation" },
      },
      { type: "content_block_stop", index: 0 },
      {
        type: "content_block_start",
        index: 1,
        content_block: {
          type: "redacted_thinking",
          data: "encrypted-thinking",
        },
      },
      { type: "content_block_stop", index: 1 },
      {
        type: "content_block_start",
        index: 2,
        content_block: {
          type: "tool_use",
          id: "tool-1",
          name: "read_context",
          input: {},
        },
      },
      { type: "content_block_stop", index: 2 },
      {
        type: "message_delta",
        delta: { stop_reason: "tool_use" },
        usage: { output_tokens: 5 },
      },
      { type: "message_stop" },
    ]),
    toAnthropicStream([
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "확인했어요." },
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
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body ?? "{}")));
    const response = responses.shift();
    assert.ok(response, "unexpected Anthropic request");
    return response;
  };
  let visibleText = "";
  try {
    const { runCareerChatAssistantStream } = await import("./llm");
    const result = await runCareerChatAssistantStream({
      executeTool: async () => ({ ok: true }),
      messages: [{ role: "user", content: "저장된 내용을 확인해줘" }],
      onTextDelta: (text) => {
        visibleText += text;
      },
      primaryModel: "claude-sonnet-5-5",
      systemBlocks: [
        { text: "Use read_context to retrieve the saved context." },
      ],
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
      usageLabel: "test:sonnet-5-5-thinking-continuation",
    });
    assert.equal(result, "확인했어요.");
    assert.equal(visibleText, "확인했어요.");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].model, "claude-sonnet-5-5");
    assert.equal("temperature" in requests[0], false);
    assert.deepEqual(requests[0].tool_choice, { type: "auto" });
    const assistantMessage = requests[1].messages.find(
      (message: any) => message.role === "assistant"
    );
    assert.deepEqual(assistantMessage.content.slice(0, 2), [
      { type: "thinking", thinking: "", signature: "signed-continuation" },
      { type: "redacted_thinking", data: "encrypted-thinking" },
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousApiKey;
    if (previousOpenAiApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiApiKey;
  }
});

test("Career tool results prefer compact model-facing text when provided", async () => {
  const previousApiKey = process.env.ANTHROPIC_API_KEY;
  const previousOpenAiApiKey = process.env.OPENAI_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const { serializeCareerToolResultForModel } = await import("./llm");
    assert.equal(
      serializeCareerToolResultForModel({
        contacts: [{ large: "ignored" }],
        modelOutput: "status=ok\ncontacts=Acme · Backend Engineer",
        ok: true,
      }),
      "status=ok\ncontacts=Acme · Backend Engineer"
    );
  } finally {
    if (previousApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousApiKey;
    if (previousOpenAiApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiApiKey;
  }
});

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
  const requestToolNames: string[][] = [];
  const requestSystemTexts: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const requestBody = JSON.parse(String(init?.body ?? "{}")) as {
      system?: Array<{ text?: string }>;
      tools?: Array<{ name?: string }>;
    };
    requestSystemTexts.push(
      (requestBody.system ?? [])
        .map((block) => String(block.text ?? ""))
        .join("\n")
    );
    requestToolNames.push(
      (requestBody.tools ?? [])
        .map((tool) => String(tool.name ?? ""))
        .filter(Boolean)
    );
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
        {
          type: "function",
          function: {
            name: "web_search",
            description: "Search the web.",
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
    assert.deepEqual(requestToolNames, [
      ["write_talent_context", "web_search"],
      ["write_talent_context", "web_search"],
    ]);
    assert.match(
      requestSystemTexts[1] ?? "",
      /Callable tools in this continuation: write_talent_context, web_search\./
    );
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
