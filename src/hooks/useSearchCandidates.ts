import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CandidateType, EduUserType, ExpUserType } from "@/types/type";
import { useCredits } from "./useCredit";
import { useCallback, useState } from "react";
import { logger } from "@/utils/logger";

export type ExperienceUserType = ExpUserType & {
  company_db: {
    name: string;
    logo: string;
    linkedin_url: string;
  };
};

export type CandidateTypeWithConnection = CandidateType & {
  edu_user: EduUserType[];
} & {
  experience_user: ExperienceUserType[];
} & {
  connection: { user_id: string; typed: number }[];
} & {
  publications?: { title: string; published_at: string }[];
} & {
  synthesized_summary?: { text: string }[];
};

async function fetchSearchIds(
  queryId: string,
  pageIdx: number,
  mode: "normal" | "more" = "normal"
) {
  const endpoint = mode === "more" ? "/api/search/more" : "/api/search";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queryId, pageIdx }),
  });
  if (!res.ok) throw new Error("search api failed");
  const data = await res.json();

  return {
    ids: (data?.results ?? []) as string[],
    isNewSearch: data?.isNewSearch ?? false,
  };
}

async function fetchCandidatesByIds(
  ids: string[],
  userId: string,
  queryId: string
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
            short_description
          )
        ),
        connection (
          user_id,
          typed
        ),
        synthesized_summary ( text ),
        reveal ( company_user_id )
      `
    )
    .in("id", ids)
    .eq("connection.user_id", userId)
    .eq("synthesized_summary.query_id", queryId)
    .eq("reveal.company_user_id", userId);

  logger.log("fetchCandidatesByIds ", data, error);
  logger.log("fetchCandidatesByIds time ", performance.now() - start_time);

  if (error) throw error;

  const dataById = new Map((data ?? []).map((item) => [item.id, item]));

  const orderedData = ids.map((id) => dataById.get(id)).filter(Boolean);

  return orderedData;
}

export function useSearchCandidates(
  userId?: string,
  queryId?: string,
  enabled: boolean = true
) {
  const { deduct } = useCredits();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<"normal" | "more">("normal");

  const query = useInfiniteQuery({
    queryKey: ["searchCandidates", queryId, userId, mode], // ✅ mode 포함
    enabled: enabled && !!userId && !!queryId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const pageIdx = pageParam as number;

      const { ids, isNewSearch } = await fetchSearchIds(
        queryId!,
        pageIdx,
        mode
      );

      if (ids?.length) {
        if (isNewSearch) await deduct(ids.length * 3);
        const items = await fetchCandidatesByIds(ids, userId!, queryId!);
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

  // ✅ 버튼 핸들러: "더 찾아보기" 같은 동작
  const runMoreSearch = useCallback(async () => {
    // 지금까지 쌓인 페이지/캐시를 버리고 새로 시작하고 싶으면:
    await queryClient.removeQueries({
      queryKey: ["searchCandidates", queryId, userId], // mode 제외 prefix로 싹 제거
    });
    setMode("more"); // ✅ key 변경 -> page 0부터 queryFn 다시 실행
  }, [queryClient, queryId, userId]);

  const runNormalSearch = useCallback(async () => {
    await queryClient.removeQueries({
      queryKey: ["searchCandidates", queryId, userId],
    });
    setMode("normal");
  }, [queryClient, queryId, userId]);

  return {
    ...query,
    mode,
    runMoreSearch,
    runNormalSearch,
  };
}
