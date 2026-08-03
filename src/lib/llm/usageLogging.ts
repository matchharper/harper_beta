import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  CLAUDE_CACHE_READ_USD_PER_MTOK,
  CLAUDE_CACHE_WRITE_USD_PER_MTOK,
  CLAUDE_INPUT_USD_PER_MTOK,
  CLAUDE_MODEL,
  CLAUDE_OUTPUT_USD_PER_MTOK,
  GPT_56_LUNA_CACHE_READ_USD_PER_MTOK,
  GPT_56_LUNA_CACHE_WRITE_USD_PER_MTOK,
  GPT_56_LUNA_INPUT_USD_PER_MTOK,
  GPT_56_LUNA_MODEL,
  GPT_56_LUNA_OUTPUT_USD_PER_MTOK,
} from "@/lib/llm/modelConfig";

type OpenAICompatibleUsage = {
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  completion_tokens?: number | null;
  cost_in_usd_ticks?: number | null;
  input_token_details?: {
    audio_tokens?: number | null;
    cached_tokens?: number | null;
    cached_tokens_details?: {
      audio_tokens?: number | null;
      image_tokens?: number | null;
      text_tokens?: number | null;
    } | null;
    image_tokens?: number | null;
    text_tokens?: number | null;
  } | null;
  input_tokens_details?: {
    cached_tokens?: number | null;
  } | null;
  input_tokens?: number | null;
  output_token_details?: {
    audio_tokens?: number | null;
    image_tokens?: number | null;
    text_tokens?: number | null;
  } | null;
  output_tokens?: number | null;
  prompt_tokens_details?: {
    cached_tokens?: number | null;
  } | null;
  prompt_tokens?: number | null;
  total_tokens?: number | null;
};

type LlmModelPricing = {
  cacheReadUsdPerMtok?: number;
  cacheWriteUsdPerMtok?: number;
  inputUsdPerMtok: number;
  longContextInputUsdPerMtok?: number;
  longContextOutputUsdPerMtok?: number;
  longContextThresholdTokens?: number;
  outputUsdPerMtok: number;
};

type LlmTokenUsage = {
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
  cacheReadInputTokensIncludedInInput: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  totalProcessedInputTokens: number | null;
  totalTokens: number | null;
};

type RealtimeModelPricing = {
  audioCachedInputUsdPerMtok: number;
  audioInputUsdPerMtok: number;
  audioOutputUsdPerMtok: number;
  imageCachedInputUsdPerMtok: number;
  imageInputUsdPerMtok: number;
  textCachedInputUsdPerMtok: number;
  textInputUsdPerMtok: number;
  textOutputUsdPerMtok: number;
};

type RealtimeTokenUsage = {
  cachedAudioInputTokens: number | null;
  cachedImageInputTokens: number | null;
  cachedInputTokens: number | null;
  cachedTextInputTokens: number | null;
  inputAudioTokens: number | null;
  inputImageTokens: number | null;
  inputTextTokens: number | null;
  inputTokens: number | null;
  outputAudioTokens: number | null;
  outputImageTokens: number | null;
  outputTextTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  unattributedCachedInputTokens: number;
  unattributedInputTokens: number;
  unattributedOutputTokens: number;
};

export type RealtimeBillingUsage = {
  audioDurationSeconds?: number | null;
  billingBasis?: "audio_duration" | "session_duration_fallback" | null;
  inputAudioSeconds?: number | null;
  outputAudioSeconds?: number | null;
  sessionDurationSeconds?: number | null;
  sessionEndedAt?: string | null;
  sessionStartedAt?: string | null;
  textInputEventCount?: number | null;
};

const XAI_REALTIME_AUDIO_USD_PER_MINUTE = 0.05;
const XAI_REALTIME_TEXT_INPUT_USD_PER_EVENT = 0.004;

const LLM_LOG_TOOL_NAMES = [
  "recommend_job_postings",
  "read_recommended_opportunities",
  "get_internal_roles",
  "internal_role_priority_review",
  "get_role_context",
  "update_recommended_opportunity_feedback",
  "web_search",
  "open_url",
  "research_company",
  "lookup_answer_examples",
  "read_talent_activity_events",
  "update_setting",
  "update_talent_profile",
  "record_internal_fit_reevaluation_information",
] as const;

const LLM_LOG_SOURCES: readonly string[] = [
  "career/profile_ingestion",
  "career/chat",
  "career/internal-opportunity-call-request",
  "org/intro-email",
  ...LLM_LOG_TOOL_NAMES.map((name) => `career_tool:${name}`),
];

const TOOL_LLM_LOG_NAMES = new Set<string>(LLM_LOG_TOOL_NAMES);

const MODEL_PRICING_USD_PER_MTOK: Record<string, LlmModelPricing> = {
  [CLAUDE_MODEL]: {
    cacheReadUsdPerMtok: CLAUDE_CACHE_READ_USD_PER_MTOK,
    cacheWriteUsdPerMtok: CLAUDE_CACHE_WRITE_USD_PER_MTOK,
    inputUsdPerMtok: CLAUDE_INPUT_USD_PER_MTOK,
    outputUsdPerMtok: CLAUDE_OUTPUT_USD_PER_MTOK,
  },
  "gpt-4.1-mini": {
    cacheReadUsdPerMtok: 0.1,
    inputUsdPerMtok: 0.4,
    outputUsdPerMtok: 1.6,
  },
  "gpt-5-mini": {
    cacheReadUsdPerMtok: 0.025,
    inputUsdPerMtok: 0.25,
    outputUsdPerMtok: 2,
  },
  [GPT_56_LUNA_MODEL]: {
    cacheReadUsdPerMtok: GPT_56_LUNA_CACHE_READ_USD_PER_MTOK,
    cacheWriteUsdPerMtok: GPT_56_LUNA_CACHE_WRITE_USD_PER_MTOK,
    inputUsdPerMtok: GPT_56_LUNA_INPUT_USD_PER_MTOK,
    outputUsdPerMtok: GPT_56_LUNA_OUTPUT_USD_PER_MTOK,
  },
  "grok-4.3": {
    cacheReadUsdPerMtok: 0.2,
    inputUsdPerMtok: 1.25,
    outputUsdPerMtok: 2.5,
  },
  "grok-4-fast-non-reasoning": {
    cacheReadUsdPerMtok: 0.05,
    inputUsdPerMtok: 0.2,
    longContextInputUsdPerMtok: 0.4,
    longContextOutputUsdPerMtok: 1,
    longContextThresholdTokens: 128_000,
    outputUsdPerMtok: 0.5,
  },
  "grok-4-fast-reasoning": {
    cacheReadUsdPerMtok: 0.05,
    inputUsdPerMtok: 0.2,
    longContextInputUsdPerMtok: 0.4,
    longContextOutputUsdPerMtok: 1,
    longContextThresholdTokens: 128_000,
    outputUsdPerMtok: 0.5,
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
    textCachedInputUsdPerMtok: 0.06,
    textInputUsdPerMtok: 0.6,
    textOutputUsdPerMtok: 2.4,
  },
};

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toNullableNonNegativeNumber(value: unknown): number | null {
  const number = toNullableNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizeRealtimeBillingUsage(
  value: unknown
): RealtimeBillingUsage | null {
  if (!isRecord(value)) return null;

  const billing: RealtimeBillingUsage = {
    audioDurationSeconds: toNullableNonNegativeNumber(
      value.audioDurationSeconds
    ),
    billingBasis:
      value.billingBasis === "audio_duration" ||
      value.billingBasis === "session_duration_fallback"
        ? value.billingBasis
        : null,
    inputAudioSeconds: toNullableNonNegativeNumber(value.inputAudioSeconds),
    outputAudioSeconds: toNullableNonNegativeNumber(value.outputAudioSeconds),
    sessionDurationSeconds: toNullableNonNegativeNumber(
      value.sessionDurationSeconds
    ),
    sessionEndedAt:
      typeof value.sessionEndedAt === "string"
        ? value.sessionEndedAt.trim().slice(0, 80) || null
        : null,
    sessionStartedAt:
      typeof value.sessionStartedAt === "string"
        ? value.sessionStartedAt.trim().slice(0, 80) || null
        : null,
    textInputEventCount: toNullableNonNegativeNumber(value.textInputEventCount),
  };

  const hasMeasurement = Object.entries(billing).some(([key, field]) => {
    if (
      key === "billingBasis" ||
      key === "sessionStartedAt" ||
      key === "sessionEndedAt"
    ) {
      return field !== null;
    }
    return field !== null && field !== undefined;
  });
  return hasMeasurement ? billing : null;
}

function getModelPricing(model: string): LlmModelPricing | null {
  const normalized = model.trim().toLowerCase();
  if (MODEL_PRICING_USD_PER_MTOK[normalized]) {
    return MODEL_PRICING_USD_PER_MTOK[normalized];
  }

  const matchedKey = Object.keys(MODEL_PRICING_USD_PER_MTOK).find((key) =>
    normalized.startsWith(key)
  );
  return matchedKey ? MODEL_PRICING_USD_PER_MTOK[matchedKey] : null;
}

function getRealtimeModelPricing(model: string): RealtimeModelPricing | null {
  const normalized = model.trim().toLowerCase();
  if (REALTIME_MODEL_PRICING_USD_PER_MTOK[normalized]) {
    return REALTIME_MODEL_PRICING_USD_PER_MTOK[normalized];
  }

  const matchedKey = Object.keys(REALTIME_MODEL_PRICING_USD_PER_MTOK)
    .sort((a, b) => b.length - a.length)
    .find((key) => normalized.startsWith(key));
  return matchedKey ? REALTIME_MODEL_PRICING_USD_PER_MTOK[matchedKey] : null;
}

function resolvePricingForUsage(
  pricing: LlmModelPricing,
  usage: LlmTokenUsage
) {
  const shouldUseLongContextPricing =
    pricing.longContextThresholdTokens !== undefined &&
    (usage.totalProcessedInputTokens ?? 0) >=
      pricing.longContextThresholdTokens;

  return {
    cacheReadUsdPerMtok: pricing.cacheReadUsdPerMtok ?? pricing.inputUsdPerMtok,
    cacheWriteUsdPerMtok:
      pricing.cacheWriteUsdPerMtok ?? pricing.inputUsdPerMtok,
    inputUsdPerMtok:
      shouldUseLongContextPricing &&
      pricing.longContextInputUsdPerMtok !== undefined
        ? pricing.longContextInputUsdPerMtok
        : pricing.inputUsdPerMtok,
    outputUsdPerMtok:
      shouldUseLongContextPricing &&
      pricing.longContextOutputUsdPerMtok !== undefined
        ? pricing.longContextOutputUsdPerMtok
        : pricing.outputUsdPerMtok,
  };
}

function roundCost(value: number) {
  return Number(value.toFixed(8));
}

export function extractLlmTokenUsage(response: any): LlmTokenUsage {
  const usage = (response?.usage ?? null) as OpenAICompatibleUsage | null;
  const responseInputCacheReadTokens = toNullableNumber(
    usage?.input_tokens_details?.cached_tokens ??
      usage?.input_token_details?.cached_tokens
  );
  const chatInputCacheReadTokens = toNullableNumber(
    usage?.prompt_tokens_details?.cached_tokens
  );
  const nestedCacheReadInputTokens =
    responseInputCacheReadTokens ?? chatInputCacheReadTokens;
  const cacheCreationInputTokens = toNullableNumber(
    usage?.cache_creation_input_tokens
  );
  const explicitCacheReadInputTokens = toNullableNumber(
    usage?.cache_read_input_tokens
  );
  const cacheReadInputTokens =
    explicitCacheReadInputTokens ?? nestedCacheReadInputTokens;
  const cacheReadInputTokensIncludedInInput =
    explicitCacheReadInputTokens === null &&
    nestedCacheReadInputTokens !== null;
  const inputTokens = toNullableNumber(
    usage?.prompt_tokens ?? usage?.input_tokens
  );
  const outputTokens = toNullableNumber(
    usage?.completion_tokens ?? usage?.output_tokens
  );
  const inputTokensAlreadyIncludeCacheRead =
    cacheReadInputTokensIncludedInInput && inputTokens !== null;
  const totalProcessedInputTokens = toNullableNumber(
    (inputTokens ?? 0) +
      (cacheCreationInputTokens ?? 0) +
      (inputTokensAlreadyIncludeCacheRead ? 0 : (cacheReadInputTokens ?? 0))
  );
  const totalTokens = toNullableNumber(
    usage?.total_tokens ??
      (totalProcessedInputTokens !== null && outputTokens !== null
        ? totalProcessedInputTokens + outputTokens
        : null)
  );

  return {
    cacheCreationInputTokens,
    cacheReadInputTokens,
    cacheReadInputTokensIncludedInInput,
    inputTokens,
    outputTokens,
    totalProcessedInputTokens,
    totalTokens,
  };
}

export function estimateLlmUsageCost(model: string, usage: LlmTokenUsage) {
  const basePricing = getModelPricing(model);
  if (!basePricing) return null;

  const pricing = resolvePricingForUsage(basePricing, usage);
  const cacheCreationInputTokens = usage.cacheCreationInputTokens ?? 0;
  const cacheReadInputTokens = usage.cacheReadInputTokens ?? 0;
  const inputTokens = usage.inputTokens ?? 0;
  const standardInputTokens = Math.max(
    inputTokens -
      (usage.cacheReadInputTokensIncludedInInput ? cacheReadInputTokens : 0),
    0
  );
  const outputTokens = usage.outputTokens ?? 0;

  const inputCostUsd =
    (standardInputTokens / 1_000_000) * pricing.inputUsdPerMtok;
  const cacheReadCostUsd =
    (cacheReadInputTokens / 1_000_000) * pricing.cacheReadUsdPerMtok;
  const cacheWriteCostUsd =
    (cacheCreationInputTokens / 1_000_000) * pricing.cacheWriteUsdPerMtok;
  const outputCostUsd = (outputTokens / 1_000_000) * pricing.outputUsdPerMtok;

  return {
    cacheReadCostUsd: roundCost(cacheReadCostUsd),
    cacheReadInputTokens,
    cacheReadUsdPerMtok: pricing.cacheReadUsdPerMtok,
    cacheWriteCostUsd: roundCost(cacheWriteCostUsd),
    cacheWriteInputTokens: cacheCreationInputTokens,
    cacheWriteUsdPerMtok: pricing.cacheWriteUsdPerMtok,
    estimatedCostUsd: roundCost(
      inputCostUsd + cacheReadCostUsd + cacheWriteCostUsd + outputCostUsd
    ),
    inputCostUsd: roundCost(inputCostUsd),
    inputTokens: standardInputTokens,
    inputUsdPerMtok: pricing.inputUsdPerMtok,
    outputCostUsd: roundCost(outputCostUsd),
    outputTokens,
    outputUsdPerMtok: pricing.outputUsdPerMtok,
  };
}

function numberOrZero(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function extractRealtimeLlmTokenUsage(
  response: any
): RealtimeTokenUsage {
  const usage = (response?.usage ??
    response ??
    null) as OpenAICompatibleUsage | null;
  const inputDetails = usage?.input_token_details ?? null;
  const outputDetails = usage?.output_token_details ?? null;
  const cachedDetails = inputDetails?.cached_tokens_details ?? null;

  const inputTokens = toNullableNumber(usage?.input_tokens);
  const outputTokens = toNullableNumber(usage?.output_tokens);
  const totalTokens = toNullableNumber(usage?.total_tokens);
  const inputTextTokens = toNullableNumber(inputDetails?.text_tokens);
  const inputAudioTokens = toNullableNumber(inputDetails?.audio_tokens);
  const inputImageTokens = toNullableNumber(inputDetails?.image_tokens);
  const cachedInputTokens = toNullableNumber(inputDetails?.cached_tokens);
  const cachedTextInputTokens = toNullableNumber(cachedDetails?.text_tokens);
  const cachedAudioInputTokens = toNullableNumber(cachedDetails?.audio_tokens);
  const cachedImageInputTokens = toNullableNumber(cachedDetails?.image_tokens);
  const outputTextTokens = toNullableNumber(outputDetails?.text_tokens);
  const outputAudioTokens = toNullableNumber(outputDetails?.audio_tokens);
  const outputImageTokens = toNullableNumber(outputDetails?.image_tokens);

  const knownInputTokens =
    numberOrZero(inputTextTokens) +
    numberOrZero(inputAudioTokens) +
    numberOrZero(inputImageTokens);
  const knownCachedInputTokens =
    numberOrZero(cachedTextInputTokens) +
    numberOrZero(cachedAudioInputTokens) +
    numberOrZero(cachedImageInputTokens);
  const knownOutputTokens =
    numberOrZero(outputTextTokens) +
    numberOrZero(outputAudioTokens) +
    numberOrZero(outputImageTokens);

  return {
    cachedAudioInputTokens,
    cachedImageInputTokens,
    cachedInputTokens,
    cachedTextInputTokens,
    inputAudioTokens,
    inputImageTokens,
    inputTextTokens,
    inputTokens,
    outputAudioTokens,
    outputImageTokens,
    outputTextTokens,
    outputTokens,
    totalTokens,
    unattributedCachedInputTokens: Math.max(
      numberOrZero(cachedInputTokens) - knownCachedInputTokens,
      0
    ),
    unattributedInputTokens: Math.max(
      numberOrZero(inputTokens) - knownInputTokens,
      0
    ),
    unattributedOutputTokens: Math.max(
      numberOrZero(outputTokens) - knownOutputTokens,
      0
    ),
  };
}

export function estimateRealtimeLlmUsageCost(
  model: string,
  usage: RealtimeTokenUsage
) {
  const pricing = getRealtimeModelPricing(model);
  if (!pricing) return null;

  const cachedTextInputTokens = numberOrZero(usage.cachedTextInputTokens);
  const cachedAudioInputTokens = numberOrZero(usage.cachedAudioInputTokens);
  const cachedImageInputTokens = numberOrZero(usage.cachedImageInputTokens);
  const uncachedTextInputTokens = Math.max(
    numberOrZero(usage.inputTextTokens) - cachedTextInputTokens,
    0
  );
  const uncachedAudioInputTokens = Math.max(
    numberOrZero(usage.inputAudioTokens) - cachedAudioInputTokens,
    0
  );
  const uncachedImageInputTokens = Math.max(
    numberOrZero(usage.inputImageTokens) - cachedImageInputTokens,
    0
  );

  const textInputCostUsd =
    (uncachedTextInputTokens / 1_000_000) * pricing.textInputUsdPerMtok;
  const audioInputCostUsd =
    (uncachedAudioInputTokens / 1_000_000) * pricing.audioInputUsdPerMtok;
  const imageInputCostUsd =
    (uncachedImageInputTokens / 1_000_000) * pricing.imageInputUsdPerMtok;
  const cachedTextInputCostUsd =
    (cachedTextInputTokens / 1_000_000) * pricing.textCachedInputUsdPerMtok;
  const cachedAudioInputCostUsd =
    (cachedAudioInputTokens / 1_000_000) * pricing.audioCachedInputUsdPerMtok;
  const cachedImageInputCostUsd =
    (cachedImageInputTokens / 1_000_000) * pricing.imageCachedInputUsdPerMtok;
  const unattributedInputCostUsd =
    (usage.unattributedInputTokens / 1_000_000) * pricing.textInputUsdPerMtok;
  const unattributedCachedInputCostUsd =
    (usage.unattributedCachedInputTokens / 1_000_000) *
    pricing.textCachedInputUsdPerMtok;
  const textOutputCostUsd =
    (numberOrZero(usage.outputTextTokens) / 1_000_000) *
    pricing.textOutputUsdPerMtok;
  const audioOutputCostUsd =
    (numberOrZero(usage.outputAudioTokens) / 1_000_000) *
    pricing.audioOutputUsdPerMtok;
  const unattributedOutputCostUsd =
    (usage.unattributedOutputTokens / 1_000_000) * pricing.textOutputUsdPerMtok;

  const estimatedCostUsd =
    textInputCostUsd +
    audioInputCostUsd +
    imageInputCostUsd +
    cachedTextInputCostUsd +
    cachedAudioInputCostUsd +
    cachedImageInputCostUsd +
    unattributedInputCostUsd +
    unattributedCachedInputCostUsd +
    textOutputCostUsd +
    audioOutputCostUsd +
    unattributedOutputCostUsd;

  return {
    audioInputCostUsd: roundCost(audioInputCostUsd),
    audioInputTokens: uncachedAudioInputTokens,
    audioInputUsdPerMtok: pricing.audioInputUsdPerMtok,
    audioOutputCostUsd: roundCost(audioOutputCostUsd),
    audioOutputTokens: numberOrZero(usage.outputAudioTokens),
    audioOutputUsdPerMtok: pricing.audioOutputUsdPerMtok,
    cachedAudioInputCostUsd: roundCost(cachedAudioInputCostUsd),
    cachedAudioInputTokens,
    cachedAudioInputUsdPerMtok: pricing.audioCachedInputUsdPerMtok,
    cachedImageInputCostUsd: roundCost(cachedImageInputCostUsd),
    cachedImageInputTokens,
    cachedImageInputUsdPerMtok: pricing.imageCachedInputUsdPerMtok,
    cachedTextInputCostUsd: roundCost(cachedTextInputCostUsd),
    cachedTextInputTokens,
    cachedTextInputUsdPerMtok: pricing.textCachedInputUsdPerMtok,
    estimatedCostUsd: roundCost(estimatedCostUsd),
    imageInputCostUsd: roundCost(imageInputCostUsd),
    imageInputTokens: uncachedImageInputTokens,
    imageInputUsdPerMtok: pricing.imageInputUsdPerMtok,
    textInputCostUsd: roundCost(textInputCostUsd),
    textInputTokens: uncachedTextInputTokens,
    textInputUsdPerMtok: pricing.textInputUsdPerMtok,
    textOutputCostUsd: roundCost(textOutputCostUsd),
    textOutputTokens: numberOrZero(usage.outputTextTokens),
    textOutputUsdPerMtok: pricing.textOutputUsdPerMtok,
    unattributedCachedInputCostUsd: roundCost(unattributedCachedInputCostUsd),
    unattributedCachedInputTokens: usage.unattributedCachedInputTokens,
    unattributedInputCostUsd: roundCost(unattributedInputCostUsd),
    unattributedInputTokens: usage.unattributedInputTokens,
    unattributedOutputCostUsd: roundCost(unattributedOutputCostUsd),
    unattributedOutputTokens: usage.unattributedOutputTokens,
  };
}

export function estimateXaiRealtimeUsageCost(
  model: string,
  billing: RealtimeBillingUsage | null | undefined
) {
  if (!model.trim().toLowerCase().startsWith("grok-voice")) return null;

  const normalizedBilling = normalizeRealtimeBillingUsage(billing);
  if (!normalizedBilling) return null;

  const inputAudioSeconds = numberOrZero(normalizedBilling.inputAudioSeconds);
  const outputAudioSeconds = numberOrZero(normalizedBilling.outputAudioSeconds);
  const explicitAudioDurationSeconds = toNullableNonNegativeNumber(
    normalizedBilling.audioDurationSeconds
  );
  const sessionDurationSeconds = toNullableNonNegativeNumber(
    normalizedBilling.sessionDurationSeconds
  );
  const audioDurationSeconds =
    explicitAudioDurationSeconds ??
    (normalizedBilling.inputAudioSeconds !== null ||
    normalizedBilling.outputAudioSeconds !== null
      ? inputAudioSeconds + outputAudioSeconds
      : (sessionDurationSeconds ?? 0));
  const textInputEventCount = numberOrZero(
    normalizedBilling.textInputEventCount
  );
  const hasAudioMeasurement =
    explicitAudioDurationSeconds !== null ||
    normalizedBilling.inputAudioSeconds !== null ||
    normalizedBilling.outputAudioSeconds !== null ||
    sessionDurationSeconds !== null;
  const hasTextMeasurement = normalizedBilling.textInputEventCount !== null;

  if (!hasAudioMeasurement && !hasTextMeasurement) return null;

  const audioCostUsd =
    (audioDurationSeconds / 60) * XAI_REALTIME_AUDIO_USD_PER_MINUTE;
  const textInputCostUsd =
    textInputEventCount * XAI_REALTIME_TEXT_INPUT_USD_PER_EVENT;
  const usesSessionFallback =
    explicitAudioDurationSeconds === null &&
    normalizedBilling.inputAudioSeconds === null &&
    normalizedBilling.outputAudioSeconds === null &&
    sessionDurationSeconds !== null;

  return {
    audioCostUsd: roundCost(audioCostUsd),
    audioDurationSeconds: roundCost(audioDurationSeconds),
    audioUsdPerMinute: XAI_REALTIME_AUDIO_USD_PER_MINUTE,
    billingBasis: usesSessionFallback
      ? "session_duration_fallback"
      : "audio_duration",
    estimatedCostUsd: roundCost(audioCostUsd + textInputCostUsd),
    inputAudioSeconds: roundCost(inputAudioSeconds),
    outputAudioSeconds: roundCost(outputAudioSeconds),
    pricingSource: "xai_official_voice_api",
    sessionDurationSeconds:
      sessionDurationSeconds === null
        ? null
        : roundCost(sessionDurationSeconds),
    textInputCostUsd: roundCost(textInputCostUsd),
    textInputEventCount,
    textInputUsdPerEvent: XAI_REALTIME_TEXT_INPUT_USD_PER_EVENT,
  };
}

export function logLlmTokenUsage(args: {
  extraEstimatedCostUsd?: number;
  label?: string;
  meta?: Record<string, unknown>;
  model: string;
  response: any;
}) {
  if (!args.label) return;

  const usage = extractLlmTokenUsage(args.response);
  const cost = estimateLlmUsageCost(args.model, usage);
  const extraEstimatedCostUsd =
    typeof args.extraEstimatedCostUsd === "number" &&
    Number.isFinite(args.extraEstimatedCostUsd)
      ? args.extraEstimatedCostUsd
      : 0;
  const target = resolveLlmLogTarget(args.label);
  if (!target) return;

  void insertLlmLog({
    estimatedCostUsd: (cost?.estimatedCostUsd ?? 0) + extraEstimatedCostUsd,
    meta: {
      ...(args.meta ?? {}),
      ...(extraEstimatedCostUsd > 0 ? { extraEstimatedCostUsd } : {}),
      costKind: "actual",
      label: args.label,
      step: target.step,
      usage,
    },
    model: args.model,
    source: target.source,
  });
  // console.info("[llm-usage]", {
  //   label: args.label,
  //   model: args.model,
  //   cacheCreationInputTokens: usage.cacheCreationInputTokens,
  //   cacheHit: (usage.cacheReadInputTokens ?? 0) > 0,
  //   cacheReadInputTokens: usage.cacheReadInputTokens,
  //   inputTokens: usage.inputTokens,
  //   outputTokens: usage.outputTokens,
  //   totalProcessedInputTokens: usage.totalProcessedInputTokens,
  //   totalTokens: usage.totalTokens,
  //   estimatedCostUsd: cost?.estimatedCostUsd ?? null,
  //   costBreakdown: cost,
  // });
}

export function logLlmTokenUsageForToolCalls(args: {
  baseLabel?: string | null;
  model: string;
  response: any;
  step: string;
  toolNames: readonly string[];
}) {
  const toolNames = Array.from(
    new Set(
      args.toolNames
        .map((name) => String(name ?? "").trim())
        .filter((name) => TOOL_LLM_LOG_NAMES.has(name))
    )
  );
  if (toolNames.length === 0) return;

  const usage = extractLlmTokenUsage(args.response);
  const cost = estimateLlmUsageCost(args.model, usage);
  const attributedEstimatedCostUsd =
    (cost?.estimatedCostUsd ?? 0) / toolNames.length;

  for (const toolName of toolNames) {
    const source = `career_tool:${toolName}`;
    void insertLlmLog({
      estimatedCostUsd: attributedEstimatedCostUsd,
      meta: {
        attributedEstimatedCostUsd,
        attributionCount: toolNames.length,
        costKind: "attribution",
        label: `${source}:${args.step}`,
        parentLabel: args.baseLabel ?? null,
        step: args.step,
        toolName,
        usage,
      },
      model: args.model,
      source,
    });
  }
}

export async function insertRealtimeLlmUsageLog(args: {
  billing?: RealtimeBillingUsage | null;
  meta?: Record<string, unknown>;
  model: string;
  response: any;
}) {
  const usage = extractRealtimeLlmTokenUsage(args.response);
  const durationBasedCost = estimateXaiRealtimeUsageCost(
    args.model,
    args.billing
  );
  const estimatedCost =
    durationBasedCost ?? estimateRealtimeLlmUsageCost(args.model, usage);
  const providerCostTicks = toNullableNumber(
    args.response?.usage?.cost_in_usd_ticks
  );
  const providerCostUsd =
    providerCostTicks === null ? null : providerCostTicks / 10_000_000_000;
  const costStatus =
    providerCostUsd !== null
      ? "provider_reported"
      : estimatedCost !== null
        ? "estimated"
        : "unpriced";

  await insertLlmLog({
    costStatus,
    estimatedCostUsd: providerCostUsd ?? estimatedCost?.estimatedCostUsd ?? 0,
    meta: {
      costKind: providerCostUsd !== null ? "actual" : costStatus,
      costStatus,
      label: "career/realtime:response",
      step: "response",
      usage,
      costBreakdown:
        providerCostUsd === null
          ? (estimatedCost ?? { source: "unpriced" })
          : {
              estimatedCostUsd: providerCostUsd,
              providerCostTicks,
              source: "provider_reported",
            },
      ...(args.billing ? { billing: args.billing } : {}),
      ...(args.meta ?? {}),
    },
    model: args.model,
    source: "career/realtime",
  });
}

function resolveLlmLogTarget(label: string) {
  const normalized = label.trim();
  for (const source of LLM_LOG_SOURCES) {
    const prefix = `${source}:`;
    if (normalized.startsWith(prefix)) {
      return {
        source,
        step: normalized.slice(prefix.length) || null,
      };
    }
  }
  return null;
}

async function insertLlmLog(args: {
  costStatus?: "priced" | "estimated" | "provider_reported" | "unpriced";
  estimatedCostUsd: number;
  meta: Record<string, unknown>;
  model: string;
  source: string;
}) {
  try {
    const admin = getTalentSupabaseAdmin() as any;
    const { error } = await admin.from("llm_logs").insert({
      cost_status: args.costStatus ?? "priced",
      estimated_cost_usd: Number.isFinite(args.estimatedCostUsd)
        ? args.estimatedCostUsd
        : 0,
      meta: args.meta,
      model: args.model,
      source: args.source,
    });
    if (error) {
      console.warn("[llm-logs] insert skipped:", error.message);
    }
  } catch (error) {
    console.warn(
      "[llm-logs] insert skipped:",
      error instanceof Error ? error.message : String(error)
    );
  }
}
