import { useInfiniteQuery } from "@tanstack/react-query";
import { useCareerApi } from "./useCareerApi";
import type { CareerRecentInfoPage } from "@/lib/career/taskItems";

export function useCareerRecentInfo(args: { enabled: boolean; userId?: string | null }) {
  const { fetchWithAuth } = useCareerApi();
  return useInfiniteQuery({
    enabled: args.enabled && Boolean(args.userId),
    initialPageParam: null as CareerRecentInfoPage["nextCursor"],
    queryKey: ["career-recent-info", args.userId],
    queryFn: async ({ pageParam }): Promise<CareerRecentInfoPage> => {
      const params = new URLSearchParams({ scope: "recent-info" });
      if (pageParam) {
        params.set("beforeAt", pageParam.at);
        params.set("beforeId", pageParam.id);
      }
      const response = await fetchWithAuth(`/api/talent/pending-actions?${params}`);
      if (!response.ok) throw new Error("Failed to load recent info");
      return response.json();
    },
    getNextPageParam: (page) => page.nextCursor,
    staleTime: 30_000,
  });
}
