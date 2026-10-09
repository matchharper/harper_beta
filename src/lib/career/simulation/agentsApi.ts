export class ApplicationBrowserApiError extends Error {
  constructor(readonly status: number) {
    super(`Application browser API returned ${status}`);
  }
}
/** Isolated Agents API transport; existing chat SDK/provider configuration is unchanged. */
export async function agentsRequest<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST"
): Promise<T> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Application browser is not configured");
  const response = await fetch(`https://api.openai.com/v1/agents/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "OpenAI-Beta": "agents=v1",
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new ApplicationBrowserApiError(response.status);
  if (response.status === 204) return {} as T;
  const text = await response.text();
  return (text.trim() ? JSON.parse(text) : {}) as T;
}
export async function browserEvent(sessionId: string, event: unknown) {
  return agentsRequest(`sessions/${encodeURIComponent(sessionId)}/events`, {
    events: [event],
  });
}
export async function cancelBrowserSession(sessionId: string) {
  try {
    await browserEvent(sessionId, { type: "agent.session.input.cancel" });
  } catch (error) {
    // A deleted provider session has no remaining work to cancel.
    if (!(error instanceof ApplicationBrowserApiError && error.status === 404)) throw error;
  }
}
export async function* browserEvents(sessionId: string, signal: AbortSignal) {
  const response = await fetch(
    `https://api.openai.com/v1/agents/sessions/${encodeURIComponent(sessionId)}/events?stream=true`,
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "agents=v1",
        Accept: "text/event-stream",
      },
      signal,
    }
  );
  if (!response.ok || !response.body)
    throw new Error(`Browser stream unavailable (${response.status})`);
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      pending += decoder
        .decode(chunk.value, { stream: true })
        .replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = pending.indexOf("\n\n")) >= 0) {
        const event = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);
        const data = event
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (data && data !== "[DONE]")
          yield JSON.parse(data) as Record<string, any>;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Finished runs may retain their provider reference after resource cleanup. */
export async function stopApplicationBrowser(browser?: {status: string; sessionId?: string}) {
  if (browser?.sessionId && ["queued", "running", "waiting"].includes(browser.status)) {
    await cancelBrowserSession(browser.sessionId);
  }
}
