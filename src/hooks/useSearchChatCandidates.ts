// hooks/useSearchChatCandidates.ts
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  SearchSource,
  normalizeSearchSources,
  queryTypeToSearchSource,
} from "@/lib/searchSource";
import { ScholarProfilePreview } from "@/lib/scholarPreview";
import { GithubProfilePreview } from "@/lib/githubPreview";
import { CandidateMarkRecord } from "@/lib/candidateMark";
import { SharedFolderCandidateNote } from "@/lib/sharedFolder";
import {
  buildEvidenceMap,
  buildRankMap,
  filterPositiveScoreCandidates,
  RunPageCandidate,
  SearchRank,
  SearchEvidence,
} from "@/lib/searchEvidence";
import type { CandidateType, EduUserType, ExpUserType } from "@/types/type";
import { useCallback, useEffect, useMemo } from "react";
import { logger } from "@/utils/logger";
import { UI_END, UI_START } from "./chat/useChatSession";
import type { Locale } from "@/i18n/useMessage";
import { fetchCandidateMarkMap } from "./useCandidateMark";
import { fetchShortlistMemoMap } from "./useShortlistMemo";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="))
    ?.split("=")[1];
}

function getLocaleFromCookie(): Locale {
  const c = getCookie("NEXT_LOCALE");
  return c === "ko" || c === "en" ? c : "ko";
}

function getDefaultEnabledSources(
  sourceType?: SearchSource | null
): SearchSource[] {
  if (sourceType === "github") return ["github"];
  if (sourceType === "scholar") return ["scholar"];
  return ["linkedin"];
}

export type ExperienceUserType = ExpUserType & {
  company_db: {
    name: string;
    logo: string;
    linkedin_url: string;
    investors?: any;
    short_description?: string;
  };
};

export type CandidateTypeWithConnection = CandidateType & {
  edu_user: EduUserType[];
  experience_user: ExperienceUserType[];
  connection: { user_id: string; typed: number; text?: string | null }[];
  shortlist_memo?: string | null;
  publications?: { title: string; published_at: string }[];
  synthesized_summary?: { text: string }[];
  s?: { text: string | null }[];
  scholar_profile_preview?: ScholarProfilePreview | null;
  github_profile_preview?: GithubProfilePreview | null;
  search_evidence?: SearchEvidence | null;
  search_rank?: SearchRank | null;
  candidate_mark?: CandidateMarkRecord | null;
  shared_folder_notes?: SharedFolderCandidateNote[];
  profile_revealed?: boolean | null;
  masked_experience_count?: number | null;
};

type SearchSettingsSnapshot = {
  is_korean: boolean;
  type: SearchSource;
  sources: SearchSource[];
};

function extractUiJsonFromMessage(content: string): any | null {
  if (!content) return null;

  const start = content.lastIndexOf(UI_START);
  const end = content.lastIndexOf(UI_END);

  if (start === -1 || end === -1 || end <= start) return null;

  const jsonText = content.slice(start + UI_START.length, end).trim();
  if (!jsonText) return null;

  try {
    return JSON.parse(jsonText);
  } catch (e) {
    logger.log("UI JSON parse failed:", e);
    return null;
  }
}

/**
 * 서버가 run/page별로 검색 id를 관리하는 전제:
 * POST /api/search
 * body: { queryId, runId, pageIdx }
 * resp: { results: string[] }
 */
async function fetchSearchIds(params: { runId: string; pageIdx: number }) {
  const { runId, pageIdx } = params;

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
  const start = pageIdx * 10;
  const end = start + 10;
  const ids = all
    .slice(start, end)
    .map((r) => r.id)
    .filter(Boolean) as string[];
  const evidenceByCandidateId = buildEvidenceMap(all);
  const rankByCandidateId = buildRankMap(all);

  return {
    ids,
    evidenceByCandidateId,
    rankByCandidateId,
  };
}

async function fetchCandidatesByIds(
  ids: string[],
  userId: string,
  runId: string,
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
          description,
          field,
          start_date,
          end_date
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

  if (error) throw error;

  const { data: scholarVariantRows, error: scholarVariantError } =
    await supabase
      .from("run_variants")
      .select("id")
      .eq("run_id", runId)
      .eq("source_type", 1)
      .limit(1);

  if (scholarVariantError) throw scholarVariantError;

  const { data: githubVariantRows, error: githubVariantError } = await supabase
    .from("run_variants")
    .select("id")
    .eq("run_id", runId)
    .eq("source_type", 2)
    .limit(1);

  if (githubVariantError) throw githubVariantError;

  const shouldReadScholarPreview =
    Array.isArray(scholarVariantRows) && scholarVariantRows.length > 0;
  const shouldReadGithubPreview =
    Array.isArray(githubVariantRows) && githubVariantRows.length > 0;
  const dataById = new Map((data ?? []).map((item: any) => [item.id, item]));
  const scholarPreviewCandidateIds = shouldReadScholarPreview
    ? ids.filter((id) => {
        const item = dataById.get(id);
        const experiences = Array.isArray(item?.experience_user)
          ? item.experience_user
          : [];
        const educations = Array.isArray(item?.edu_user) ? item.edu_user : [];
        return experiences.length === 0 && educations.length === 0;
      })
    : [];
  const githubPreviewCandidateIds = shouldReadGithubPreview
    ? ids.filter((id) => {
        const item = dataById.get(id);
        const experiences = Array.isArray(item?.experience_user)
          ? item.experience_user
          : [];
        const educations = Array.isArray(item?.edu_user) ? item.edu_user : [];
        return experiences.length === 0 && educations.length === 0;
      })
    : [];
  const scholarPreviewByCandidateId =
    scholarPreviewCandidateIds.length > 0
      ? await fetchScholarPreviewByCandidateIds(scholarPreviewCandidateIds)
      : new Map<string, ScholarProfilePreview>();
  const candidateMarkByCandidateId = await fetchCandidateMarkMap(userId, ids);
  const shortlistMemoByCandidateId = await fetchShortlistMemoMap(userId, ids);

  const githubPreviewByCandidateId =
    githubPreviewCandidateIds.length > 0
      ? await fetchGithubPreviewByCandidateIds(githubPreviewCandidateIds)
      : new Map<string, GithubProfilePreview>();

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

  const profileRows = ((Array.isArray(profiles) ? profiles : []) as unknown) as Array<{
    id: string;
    candid_id: string | null;
    affiliation: string | null;
    topics: string[] | null;
    h_index: number | null;
    total_citations_num: number | null;
  }>;
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
          topics: Array.isArray(row.topics) ? row.topics.join(", ") : null,
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
    .select(
      "id, candid_id, name, company, location, followers, public_repos"
    )
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
    .select(
      "github_profile_id, repo_id, role, commits, additions, deletions, merged_prs"
    )
    .in("github_profile_id", profileIds);

  if (contributionError) throw contributionError;

  const { data: repos, error: repoError } = await supabase
    .from("github_repo")
    .select(
      "id, repo_full_name, description, stars, forks, language, languages, topics"
    )
    .in("id", (contributions ?? []).map((c: any) => c.repo_id).filter(Boolean));

  if (repoError) throw repoError;

  // Aggregate by profile
  const profileData = new Map<
    string,
    {
      topLanguages: Set<string>;
      topRepoStars: number;
      ownerCreatorTotalStars: number;
      countedOwnerCreatorRepoIds: Set<string>;
    }
  >();

  const repoMap = new Map((repos ?? []).map((r: any) => [r.id, r]));

  for (const contrib of contributions ?? []) {
    const profileId = (contrib as any)?.github_profile_id;
    const repoId = (contrib as any)?.repo_id;
    if (!profileId || !repoId) continue;

    const repo = repoMap.get(repoId);
    if (!repo) continue;

    if (!profileData.has(profileId)) {
      profileData.set(profileId, {
        topLanguages: new Set(),
        topRepoStars: 0,
        ownerCreatorTotalStars: 0,
        countedOwnerCreatorRepoIds: new Set(),
      });
    }

    const data = profileData.get(profileId)!;
    if ((repo as any).language) {
      data.topLanguages.add((repo as any).language);
    }
    data.topRepoStars = Math.max(data.topRepoStars, (repo as any).stars ?? 0);

    const role = String((contrib as any)?.role ?? "").toLowerCase();
    if (
      (role === "owner" || role === "creator") &&
      !data.countedOwnerCreatorRepoIds.has(String(repoId))
    ) {
      data.countedOwnerCreatorRepoIds.add(String(repoId));
      data.ownerCreatorTotalStars += Number((repo as any).stars ?? 0);
    }
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
            ownerCreatorTotalStars: data?.ownerCreatorTotalStars ?? 0,
            topLanguages: data ? Array.from(data.topLanguages).slice(0, 5) : [],
            topRepoStars: data?.topRepoStars ?? 0,
          },
        ];
      })
  );
}

async function loadSearchSettings(
  userId: string,
  sourceType: SearchSource,
  selectedSources: SearchSource[]
): Promise<SearchSettingsSnapshot> {
  const { data: row, error } = await supabase
    .from("settings")
    .select("is_korean")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `loadSearchSettings failed (${error.code}): ${error.message}`
    );
  }

  return {
    is_korean: row?.is_korean ?? false,
    type: sourceType,
    sources: normalizeSearchSources(selectedSources, {
      enabledOnly: true,
      fallback: getDefaultEnabledSources(sourceType),
    }),
  };
}

async function loadQuerySourceType(
  queryId: string
): Promise<SearchSettingsSnapshot["type"]> {
  const { data, error } = await supabase
    .from("queries")
    .select("type")
    .eq("query_id", queryId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `loadQuerySourceType failed (${error.code}): ${error.message}`
    );
  }

  return queryTypeToSearchSource(data?.type);
}

/**
 * run 생성:
 * body: { queryId, messageId, criteria, queryText }
 * resp: { runId }
 */
async function createRunFromMessage(params: {
  queryId: string;
  messageId: number;
  criteria: any;
  queryText: string;
  userId?: string;
  sources?: unknown;
}) {
  const { queryId, messageId, criteria, queryText, userId, sources } = params;
  console.log("\n createRunFromMessage: ", queryId, messageId, criteria);

  if (!queryId) throw new Error("createRunFromMessage: missing queryId");
  if (!Number.isFinite(messageId))
    throw new Error("createRunFromMessage: invalid messageId");
  if (criteria == null)
    throw new Error("createRunFromMessage: missing criteria");

  // Insert a new run row.
  // Assumes:
  // - runs.id is uuid with default gen_random_uuid() (or uuid_generate_v4())
  // - runs.query_id (uuid), runs.trigger_message_id (int/bigint), runs.criteria (jsonb)
  // - RLS policy allows insert when the user owns the query
  const locale = getLocaleFromCookie();
  const sourceType = await loadQuerySourceType(queryId);
  const selectedSources = normalizeSearchSources(sources, {
    enabledOnly: true,
    fallback: getDefaultEnabledSources(sourceType),
  });
  const searchSettings = userId
    ? await loadSearchSettings(
        userId,
        selectedSources[0] ?? getDefaultEnabledSources(sourceType)[0],
        selectedSources
      )
    : {
        is_korean: false,
        type: selectedSources[0] ?? getDefaultEnabledSources(sourceType)[0],
        sources: selectedSources,
      };
  const testMode =
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_WORKER_TEST_MODE === "true";
  const queueStatus = testMode ? "queued_test" : "queued";

  const { data, error } = await supabase
    .from("runs")
    .insert({
      query_id: queryId,
      message_id: messageId,
      criteria,
      query_text: queryText,
      user_id: userId,
      status: queueStatus,
      locale,
      search_settings: searchSettings,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(
      `createRunFromMessage: insert failed (${error.code}): ${error.message}`
    );
  }
  if (!data?.id) {
    throw new Error("createRunFromMessage: no run id returned");
  }

  return { runId: data.id as string };
}

export function useChatSearchCandidates(
  userId?: string,
  queryId?: string,
  runId?: string,
  enabled: boolean = true
) {
  const queryClient = useQueryClient();

  const qk = useMemo(
    () => ["searchCandidatesByRun", queryId, userId, runId],
    [queryId, userId, runId]
  );

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
          queryClient.invalidateQueries({ queryKey: qk });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, runId, queryClient, qk]);

  const infinite = useInfiniteQuery({
    queryKey: qk,
    enabled: enabled && !!userId && !!queryId && !!runId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const pageIdx = pageParam as number;

      const { ids, evidenceByCandidateId, rankByCandidateId } =
        await fetchSearchIds({
          runId: runId!,
          pageIdx,
        });

      if (ids?.length) {
        const items = await fetchCandidatesByIds(
          ids,
          userId!,
          runId!,
          evidenceByCandidateId,
          rankByCandidateId
        );
        return { pageIdx, ids, items };
      }

      return { pageIdx, ids: [], items: [] };
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.ids?.length) return undefined;
      return lastPage.pageIdx + 1;
    },
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: false,
  });

  const runSearch = useCallback(
    async ({ messageId }: { messageId: number }) => {
      if (!queryId || !userId) return null;

      // 1) load message
      const { data, error } = await supabase
        .from("messages")
        .select("id, content")
        .eq("id", messageId)
        .single();

      if (error) {
        logger.log("load message error:", error);
        return null;
      }
      if (!data?.content) return null;

      // 2) parse criteria from UI block
      const inputs = extractUiJsonFromMessage(data.content);
      if (!inputs || !inputs.criteria) {
        logger.log("no criteria parsed from message:", messageId);
        return null;
      }

      // 3) create run
      const { runId: newRunId } = await createRunFromMessage({
        queryId,
        messageId,
        criteria: inputs.criteria,
        queryText: inputs.thinking ?? "",
        userId,
        sources: inputs.sources,
      });

      if (!newRunId) return null;

      return newRunId;
    },
    [queryId, userId]
  );

  return {
    ...infinite,
    runSearch,
  };
}
