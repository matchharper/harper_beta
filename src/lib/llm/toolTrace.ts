import { AsyncLocalStorage } from "node:async_hooks";

export type ToolTraceEvent = {
  executionId: string;
  callId?: string;
  name: string;
  phase: "started" | "returned" | "threw";
  occurredAt: string;
  input?: unknown;
  result?: unknown;
  error?: unknown;
  diagnostics?: readonly unknown[];
  durationMs?: number;
};

const observers = new AsyncLocalStorage<
  (event: ToolTraceEvent) => Promise<void>
>();

/** Opt-in observer: execution records, never model context or control flow. */
export function withToolTrace<T>(
  observer: (event: ToolTraceEvent) => Promise<void>,
  work: () => T
): T {
  return observers.run(observer, work);
}

export function getToolTraceObserver() {
  const observer = observers.getStore();
  if (!observer) return undefined;
  return async (event: ToolTraceEvent) => {
    try {
      await observer(event);
    } catch (error) {
      console.warn("[tool-trace] Recording failed", error);
    }
  };
}
