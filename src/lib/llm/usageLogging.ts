type OpenAICompatibleUsage = {
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  completion_tokens?: number | null;
  input_tokens_details?: {
    cached_tokens?: number | null;
  } | null;
  input_tokens?: number | null;
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

const MODEL_PRICING_USD_PER_MTOK: Record<string, LlmModelPricing> = {
  "claude-sonnet-4-6": {
    cacheReadUsdPerMtok: 0.3,
    cacheWriteUsdPerMtok: 3.75,
    inputUsdPerMtok: 3,
    outputUsdPerMtok: 15,
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
  "grok-4-1-fast-non-reasoning": {
    cacheReadUsdPerMtok: 0.05,
    inputUsdPerMtok: 0.2,
    outputUsdPerMtok: 0.5,
  },
  "grok-4-1-fast-reasoning": {
    cacheReadUsdPerMtok: 0.05,
    inputUsdPerMtok: 0.2,
    outputUsdPerMtok: 0.5,
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

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
    usage?.input_tokens_details?.cached_tokens
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

export function logLlmTokenUsage(args: {
  label?: string;
  model: string;
  response: any;
}) {
  if (!args.label) return;

  const usage = extractLlmTokenUsage(args.response);
  const cost = estimateLlmUsageCost(args.model, usage);
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
