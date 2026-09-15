import assert from "node:assert/strict";
import test from "node:test";

process.env.OPENAI_API_KEY ||= "test-openai-key";
process.env.OPENROUTER_API_KEY ||= "test-openrouter-key";

const loadLlm = () => import("@/lib/llm/llm");

function asyncStream(items: unknown[]) {
  return (async function* () {
    for (const item of items) yield item;
  })();
}

test("routes DeepSeek V4 Flash 0731 to OpenRouter", async () => {
  const { getLlmChatProviderForModel, supportsSamplingParametersForModel } =
    await loadLlm();
  const model = "deepseek/deepseek-v4-flash-0731";
  assert.equal(getLlmChatProviderForModel(model), "openrouter");
  assert.equal(supportsSamplingParametersForModel(model), true);
});

test("rejects Grok model IDs before selecting a provider", async () => {
  const { getLlmChatProviderForModel } = await loadLlm();
  assert.throws(
    () => getLlmChatProviderForModel("grok-4.3"),
    /Grok models are disabled/
  );
});

test("routes Z.ai models to OpenRouter with explicit reasoning effort", async () => {
  const {
    createChatCompletionWithFallback,
    getLlmChatProviderForModel,
    openrouterClient,
  } = await loadLlm();
  assert.equal(getLlmChatProviderForModel("z-ai/glm-5.3-flash"), "openrouter");

  const completions = openrouterClient.chat.completions as any;
  const originalCreate = completions.create;
  let receivedBody: Record<string, any> | null = null;
  completions.create = async (body: Record<string, any>) => {
    receivedBody = body;
    return { choices: [{ message: { content: "ok" } }] };
  };

  try {
    await createChatCompletionWithFallback({
      buildRequest: () => ({ messages: [{ content: "hello", role: "user" }] }),
      chatCompletionReasoning: { reasoningEffort: "high" },
      model: "z-ai/glm-5.3-flash",
    });
  } finally {
    completions.create = originalCreate;
  }

  assert.ok(receivedBody);
  const requestBody = receivedBody as unknown as Record<string, any>;
  assert.equal(requestBody.model, "z-ai/glm-5.3-flash");
  assert.deepEqual(requestBody.reasoning, { effort: "high" });
  assert.deepEqual(requestBody.provider, {
    allow_fallbacks: false,
    only: ["z-ai"],
  });
});

test("preserves OpenRouter reasoning details across a tool call", async () => {
  const { openrouterClient } = await loadLlm();
  const { runTalentAssistantToolLoop } =
    await import("@/lib/talentOnboarding/llm");
  const completions = openrouterClient.chat.completions as any;
  const originalCreate = completions.create;
  const receivedBodies: Array<Record<string, any>> = [];
  const reasoningDetails = [
    {
      format: "unknown",
      id: "reasoning-1",
      index: 0,
      type: "reasoning.summary",
    },
  ];
  completions.create = async (body: Record<string, any>) => {
    receivedBodies.push(body);
    if (receivedBodies.length === 1) {
      return {
        choices: [
          {
            message: {
              content: "",
              reasoning_details: reasoningDetails,
              tool_calls: [
                {
                  function: { arguments: '{"query":"Harper"}', name: "search" },
                  id: "tool-1",
                  type: "function",
                },
              ],
            },
          },
        ],
      };
    }
    return { choices: [{ message: { content: "done" } }] };
  };

  try {
    const result = await runTalentAssistantToolLoop({
      executeTool: async () => ({ ok: true }),
      messages: [{ content: "Find Harper", role: "user" }],
      modelConfig: {
        chatCompletionReasoningEffort: "high",
        primaryModel: "z-ai/glm-5.3-flash",
      },
      tools: [
        {
          function: {
            description: "Search",
            name: "search",
            parameters: { type: "object" },
          },
          type: "function",
        },
      ],
    });
    assert.equal(result, "done");
  } finally {
    completions.create = originalCreate;
  }

  assert.equal(receivedBodies.length, 2);
  assert.deepEqual(
    receivedBodies[1].messages[1].reasoning_details,
    reasoningDetails
  );
  assert.deepEqual(receivedBodies[1].reasoning, { effort: "high" });
});

test("streams OpenRouter text and reconstructs tool and reasoning deltas", async () => {
  const { openrouterClient } = await loadLlm();
  const { runTalentAssistantToolLoop } =
    await import("@/lib/talentOnboarding/llm");
  const completions = openrouterClient.chat.completions as any;
  const originalCreate = completions.create;
  const receivedBodies: Array<Record<string, any>> = [];
  const reasoningDetails = [
    {
      format: "unknown",
      id: "reasoning-1",
      index: 0,
      text: "first",
      type: "reasoning.text",
    },
    {
      format: "unknown",
      id: "reasoning-2",
      index: 1,
      text: "second",
      type: "reasoning.text",
    },
  ];
  completions.create = async (body: Record<string, any>) => {
    receivedBodies.push(body);
    if (receivedBodies.length === 1) {
      return asyncStream([
        {
          choices: [
            {
              delta: {
                reasoning: "private ",
                reasoning_details: [reasoningDetails[0]],
                tool_calls: [
                  {
                    function: {
                      arguments: '{"query":"Har',
                      name: "sea",
                    },
                    id: "tool-1",
                    index: 0,
                    type: "function",
                  },
                ],
              },
              finish_reason: null,
            },
          ],
          id: "chat-1",
          model: "z-ai/glm-5.3-flash",
        },
        {
          choices: [
            {
              delta: {
                reasoning: "reasoning",
                reasoning_details: [reasoningDetails[1]],
                tool_calls: [
                  {
                    function: { arguments: 'per"}', name: "rch" },
                    index: 0,
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        },
      ]);
    }
    return asyncStream([
      {
        choices: [{ delta: { content: "do" }, finish_reason: null }],
      },
      {
        choices: [{ delta: { content: "ne" }, finish_reason: "stop" }],
      },
      {
        choices: [],
        usage: {
          completion_tokens: 2,
          prompt_tokens: 10,
          total_tokens: 12,
        },
      },
    ]);
  };
  const textDeltas: string[] = [];
  const startedTools: Array<Record<string, unknown>> = [];

  try {
    const result = await runTalentAssistantToolLoop({
      executeTool: async () => ({ ok: true }),
      messages: [{ content: "Find Harper", role: "user" }],
      modelConfig: {
        chatCompletionReasoningEffort: "high",
        primaryModel: "z-ai/glm-5.3-flash",
      },
      onTextDelta: (delta) => {
        textDeltas.push(delta);
      },
      onToolStart: (tool) => {
        startedTools.push(tool);
      },
      tools: [
        {
          function: {
            description: "Search",
            name: "search",
            parameters: { type: "object" },
          },
          type: "function",
        },
      ],
    });
    assert.equal(result, "done");
  } finally {
    completions.create = originalCreate;
  }

  assert.deepEqual(textDeltas, ["do", "ne"]);
  assert.deepEqual(startedTools, [
    { id: "tool-1", input: { query: "Harper" }, name: "search" },
  ]);
  assert.equal(receivedBodies.length, 2);
  assert.equal(receivedBodies[0].stream, true);
  assert.deepEqual(receivedBodies[0].stream_options, { include_usage: true });
  assert.deepEqual(receivedBodies[0].reasoning, { effort: "high" });
  assert.equal(receivedBodies[1].messages[1].reasoning, "private reasoning");
  assert.deepEqual(
    receivedBodies[1].messages[1].reasoning_details,
    reasoningDetails
  );
  assert.deepEqual(receivedBodies[1].messages[1].tool_calls, [
    {
      function: { arguments: '{"query":"Harper"}', name: "search" },
      id: "tool-1",
      type: "function",
    },
  ]);
});

test("forwards OpenRouter deltas through the Career chat stream", async () => {
  const { openrouterClient } = await loadLlm();
  const { runCareerChatAssistantStream } = await import("@/lib/career/llm");
  const completions = openrouterClient.chat.completions as any;
  const originalCreate = completions.create;
  let receivedBody: Record<string, any> | null = null;
  completions.create = async (body: Record<string, any>) => {
    receivedBody = body;
    return asyncStream([
      {
        choices: [{ delta: { content: "안녕" }, finish_reason: null }],
      },
      {
        choices: [{ delta: { content: "하세요" }, finish_reason: "stop" }],
      },
    ]);
  };
  const textDeltas: string[] = [];

  try {
    const result = await runCareerChatAssistantStream({
      chatCompletionReasoningEffort: "high",
      executeTool: async () => ({}),
      messages: [{ content: "Hello", role: "user" }],
      onTextDelta: (delta) => {
        textDeltas.push(delta);
      },
      primaryModel: "z-ai/glm-5.3-flash",
      systemBlocks: [{ text: "Reply in Korean." }],
      tools: [],
    });
    assert.equal(result, "안녕하세요");
  } finally {
    completions.create = originalCreate;
  }

  assert.deepEqual(textDeltas, ["안녕", "하세요"]);
  assert.ok(receivedBody);
  assert.equal((receivedBody as Record<string, any>).stream, true);
});

test("enables OpenRouter reasoning for DeepSeek V4 Flash 0731", async () => {
  const { createChatCompletionWithFallback, openrouterClient } =
    await loadLlm();
  const completions = openrouterClient.chat.completions as any;
  const originalCreate = completions.create;
  let receivedBody: Record<string, any> | null = null;
  completions.create = async (body: Record<string, any>) => {
    receivedBody = body;
    return { choices: [{ message: { content: "ok" } }] };
  };

  try {
    await createChatCompletionWithFallback({
      buildRequest: () => ({
        messages: [
          {
            content: "",
            reasoning_details: [{ type: "reasoning.summary", text: "summary" }],
            role: "assistant",
            tool_calls: [],
          },
        ],
        parallel_tool_calls: false,
        temperature: 0.1,
      }),
      chatCompletionReasoning: { reasoningEffort: "high" },
      model: "deepseek/deepseek-v4-flash-0731",
    });
  } finally {
    completions.create = originalCreate;
  }

  assert.ok(receivedBody);
  const requestBody = receivedBody as unknown as Record<string, any>;
  assert.deepEqual(requestBody.reasoning, { effort: "high" });
  assert.equal(requestBody.temperature, 0.1);
  assert.equal(requestBody.parallel_tool_calls, false);
  assert.deepEqual(requestBody.messages[0].reasoning_details, [
    { type: "reasoning.summary", text: "summary" },
  ]);
});

test("aborts an in-flight OpenRouter completion without retrying", async () => {
  const { createChatCompletionWithFallback, openrouterClient } =
    await loadLlm();
  const completions = openrouterClient.chat.completions as any;
  const originalCreate = completions.create;
  const controller = new AbortController();
  let callCount = 0;
  completions.create = async (
    _body: Record<string, any>,
    options: { signal?: AbortSignal }
  ) => {
    callCount += 1;
    return new Promise((_, reject) => {
      options.signal?.addEventListener(
        "abort",
        () => reject(options.signal?.reason),
        { once: true }
      );
    });
  };

  const reason = new Error("superseded Slack turn");
  try {
    const completion = createChatCompletionWithFallback({
      buildRequest: () => ({ messages: [] }),
      model: "deepseek/deepseek-v4-flash-0731",
      signal: controller.signal,
    });
    controller.abort(reason);
    await assert.rejects(completion, reason);
  } finally {
    completions.create = originalCreate;
  }
  assert.equal(callCount, 1);
});

test("uses Anthropic native structured output instead of a JSON-only prompt", async () => {
  const { createChatCompletionWithFallback } = await loadLlm();
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  let receivedUrl = "";
  let receivedBody: Record<string, any> | null = null;
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  globalThis.fetch = async (input, init) => {
    receivedUrl = String(input);
    receivedBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(
      JSON.stringify({
        content: [
          {
            text: '{"subject":"Hello","body":"Body","requestContext":"Question"}',
            type: "text",
          },
        ],
        id: "msg-structured",
        model: "claude-sonnet-5",
        stop_reason: "end_turn",
        usage: { input_tokens: 12, output_tokens: 8 },
      }),
      { status: 200 }
    );
  };

  try {
    const result = await createChatCompletionWithFallback({
      buildRequest: () => ({
        max_tokens: 1_800,
        messages: [
          { content: "Write candidate copy.", role: "system" },
          { content: "Current instruction", role: "user" },
        ],
      }),
      model: "claude-sonnet-5",
      structuredOutput: {
        name: "candidate_contact_copy",
        schema: {
          additionalProperties: false,
          properties: {
            body: { type: "string" },
            requestContext: { type: "string" },
            subject: { type: "string" },
          },
          required: ["subject", "body", "requestContext"],
          type: "object",
        },
      },
    });
    assert.equal(result.model, "claude-sonnet-5");
    assert.match(result.response.choices[0].message.content, /"subject"/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalApiKey;
  }

  assert.equal(receivedUrl, "https://api.anthropic.com/v1/messages");
  assert.ok(receivedBody);
  assert.deepEqual((receivedBody as Record<string, any>).output_config.format, {
    schema: {
      additionalProperties: false,
      properties: {
        body: { type: "string" },
        requestContext: { type: "string" },
        subject: { type: "string" },
      },
      required: ["subject", "body", "requestContext"],
      type: "object",
    },
    type: "json_schema",
  });
});

test("falls back to Luna xhigh when structured-output validation fails", async () => {
  const { client, createChatCompletionWithFallback, openrouterClient } =
    await loadLlm();
  const openrouterCompletions = openrouterClient.chat.completions as any;
  const originalOpenrouterCreate = openrouterCompletions.create;
  const responses = client.responses as any;
  const originalResponsesCreate = responses.create;
  let fallbackRequest: Record<string, any> | null = null;
  let primaryCalls = 0;

  openrouterCompletions.create = async () => {
    primaryCalls += 1;
    return { choices: [{ message: { content: "not-json" } }] };
  };
  responses.create = async (body: Record<string, any>) => {
    fallbackRequest = body;
    return {
      id: "resp-luna-fallback",
      model: "gpt-5.6-luna",
      output: [
        {
          content: [
            {
              text: '{"subject":"Hello","body":"Body","requestContext":"Question"}',
              type: "output_text",
            },
          ],
          role: "assistant",
          type: "message",
        },
      ],
      status: "completed",
      usage: { input_tokens: 10, output_tokens: 8, total_tokens: 18 },
    };
  };

  try {
    const result = await createChatCompletionWithFallback({
      buildRequest: () => ({
        messages: [{ content: "Write JSON", role: "user" }],
      }),
      fallbackModel: "gpt-5.6-luna",
      model: "deepseek/deepseek-v4-flash-0731",
      openAIResponses: { reasoningEffort: "xhigh" },
      structuredOutput: {
        name: "candidate_contact_copy",
        schema: {
          additionalProperties: false,
          properties: { subject: { type: "string" } },
          required: ["subject"],
          type: "object",
        },
      },
      validateResponse: (response) => {
        JSON.parse(String(response?.choices?.[0]?.message?.content ?? ""));
      },
    });

    assert.equal(result.model, "gpt-5.6-luna");
    assert.equal(result.fallbackReason, "primary_failed");
  } finally {
    openrouterCompletions.create = originalOpenrouterCreate;
    responses.create = originalResponsesCreate;
  }

  assert.equal(primaryCalls, 1);
  assert.ok(fallbackRequest);
  assert.deepEqual((fallbackRequest as Record<string, any>).reasoning, {
    effort: "xhigh",
  });
  assert.equal(
    (fallbackRequest as Record<string, any>).text.format.type,
    "json_schema"
  );
});
