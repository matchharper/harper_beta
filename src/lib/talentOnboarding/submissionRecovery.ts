export type TalentOnboardingSubmissionStatus = {
  conversation?: {
    profileIngestionStatus?: string | null;
    stage?: string | null;
  } | null;
  hasFirstSubmission?: boolean;
  needsOnboarding?: boolean;
};

export function isTalentOnboardingSubmissionCommitted(
  status: TalentOnboardingSubmissionStatus
) {
  const stage = status.conversation?.stage?.trim();
  const profileIngestionStatus =
    status.conversation?.profileIngestionStatus?.trim();
  if (
    profileIngestionStatus === "processing" ||
    profileIngestionStatus === "failed"
  ) {
    return false;
  }
  return (
    status.hasFirstSubmission === true ||
    status.needsOnboarding === false ||
    Boolean(stage && stage !== "profile")
  );
}
