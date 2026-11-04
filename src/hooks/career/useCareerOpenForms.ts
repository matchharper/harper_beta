import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCareerApi } from "./useCareerApi";
import type { CareerForm } from "@/lib/career/forms/schema";
import type { CareerWorkActivity } from "@/lib/career/work/activity";

export function useCareerOpenForms(conversationId?: string | null) {
  const { fetchWithAuth } = useCareerApi();
  const queryClient = useQueryClient();
  const lastObserved = useRef<string | undefined>(undefined);
  const query = useQuery({
    queryKey: ["career-open-forms", conversationId],
    enabled: Boolean(conversationId),
    queryFn: async () => {
      const response = await fetchWithAuth(`/api/talent/work?conversationId=${encodeURIComponent(conversationId!)}`);
      if (!response.ok) throw new Error("Work status unavailable");
      return await response.json() as { forms: CareerForm[]; latestMessageId: number | null; pending: number; canStop?: boolean; retrying?: boolean; activities?: CareerWorkActivity[] };
    },
    refetchInterval: query => query.state.data?.activities?.length ? 1000 : 5000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  useEffect(() => {
    if (!query.data) return;
    const stamp = `${conversationId}:${query.data.latestMessageId}:${query.data.pending}`;
    if (stamp !== lastObserved.current) {
      const changed = lastObserved.current !== undefined;
      lastObserved.current = stamp;
      void queryClient.invalidateQueries({ queryKey: ["career-message-history", conversationId] });
      // Durable turns can change opportunities after the POST has returned.
      // Refresh their existing projections when execution advances, including
      // work that completes silently, so an accepted offer is not left actionable.
      if (changed) for (const key of ["career-session", "career-history-opportunities", "career-pending-actions", "career-task-progress"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    }
  }, [conversationId, query.data, queryClient]);
  return query;
}
