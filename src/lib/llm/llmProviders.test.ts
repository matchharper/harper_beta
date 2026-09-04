import assert from "node:assert/strict";
import test from "node:test";

process.env.OPENAI_API_KEY ||= "test-openai-key";
process.env.DEEPSEEK_API_KEY ||= "test-deepseek-key";
process.env.OPENROUTER_API_KEY ||= "test-openrouter-key";

const loadLlm = () => import("@/lib/llm/llm");

function asyncStream(items: unknown[]) {
  return (async function* () {
    for (const item of items) yield item;
  })();
}

test("routes DeepSeek V4 models to the DeepSeek provider", async () => {
  const { getLlmChatProviderForModel, supportsSamplingParametersForModel } =
    await loadLlm();
  assert.equal(getLlmChatProviderForModel("deepseek-v4-flash"), "deepseek");
  assert.equal(getLlmChatProviderForModel("deepseek-v4-pro"), "deepseek");
  assert.equal(supportsSamplingParametersForModel("deepseek-v4-flash"), false);
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

test("enables DeepSeek high thinking and preserves tool reasoning", async () => {
  const { createChatCompletionWithFallback, deepseekClient } = await loadLlm();
  const completions = deepseekClient.chat.completions as any;
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
            reasoning_content: "private tool reasoning",
            role: "assistant",
            tool_calls: [],
          },
        ],
        parallel_tool_calls: false,
        temperature: 0.1,
      }),
      deepSeekThinking: { reasoningEffort: "high" },
      model: "deepseek-v4-flash",
    });
  } finally {
    completions.create = originalCreate;
  }

  assert.ok(receivedBody);
  const requestBody = receivedBody as unknown as Record<string, any>;
  assert.equal(requestBody.reasoning_effort, "high");
  assert.deepEqual(requestBody.thinking, { type: "enabled" });
  assert.equal(requestBody.temperature, undefined);
  assert.equal(requestBody.parallel_tool_calls, false);
  assert.equal(
    requestBody.messages[0].reasoning_content,
    "private tool reasoning"
  );
});

test("aborts an in-flight chat completion without retrying", async () => {
  const { createChatCompletionWithFallback, deepseekClient } = await loadLlm();
  const completions = deepseekClient.chat.completions as any;
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
      model: "deepseek-v4-flash",
      signal: controller.signal,
    });
    controller.abort(reason);
    await assert.rejects(completion, reason);
  } finally {
    completions.create = originalCreate;
  }
  assert.equal(callCount, 1);
});
