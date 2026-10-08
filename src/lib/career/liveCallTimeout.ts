export const LIVE_IDLE_PROMPT_MS = 5 * 60_000;
export const LIVE_IDLE_RESPONSE_MS = 3 * 60_000;
export const LIVE_MAX_DURATION_MS = 60 * 60_000;

export function getLiveCallTimeoutAction({
  now,
  connectedAt,
  lastActivityAt,
  warningAt,
  busy,
}: {
  now: number;
  connectedAt: number;
  lastActivityAt: number;
  warningAt: number | null;
  busy: boolean;
}): "none" | "active" | "warn" | "end" {
  if (now - connectedAt >= LIVE_MAX_DURATION_MS) return "end";
  if (busy) return "active";
  if (warningAt !== null) {
    return now - warningAt >= LIVE_IDLE_RESPONSE_MS ? "end" : "none";
  }
  const idleMs = now - lastActivityAt;
  if (idleMs >= LIVE_IDLE_PROMPT_MS + LIVE_IDLE_RESPONSE_MS) return "end";
  return idleMs >= LIVE_IDLE_PROMPT_MS ? "warn" : "none";
}
