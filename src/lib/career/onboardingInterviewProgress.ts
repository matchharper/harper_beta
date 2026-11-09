import type {
  CareerInterviewProgress,
  CareerOnboardingChecklistProgress,
  CareerTalentInsights,
} from "@/components/career/types";

type ResolveCareerInterviewProgressArgs = {
  canForceComplete: boolean;
  checklistProgress: CareerOnboardingChecklistProgress | null;
  isOnboardingDone: boolean;
  talentInsights: CareerTalentInsights | null;
  userChatCount: number;
};

/** Completion is a persisted action, not a percentage inferred from answers. */
export function resolveCareerInterviewProgress({
  canForceComplete,
  isOnboardingDone,
}: ResolveCareerInterviewProgressArgs): CareerInterviewProgress {
  return {
    canForceComplete: !isOnboardingDone && canForceComplete,
    filledCount: 0,
    percent: isOnboardingDone ? 100 : 0,
    remainingCount: 0,
    totalCount: 0,
  };
}
