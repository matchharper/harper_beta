export function shouldUseCareerRealtimeOnboarding(args: {
  hasConversationStarter: boolean;
  hasMockInterview?: boolean;
  hasInternalOpportunityCall: boolean;
  isOnboardingDone: boolean;
}) {
  const hasFocusedCallObjective =
    args.hasConversationStarter ||
    args.hasInternalOpportunityCall ||
    args.hasMockInterview;
  return !args.isOnboardingDone && !hasFocusedCallObjective;
}
