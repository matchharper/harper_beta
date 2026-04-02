import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  RequestAccessApprovalEmailLocale,
  RequestAccessBulkApprovalResponse,
  RequestAccessReviewQueueResponse,
} from "@/lib/requestAccess/types";

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

export function useBulkSendOpsRequestAccessApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      requests: string[];
      locale: RequestAccessApprovalEmailLocale;
      from: string;
      subject: string;
      html: string;
    }) =>
      fetchWithInternalAuth<RequestAccessBulkApprovalResponse>(
        "/api/internal/request-access/approvals",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: opsRequestAccessQueueKey,
      });
    },
  });
}
