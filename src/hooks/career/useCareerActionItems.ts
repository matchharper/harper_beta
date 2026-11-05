import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCareerApi } from "./useCareerApi";
import { useCareerSidebarContext } from "@/components/career/CareerSidebarContext";
import { useCareerChatActivityContext } from "@/components/career/CareerChatPanelContext";
import {
  careerActionItemSchema,
  sortCareerActionItems,
  type CareerActionItem,
} from "@/lib/career/actionItems";

export function useCareerActionItems() {
  const { user, isOnboardingDone, stage } = useCareerSidebarContext();
  const { tasksOverride } = useCareerChatActivityContext();
  const { fetchWithAuth } = useCareerApi();
  const queryClient = useQueryClient();
  const queryKey = ["career-action-items", user?.id];
  const query = useQuery({
    queryKey,
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
  const { mutate } = useMutation({
    mutationFn: async (args: {
      item: CareerActionItem;
      conversationId: string;
    }) => {
      const response = await fetchWithAuth("/api/talent/action-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: args.item.id,
          revision: args.item.revision,
          conversationId: args.conversationId,
        }),
      });
      if (!response.ok) throw new Error("Unable to close visible action");
    },
    onMutate: async ({ item }) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<CareerActionItem[]>(queryKey, (items) =>
        items?.filter((current) => current.id !== item.id)
      );
    },
    // A failed or conflicting close brings the current card back.
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  const close = useCallback(
    (item: CareerActionItem, conversationId: string) =>
      mutate({ item, conversationId }),
    [mutate]
  );
  return {
    ...query,
    data:
      tasksOverride !== undefined
        ? (tasksOverride.actionItems ?? [])
        : query.data,
    isPending:
      tasksOverride === undefined && Boolean(user?.id) && query.isPending,
    close,
  };
}
