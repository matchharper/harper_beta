import { useQuery } from "@tanstack/react-query";
import type { OfficialJobListItem } from "@/lib/officialJobs";

export const officialJobsQueryKey = ["official-jobs"] as const;
export const OFFICIAL_JOBS_QUERY_STALE_TIME_MS = 5 * 60_000;
export const OFFICIAL_JOBS_QUERY_GC_TIME_MS = 30 * 60_000;

type OfficialJobsResponse = {
  jobs: OfficialJobListItem[];
};

export async function fetchOfficialJobs() {
  const response = await fetch("/api/official-jobs", {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to load official jobs: ${response.status}`);
  }

  const payload = (await response.json()) as OfficialJobsResponse;
  return payload.jobs;
}

export function useOfficialJobs(initialJobs: OfficialJobListItem[]) {
  return useQuery({
    queryKey: officialJobsQueryKey,
    queryFn: fetchOfficialJobs,
    initialData: initialJobs,
    staleTime: OFFICIAL_JOBS_QUERY_STALE_TIME_MS,
    gcTime: OFFICIAL_JOBS_QUERY_GC_TIME_MS,
  });
}
