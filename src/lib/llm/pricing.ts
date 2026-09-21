/**
 * Authoritative LLM price registry for harper_beta.
 *
 * Token prices, provider redirects, and time-based tiers belong here only.
 * Logging code consumes these resolvers and stores the selected pricing source
 * with each record so historical estimates remain explainable.
 */

export type LlmModelPricing = {
  cacheReadUsdPerMtok?: number;
  cacheWriteUsdPerMtok?: number;
  effectiveModel?: string;
  inputUsdPerMtok: number;
  longContextInputUsdPerMtok?: number;
  longContextOutputUsdPerMtok?: number;
  longContextThresholdTokens?: number;
  outputUsdPerMtok: number;
  pricingSource: string;
  pricingTier?: string;
};

export type RealtimeModelPricing = {
  audioCachedInputUsdPerMtok: number;
  audioInputUsdPerMtok: number;
  audioOutputUsdPerMtok: number;
  imageCachedInputUsdPerMtok: number;
  imageInputUsdPerMtok: number;
  textCachedInputUsdPerMtok: number;
  textInputUsdPerMtok: number;
  textOutputUsdPerMtok: number;
  pricingSource: string;
};

const STATIC_MODEL_PRICING_USD_PER_MTOK: Record<string, LlmModelPricing> = {
  "claude-sonnet-5": {
    cacheReadUsdPerMtok: 0.2,
    cacheWriteUsdPerMtok: 2.5,
    inputUsdPerMtok: 2,
    outputUsdPerMtok: 10,
    pricingSource: "anthropic_api_pricing_2026_09",
  },
  "gpt-4.1-mini": {
    cacheReadUsdPerMtok: 0.1,
    inputUsdPerMtok: 0.4,
    outputUsdPerMtok: 1.6,
    pricingSource: "openai_api_pricing_2026_09",
  },
  "gpt-5-mini": {
    cacheReadUsdPerMtok: 0.025,
    inputUsdPerMtok: 0.25,
    outputUsdPerMtok: 2,
    pricingSource: "openai_api_pricing_2026_09",
  },
  "gpt-5.6-luna": {
    cacheReadUsdPerMtok: 0.02,
    cacheWriteUsdPerMtok: 0.25,
    inputUsdPerMtok: 0.2,
    outputUsdPerMtok: 1.2,
    pricingSource: "openai_api_pricing_2026_09",
  },
  "gpt-5.6-terra": {
    cacheReadUsdPerMtok: 0.2,
    cacheWriteUsdPerMtok: 2.5,
    inputUsdPerMtok: 2,
    outputUsdPerMtok: 12,
    pricingSource: "openai_api_pricing_2026_09",
  },
  "grok-build-0.1": {
    cacheReadUsdPerMtok: 0.2,
    inputUsdPerMtok: 1,
    outputUsdPerMtok: 2,
    pricingSource: "xai_api_pricing_2026_09",
  },
  "grok-4.3": {
    cacheReadUsdPerMtok: 0.2,
    effectiveModel: "grok-4.3",
    inputUsdPerMtok: 1.25,
    outputUsdPerMtok: 2.5,
    pricingSource: "xai_grok_4_3_pricing_2026_09",
  },
  "grok-4-fast-reasoning": {
    cacheReadUsdPerMtok: 0.2,
    effectiveModel: "grok-4.3",
    inputUsdPerMtok: 1.25,
    outputUsdPerMtok: 2.5,
    pricingSource: "xai_retired_slug_redirect_2026_05_15",
  },
  "grok-4-fast-non-reasoning": {
    cacheReadUsdPerMtok: 0.2,
    effectiveModel: "grok-4.3",
    inputUsdPerMtok: 1.25,
    outputUsdPerMtok: 2.5,
    pricingSource: "xai_retired_slug_redirect_2026_05_15",
  },
  "deepseek/deepseek-v4-flash-0731": {
    cacheReadUsdPerMtok: 0.013,
    inputUsdPerMtok: 0.05,
    outputUsdPerMtok: 0.16,
    pricingSource: "openrouter_pricing_2026_09_13",
  },
  "z-ai/glm-5.3-flash": {
    cacheReadUsdPerMtok: 0.015,
    inputUsdPerMtok: 0.075,
    outputUsdPerMtok: 0.25,
    pricingSource: "openrouter_pricing_2026_09_01",
  },
  "meta/muse-spark-1.3": {
    cacheReadUsdPerMtok: 0.15,
    inputUsdPerMtok: 1.25,
    outputUsdPerMtok: 4.25,
    pricingSource: "openrouter_pricing_2026_09_15",
  },
  "openrouter:z-ai/glm-5.3-flash": {
    cacheReadUsdPerMtok: 0.015,
    effectiveModel: "z-ai/glm-5.3-flash",
    inputUsdPerMtok: 0.075,
    outputUsdPerMtok: 0.25,
    pricingSource: "openrouter_pricing_2026_09_01",
  },
};

const REALTIME_MODEL_PRICING_USD_PER_MTOK: Record<
  string,
  RealtimeModelPricing
> = {
  "gpt-realtime-2": {
    audioCachedInputUsdPerMtok: 0.4,
    audioInputUsdPerMtok: 32,
    audioOutputUsdPerMtok: 64,
    imageCachedInputUsdPerMtok: 0.5,
    imageInputUsdPerMtok: 5,
    pricingSource: "openai_realtime_pricing_2026_09",
    textCachedInputUsdPerMtok: 0.4,
    textInputUsdPerMtok: 4,
    textOutputUsdPerMtok: 24,
  },
  "gpt-realtime-2.1": {
    audioCachedInputUsdPerMtok: 0.4,
    audioInputUsdPerMtok: 32,
    audioOutputUsdPerMtok: 64,
    imageCachedInputUsdPerMtok: 0.5,
    imageInputUsdPerMtok: 5,
    pricingSource: "openai_realtime_pricing_2026_09",
    textCachedInputUsdPerMtok: 0.4,
    textInputUsdPerMtok: 4,
    textOutputUsdPerMtok: 24,
  },
  "gpt-realtime-2.1-mini": {
    audioCachedInputUsdPerMtok: 0.3,
    audioInputUsdPerMtok: 10,
    audioOutputUsdPerMtok: 20,
    imageCachedInputUsdPerMtok: 0.08,
    imageInputUsdPerMtok: 0.8,
    pricingSource: "openai_realtime_pricing_2026_09",
    textCachedInputUsdPerMtok: 0.06,
    textInputUsdPerMtok: 0.6,
    textOutputUsdPerMtok: 2.4,
  },
};

export function getLlmModelPricing(
  model: string,
  _options: { at?: Date } = {}
): LlmModelPricing | null {
  const normalized = model.trim().toLowerCase();
  const exact = STATIC_MODEL_PRICING_USD_PER_MTOK[normalized];
  if (exact) return exact;
  const matchedKey = Object.keys(STATIC_MODEL_PRICING_USD_PER_MTOK)
    .sort((a, b) => b.length - a.length)
    .find((key) => normalized.startsWith(key));
  return matchedKey ? STATIC_MODEL_PRICING_USD_PER_MTOK[matchedKey] : null;
}

export function getRealtimeModelPricing(
  model: string
): RealtimeModelPricing | null {
  const normalized = model.trim().toLowerCase();
  const exact = REALTIME_MODEL_PRICING_USD_PER_MTOK[normalized];
  if (exact) return exact;
  const matchedKey = Object.keys(REALTIME_MODEL_PRICING_USD_PER_MTOK)
    .sort((a, b) => b.length - a.length)
    .find((key) => normalized.startsWith(key));
  return matchedKey ? REALTIME_MODEL_PRICING_USD_PER_MTOK[matchedKey] : null;
}

export const OPENAI_WEB_SEARCH_USD_PER_CALL = 0.01;
