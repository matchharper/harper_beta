import type { SimulationSession } from "./session";

/** Keep the timeline occupied until the saved outcome actually reaches the UI. */
export function browserPresentationPhase(
  session: SimulationSession | undefined,
  messages: ReadonlyArray<{ id: string | number }>
): "running" | "result" | null {
  const browser = session?.browser;
  if (!browser) return null;
  if (browser.result && !messages.some(m => String(m.id) === String(browser.resultMessageId)))
    return "result";
  if (session?.status === "active" && ["queued", "running"].includes(browser.status))
    return "running";
  return null;
}
