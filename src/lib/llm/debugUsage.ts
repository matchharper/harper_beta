import {
  estimateLlmUsageCost,
  extractLlmTokenUsage,
} from "@/lib/llm/usageLogging";

export type LlmDebugCall = {
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  estimatedCostUsd: number | null;
  inputTokens: number;
  model: string;
  outputTokens: number;
  pricingStatus: "estimated" | "unpriced" | "usage_unavailable";
  processedInputTokens: number;
  step: string;
  totalTokens: number;
};

export type LlmDebugSummary = {
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  calls: LlmDebugCall[];
  completionCount: number;
  estimatedCostUsd: number | null;
  inputTokens: number;
  models: string[];
  outputTokens: number;
  pricingStatus: "estimated" | "partial" | "unpriced" | "usage_unavailable";
  processedInputTokens: number;
  totalTokens: number;
};

function numberOrZero(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function roundCost(value: number) {
  return Number(value.toFixed(8));
}

export function createLlmDebugCall(args: {
  model: string;
  response: any;
  step: string;
}): LlmDebugCall {
  const usage = extractLlmTokenUsage(args.response);
  const hasUsage = [
    usage.cacheCreationInputTokens,
    usage.cacheReadInputTokens,
    usage.inputTokens,
    usage.outputTokens,
    usage.totalTokens,
  ].some((value) => value !== null);
  const cost = hasUsage ? estimateLlmUsageCost(args.model, usage) : null;
  return {
    cacheCreationInputTokens: numberOrZero(usage.cacheCreationInputTokens),
    cacheReadInputTokens: numberOrZero(usage.cacheReadInputTokens),
    estimatedCostUsd: cost?.estimatedCostUsd ?? null,
    inputTokens: numberOrZero(usage.inputTokens),
    model: String(args.model || "unknown"),
    outputTokens: numberOrZero(usage.outputTokens),
    pricingStatus: !hasUsage
      ? "usage_unavailable"
      : cost
        ? "estimated"
        : "unpriced",
    processedInputTokens: numberOrZero(usage.totalProcessedInputTokens),
    step: args.step,
    totalTokens: numberOrZero(usage.totalTokens),
  };
}

export function summarizeLlmDebugCalls(
  calls: readonly LlmDebugCall[]
): LlmDebugSummary {
  const pricedCalls = calls.filter((call) => call.estimatedCostUsd !== null);
  const sum = (field: keyof LlmDebugCall) =>
    calls.reduce((total, call) => {
      const value = call[field];
      return total + (typeof value === "number" ? value : 0);
    }, 0);
  return {
    cacheCreationInputTokens: sum("cacheCreationInputTokens"),
    cacheReadInputTokens: sum("cacheReadInputTokens"),
    calls: [...calls],
    completionCount: calls.length,
    estimatedCostUsd:
      pricedCalls.length === 0
        ? null
        : roundCost(
            pricedCalls.reduce(
              (total, call) => total + (call.estimatedCostUsd ?? 0),
              0
            )
          ),
    inputTokens: sum("inputTokens"),
    models: Array.from(new Set(calls.map((call) => call.model))),
    outputTokens: sum("outputTokens"),
    pricingStatus:
      pricedCalls.length === 0
        ? calls.every((call) => call.pricingStatus === "usage_unavailable")
          ? "usage_unavailable"
          : "unpriced"
        : pricedCalls.length === calls.length
          ? "estimated"
          : "partial",
    processedInputTokens: sum("processedInputTokens"),
    totalTokens: sum("totalTokens"),
  };
}
