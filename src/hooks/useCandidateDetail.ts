import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CandidateType } from "@/types/type";
import type { Database } from "@/types/database.types";
import type { CandidateMarkRecord } from "@/lib/candidateMark";
import { fetchCandidateMarkMap } from "./useCandidateMark";

export type GithubRepoContributionRow =
  Database["public"]["Tables"]["github_repo_contribution"]["Row"];
export type GithubProfileRow =
  Database["public"]["Tables"]["github_profile"]["Row"];
export type ScholarProfileRow =
  Database["public"]["Tables"]["scholar_profile"]["Row"];
export type ScholarPaperRow = Database["public"]["Tables"]["papers"]["Row"];

export type CandidateDetail = CandidateType & {
  connection?: { user_id: string; typed: number }[];
  candidate_mark?: CandidateMarkRecord | null;
  github_repo_contribution?: GithubRepoContributionRow[];
  scholar_profile?: ScholarProfileRow | null;
  scholar_papers?: ScholarPaperRow[];
  isAutomationResult?: boolean;
};

export const candidateKey = (id?: string, userId?: string) =>
  ["candidate", id, userId] as const;

export async function fetchCandidateDetail(id: string, userId?: string) {
  const q = supabase
    .from("candid")
    .select(
      `
      *,
      edu_user (
        school,
        degree,
        field,
        start_date,
        end_date,
        url
      ),
      experience_user (
        role,
        start_date,
        end_date,
        description,
        months,
        company_id,
        company_db (
          name,
          logo,
          linkedin_url,
          founded_year,
          employee_count_range,
          specialities,
          investors,
          short_description,
          location
        )
      ),
      publications (
        title,
        link,
        published_at,
        citation_num
      ),
      extra_experience(
        *
      ),
      connection (
        user_id,
        typed
      ),
      s:summary ( text )
    `
    )
    .eq("id", id)
    .limit(1)
    .maybeSingle();

  // userId가 있으면 connection을 해당 user로만 필터
  const { data, error } = await q;
  // const { data, error } = userId
  // ? await q.eq("connection.user_id", userId)
  // : await q;

  if (error) throw error;
  if (!data) return null;

  let scholarProfile: ScholarProfileRow | null = null;
  let scholarPapers: ScholarPaperRow[] = [];
  let githubRepoContributions: GithubRepoContributionRow[] = [];

  // GitHub profile and contributions
  const { data: scholarProfileRow, error: scholarProfileError } = await supabase
    .from("scholar_profile")
    .select("*")
    .eq("candid_id", id)
    .maybeSingle();

  if (scholarProfileError) throw scholarProfileError;

  scholarProfile = (scholarProfileRow as ScholarProfileRow | null) ?? null;

  if (scholarProfile?.id) {
    const { data: contributions, error: contributionsError } = await supabase
      .from("scholar_contributions")
      .select("paper_id")
      .eq("scholar_profile_id", scholarProfile.id);

    if (contributionsError) throw contributionsError;

    const paperIds = Array.from(
      new Set(
        (contributions ?? [])
          .map((row) => String((row as any)?.paper_id ?? "").trim())
          .filter(Boolean)
      )
    );

    if (paperIds.length > 0) {
      const { data: papers, error: papersError } = await supabase
        .from("papers")
        .select("*")
        .in("id", paperIds)
        .order("total_citations", { ascending: false })
        .order("pub_year", { ascending: false, nullsFirst: false });

      if (papersError) throw papersError;
      scholarPapers = (papers as ScholarPaperRow[] | null) ?? [];
    }
  }

  const { data: githubProfiles, error: githubProfileError } = await supabase
    .from("github_profile")
    .select("id")
    .eq("candid_id", id);

  if (githubProfileError) throw githubProfileError;

  const githubProfileIds = Array.from(
    new Set(
      (githubProfiles ?? [])
        .map((row) => String((row as any)?.id ?? "").trim())
        .filter(Boolean)
    )
  );

  if (githubProfileIds.length > 0) {
    const { data: githubRepoRows, error: githubRepoError } = await supabase
      .from("github_repo_contribution")
      .select("*")
      .in("github_profile_id", githubProfileIds);

    if (githubRepoError) throw githubRepoError;

    githubRepoContributions =
      (githubRepoRows as GithubRepoContributionRow[] | null) ?? [];
  }

  if (userId) {
    const candidateMarkById = await fetchCandidateMarkMap(userId, [id]);
    const { data: autoRow, error: autoError } = await supabase
      .from("automation_results")
      .select("id")
      .eq("user_id", userId)
      .eq("candid_id", id)
      .limit(1);

    if (autoError) throw autoError;
    return {
      ...data,
      candidate_mark: candidateMarkById.get(id) ?? null,
      github_repo_contribution: githubRepoContributions,
      scholar_profile: scholarProfile,
      scholar_papers: scholarPapers,
      isAutomationResult: autoRow?.length > 0,
    } as CandidateDetail;
  }

  return {
    ...(data as CandidateDetail),
    github_repo_contribution: githubRepoContributions,
    scholar_profile: scholarProfile,
    scholar_papers: scholarPapers,
  };
}

export function useCandidateDetail(userId?: string, candidId?: string) {
  return useQuery({
    queryKey: candidateKey(candidId, userId),
    enabled: !!candidId,
    queryFn: () => fetchCandidateDetail(candidId!, userId),
    staleTime: 60_000,
  });
}
