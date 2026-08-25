import { useQuery } from "@tanstack/react-query";
import type { CareerPendingAction } from "@/lib/career/pendingActions";
import { useCareerApi } from "@/hooks/career/useCareerApi";

type PendingActionsResponse = {
  actions?: CareerPendingAction[];
  error?: string;
};

export function useCareerPendingActions(args: {
  enabled: boolean;
  locale?: string | null;
  userId?: string | null;
}) {
  const { fetchWithAuth } = useCareerApi();

  return useQuery({
    enabled: args.enabled && Boolean(args.userId),
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (args.locale) searchParams.set("locale", args.locale);
      const response = await fetchWithAuth(
        `/api/talent/pending-actions${searchParams.size ? `?${searchParams}` : ""}`
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as PendingActionsResponse;
      if (!response.ok) {
        throw new Error(payload.error || "처리할 항목을 불러오지 못했습니다.");
      }
      return Array.isArray(payload.actions) ? payload.actions : [];
    },
    queryKey: ["career-pending-actions", args.userId, args.locale ?? ""],
    staleTime: 30_000,
  });
}
