import { useQuery } from "@tanstack/react-query";
import { CandidateTypeWithConnection } from "./useSearchChatCandidates";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";

export const automationResultsKey = (
  userId?: string,
  automationId?: string,
  pageIdx: number = 0,
  pageSize: number = 10
) => ["automationResults", userId, automationId, pageIdx, pageSize] as const;

export function useAutomationResults(
  userId?: string,
  automationId?: string,
  pageIdx: number = 0,
  pageSize: number = 10
) {
  return useQuery({
    queryKey: automationResultsKey(userId, automationId, pageIdx, pageSize),
    enabled: !!userId && !!automationId,
    queryFn: async () => {
      if (!userId || !automationId) {
        return {
          items: [] as CandidateTypeWithConnection[],
          hasNext: false,
          total: 0,
        };
      }

      return fetchWithInternalAuth<{
        items: CandidateTypeWithConnection[];
        hasNext: boolean;
        total: number;
      }>("/api/candidates/automation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          automationId,
          pageIdx,
          pageSize,
        }),
      });
    },
    staleTime: 10_000,
  });
}
