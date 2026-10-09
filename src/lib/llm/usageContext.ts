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
};
const context = new AsyncLocalStorage<LlmUsageContext>();
export const getLlmUsageContext = () => context.getStore();
export function withLlmUsageContext<T>(
  value: LlmUsageContext,
  work: () => T
): T {
  return context.run({ ...value }, work);
}
export function setCareerCapabilityUsageStep(step: Record<string, unknown>) {
  const current = context.getStore();
  if (current) current.careerCapability = step;
}
