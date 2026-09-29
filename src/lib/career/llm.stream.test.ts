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

test("resume-capable streaming retains eight calls and main's unrestricted continuation tools", async () => {
  const previousApiKey = process.env.ANTHROPIC_API_KEY;
  const previousOpenAiApiKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const { runCareerChatAssistantStream } = await import("./llm");
    for (const hasResume of [false, true]) {
      const limit = hasResume ? 8 : 3;
      const tools = [
        "read_document",
        ...(hasResume ? ["generate_resume"] : []),
      ];
      let executions = 0;
      const requests: string[][] = [];
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as {
          tools?: Array<{ name: string }>;
        };
        const available = (body.tools ?? []).map((tool) => tool.name);
        requests.push(available);
        assert.ok(
          requests.length <= limit + 1,
          "tool budget must terminate the loop"
        );
        const final = available.length === 0;
        return toAnthropicStream([
          {
            type: "message_start",
            message: {
              id: `message-${requests.length}`,
              model: "claude-sonnet-4-6",
              usage: { input_tokens: 10, output_tokens: 0 },
            },
          },
          {
            type: "content_block_start",
            index: 0,
            content_block: final
              ? { type: "text", text: "확인했습니다." }
              : {
                  type: "tool_use",
                  id: `tool-${requests.length}`,
                  name:
                    hasResume && executions === limit - 1
                      ? "generate_resume"
                      : "read_document",
                  input: {},
                },
          },
          { type: "content_block_stop", index: 0 },
          {
            type: "message_delta",
            delta: { stop_reason: final ? "end_turn" : "tool_use" },
            usage: { output_tokens: 5 },
          },
          { type: "message_stop" },
        ]);
      };
      const result = await runCareerChatAssistantStream({
        executeTool: async () => {
          executions++;
          return { ok: true };
        },
        messages: [
          { role: "user", content: "기존 문서를 확인해서 이력서를 만들어줘" },
        ],
        onTextDelta: () => {},
        primaryModel: "claude-sonnet-4-6",
        responseLocale: "ko",
        systemBlocks: [
          { key: "tool_policy", text: "Use the available tools." },
        ],
        tools: tools.map((name) => ({
          type: "function" as const,
          function: { name, description: name, parameters: { type: "object" } },
        })),
        usageLabel: "test:career-resume-merge-budget",
      });
      assert.equal(result, "확인했습니다.");
      assert.equal(executions, limit);
      assert.equal(requests.length, limit + 1);
      assert.deepEqual(requests.at(-1), []);
      for (const names of requests.slice(0, -1)) assert.deepEqual(names, tools);
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousApiKey;
    if (previousOpenAiApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiApiKey;
  }
});
