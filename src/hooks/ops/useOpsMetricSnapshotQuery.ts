import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import {
  opsMetricSnapshotPollInterval,
  type WithOpsMetricSnapshot,
} from "@/lib/ops/metricSnapshots";

/**
 * A metrics view served from its last snapshot. While the server recomputes it the query keeps asking, and
 * `refresh` asks the server to recompute now.
 */
export function useOpsMetricSnapshotQuery<T>(args: {
  enabled: boolean;
  params: URLSearchParams;
  path: string;
  queryKey: readonly unknown[];
}) {
  const forceRef = useRef(false);
  const query = useQuery({
    queryKey: args.queryKey,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams(args.params);
      if (forceRef.current) {
        forceRef.current = false;
        params.set("refresh", "1");
      }
      return fetchWithInternalAuth<WithOpsMetricSnapshot<T>>(
        `${args.path}?${params.toString()}`,
        { signal }
      );
    },
    enabled: args.enabled,
    gcTime: 15 * 60 * 1_000,
    placeholderData: (previousData) => previousData,
    refetchInterval: (current) => opsMetricSnapshotPollInterval(current.state.data),
    retry: false,
    staleTime: 2 * 60 * 1_000,
  });
  const refresh = () => {
    forceRef.current = true;
    return query.refetch();
  };
  return { ...query, refresh };
}
