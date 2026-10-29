export const HISTORY_FEEDBACK_EXPERIMENT = "career_history_feedback_actions_v1";
export const HISTORY_FEEDBACK_VIEW_EVENT =
  "career_history_feedback_actions_viewed";
export const HISTORY_FEEDBACK_SAVED_EVENT =
  "career_history_feedback_actions_saved";

export type HistoryFeedbackVariant = "thumbs" | "save_hide";

export function assignHistoryFeedbackVariant(
  userId?: string | null
): HistoryFeedbackVariant {
  const normalized = userId?.trim().toLowerCase();
  if (!normalized) return "thumbs";
  // Stable, independently salted 50:50 allocation across devices and sessions.
  let hash = 0x811c9dc5;
  const input = `${HISTORY_FEEDBACK_EXPERIMENT}:${normalized}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0 < 0x80000000 ? "thumbs" : "save_hide";
}
