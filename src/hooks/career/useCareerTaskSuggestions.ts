import { useQuery } from "@tanstack/react-query";
import { useCareerChatActivityContext } from "@/components/career/CareerChatPanelContext";
import { useCareerSidebarContext } from "@/components/career/CareerSidebarContext";
import type { CareerExternalFeedbackSnapshot } from "@/lib/career/taskItems";
import { useCareerApi } from "./useCareerApi";

export const careerExternalFeedbackQueryKey = (userId: string | null) =>
  ["career-task-external-feedback", userId] as const;

// Mounted only inside Tasks. Feedback suggestions settle independently of the
// workspace bootstrap, pending actions, and the full opportunity history.
export function useCareerTaskSuggestions() {
  const { fetchWithAuth } = useCareerApi();
  const { user } = useCareerSidebarContext();
  const { sessionPending, tasksOverride } = useCareerChatActivityContext();
  const overridden = tasksOverride !== undefined;
  const enabled = Boolean(user) && !overridden;
  const externalQuery = useQuery({
    enabled: enabled && !sessionPending,
    queryKey: careerExternalFeedbackQueryKey(user?.id ?? null),
    queryFn: async (): Promise<CareerExternalFeedbackSnapshot> => {
      const response = await fetchWithAuth(
        "/api/talent/pending-actions?scope=external-feedback"
      );
      if (!response.ok)
        throw new Error("Failed to load external feedback suggestions");
      return response.json();
    },
    staleTime: 30_000,
  });

  return {
    externalFeedback: overridden
      ? (tasksOverride.externalFeedback ?? [])
      : (externalQuery.data?.externalFeedback ?? []),
    externalLoading: enabled && externalQuery.isPending,
    externalError: enabled && externalQuery.isError,
    retryExternal: () => {
      void externalQuery.refetch();
    },
  };
}
