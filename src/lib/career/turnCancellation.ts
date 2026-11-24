/** A user action on one saved request, not a cancellation of account settings. */
export const CAREER_TURN_STOP_FACT = "[The user requested Stop for this request.]";

export function isCareerTurnStopped(payload: unknown): boolean {
  return !!payload && typeof payload === "object" &&
    (payload as Record<string, unknown>).careerTurnStopped === true;
}

/** The reply to this request ended after repeated execution failures. */
export const CAREER_TURN_FAILED_FACT = "[Harper could not produce a reply to this request: execution failed repeatedly and was stopped. The person may send it again.]";

export function isCareerTurnFailed(payload: unknown): boolean {
  return !!payload && typeof payload === "object" &&
    (payload as Record<string, unknown>).careerTurnFailed === true;
}
