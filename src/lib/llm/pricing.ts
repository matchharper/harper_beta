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
  "z-ai/glm-5.3-flash": {
    cacheReadUsdPerMtok: 0.015,
    inputUsdPerMtok: 0.075,
    outputUsdPerMtok: 0.25,
    pricingSource: "openrouter_pricing_2026_09_01",
  },
  "openrouter:z-ai/glm-5.3-flash": {
    cacheReadUsdPerMtok: 0.015,
    effectiveModel: "z-ai/glm-5.3-flash",
    inputUsdPerMtok: 0.075,
    outputUsdPerMtok: 0.25,
    pricingSource: "openrouter_pricing_2026_09_01",
  },
};

const DEEPSEEK_PRICING_EFFECTIVE_AT_UTC = Date.UTC(2026, 7, 16, 16, 0, 0);
const DEEPSEEK_PEAK_HOURS_UTC = [
  [1, 4],
  [6, 10],
] as const;
const DEEPSEEK_RATES = {
  flash: {
    legacy: { cached: 0.0028, input: 0.14, output: 0.28 },
    off_peak: { cached: 0.007, input: 0.22, output: 0.66 },
    peak: { cached: 0.014, input: 0.44, output: 1.32 },
  },
  pro: {
    legacy: { cached: 0.003625, input: 0.435, output: 0.87 },
    off_peak: { cached: 0.022, input: 0.66, output: 1.98 },
    peak: { cached: 0.044, input: 1.32, output: 3.96 },
  },
} as const;

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
  options: { at?: Date } = {}
): LlmModelPricing | null {
  const normalized = model.trim().toLowerCase();
  const deepseekFamily = normalized.startsWith("deepseek-v4-pro")
    ? "pro"
    : normalized.startsWith("deepseek-v4-flash") ||
        normalized === "deepseek-chat" ||
        normalized === "deepseek-reasoner"
      ? "flash"
      : null;
  if (deepseekFamily) {
    const at = options.at ?? new Date();
    const tier =
      at.getTime() < DEEPSEEK_PRICING_EFFECTIVE_AT_UTC
        ? "legacy"
        : DEEPSEEK_PEAK_HOURS_UTC.some(
              ([start, end]) => at.getUTCHours() >= start && at.getUTCHours() < end
            )
          ? "peak"
          : "off_peak";
    const rates = DEEPSEEK_RATES[deepseekFamily][tier];
    return {
      cacheReadUsdPerMtok: rates.cached,
      effectiveModel: `deepseek-v4-${deepseekFamily}`,
      inputUsdPerMtok: rates.input,
      outputUsdPerMtok: rates.output,
      pricingSource: `deepseek_api_pricing_2026_08_16:${tier}`,
      pricingTier: tier,
    };
  }

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

export const XAI_REALTIME_AUDIO_USD_PER_MINUTE = 0.05;
export const XAI_REALTIME_TEXT_INPUT_USD_PER_EVENT = 0.004;
export const OPENAI_WEB_SEARCH_USD_PER_CALL = 0.01;
