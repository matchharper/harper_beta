import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCareerApi } from "./useCareerApi";
import { useCareerSidebarContext } from "@/components/career/CareerSidebarContext";
import { useCareerChatActivityContext } from "@/components/career/CareerChatPanelContext";
import {
  careerContentSuggestionSchema,
  isCareerContentSuggestionVisible,
  sortCareerContentSuggestions,
  type CareerContentReaction,
  type CareerContentSuggestion,
} from "@/lib/career/contentSuggestions";

const KEY = "career-content-suggestions";

/** Events, articles and posts Harper saved for the user ("볼 만한 것"). */
export function useCareerContentSuggestions() {
  const { user, isOnboardingDone, stage } = useCareerSidebarContext();
  const { tasksOverride } = useCareerChatActivityContext();
  const { fetchWithAuth } = useCareerApi();
  const queryClient = useQueryClient();
  const queryKey = [KEY, user?.id];
  const preview = tasksOverride !== undefined;
  const query = useQuery({
    queryKey,
    enabled:
      Boolean(user?.id) && !preview && (isOnboardingDone || stage === "completed"),
    queryFn: async () => {
      const response = await fetchWithAuth("/api/talent/content-suggestions");
      if (!response.ok) throw new Error("Unable to load suggestions");
      return sortCareerContentSuggestions(
        careerContentSuggestionSchema
          .array()
          .parse((await response.json()).items)
      );
    },
    staleTime: 0,
    refetchInterval: 30_000,
  });
  const mutation = useMutation({
    mutationFn: async (args: { id: string; reaction: CareerContentReaction }) => {
      if (preview) return;
      const response = await fetchWithAuth("/api/talent/content-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      if (!response.ok) throw new Error("Unable to save reaction");
    },
    onMutate: async ({ id, reaction }) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<CareerContentSuggestion[]>(queryKey, (items) =>
        items?.flatMap((item) => {
          if (item.id !== id) return [item];
          if (reaction === "dismissed") return [];
          if (reaction === "seen" && item.status !== "new") return [item];
          return [{ ...item, status: reaction }];
        })
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  const { mutate } = mutation;
  const react = useCallback(
    (id: string, reaction: CareerContentReaction) => mutate({ id, reaction }),
    [mutate]
  );
  const items = preview
    ? sortCareerContentSuggestions(
        (tasksOverride?.contentSuggestions ?? []).filter((item) =>
          isCareerContentSuggestionVisible(item)
        )
      )
    : query.data;
  return {
    ...query,
    data: items,
    newCount: (items ?? []).filter((item) => item.status === "new").length,
    react,
    isPending: !preview && Boolean(user?.id) && query.isPending,
  };
}
