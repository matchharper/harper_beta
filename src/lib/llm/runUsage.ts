import { getLlmUsageContext, type CompanyRunUsage } from "./usageContext";

/**
 * Model usage of one company Harper run (company_agent_web_action_jobs.usage):
 * every chat completion made while the run's usage context is active adds to it.
 */
export function createCompanyRunUsage(): CompanyRunUsage {
  return {
    cacheWriteTokens: 0,
    cachedInputTokens: 0,
    calls: 0,
    costUsd: 0,
    inputTokens: 0,
    models: [],
    outputTokens: 0,
    unpricedCalls: 0,
  };
}

/** Never fails the model call: usage is best effort. */
export async function addLlmCallToRunUsage(model: string, response: unknown) {
  const totals = getLlmUsageContext()?.companyRunUsage;
  if (!totals) return;
  try {
    const { estimateLlmUsageCost, extractLlmTokenUsage } = await import("./usageLogging");
    const usage = extractLlmTokenUsage(response ?? {});
    totals.calls += 1;
    totals.inputTokens += usage.inputTokens ?? 0;
    totals.cachedInputTokens += usage.cacheReadInputTokens ?? 0;
    totals.cacheWriteTokens += usage.cacheCreationInputTokens ?? 0;
    totals.outputTokens += usage.outputTokens ?? 0;
    const cost = estimateLlmUsageCost(model, usage);
    if (cost) totals.costUsd += cost.estimatedCostUsd;
    else totals.unpricedCalls += 1;
    if (!totals.models.includes(model)) totals.models.push(model);
  } catch (error) {
    console.warn("[llm:run-usage]", error instanceof Error ? error.message : String(error));
  }
}

/** The stored shape, the same as company_agent_operations.usage. */
export function companyRunUsageJson(totals: CompanyRunUsage, elapsedMs: number) {
  return {
    cacheWriteTokens: totals.cacheWriteTokens,
    cachedInputTokens: totals.cachedInputTokens,
    calls: totals.calls,
    costComplete: totals.unpricedCalls === 0,
    costUsd: Math.round(totals.costUsd * 1e8) / 1e8,
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
    inputTokens: totals.inputTokens,
    models: totals.models,
    outputTokens: totals.outputTokens,
  };
}

type RunUsageJson = ReturnType<typeof companyRunUsageJson>;

/** A retried run keeps the usage of its earlier attempts. */
export function mergeRunUsage(previous: unknown, current: RunUsageJson): RunUsageJson & { attempts: number } {
  const before = previous && typeof previous === "object" ? (previous as Record<string, unknown>) : null;
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  if (!before) return { ...current, attempts: 1 };
  return {
    cacheWriteTokens: number(before.cacheWriteTokens) + current.cacheWriteTokens,
    cachedInputTokens: number(before.cachedInputTokens) + current.cachedInputTokens,
    calls: number(before.calls) + current.calls,
    costComplete: before.costComplete !== false && current.costComplete,
    costUsd: Math.round((number(before.costUsd) + current.costUsd) * 1e8) / 1e8,
    elapsedMs: number(before.elapsedMs) + current.elapsedMs,
    inputTokens: number(before.inputTokens) + current.inputTokens,
    models: [...new Set([...(Array.isArray(before.models) ? before.models.map(String) : []), ...current.models])],
    outputTokens: number(before.outputTokens) + current.outputTokens,
    attempts: Math.max(1, number(before.attempts)) + 1,
  };
}
