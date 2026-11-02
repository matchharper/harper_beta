import type { SimulationSession } from "./session";

/** Only the current active job may expose its browser; never reuse a past attempt. */
export function applicationBrowserPreviewSession(state?: SimulationSession) {
  if (state?.status !== "active") return null;
  const browser = state.browser;
  if (browser?.engine === "browser-use-agents" && browser.status === "running")
    return browser.managed?.sessionId ?? null;
  if (state.applicationInspection?.status === "running")
    return state.applicationInspection.browserUseSessionId ?? null;
  return null;
}
