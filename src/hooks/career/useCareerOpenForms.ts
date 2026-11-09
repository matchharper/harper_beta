import type { CareerMessage } from "@/components/career/types";
import { createContext, useContext, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCareerApi } from "./useCareerApi";
import type { CareerForm } from "@/lib/career/forms/schema";
import type { CareerWorkActivity } from "@/lib/career/work/activity";

export type CareerOpenFormsSnapshot = {
  completionCursor: string | null;
  forms: CareerForm[];
  latestMessageId: number | null;
  pendingInputMessageIds?: number[];
  hasActiveInputTurn?: boolean;
  pending: number;
  canStop?: boolean;
  retrying?: boolean;
  activities?: CareerWorkActivity[];
  activeInvocationIds?: string[];
  turns?: CareerMessage[];
};

/** Read-only snapshots for isolated local component previews. */
export const CareerOpenFormsSnapshotContext = createContext<
  CareerOpenFormsSnapshot | undefined
>(undefined);

export function useCareerOpenForms(conversationId?: string | null) {
  const snapshot = useContext(CareerOpenFormsSnapshotContext);
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
    enabled: Boolean(conversationId) && snapshot === undefined,
    queryFn: async () => {
      const response = await fetchWithAuth(
        `/api/talent/work?conversationId=${encodeURIComponent(conversationId!)}`
      );
      if (!response.ok) throw new Error("Work status unavailable");
      return (await response.json()) as CareerOpenFormsSnapshot;
    },
    refetchInterval: (query) =>
      query.state.data?.activities?.length || query.state.data?.pendingInputMessageIds?.length ? 1000 : 5000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  useEffect(() => {
    if (snapshot !== undefined || !query.data) return;
    const prior =
      lastObserved.current?.conversationId === conversationId
        ? lastObserved.current
        : undefined;
    if (
      query.data.latestMessageId !== prior?.messageId ||
      query.data.completionCursor !== prior?.completionCursor
    ) {
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
  }, [conversationId, query.data, query.dataUpdatedAt, queryClient, snapshot]);
  return snapshot === undefined
    ? query
    : {
        ...query,
        data: snapshot,
        isPending: false,
        isLoading: false,
        isError: false,
      };
}
