import { useQuery } from "@tanstack/react-query";
import { useCareerApi } from "./useCareerApi";
import { useCareerSidebarContext } from "@/components/career/CareerSidebarContext";
import { useCareerChatActivityContext } from "@/components/career/CareerChatPanelContext";
import {
  careerActionItemSchema,
  sortCareerActionItems,
} from "@/lib/career/actionItems";

export function useCareerActionItems() {
  const { user, isOnboardingDone, stage } = useCareerSidebarContext();
  const { tasksOverride } = useCareerChatActivityContext();
  const { fetchWithAuth } = useCareerApi();
  const query = useQuery({
    queryKey: ["career-action-items", user?.id],
    enabled:
      Boolean(user?.id) &&
      tasksOverride === undefined &&
      (isOnboardingDone || stage === "completed"),
    queryFn: async () => {
      const response = await fetchWithAuth("/api/talent/action-items");
      if (!response.ok) throw new Error("Unable to load visible actions");
      return sortCareerActionItems(
        careerActionItemSchema.array().parse((await response.json()).items)
      );
    },
    staleTime: 0,
    refetchInterval: 10_000,
  });
  return {
    ...query,
    data:
      tasksOverride !== undefined
        ? (tasksOverride.actionItems ?? [])
        : query.data,
    isPending:
      tasksOverride === undefined && Boolean(user?.id) && query.isPending,
  };
}
