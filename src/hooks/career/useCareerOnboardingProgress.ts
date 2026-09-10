import { useCallback, useMemo } from "react";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CareerOnboardingChecklistProgress } from "@/components/career/types";

type UseCareerOnboardingProgressArgs = {
  userId: string | null;
};

const CAREER_ONBOARDING_PROGRESS_GC_TIME = 30 * 60_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeCount = (value: unknown) => {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
};

export const normalizeCareerOnboardingProgress = (
  value: unknown
): CareerOnboardingChecklistProgress | null => {
  if (!isRecord(value)) return null;

  const totalCount = normalizeCount(value.totalCount);
  const coveredCount = normalizeCount(value.coveredCount);
  const suppliedPercent = Number(value.percent);
  const percent =
    Number.isFinite(suppliedPercent)
      ? Math.max(0, Math.min(100, Math.round(suppliedPercent)))
      : totalCount > 0
        ? Math.min(100, Math.round((coveredCount / totalCount) * 100))
        : 0;

  return {
    additionalCoveredCount: normalizeCount(value.additionalCoveredCount),
    completed: value.completed === true,
    coveredCount,
    finalConfirmationCovered: value.finalConfirmationCovered === true,
    minCoveredCount: normalizeCount(value.minCoveredCount),
    percent,
    requiredQuestionsCovered: value.requiredQuestionsCovered === true,
    totalCount,
  };
};

export const careerOnboardingProgressKey = (userId: string | null) =>
  ["career-onboarding-progress", userId] as const;

export const useCareerOnboardingProgress = ({
  userId,
}: UseCareerOnboardingProgressArgs) => {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => careerOnboardingProgressKey(userId), [userId]);

  const progressQuery = useQuery<CareerOnboardingChecklistProgress | null>({
    queryKey,
    // The session response hydrates the initial value and each completed chat
    // turn pushes the authoritative value in its talent_profile event. This is
    // intentionally a cache-only query: fetching here would duplicate the same
    // database work after every onboarding answer.
    queryFn: skipToken,
    gcTime: CAREER_ONBOARDING_PROGRESS_GC_TIME,
  });

  const applyProgress = useCallback(
    (progress: unknown) => {
      queryClient.setQueryData(
        queryKey,
        normalizeCareerOnboardingProgress(progress)
      );
    },
    [queryClient, queryKey]
  );

  const hydrateProgress = useCallback(
    (progress: unknown) => {
      queryClient.setQueryData<CareerOnboardingChecklistProgress | null>(
        queryKey,
        (current) =>
          current === undefined
            ? normalizeCareerOnboardingProgress(progress)
            : current
      );
    },
    [queryClient, queryKey]
  );

  const resetProgress = useCallback(() => {
    queryClient.removeQueries({
      queryKey: ["career-onboarding-progress"],
    });
  }, [queryClient]);

  return {
    onboardingChecklistProgress: progressQuery.data ?? null,
    applyProgress,
    hydrateProgress,
    resetProgress,
  };
};
