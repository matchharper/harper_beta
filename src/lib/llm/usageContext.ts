import { AsyncLocalStorage } from "node:async_hooks";

// Request-local attribution, including nested model calls. Never shared across users.
export type LlmUsageContext = {
  userId?: string;
  conversationId?: string;
  sourceMessageId?: number;
  requestId: string;
  careerChannel?: "chat";
  careerOrigin?: "web" | "server";
  careerCapability?: Record<string, unknown>;
  /** Totals of every model call made inside one company Harper run (runUsage.ts). */
  companyRunUsage?: CompanyRunUsage;
  /**
   * The company Harper run (company_agent_web_action_jobs.id) this work is
   * part of. Searches started inside it are linked to it.
   */
  companyRunId?: string;
};

export type CompanyRunUsage = {
  cacheWriteTokens: number;
  cachedInputTokens: number;
  calls: number;
  costUsd: number;
  inputTokens: number;
  models: string[];
  outputTokens: number;
  unpricedCalls: number;
};
const context = new AsyncLocalStorage<LlmUsageContext>();
export const getLlmUsageContext = () => context.getStore();
export function withLlmUsageContext<T>(
  value: LlmUsageContext,
  work: () => T
): T {
  // A nested context still adds to the run it is part of.
  const outer = context.getStore();
  const runUsage = value.companyRunUsage ?? outer?.companyRunUsage;
  const runId = value.companyRunId ?? outer?.companyRunId;
  return context.run({
    ...value,
    ...(runUsage ? { companyRunUsage: runUsage } : {}),
    ...(runId ? { companyRunId: runId } : {}),
  }, work);
}
export function setCareerCapabilityUsageStep(step: Record<string, unknown>) {
  const current = context.getStore();
  if (current) current.careerCapability = step;
}
