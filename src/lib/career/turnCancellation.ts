/** A user action on one saved request, not a cancellation of account settings. */
export const CAREER_TURN_STOP_FACT = "[The user requested Stop for this request. Completed effects were retained.]";

export function isCareerTurnStopped(payload: unknown): boolean {
  return !!payload && typeof payload === "object" &&
    (payload as Record<string, unknown>).careerTurnStopped === true;
}
