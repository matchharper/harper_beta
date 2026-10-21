export type LiveSessionInstructionUpdate = {
  instructions: string;
  onboardingContext: string | null;
};

// Live startup instructions are immutable. Update the Responses backend and
// send compact facts separately to the voice model, without triggering speech.
export function buildLiveSessionUpdateEvents(
  update: LiveSessionInstructionUpdate,
  previousOnboardingContext: string | null,
  eventId: string
): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [
    {
      type: "session.update",
      session: {
        delegation: {
          type: "responses",
          responses: { instructions: update.instructions },
        },
      },
    },
  ];
  if (
    update.onboardingContext &&
    update.onboardingContext !== previousOnboardingContext
  ) {
    events.push({
      type: "session.thinking.append",
      event_id: eventId,
      delegation_id: null,
      content: update.onboardingContext,
    });
  }
  return events;
}
