export type CareerEndCallOptions = {
  completeOnboarding?: boolean;
};

/** Only the tool's explicit machine command requests onboarding completion. */
export function parseCareerEndCallArguments(value: string): CareerEndCallOptions {
  try {
    const args: unknown = JSON.parse(value);
    return {
      completeOnboarding:
        typeof args === "object" && args !== null &&
        "complete_onboarding" in args && args.complete_onboarding === true,
    };
  } catch {
    return { completeOnboarding: false };
  }
}

export function shouldSpeakRealtimeEndCallFallback(args: {
  endCallRequested: boolean;
  responseText: string;
}) {
  return args.endCallRequested && !args.responseText.trim();
}
