import { useQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { OpsCostResponse } from "@/lib/ops/costTypes";
import type { OpsTaskCostResponse } from "@/lib/ops/taskCosts";

export function useOpsTaskCosts(
  from: string,
  through: string,
  enabled: boolean
) {
  return useQuery({
    enabled,
    queryFn: () =>
      fetchWithInternalAuth<OpsTaskCostResponse>(
        `/api/internal/cost/tasks?${new URLSearchParams({ from, through })}`
      ),
    queryKey: ["ops-task-costs", from, through],
    staleTime: 60_000,
    retry: false,
  });
}

export function useOpsCosts(from: string, through: string, enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: () => {
      const query = new URLSearchParams({ from, through });
      return fetchWithInternalAuth<OpsCostResponse>(
        `/api/internal/cost?${query.toString()}`
      );
    },
    queryKey: ["ops-costs", from, through],
    staleTime: 60_000,
  });
}
