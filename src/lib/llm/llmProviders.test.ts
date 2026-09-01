import assert from "node:assert/strict";
import test from "node:test";

process.env.OPENAI_API_KEY ||= "test-openai-key";
process.env.DEEPSEEK_API_KEY ||= "test-deepseek-key";

const loadLlm = () => import("@/lib/llm/llm");

test("routes DeepSeek V4 models to the DeepSeek provider", async () => {
  const { getLlmChatProviderForModel, supportsSamplingParametersForModel } =
    await loadLlm();
  assert.equal(getLlmChatProviderForModel("deepseek-v4-flash"), "deepseek");
  assert.equal(getLlmChatProviderForModel("deepseek-v4-pro"), "deepseek");
  assert.equal(supportsSamplingParametersForModel("deepseek-v4-flash"), false);
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
