import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateLlmUsageCost,
  estimateXaiRealtimeUsageCost,
  extractLlmTokenUsage,
  normalizeRealtimeBillingUsage,
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

test("prices xAI realtime audio by sent and received duration", () => {
  const cost = estimateXaiRealtimeUsageCost("grok-voice-think-fast-2.0", {
    inputAudioSeconds: 60,
    outputAudioSeconds: 30,
    textInputEventCount: 2,
  });

  assert.deepEqual(cost, {
    audioCostUsd: 0.075,
    audioDurationSeconds: 90,
    audioUsdPerMinute: 0.05,
    billingBasis: "audio_duration",
    estimatedCostUsd: 0.083,
    inputAudioSeconds: 60,
    outputAudioSeconds: 30,
    pricingSource: "xai_official_voice_api",
    sessionDurationSeconds: null,
    textInputCostUsd: 0.008,
    textInputEventCount: 2,
    textInputUsdPerEvent: 0.004,
  });
});

test("uses session duration only when audio counters are unavailable", () => {
  const cost = estimateXaiRealtimeUsageCost("grok-voice-latest", {
    sessionDurationSeconds: 120,
  });

  assert.equal(cost?.billingBasis, "session_duration_fallback");
  assert.equal(cost?.audioDurationSeconds, 120);
  assert.equal(cost?.estimatedCostUsd, 0.1);
});

test("does not apply xAI voice pricing to other realtime models", () => {
  assert.equal(
    estimateXaiRealtimeUsageCost("gpt-realtime-2.1", {
      inputAudioSeconds: 60,
    }),
    null
  );
  assert.equal(
    estimateXaiRealtimeUsageCost("grok-voice-latest", {
      sessionStartedAt: "2026-07-31T00:00:00.000Z",
    }),
    null
  );
});

test("normalizes invalid client measurements without turning them into cost", () => {
  assert.deepEqual(
    normalizeRealtimeBillingUsage({
      inputAudioSeconds: -1,
      sessionDurationSeconds: 12,
      textInputEventCount: "not-a-number",
    }),
    {
      audioDurationSeconds: null,
      billingBasis: null,
      inputAudioSeconds: null,
      outputAudioSeconds: null,
      sessionDurationSeconds: 12,
      sessionEndedAt: null,
      sessionStartedAt: null,
      textInputEventCount: null,
    }
  );
});
