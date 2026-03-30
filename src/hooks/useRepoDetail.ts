import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database.types";

export type GithubRepoRow = Database["public"]["Tables"]["github_repo"]["Row"];
export type GithubRepoContributionRow =
  Database["public"]["Tables"]["github_repo_contribution"]["Row"];
export type GithubProfileRow =
  Database["public"]["Tables"]["github_profile"]["Row"];

export type RepoContributor = GithubRepoContributionRow & {
  github_profile: GithubProfileRow | null;
};

export type RepoDetail = {
  repo: GithubRepoRow;
  contributors: RepoContributor[];
};

export const repoDetailKey = (repoId?: string) =>
  ["repo-detail", repoId] as const;

export async function fetchRepoDetail(
  repoId: string
): Promise<RepoDetail | null> {
  const normalizedRepoId = String(repoId ?? "").trim();
  if (!normalizedRepoId) return null;

  // Step 1: Fetch repo metadata
  const { data: repo, error: repoError } = await supabase
    .from("github_repo")
    .select("*")
    .eq("id", normalizedRepoId)
    .maybeSingle();

  if (repoError) throw repoError;
  if (!repo) return null;

  // Step 2: Fetch all contributions for this repo
  const { data: contributions, error: contributionsError } = await supabase
    .from("github_repo_contribution")
    .select("*")
    .eq("repo_id", normalizedRepoId);

  if (contributionsError) throw contributionsError;

  // Step 3: Collect github_profile_ids
  const profileIds = Array.from(
    new Set(
      (contributions ?? [])
        .map((row) => String(row.github_profile_id ?? "").trim())
        .filter(Boolean)
    )
  );

  // Step 4: Batch fetch github_profile rows
  let profiles: GithubProfileRow[] = [];
  if (profileIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from("github_profile")
      .select("*")
      .in("id", profileIds);

    if (profileError) throw profileError;
    profiles = (profileRows as GithubProfileRow[] | null) ?? [];
  }

  // Step 5: Join
  const profileById = new Map(
    profiles.map((p) => [p.id, p] as const)
  );

  const resolvedContributors: RepoContributor[] = (contributions ?? []).map(
    (contribution) => ({
      ...contribution,
      github_profile:
        profileById.get(contribution.github_profile_id ?? "") ?? null,
    })
  );

  return {
    repo: repo as GithubRepoRow,
    contributors: resolvedContributors,
  };
}

export function useRepoDetail(repoId?: string) {
  return useQuery({
    queryKey: repoDetailKey(repoId),
    enabled: !!repoId,
    queryFn: () => fetchRepoDetail(repoId!),
    staleTime: 60_000,
  });
}
