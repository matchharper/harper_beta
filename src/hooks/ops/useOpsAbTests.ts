import { useQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { OpsAbTestsResponse } from "@/lib/ops/abTests";

export function useOpsAbTests(args: {
  days: number;
  externalSurface?: "web" | "worker" | "daily";
  enabled: boolean;
  excludedEmails: string[];
}) {
  return useQuery({
    queryKey: [
      "ops-ab-tests",
      args.days,
      args.externalSurface ?? "web",
      ...args.excludedEmails,
    ],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        days: String(args.days),
        externalSurface: args.externalSurface ?? "web",
      });
      for (const value of args.excludedEmails) {
        params.append("exclude", value);
      }
      return fetchWithInternalAuth<OpsAbTestsResponse>(
        `/api/internal/debug/ab-tests?${params.toString()}`,
        { signal }
      );
    },
    enabled: args.enabled,
    retry: false,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}
