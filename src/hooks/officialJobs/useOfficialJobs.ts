import { infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";
import type { OfficialJobListItem } from "@/lib/officialJobs";
import {
  OFFICIAL_JOBS_PAGE_SIZE,
  type OfficialJobsPage,
} from "@/lib/officialJobs/pagination";

// Career's onboarding lookup still uses the complete catalog. Never share its
// array cache with the infinite query's pages/pageParams cache.
export const officialJobsQueryKey = ["official-jobs"] as const;
export const officialJobsInfiniteQueryKey = [
  "official-jobs",
  "infinite",
  OFFICIAL_JOBS_PAGE_SIZE,
] as const;
export const OFFICIAL_JOBS_QUERY_STALE_TIME_MS = 0;
export const OFFICIAL_JOBS_QUERY_GC_TIME_MS = 30 * 60_000;

export async function fetchOfficialJobs(): Promise<OfficialJobListItem[]> {
  const response = await fetch("/api/official-jobs", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`Failed to load official jobs: ${response.status}`);
  const payload = await response.json();
  return payload.jobs;
}

export async function fetchOfficialJobsPage(
  offset: number,
  signal?: AbortSignal
): Promise<OfficialJobsPage> {
  const response = await fetch(`/api/official-jobs?offset=${offset}`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to load official jobs: ${response.status}`);
  }

  return response.json();
}

export const officialJobsInfiniteOptions = infiniteQueryOptions({
  queryKey: officialJobsInfiniteQueryKey,
  queryFn: ({ pageParam, signal }) => fetchOfficialJobsPage(pageParam, signal),
  initialPageParam: 0,
  getNextPageParam: (lastPage) => lastPage.nextOffset,
  staleTime: OFFICIAL_JOBS_QUERY_STALE_TIME_MS,
  gcTime: OFFICIAL_JOBS_QUERY_GC_TIME_MS,
});

export function useOfficialJobs(initialPage: OfficialJobsPage) {
  return useInfiniteQuery({
    ...officialJobsInfiniteOptions,
    initialData: { pages: [initialPage], pageParams: [0] },
  });
}
