import assert from "node:assert/strict";
import test from "node:test";
import { createLlmDebugCall, summarizeLlmDebugCalls } from "./debugUsage";

test("calculates cached and uncached Luna cost per completion", () => {
  const call = createLlmDebugCall({
    model: "gpt-5.6-luna",
    response: {
      usage: {
        completion_tokens: 1_000,
        prompt_tokens: 10_000,
        prompt_tokens_details: { cached_tokens: 4_000 },
        total_tokens: 11_000,
      },
    },
    step: "tool_loop_1",
  });

  assert.deepEqual(call, {
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 4_000,
    estimatedCostUsd: 0.00248,
    inputTokens: 10_000,
    model: "gpt-5.6-luna",
    outputTokens: 1_000,
    pricingStatus: "estimated",
    processedInputTokens: 10_000,
    step: "tool_loop_1",
    totalTokens: 11_000,
  });
});

test("sums priced calls and reports partial pricing", () => {
  const summary = summarizeLlmDebugCalls([
    createLlmDebugCall({
      model: "gpt-5.6-luna",
      response: {
        usage: {
          completion_tokens: 100,
          prompt_tokens: 1_000,
          total_tokens: 1_100,
        },
      },
      step: "routing",
    }),
    createLlmDebugCall({
      model: "unknown-model",
      response: {
        usage: {
          completion_tokens: 50,
          prompt_tokens: 500,
          total_tokens: 550,
        },
      },
      step: "final_response",
    }),
  ]);

  assert.equal(summary.completionCount, 2);
  assert.equal(summary.estimatedCostUsd, 0.00032);
  assert.equal(summary.pricingStatus, "partial");
  assert.deepEqual(summary.models, ["gpt-5.6-luna", "unknown-model"]);
  assert.equal(summary.inputTokens, 1_500);
  assert.equal(summary.outputTokens, 150);
});

test("does not report zero cost when a provider omits usage", () => {
  const call = createLlmDebugCall({
    model: "gpt-5.6-luna",
    response: { choices: [] },
    step: "final_response",
  });
  const summary = summarizeLlmDebugCalls([call]);

  assert.equal(call.estimatedCostUsd, null);
  assert.equal(call.pricingStatus, "usage_unavailable");
  assert.equal(summary.estimatedCostUsd, null);
  assert.equal(summary.pricingStatus, "usage_unavailable");
});
