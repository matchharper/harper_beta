import { useQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { OpsAbTestKey, OpsAbTestsResponse } from "@/lib/ops/abTests";

export function useOpsAbTests(args: {
  experiment: OpsAbTestKey;
  days: number;
  externalSurface?: "all" | "web" | "worker" | "daily";
  enabled: boolean;
  excludedEmails: string[];
}) {
  return useQuery({
    queryKey: [
      "ops-ab-tests",
      args.experiment,
      args.days,
      args.externalSurface ?? "all",
      ...args.excludedEmails,
    ],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        experiment: args.experiment,
        days: String(args.days),
        externalSurface: args.externalSurface ?? "all",
      });
      for (const value of args.excludedEmails) {
        params.append("exclude", value);
      }
      return fetchWithInternalAuth<OpsAbTestsResponse>(
        `/api/internal/debug/ab-tests?${params.toString()}`,
        { signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]) }
      );
    },
    enabled: args.enabled,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
