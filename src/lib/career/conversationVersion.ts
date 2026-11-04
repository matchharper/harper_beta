/** A dev-selected conversation experience; model selection stays independent. */
export type CareerConversationVersion = "professional" | "friendly";

export function resolveCareerConversationVersion(
  value: unknown,
  canUseDevControls: boolean
): CareerConversationVersion {
  return canUseDevControls && value === "friendly"
    ? "friendly"
    : "professional";
}

/** Read only server-authorized source-message metadata, including on resume. */
export function readCareerConversationVersion(
  payload: unknown
): CareerConversationVersion {
  return resolveCareerConversationVersion(
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).careerConversationVersion
      : undefined,
    true
  );
}

export const CAREER_BUBBLE_BREAK = "[[bubble]]";

/** Transport delimiter only: unfinished streaming text is withheld, never rewritten. */
export function splitCareerMessageBubbles(
  content: string,
  streaming = false
): string[] {
  const parts = content.split(CAREER_BUBBLE_BREAK);
  if (streaming) parts.pop();
  return parts.map((part) => part.trim()).filter(Boolean);
}
