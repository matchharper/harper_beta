import type {
  CareerInterviewProgress,
  CareerOnboardingChecklistProgress,
  CareerTalentInsights,
} from "@/components/career/types";
import { INSIGHT_CHECKLIST } from "@/lib/talentOnboarding/insightChecklist";
import { TALENT_INTERVIEW_FINAL_STEP } from "@/lib/talentOnboarding/progress";

type ResolveCareerInterviewProgressArgs = {
  canForceComplete: boolean;
  checklistProgress: CareerOnboardingChecklistProgress | null;
  isOnboardingDone: boolean;
  talentInsights: CareerTalentInsights | null;
  userChatCount: number;
};

const clampCount = (value: number, max: number) =>
  Math.max(0, Math.min(max, Math.floor(value)));

export function resolveCareerInterviewProgress({
  canForceComplete,
  checklistProgress,
  isOnboardingDone,
  talentInsights,
  userChatCount,
}: ResolveCareerInterviewProgressArgs): CareerInterviewProgress {
  if (checklistProgress) {
    const totalCount = Math.max(0, checklistProgress.totalCount);
    const filledCount = clampCount(checklistProgress.coveredCount, totalCount);
    const percent =
      totalCount > 0
        ? Math.min(100, Math.round((filledCount / totalCount) * 100))
        : 0;

    return {
      canForceComplete: !isOnboardingDone && canForceComplete,
      filledCount,
      percent,
      remainingCount: Math.max(totalCount - filledCount, 0),
      totalCount,
    };
  }

  const insightTotalCount = INSIGHT_CHECKLIST.length;
  const insightFilledCount = INSIGHT_CHECKLIST.reduce((count, item) => {
    const value = talentInsights?.[item.key];
    return String(value ?? "").trim().length > 0 ? count + 1 : count;
  }, 0);
  const insightPercent =
    insightTotalCount > 0
      ? Math.min(
          100,
          Math.round((insightFilledCount / insightTotalCount) * 100)
        )
      : 0;
  const turnFilledCount = clampCount(
    userChatCount,
    TALENT_INTERVIEW_FINAL_STEP
  );
  const turnPercent = Math.round(
    (turnFilledCount / TALENT_INTERVIEW_FINAL_STEP) * 100
  );
  const fallbackProgress =
    turnPercent > insightPercent
      ? {
          filledCount: turnFilledCount,
          percent: turnPercent,
          totalCount: TALENT_INTERVIEW_FINAL_STEP,
        }
      : {
          filledCount: insightFilledCount,
          percent: insightPercent,
          totalCount: insightTotalCount,
        };

  return {
    canForceComplete: !isOnboardingDone && canForceComplete,
    filledCount: fallbackProgress.filledCount,
    percent: fallbackProgress.percent,
    remainingCount: Math.max(
      fallbackProgress.totalCount - fallbackProgress.filledCount,
      0
    ),
    totalCount: fallbackProgress.totalCount,
  };
}
