export type InternalCallVoiceContext = {
  callId: string;
  revision: string;
  text: string;
};
export type LiveSessionInstructionUpdate = {
  instructions: string;
  onboardingContext: string | null;
  internalCallContext?: InternalCallVoiceContext | null;
};

// A transcript save can finish after a newer answer-tool write. Its older snapshot
// must not replace the latest responses in either model's context.
export function isStaleInternalCallContext(
  next: InternalCallVoiceContext | null | undefined,
  previous: InternalCallVoiceContext | null | undefined
) {
  return Boolean(
    next &&
    previous &&
    next.callId === previous.callId &&
    next.revision < previous.revision
  );
}

// Live startup instructions are immutable. Update the Responses backend and
// send compact facts separately to the voice model, without triggering speech.
export function buildLiveSessionUpdateEvents(
  update: LiveSessionInstructionUpdate,
  previousOnboardingContext: string | null,
  eventId: string,
  previousInternalCallContext?: InternalCallVoiceContext | null
): Record<string, unknown>[] {
  if (
    isStaleInternalCallContext(
      update.internalCallContext,
      previousInternalCallContext
    )
  )
    return [];
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
    update.internalCallContext &&
    (update.internalCallContext.callId !==
      previousInternalCallContext?.callId ||
      update.internalCallContext.text !== previousInternalCallContext?.text)
  ) {
    events.push({
      type: "session.thinking.append",
      event_id: `${eventId}_call`,
      delegation_id: null,
      content: `Latest saved internal call context (replaces earlier snapshots):\n${update.internalCallContext.text}`,
    });
  }
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
