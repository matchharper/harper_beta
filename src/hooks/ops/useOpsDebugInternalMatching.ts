import { useQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OpsDebugInternalMatchingResponse,
} from "@/lib/ops/internalMatchingAnalytics";

export type OpsDebugInternalMatchingFilters = {
  from?: string;
  to?: string;
};

export const opsDebugInternalMatchingKey = (
  filters: OpsDebugInternalMatchingFilters
) =>
  [
    "ops-debug-internal-matching",
    filters.from ?? "",
    filters.to ?? "",
  ] as const;

export function useOpsDebugInternalMatching(
  enabled: boolean,
  filters: OpsDebugInternalMatchingFilters
) {
  return useQuery({
    queryKey: opsDebugInternalMatchingKey(filters),
    queryFn: () => {
      const params = new URLSearchParams();
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
