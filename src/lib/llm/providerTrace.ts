import { AsyncLocalStorage } from "node:async_hooks";

/** Opt-in, request-local diagnostics. Credentials and headers are never captured. */
export type LlmProviderExchange = {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  endpoint: string;
  method: string;
  request: unknown;
  response?: unknown;
  status?: number;
  error?: string;
};

const observers = new AsyncLocalStorage<(exchange: LlmProviderExchange) => void>();

export function withLlmProviderTrace<T>(
  onExchange: (exchange: LlmProviderExchange) => void,
  work: () => T
): T {
  return observers.run(onExchange, work);
}

function decode(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}

export const tracedLlmFetch: typeof fetch = async (input, init) => {
  const observe = observers.getStore();
  if (!observe) return fetch(input, init);
  const started = Date.now();
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const body = typeof init?.body === "string"
    ? init.body
    : input instanceof Request ? await input.clone().text() : "";
  const common = {
    startedAt: new Date(started).toISOString(),
    endpoint: url.origin + url.pathname,
    method: init?.method ?? (input instanceof Request ? input.method : "GET"),
    request: decode(body),
  };
  const emit = (result: Omit<LlmProviderExchange, keyof typeof common | "completedAt" | "durationMs">) => {
    try {
      observe({ ...common, ...result, completedAt: new Date().toISOString(), durationMs: Date.now() - started });
    } catch {
      // A diagnostic observer must not change the model execution outcome.
    }
  };
  try {
    const response = await fetch(input, init);
    // Suggestion generation is non-streaming. Leave streaming bodies untouched.
    const contentType = response.headers.get("content-type") ?? "";
    let captured: unknown = { streaming: true };
    if (!contentType.includes("text/event-stream")) {
      try { captured = decode(await response.clone().text()); }
      catch { captured = { captureError: "Response body could not be captured" }; }
    }
    emit({ status: response.status, response: captured });
    return response;
  } catch (error) {
    emit({ error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
};
