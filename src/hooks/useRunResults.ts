import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CandidateMarkStatus } from "@/lib/candidateMark";
import { SearchSource } from "@/lib/searchSource";
import { ScholarProfilePreview } from "@/lib/scholarPreview";
import { GithubProfilePreview } from "@/lib/githubPreview";
import {
  buildEvidenceMap,
  buildRankMap,
  filterPositiveScoreCandidates,
  RunPageCandidate,
  SearchRank,
  SearchEvidence,
} from "@/lib/searchEvidence";
import { CandidateTypeWithConnection } from "./useSearchChatCandidates";
import { logger } from "@/utils/logger";
import {
  fetchCandidateIdsByMarkStatuses,
  fetchCandidateMarkMap,
} from "./useCandidateMark";
import { fetchShortlistMemoMap } from "./useShortlistMemo";

const RUN_RESULTS_PAGE_SIZE = 10;

async function fetchCandidatesByIds(
  ids: string[],
  userId: string,
  runId: string,
  sourceType: SearchSource,
  evidenceByCandidateId?: Map<string, SearchEvidence>,
  rankByCandidateId?: Map<string, SearchRank>
) {
  if (ids.length === 0) return [];

  const start_time = performance.now();

  const { data, error } = await supabase
    .from("candid")
    .select(
      `
          id,
          headline,
          location,
          name,
          profile_picture,
          links,
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
            description,
            start_date,
            end_date,
            company_id,
            company_db (
              name,
              investors,
              short_description,
              logo
            )
          ),
          connection (
            user_id,
            typed
          ),
          synthesized_summary ( text )
        `
    )
    .in("id", ids)
    .eq("connection.user_id", userId)
    .eq("synthesized_summary.run_id", runId);

  logger.log("fetchCandidatesByIds time ", performance.now() - start_time);
  if (error) throw error;

  let scholarPreviewByCandidateId = new Map<string, ScholarProfilePreview>();
  let shouldReadScholarPreview = sourceType === "scholar";
  if (!shouldReadScholarPreview) {
    const { data: scholarVariantRows, error: scholarVariantError } =
      await supabase
        .from("run_variants")
        .select("id")
        .eq("run_id", runId)
        .eq("source_type", 1)
        .limit(1);

    if (scholarVariantError) throw scholarVariantError;
    shouldReadScholarPreview =
      Array.isArray(scholarVariantRows) && scholarVariantRows.length > 0;
  }
  const dataById = new Map((data ?? []).map((item: any) => [item.id, item]));
  const scholarPreviewCandidateIds = shouldReadScholarPreview
    ? sourceType === "scholar"
      ? ids
      : ids.filter((id) => {
          const item = dataById.get(id);
          const experiences = Array.isArray(item?.experience_user)
            ? item.experience_user
            : [];
          const educations = Array.isArray(item?.edu_user) ? item.edu_user : [];
          return experiences.length === 0 && educations.length === 0;
        })
    : [];

  if (scholarPreviewCandidateIds.length > 0) {
    scholarPreviewByCandidateId = await fetchScholarPreviewByCandidateIds(
      scholarPreviewCandidateIds
    );
  }

  // --- GitHub preview ---
  let shouldReadGithubPreview = sourceType === "github";
  if (!shouldReadGithubPreview) {
    const { data: githubVariantRows, error: githubVariantError } = await supabase
      .from("run_variants")
      .select("id")
      .eq("run_id", runId)
      .eq("source_type", 2)
      .limit(1);

    if (githubVariantError) throw githubVariantError;
    shouldReadGithubPreview =
      Array.isArray(githubVariantRows) && githubVariantRows.length > 0;
  }

  const githubPreviewCandidateIds = shouldReadGithubPreview
    ? sourceType === "github"
      ? ids
      : ids.filter((id) => {
          const item = dataById.get(id);
          const experiences = Array.isArray(item?.experience_user)
            ? item.experience_user
            : [];
          const educations = Array.isArray(item?.edu_user) ? item.edu_user : [];
          return experiences.length === 0 && educations.length === 0;
        })
    : [];

  let githubPreviewByCandidateId = new Map<string, GithubProfilePreview>();
  if (githubPreviewCandidateIds.length > 0) {
    githubPreviewByCandidateId = await fetchGithubPreviewByCandidateIds(
      githubPreviewCandidateIds
    );
  }

  const candidateMarkByCandidateId = await fetchCandidateMarkMap(userId, ids);
  const shortlistMemoByCandidateId = await fetchShortlistMemoMap(userId, ids);

  const ordered = ids
    .map((id) => {
      const item = dataById.get(id);
      if (!item) return null;
      return {
        ...item,
        scholar_profile_preview: scholarPreviewByCandidateId.get(id) ?? null,
        github_profile_preview: githubPreviewByCandidateId.get(id) ?? null,
        search_evidence: evidenceByCandidateId?.get(id) ?? null,
        search_rank: rankByCandidateId?.get(id) ?? null,
        candidate_mark: candidateMarkByCandidateId.get(id) ?? null,
        shortlist_memo: shortlistMemoByCandidateId.get(id) ?? "",
      };
    })
    .filter(Boolean);

  return ordered as CandidateTypeWithConnection[];
}

async function fetchScholarPreviewByCandidateIds(ids: string[]) {
  const { data: profiles, error: profileError } = await supabase
    .from("scholar_profile")
    .select("id, candid_id, affiliation, topics, h_index, total_citations_num")
    .in("candid_id", ids);

  if (profileError) throw profileError;

  const profileRows = Array.isArray(profiles) ? profiles : [];
  if (profileRows.length === 0) {
    return new Map<string, ScholarProfilePreview>();
  }

  const profileIds = profileRows.map((row) => row.id);
  const { data: contributions, error: contributionError } = await supabase
    .from("scholar_contributions")
    .select("scholar_profile_id")
    .in("scholar_profile_id", profileIds);

  if (contributionError) throw contributionError;

  const paperCountByProfileId = new Map<string, number>();
  for (const row of contributions ?? []) {
    const profileId = String((row as any)?.scholar_profile_id ?? "");
    if (!profileId) continue;
    paperCountByProfileId.set(
      profileId,
      (paperCountByProfileId.get(profileId) ?? 0) + 1
    );
  }

  return new Map<string, ScholarProfilePreview>(
    profileRows
      .filter((row) => Boolean(row.candid_id))
      .map((row) => [
        row.candid_id as string,
        {
          scholarProfileId: row.id,
          affiliation: row.affiliation,
          topics: row.topics,
          hIndex: row.h_index,
          paperCount: paperCountByProfileId.get(row.id) ?? 0,
          citationCount: row.total_citations_num ?? 0,
        },
      ])
  );
}

async function fetchGithubPreviewByCandidateIds(ids: string[]) {
  const { data: profiles, error: profileError } = await supabase
    .from("github_profile")
    .select("id, candid_id, name, company, location, followers, public_repos")
    .in("candid_id", ids);

  if (profileError) throw profileError;

  const profileRows = ((Array.isArray(profiles) ? profiles : []) as unknown) as Array<{
    id: string;
    candid_id: string | null;
    name: string | null;
    company: string | null;
    location: string | null;
    followers: number | null;
    public_repos: number | null;
  }>;
  if (profileRows.length === 0) {
    return new Map<string, GithubProfilePreview>();
  }

  const profileIds = profileRows.map((row) => row.id);
  const { data: contributions, error: contributionError } = await supabase
    .from("github_repo_contribution")
    .select("github_profile_id, repo_id")
    .in("github_profile_id", profileIds);

  if (contributionError) throw contributionError;

  const { data: repos, error: repoError } = await supabase
    .from("github_repo")
    .select("id, language, stars")
    .in("id", (contributions ?? []).map((c: any) => c.repo_id).filter(Boolean));

  if (repoError) throw repoError;

  const profileData = new Map<
    string,
    { topLanguages: Set<string>; topRepoStars: number }
  >();

  const repoMap = new Map((repos ?? []).map((r: any) => [r.id, r]));

  for (const contrib of contributions ?? []) {
    const profileId = (contrib as any)?.github_profile_id;
    const repoId = (contrib as any)?.repo_id;
    if (!profileId || !repoId) continue;

    const repo = repoMap.get(repoId);
    if (!repo) continue;

    if (!profileData.has(profileId)) {
      profileData.set(profileId, { topLanguages: new Set(), topRepoStars: 0 });
    }

    const data = profileData.get(profileId)!;
    if ((repo as any).language) {
      data.topLanguages.add((repo as any).language);
    }
    data.topRepoStars = Math.max(data.topRepoStars, (repo as any).stars ?? 0);
  }

  return new Map<string, GithubProfilePreview>(
    profileRows
      .filter((row) => Boolean(row.candid_id))
      .map((row) => {
        const data = profileData.get(row.id);
        return [
          row.candid_id as string,
          {
            name: row.name,
            company: row.company,
            location: row.location,
            followers: row.followers ?? 0,
            publicRepos: row.public_repos ?? 0,
            topLanguages: data ? Array.from(data.topLanguages).slice(0, 5) : [],
            topRepoStars: data?.topRepoStars ?? 0,
          },
        ];
      })
  );
}

async function fetchRunPage12(params: {
  runId: string;
  pageIdx: number;
  userId: string;
}) {
  const { runId, pageIdx } = params;

  const { data, error } = await supabase
    .from("runs_pages")
    .select("candidate_ids, created_at")
    .eq("run_id", runId)
    .eq("page_idx", pageIdx)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const row = data?.[0];
  const all = filterPositiveScoreCandidates(
    (row?.candidate_ids ?? []) as RunPageCandidate[]
  );
  const ids = all
    .slice(0, 10)
    .map((r) => r.id)
    .filter(Boolean) as string[];

  return {
    ids,
  };
}

async function fetchRunPage(params: {
  runId: string;
  pageIdx: number; // this is now the "virtual page" inside a single row
  userId: string;
  excludedMarkStatuses?: CandidateMarkStatus[];
}) {
  const {
    runId,
    pageIdx,
    userId,
    excludedMarkStatuses = [],
  } = params;

  // NOTE: always read the latest single row for this runId
  const { data, error } = await supabase
    .from("runs_pages")
    .select("candidate_ids, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;

  const row = data?.[0];
  const all = filterPositiveScoreCandidates(
    (row?.candidate_ids ?? []) as RunPageCandidate[]
  );
  const excludedCandidateIds =
    excludedMarkStatuses.length > 0
      ? await fetchCandidateIdsByMarkStatuses(userId, excludedMarkStatuses)
      : new Set<string>();
  const visibleCandidates =
    excludedCandidateIds.size > 0
      ? all.filter((candidate) => !excludedCandidateIds.has(String(candidate.id)))
      : all;

  const start = pageIdx * RUN_RESULTS_PAGE_SIZE;
  const end = start + RUN_RESULTS_PAGE_SIZE;

  const ids = visibleCandidates
    .slice(start, end)
    .map((r) => r.id)
    .filter(Boolean) as string[];
  const evidenceByCandidateId = buildEvidenceMap(visibleCandidates);
  const rankByCandidateId = buildRankMap(visibleCandidates);

  return {
    ids,
    total: visibleCandidates.length,
    evidenceByCandidateId,
    rankByCandidateId,
  };
}

export function useRunPagesInfinite({
  userId,
  runId,
  sourceType = "linkedin",
  excludedMarkStatuses = [],
  enabled = true,
}: {
  userId?: string;
  runId?: string;
  sourceType?: SearchSource;
  excludedMarkStatuses?: CandidateMarkStatus[];
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const excludedMarkStatusesKey = useMemo(
    () => (excludedMarkStatuses.length > 0 ? excludedMarkStatuses.join("|") : "all"),
    [excludedMarkStatuses]
  );

  const qk = useMemo(
    () => ["runPages", runId, userId, sourceType, excludedMarkStatusesKey],
    [excludedMarkStatusesKey, runId, sourceType, userId]
  );

  // 1) runs_pages realtime 구독
  useEffect(() => {
    if (!enabled || !runId) return;

    const channel = supabase
      .channel(`runs_pages:${runId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "runs_pages",
          filter: `run_id=eq.${runId}`,
        },
        () => {
          // 새 페이지 들어오면 다시 읽게
          queryClient.invalidateQueries({ queryKey: qk });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, runId, queryClient, qk]);

  // 2) infinite query: pageIdx를 runs_pages에서만 읽음
  const infinite = useInfiniteQuery({
    queryKey: qk,
    enabled: enabled && !!userId && !!runId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const pageIdx = pageParam as number;

      const { ids, total, evidenceByCandidateId, rankByCandidateId } =
        await fetchRunPage({
          runId: runId!,
          pageIdx,
          userId: userId!,
          excludedMarkStatuses,
        });

      // ids -> 후보자 fetch
      const items = ids.length
        ? await fetchCandidatesByIds(
            ids,
            userId!,
            runId!,
            sourceType,
            evidenceByCandidateId,
            rankByCandidateId
          )
        : [];

      return { pageIdx, ids, items, total };
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage?.ids?.length) return undefined;
      const nextStart = (lastPage.pageIdx + 1) * RUN_RESULTS_PAGE_SIZE;
      if (typeof lastPage.total === "number" && nextStart >= lastPage.total) {
        return undefined;
      }
      return lastPage.pageIdx + 1;
    },
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: false,
  });

  return infinite;
}
