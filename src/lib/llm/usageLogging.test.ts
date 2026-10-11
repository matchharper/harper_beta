import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateLlmUsageCost,
  extractLlmTokenUsage,
} from "@/lib/llm/usageLogging";

test("accounts for GPT-6 Luna cache writes included in input tokens", () => {
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
  const cost = estimateLlmUsageCost("gpt-6-luna", usage);
  assert.equal(cost?.inputTokens, 500);
  assert.equal(cost?.cacheWriteInputTokens, 1_200);
  assert.equal(cost?.cacheReadInputTokens, 300);
});

test("prices GPT-6 Luna long context cache and output tokens", () => {
  const usage = extractLlmTokenUsage({
    usage: {
      input_tokens: 273_000,
      input_tokens_details: {
        cached_tokens: 1_000,
        cache_write_tokens: 1_000,
      },
      output_tokens: 1_000,
    },
  });
  const cost = estimateLlmUsageCost("gpt-6-luna", usage);
  assert.equal(cost?.inputUsdPerMtok, 0.2);
  assert.equal(cost?.cacheReadUsdPerMtok, 0.02);
  assert.equal(cost?.cacheWriteUsdPerMtok, 0.25);
  assert.equal(cost?.outputUsdPerMtok, 0.75);
  assert.equal(cost?.estimatedCostUsd, 0.05522);
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

test("prices GPT-6.1 Sol without double counting cached input", () => {
  const usage = extractLlmTokenUsage({
    usage: {
      input_tokens: 2_000,
      input_tokens_details: { cached_tokens: 300, cache_write_tokens: 1_200 },
      output_tokens: 100,
    },
  });
  const cost = estimateLlmUsageCost("gpt-6.1-sol", usage);
  assert.equal(cost?.inputTokens, 500);
  assert.equal(cost?.estimatedCostUsd, 0.00503);
});

test("GPT-6.1 Sol long-context pricing applies only above 272K", () => {
  const estimate = (tokens: number) =>
    estimateLlmUsageCost(
      "gpt-6.1-sol",
      extractLlmTokenUsage({
        usage: {
          input_tokens: tokens,
          input_tokens_details: {
            cached_tokens: 1_000,
            cache_write_tokens: 1_000,
          },
          output_tokens: 1_000,
        },
      })
    );
  assert.equal(estimate(272_000)?.estimatedCostUsd, 0.5526);
  assert.equal(estimate(273_000)?.estimatedCostUsd, 1.1042);
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

test("prices OpenRouter DeepSeek V4.1 Flash", () => {
  const usage = extractLlmTokenUsage({
    usage: { input_tokens: 1_000, output_tokens: 500 },
  });

  const cost = estimateLlmUsageCost("deepseek/deepseek-v4.1-flash", usage);
  assert.equal(cost?.inputUsdPerMtok, 0.027);
  assert.equal(cost?.outputUsdPerMtok, 0.6);
  assert.equal(cost?.pricingSource, "openrouter_pricing_2026_10_02");
  assert.equal(cost?.estimatedCostUsd, 0.000327);
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

test("prices OpenRouter MiMo V2.6 Pro", () => {
  const usage = extractLlmTokenUsage({
    usage: { input_tokens: 1_000, output_tokens: 500 },
  });

  const cost = estimateLlmUsageCost("xiaomi/mimo-v2.6-pro", usage);
  assert.equal(cost?.inputUsdPerMtok, 0.435);
  assert.equal(cost?.outputUsdPerMtok, 0.87);
  assert.equal(cost?.pricingSource, "openrouter_pricing_2026_09_22");
  assert.equal(cost?.estimatedCostUsd, 0.00087);
});
