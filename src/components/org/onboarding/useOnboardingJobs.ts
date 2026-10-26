import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { readOnboardingJobs, type OnboardingJob } from "@/lib/org/onboardingJobs";

const requests = new Map<string, Promise<OnboardingJob[]>>();

export function useOnboardingJobs({ workspaceId, userId, enabled, previewJobs }: {
  workspaceId: string;
  userId: string;
  enabled: boolean;
  previewJobs?: OnboardingJob[];
}) {
  const client = useQueryClient();
  const key = `org-onboarding-jobs:v1:${previewJobs ? "preview:" : ""}${userId}:${workspaceId}`;
  const options = {
    queryKey: [key],
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: () => {
      const existing = requests.get(key);
      if (existing) return existing;
      const request = (async () => {
        try {
          const cached = localStorage.getItem(key);
          if (cached !== null) return readOnboardingJobs(JSON.parse(cached));
        } catch { /* Browser storage is optional. */ }
        let jobs: OnboardingJob[] = [];
        try {
          if (previewJobs) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            jobs = readOnboardingJobs(previewJobs);
          } else {
            const result = await fetchWithInternalAuth<{ jobs: OnboardingJob[] }>("/api/org/onboarding", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ workspaceId, action: "jobs" }),
              signal: AbortSignal.timeout(20_000),
            });
            jobs = readOnboardingJobs(result.jobs);
          }
        } catch { /* Optional suggestions never block onboarding or trigger another search. */ }
        try { localStorage.setItem(key, JSON.stringify(jobs)); } catch { /* Optional cache. */ }
        return jobs;
      })();
      requests.set(key, request);
      return request;
    },
  };
  const query = useQuery({ ...options, enabled });
  return { jobs: query.data ?? [], wait: () => enabled ? client.ensureQueryData(options) : Promise.resolve([]) };
}
