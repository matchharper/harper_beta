import { useQueries } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import {
  OPS_TALENT_ACTION_SOURCE_GROUPS,
  type OpsTalentActionLogsResponse,
  type OpsTalentActionSourceGroup,
  type OpsTalentActionView,
} from "@/lib/ops/talentActionLogs";

export type OpsTalentActionLogFilters = {
  days: number;
  view: OpsTalentActionView;
  weeks: number;
};

export const opsTalentActionLogsKey = (
  group: OpsTalentActionSourceGroup,
  filters: OpsTalentActionLogFilters
) =>
  [
    "ops-talent-action-logs",
    group,
    filters.view,
    filters.days,
    filters.weeks,
  ] as const;

export function useOpsTalentActionLogs(
  enabled: boolean,
  filters: OpsTalentActionLogFilters
) {
  return useQueries({
    queries: OPS_TALENT_ACTION_SOURCE_GROUPS.map((group) => ({
      queryKey: opsTalentActionLogsKey(group, filters),
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        const params = new URLSearchParams({
          days: String(filters.days),
          group,
          view: filters.view,
          weeks: String(filters.weeks),
        });
        return fetchWithInternalAuth<OpsTalentActionLogsResponse>(
          `/api/internal/debug/action-logs?${params.toString()}`,
          { signal }
        );
      },
      enabled,
      gcTime: 15 * 60 * 1_000,
      retry: false,
      staleTime: 2 * 60 * 1_000,
    })),
  });
}
