export function shouldUseCareerRealtimeOnboarding(args: {
  hasConversationStarter: boolean;
  hasInternalOpportunityCall: boolean;
  isOnboardingDone: boolean;
}) {
  const hasFocusedCallObjective =
    args.hasConversationStarter || args.hasInternalOpportunityCall;
  return !args.isOnboardingDone && !hasFocusedCallObjective;
}
