import { useQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OpsDebugInternalMatchingResponse,
  OpsDebugInternalMatchingRoleMode,
} from "@/lib/ops/internalMatchingAnalytics";

export type OpsDebugInternalMatchingFilters = {
  from?: string;
  roleMode?: OpsDebugInternalMatchingRoleMode;
  to?: string;
};

export const opsDebugInternalMatchingKey = (
  filters: OpsDebugInternalMatchingFilters
) =>
  [
    "ops-debug-internal-matching",
    filters.from ?? "",
    filters.to ?? "",
    filters.roleMode ?? "all",
  ] as const;

export function useOpsDebugInternalMatching(
  enabled: boolean,
  filters: OpsDebugInternalMatchingFilters
) {
  return useQuery({
    queryKey: opsDebugInternalMatchingKey(filters),
    queryFn: () => {
      const params = new URLSearchParams({
        roleMode: filters.roleMode ?? "all",
      });
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      return fetchWithInternalAuth<OpsDebugInternalMatchingResponse>(
        `/api/internal/debug/matching?${params.toString()}`
      );
    },
    enabled,
    staleTime: 60_000,
  });
}
