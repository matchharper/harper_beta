export type TalentOnboardingCompletionReason = "llm_onboarding_done_marker";

export const TALENT_ONBOARDING_DONE_MARKER = "[[HARPER_ONBOARDING_DONE]]";

export function hasTalentOnboardingCompletionMarker(
  value: string | null | undefined
) {
  return String(value ?? "").includes(TALENT_ONBOARDING_DONE_MARKER);
}

export function stripTalentOnboardingCompletionMarker(
  value: string | null | undefined
) {
  return String(value ?? "")
    .replaceAll(TALENT_ONBOARDING_DONE_MARKER, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function resolveTalentOnboardingCompletion(args: {
  assistantContent: string;
  assistantEndedOnboarding?: boolean;
}): { completed: boolean; reason: TalentOnboardingCompletionReason | null } {
  if (
    args.assistantEndedOnboarding ||
    hasTalentOnboardingCompletionMarker(args.assistantContent)
  ) {
    return { completed: true, reason: "llm_onboarding_done_marker" };
  }

  return { completed: false, reason: null };
}
