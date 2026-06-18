import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  AshbyOfficialJobsSyncSummary,
  OpsOfficialJobRecord,
  OpsOfficialJobSaveInput,
  OpsOfficialJobSaveResponse,
  OpsOfficialJobsResponse,
} from "@/lib/ops/officialJobs";

export const opsOfficialJobsKey = ["ops-official-jobs"] as const;

export function useOpsOfficialJobs(enabled = true) {
  return useQuery({
    queryKey: opsOfficialJobsKey,
    queryFn: () =>
      fetchWithInternalAuth<OpsOfficialJobsResponse>(
        "/api/internal/official-jobs"
      ),
    enabled,
    staleTime: 15_000,
  });
}

export function useSaveOpsOfficialJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: OpsOfficialJobSaveInput) =>
      fetchWithInternalAuth<OpsOfficialJobSaveResponse>(
        "/api/internal/official-jobs",
        {
          method: input.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opsOfficialJobsKey });
    },
  });
}

export function useSyncAshbyOfficialJobs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetchWithInternalAuth<AshbyOfficialJobsSyncSummary>(
        "/api/internal/official-jobs/sync-ashby",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unpublishMissing: true }),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opsOfficialJobsKey });
    },
  });
}

export type {
  AshbyOfficialJobsSyncSummary,
  OpsOfficialJobRecord,
  OpsOfficialJobSaveInput,
};
