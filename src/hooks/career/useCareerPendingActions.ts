import { useQuery } from "@tanstack/react-query";
import type { CareerPendingAction } from "@/lib/career/pendingActions";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useMessages } from "@/i18n/useMessage";
import type {
  CareerPendingActionsSnapshot,
  CareerTaskProgressSnapshot,
} from "@/lib/career/taskItems";

type PendingActionsResponse = Partial<CareerPendingActionsSnapshot> & {
  actions?: CareerPendingAction[];
  error?: string;
};

type PendingActionsArgs = {
  enabled: boolean;
  locale?: string | null;
  userId?: string | null;
};

export function useCareerPendingActionsSnapshot(args: PendingActionsArgs) {
  const { fetchWithAuth } = useCareerApi();
  const { locale } = useMessages();
  const requestLocale = args.locale ?? locale;

  return useQuery({
    enabled: args.enabled && Boolean(args.userId),
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (requestLocale) searchParams.set("locale", requestLocale);
      const response = await fetchWithAuth(
        `/api/talent/pending-actions${searchParams.size ? `?${searchParams}` : ""}`
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as PendingActionsResponse;
      if (!response.ok) {
        throw new Error(payload.error || "처리할 항목을 불러오지 못했습니다.");
      }
      return {
        actions: Array.isArray(payload.actions) ? payload.actions : [],
        meetingSchedules: Array.isArray(payload.meetingSchedules)
          ? payload.meetingSchedules
          : [],
        unavailableCategories: payload.unavailableCategories ?? [],
      } satisfies CareerPendingActionsSnapshot;
    },
    queryKey: ["career-pending-actions", args.userId, requestLocale],
    staleTime: 30_000,
  });
}

// Keep the composer's existing array contract while sharing one query with
// the task tab and its navigation badge.
export function useCareerPendingActions(args: PendingActionsArgs) {
  const query = useCareerPendingActionsSnapshot(args);
  return { ...query, data: query.data?.actions };
}

export function useCareerTaskProgress(args: PendingActionsArgs) {
  const { fetchWithAuth } = useCareerApi();
  const { locale } = useMessages();
  const requestLocale = args.locale ?? locale;
  return useQuery({
    enabled: args.enabled && Boolean(args.userId),
    queryKey: ["career-task-progress", args.userId, requestLocale],
    queryFn: async (): Promise<CareerTaskProgressSnapshot> => {
      const params = new URLSearchParams({ scope: "progress" });
      if (requestLocale) params.set("locale", requestLocale);
      const response = await fetchWithAuth(
        `/api/talent/pending-actions?${params}`
      );
      if (!response.ok) throw new Error("Failed to load career task progress");
      return response.json();
    },
    staleTime: 30_000,
  });
}
