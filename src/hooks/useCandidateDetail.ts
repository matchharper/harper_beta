import { useQuery } from "@tanstack/react-query";
import type { CandidateType } from "@/types/type";
import type { Database } from "@/types/database.types";
import type { CandidateMarkRecord } from "@/lib/candidateMark";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";

export type GithubRepoContributionRow =
  Database["public"]["Tables"]["github_repo_contribution"]["Row"];
export type GithubProfileRow =
  Database["public"]["Tables"]["github_profile"]["Row"];
export type GithubRepoRow =
  Database["public"]["Tables"]["github_repo"]["Row"];
export type ScholarProfileRow =
  Database["public"]["Tables"]["scholar_profile"]["Row"];
export type ScholarPaperRow = Database["public"]["Tables"]["papers"]["Row"];

export type GithubContributionWithRepo = GithubRepoContributionRow & {
  github_repo: GithubRepoRow | null;
};

export type CandidateDetail = CandidateType & {
  connection?: { user_id: string; typed: number }[];
  candidate_mark?: CandidateMarkRecord | null;
  github_profile?: GithubProfileRow | null;
  github_repo_contribution?: GithubContributionWithRepo[];
  scholar_profile?: ScholarProfileRow | null;
  scholar_papers?: ScholarPaperRow[];
  isAutomationResult?: boolean;
  profile_revealed?: boolean | null;
  masked_experience_count?: number | null;
};

export const candidateKey = (id?: string, userId?: string) =>
  ["candidate", id, userId] as const;

export async function fetchCandidateDetail(id: string, userId?: string) {
  if (!id || !userId) return null;

  return fetchWithInternalAuth<CandidateDetail>(
    `/api/candidates/detail?candidId=${encodeURIComponent(id)}`
  );
}

export function useCandidateDetail(userId?: string, candidId?: string) {
  return useQuery({
    queryKey: candidateKey(candidId, userId),
    enabled: !!candidId,
    queryFn: () => fetchCandidateDetail(candidId!, userId),
    staleTime: 60_000,
  });
}
