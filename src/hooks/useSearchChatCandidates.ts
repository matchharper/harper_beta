// hooks/useSearchChatCandidates.ts
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryTypeToSearchSource } from "@/lib/searchSource";
import { ScholarProfilePreview } from "@/lib/scholarPreview";
import {
  buildEvidenceMap,
  filterPositiveScoreCandidates,
  RunPageCandidate,
  SearchEvidence,
} from "@/lib/searchEvidence";
import type { CandidateType, EduUserType, ExpUserType } from "@/types/type";
import { useCallback, useEffect, useMemo } from "react";
import { logger } from "@/utils/logger";
import { UI_END, UI_START } from "./chat/useChatSession";
import type { Locale } from "@/i18n/useMessage";

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
  search_evidence?: SearchEvidence | null;
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
 * resp: { results: string[], isNewSearch?: boolean }
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

  return {
    ids,
    evidenceByCandidateId,
    isNewSearch: false,
  };
}

async function fetchCandidatesByIds(
  ids: string[],
  userId: string,
  runId: string,
  evidenceByCandidateId?: Map<string, SearchEvidence>
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

  const { data: scholarVariantRows, error: scholarVariantError } = await supabase
    .from("run_variants")
    .select("id")
    .eq("run_id", runId)
    .eq("source_type", 1)
    .limit(1);

  if (scholarVariantError) throw scholarVariantError;

  const shouldReadScholarPreview =
    Array.isArray(scholarVariantRows) && scholarVariantRows.length > 0;
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
  const scholarPreviewByCandidateId =
    scholarPreviewCandidateIds.length > 0
      ? await fetchScholarPreviewByCandidateIds(scholarPreviewCandidateIds)
      : new Map<string, ScholarProfilePreview>();

  const ordered = ids
    .map((id) => {
      const item = dataById.get(id);
      if (!item) return null;
      return {
        ...item,
        scholar_profile_preview: scholarPreviewByCandidateId.get(id) ?? null,
        search_evidence: evidenceByCandidateId?.get(id) ?? null,
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
}) {
  const { queryId, messageId, criteria, queryText, userId } = params;
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
  const { data: queryRow, error: queryError } = await supabase
    .from("queries")
    .select("type")
    .eq("query_id", queryId)
    .maybeSingle();

  if (queryError) {
    throw new Error(
      `createRunFromMessage: query lookup failed (${queryError.code}): ${queryError.message}`
    );
  }

  const sourceType = queryTypeToSearchSource(queryRow?.type);

  const { data, error } = await supabase
    .from("runs")
    .insert({
      query_id: queryId,
      message_id: messageId,
      criteria,
      query_text: queryText,
      user_id: userId,
      status: "queued",
      locale,
      search_settings: {
        type: sourceType,
      },
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

      const { ids, isNewSearch, evidenceByCandidateId } = await fetchSearchIds({
        runId: runId!,
        pageIdx,
      });

      if (ids?.length) {
        if (isNewSearch) await deduct(1);
        const items = await fetchCandidatesByIds(
          ids,
          userId!,
          runId!,
          evidenceByCandidateId
        );
        return { pageIdx, ids, items, isNewSearch };
      }

      return { pageIdx, ids: [], items: [], isNewSearch };
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
      });

      if (!newRunId) return null;

      return newRunId;
    },
    [queryId, userId, queryClient]
  );

  return {
    ...infinite,
    runSearch,
  };
}
function deduct(arg0: number) {
  throw new Error("Function not implemented.");
}
