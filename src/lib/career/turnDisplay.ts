/** Public output only. Never provider reasoning or the private tool transcript. */
export type CareerTurnEvent = {
  id: string;
  kind: "message" | "tool";
  text: string;
};
export const CAREER_TURN_ACTIVITY = "career_turn_activity";

export function readCareerTurnEvents(value: unknown): CareerTurnEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is CareerTurnEvent =>
    entry && typeof entry.id === "string" && typeof entry.text === "string" &&
    (entry.kind === "message" || entry.kind === "tool")
  );
}
