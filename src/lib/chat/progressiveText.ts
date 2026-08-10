import { buildChatTypewriterChunks } from "@/lib/chat/typewriter";

export const CHAT_TEXT_REVEAL_INTERVAL_MS = 18;
const MAX_DIRECT_DELTA_CHAR_COUNT = 48;

/**
 * SSE providers may coalesce many deltas into one network frame. Keep normal
 * provider deltas intact, but split a coalesced payload so React can reveal it
 * progressively instead of replacing the whole assistant message at once.
 */
export function splitChatTextDeltaForReveal(delta: string) {
  if (!delta) return [];
  if (Array.from(delta).length <= MAX_DIRECT_DELTA_CHAR_COUNT) return [delta];
  return buildChatTypewriterChunks(delta, 12);
}

export function waitForChatTextReveal() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, CHAT_TEXT_REVEAL_INTERVAL_MS);
  });
}
