// Browser infrastructure only: Harper keeps its own agent, tools and approvals.
const endpoint = "https://api.browser-use.com/api/v4/browsers";

async function request(suffix, method, body) {
  const key = process.env.BROWSER_USE_API_KEY;
  if (!key) throw Error("BROWSER_USE_API_KEY is required for application browsing");
  const response = await fetch(endpoint + suffix, {
    method,
    headers: { "X-Browser-Use-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
    redirect: "error",
  });
  // Do not retry browser creation: an ambiguous response may already have created one.
  if (method === "PATCH" && response.status === 404) return;
  if (!response.ok) throw Error(`Browser Use Cloud ${method} failed (${response.status})`);
  return response.status === 204 ? undefined : response.json();
}

export async function stopBrowserUseSession(id) {
  await request(`/${encodeURIComponent(id)}`, "PATCH", { action: "stop" });
}

export async function createBrowserUseSession() {
  const session = await request("", "POST", {
    timeout: 30,
    proxyCountryCode: null,
    solveCaptchas: false,
    enableRecording: false,
    browserScreenWidth: 1280,
    browserScreenHeight: 960,
  });
  try {
    if (typeof session?.id !== "string" || !session.id ||
        typeof session?.cdpUrl !== "string")
      throw Error("Browser Use Cloud did not return a browser ID and secure CDP URL");
    let connectUrl = session.cdpUrl;
    const endpoint = new URL(connectUrl);
    // Cloud may return HTTPS discovery rather than a WebSocket. Playwright
    // resolves this automatically; Stagehand v3 requires the actual socket URL.
    if (endpoint.protocol === "https:") {
      endpoint.pathname = endpoint.pathname.replace(/\/$/, "") + "/json/version";
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(15_000), redirect: "error" });
      if (!response.ok) throw Error(`Browser Use CDP discovery failed (${response.status})`);
      connectUrl = (await response.json()).webSocketDebuggerUrl;
    }
    if (typeof connectUrl !== "string" || new URL(connectUrl).protocol !== "wss:")
      throw Error("Browser Use Cloud did not return a secure CDP URL");
    return { id: session.id, connectUrl };
  } catch (error) {
    if (session?.id) await stopBrowserUseSession(session.id).catch(() => {});
    throw error;
  }
}

export function browserUseStagehandOptions(session) {
  // Stagehand v3 calls external CDP connections LOCAL. This never launches Chrome.
  if (!session?.connectUrl || new URL(session.connectUrl).protocol !== "wss:")
    throw Error("A remote CDP connection is required");
  return { env: "LOCAL", localBrowserLaunchOptions: { cdpUrl: session.connectUrl } };
}
