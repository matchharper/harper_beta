import type { CareerMessage } from "@/components/career/types";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCareerApi } from "./useCareerApi";
import type { CareerForm } from "@/lib/career/forms/schema";
import type { CareerWorkActivity } from "@/lib/career/work/activity";

export function useCareerOpenForms(conversationId?: string | null) {
  const { fetchWithAuth } = useCareerApi();
  const queryClient = useQueryClient();
  const lastObserved = useRef<
    | {
        conversationId?: string | null;
        messageId: number | null;
        completionCursor: string | null;
      }
    | undefined
  >(undefined);
  const query = useQuery({
    queryKey: ["career-open-forms", conversationId],
    enabled: Boolean(conversationId),
    queryFn: async () => {
      const response = await fetchWithAuth(
        `/api/talent/work?conversationId=${encodeURIComponent(conversationId!)}`
      );
      if (!response.ok) throw new Error("Work status unavailable");
      return (await response.json()) as {
        completionCursor: string | null;
        forms: CareerForm[];
        latestMessageId: number | null;
        pending: number;
        canStop?: boolean;
        retrying?: boolean;
        activities?: CareerWorkActivity[];
        activeInvocationIds?: string[];
        turns?: CareerMessage[];
      };
    },
    refetchInterval: (query) =>
      query.state.data?.activities?.length ? 1000 : 5000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  useEffect(() => {
    if (!query.data) return;
    const prior =
      lastObserved.current?.conversationId === conversationId
        ? lastObserved.current
        : undefined;
    if (query.data.latestMessageId !== prior?.messageId || query.data.completionCursor !== prior?.completionCursor) {
      void queryClient.invalidateQueries(
        { queryKey: ["career-message-history", conversationId] },
        { cancelRefetch: false }
      );
    }
    // Realtime handles recommendation changes while a turn runs. Reconcile the
    // other projections from the durable completion cursor, including silent
    // work that starts and finishes entirely between two polls.
    if (prior && query.data.completionCursor !== prior.completionCursor) {
      for (const key of [
        "career-session",
        "career-history-opportunities",
        "career-history-summary",
        "career-task-progress",
        "career-pending-actions",
        "career-action-items",
      ]) {
        void queryClient.invalidateQueries(
          { queryKey: [key] },
          { cancelRefetch: false }
        );
      }
    }
    lastObserved.current = {
      conversationId,
      messageId: query.data.latestMessageId,
      completionCursor: query.data.completionCursor,
    };
  }, [conversationId, query.data, query.dataUpdatedAt, queryClient]);
  return query;
}
