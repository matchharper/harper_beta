import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateLlmUsageCost,
  extractLlmTokenUsage,
} from "@/lib/llm/usageLogging";

test("accounts for GPT-5.6 cache writes included in input tokens", () => {
  const usage = extractLlmTokenUsage({
    usage: {
      input_tokens: 2_000,
      input_tokens_details: {
        cache_write_tokens: 1_200,
        cached_tokens: 300,
      },
      output_tokens: 100,
      total_tokens: 2_100,
    },
  });

  assert.deepEqual(usage, {
    cacheCreationInputTokens: 1_200,
    cacheCreationInputTokensIncludedInInput: true,
    cacheReadInputTokens: 300,
    cacheReadInputTokensIncludedInInput: true,
    inputTokens: 2_000,
    outputTokens: 100,
    totalProcessedInputTokens: 2_000,
    totalTokens: 2_100,
  });
  const cost = estimateLlmUsageCost("gpt-5.6-luna", usage);
  assert.equal(cost?.inputTokens, 500);
  assert.equal(cost?.cacheWriteInputTokens, 1_200);
  assert.equal(cost?.cacheReadInputTokens, 300);
});

test("prices GPT-5.6 Terra fallback usage", () => {
  const usage = extractLlmTokenUsage({
    usage: {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      total_tokens: 2_000_000,
    },
  });

  const cost = estimateLlmUsageCost("gpt-5.6-terra", usage);
  assert.equal(cost?.inputCostUsd, 2);
  assert.equal(cost?.outputCostUsd, 12);
  assert.equal(cost?.estimatedCostUsd, 14);
});

test("prices retired Grok Fast slugs as redirected Grok 4.3", () => {
  const usage = extractLlmTokenUsage({
    usage: { input_tokens: 1_000, output_tokens: 500 },
  });

  const cost = estimateLlmUsageCost("grok-4-fast-reasoning", usage);
  assert.equal(cost?.inputUsdPerMtok, 1.25);
  assert.equal(cost?.outputUsdPerMtok, 2.5);
  assert.equal(cost?.pricingSource, "xai_retired_slug_redirect_2026_05_15");
  assert.equal(cost?.estimatedCostUsd, 0.0025);
});

test("prices OpenRouter DeepSeek V4 Flash 0731", () => {
  const usage = extractLlmTokenUsage({
    usage: { input_tokens: 1_000, output_tokens: 500 },
  });

  const cost = estimateLlmUsageCost("deepseek/deepseek-v4-flash-0731", usage);
  assert.equal(cost?.inputUsdPerMtok, 0.05);
  assert.equal(cost?.outputUsdPerMtok, 0.16);
  assert.equal(cost?.pricingSource, "openrouter_pricing_2026_09_13");
  assert.equal(cost?.estimatedCostUsd, 0.00013);
});

test("prices OpenRouter Muse Spark 1.3", () => {
  const usage = extractLlmTokenUsage({
    usage: { input_tokens: 1_000, output_tokens: 500 },
  });

  const cost = estimateLlmUsageCost("meta/muse-spark-1.3", usage);
  assert.equal(cost?.inputUsdPerMtok, 1.25);
  assert.equal(cost?.outputUsdPerMtok, 4.25);
  assert.equal(cost?.pricingSource, "openrouter_pricing_2026_09_15");
  assert.equal(cost?.estimatedCostUsd, 0.003375);
});
