import { useQuery } from "@tanstack/react-query";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import type {
  CareerReengagementPendingAction,
  CareerReengagementPendingActionsSnapshot,
} from "@/lib/career/pendingActions";

type ReengagementPendingActionsResponse =
  CareerReengagementPendingActionsSnapshot & {
    error?: string;
  };

const asActions = (value: unknown) =>
  (Array.isArray(value) ? value : []) as CareerReengagementPendingAction[];

export function useCareerReengagementPendingActions(args: {
  enabled: boolean;
  userId?: string | null;
}) {
  const { fetchWithAuth } = useCareerApi();

  return useQuery({
    enabled: args.enabled && Boolean(args.userId),
    queryFn: async () => {
      const response = await fetchWithAuth(
        "/api/talent/pending-actions?scope=reengagement"
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as Partial<ReengagementPendingActionsResponse>;
      if (!response.ok) {
        throw new Error(
          payload.error || "re-engagement pending action을 불러오지 못했습니다."
        );
      }
      return {
        actions: asActions(payload.actions),
        promptActions: asActions(payload.promptActions),
      };
    },
    queryKey: ["career-reengagement-pending-actions", args.userId],
    staleTime: 30_000,
  });
}
