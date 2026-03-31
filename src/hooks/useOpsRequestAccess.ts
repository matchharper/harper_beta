import { useQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { RequestAccessReviewQueueResponse } from "@/lib/requestAccess/types";

export const opsRequestAccessQueueKey = ["ops-request-access-queue"] as const;

export function useOpsRequestAccessQueue() {
  return useQuery({
    queryKey: opsRequestAccessQueueKey,
    queryFn: () =>
      fetchWithInternalAuth<RequestAccessReviewQueueResponse>(
        "/api/internal/request-access/requests"
      ),
    staleTime: 20_000,
  });
}
