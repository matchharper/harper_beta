import { inspectApplicationForm } from "@/lib/career/simulation/applicationFormInspection";
import { estimateLlmUsageCost, extractLlmTokenUsage } from "@/lib/llm/usageLogging";
import type { InspectionStreamEvent, InspectionUsage } from "./applicationFormInspection";

export function createInspectionUsage() {
  const seen = new Set<string>();
  const sources = new Set<string>();
  let startedCount = 0;
  const total: InspectionUsage = { requests: 0, unpricedRequests: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, estimatedCostUsd: null, pricingSources: [] };
  return {
    add(receipts: { id?: string; model?: string; usage?: unknown }[], requestsStarted?: number) {
      startedCount = Math.max(startedCount, requestsStarted ?? 0);
      for (const receipt of receipts) {
        if (receipt.id && seen.has(receipt.id)) continue;
        if (receipt.id) seen.add(receipt.id);
        total.requests++;
        const usage = extractLlmTokenUsage(receipt);
        total.inputTokens += usage.inputTokens ?? 0;
        total.cachedInputTokens += usage.cacheReadInputTokens ?? 0;
        total.outputTokens += usage.outputTokens ?? 0;
        const cost = usage.inputTokens !== null && usage.outputTokens !== null && receipt.model
          ? estimateLlmUsageCost(receipt.model, usage) : null;
        if (cost) {
          total.estimatedCostUsd = (total.estimatedCostUsd ?? 0) + cost.estimatedCostUsd;
          sources.add(cost.pricingSource);
        } else total.unpricedRequests++;
      }
      return this.snapshot();
    },
    snapshot(): InspectionUsage {
      const pending = Math.max(0, startedCount - total.requests);
      return { ...total, requests: total.requests + pending, unpricedRequests: total.unpricedRequests + pending, pricingSources: [...sources] };
    },
  };
}

export async function runInspectionDebug(
  url: string,
  signal: AbortSignal,
  send: (event: InspectionStreamEvent) => void,
  inspect = inspectApplicationForm,
) {
  const runId = crypto.randomUUID(), started = Date.now();
  const startedAt = new Date(started).toISOString();
  const usage = createInspectionUsage();
  send({ type: "started", runId, startedAt, url });
  const form = await inspect(url, signal, {
    onEvent(event) {
      send({ type: "log", event });
      if (event.kind === "usage") {
        const data = event.data as { receipts: Parameters<ReturnType<typeof createInspectionUsage>["add"]>[0]; requestsStarted?: number };
        send({ type: "usage", usage: usage.add(data.receipts, data.requestsStarted) });
      }
    },
  });
  const result = { runId, url, startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - started, form, usage: usage.snapshot() };
  send({ type: "completed", result });
  return result;
}
