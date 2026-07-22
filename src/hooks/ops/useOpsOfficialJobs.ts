import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  AshbyOfficialJobsSyncSummary,
  OpsOfficialJobAnalyticsResponse,
  OpsOfficialJobCompanyOptionsResponse,
  OpsOfficialJobRecord,
  OpsOfficialJobSaveInput,
  OpsOfficialJobSaveResponse,
  OpsOfficialJobsResponse,
} from "@/lib/ops/officialJobs";

export const opsOfficialJobsKey = ["ops-official-jobs"] as const;
export const opsOfficialJobCompanyOptionsKey = [
  "ops-official-job-company-options",
] as const;

export function opsOfficialJobAnalyticsKey(jobId: string | null | undefined) {
  return ["ops-official-job-analytics", jobId ?? ""] as const;
}

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

export function useOpsOfficialJobCompanyOptions(enabled = true) {
  return useQuery({
    queryKey: opsOfficialJobCompanyOptionsKey,
    queryFn: () =>
      fetchWithInternalAuth<OpsOfficialJobCompanyOptionsResponse>(
        "/api/internal/official-jobs/company-workspaces"
      ),
    enabled,
    gcTime: 2 * 60 * 60_000,
    staleTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useOpsOfficialJobAnalytics(
  jobId: string | null | undefined,
  enabled = true
) {
  const normalizedJobId = String(jobId ?? "").trim();

  return useQuery({
    queryKey: opsOfficialJobAnalyticsKey(normalizedJobId),
    queryFn: () =>
      fetchWithInternalAuth<OpsOfficialJobAnalyticsResponse>(
        `/api/internal/official-jobs/analytics?jobId=${encodeURIComponent(
          normalizedJobId
        )}`
      ),
    enabled: enabled && Boolean(normalizedJobId),
    gcTime: 30 * 60_000,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
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
