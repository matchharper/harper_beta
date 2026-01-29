
import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { CandidateTypeWithConnection } from "./useSearchChatCandidates";
import { logger } from "@/utils/logger";

async function fetchCandidatesByIds(
    ids: string[],
    userId: string,
    runId: string
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
          synthesized_summary ( text )
        `
        )
        .in("id", ids)
        .eq("connection.user_id", userId)
        .eq("synthesized_summary.run_id", runId);

    logger.log("fetchCandidatesByIds time ", performance.now() - start_time);
    if (error) throw error;

    const dataById = new Map((data ?? []).map((item: any) => [item.id, item]));
    const ordered = ids.map((id) => dataById.get(id)).filter(Boolean);

    return ordered as CandidateTypeWithConnection[];
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
    const ids = (row?.candidate_ids ?? []).slice(0, 10).map((r: any) => r.id);

    return {
        ids,
    };
}

async function fetchRunPage(params: {
    runId: string;
    pageIdx: number; // this is now the "virtual page" inside a single row
    userId: string;
}) {
    const { runId, pageIdx } = params;

    // NOTE: always read the latest single row for this runId
    const { data, error } = await supabase
        .from("runs_pages")
        .select("candidate_ids, created_at")
        .eq("run_id", runId)
        .order("created_at", { ascending: false })
        .limit(1);

    if (error) throw error;

    const row = data?.[0];
    const all = (row?.candidate_ids ?? []) as Array<{ id: string }>;

    const start = pageIdx * 10;
    const end = start + 10;

    const ids = all.slice(start, end).map((r) => r.id);

    return { ids, total: all.length };
}


export function useRunPagesInfinite({
    userId,
    runId,
    enabled = true,
}: {
    userId?: string;
    runId?: string;
    enabled?: boolean;
}) {
    const queryClient = useQueryClient();

    const qk = useMemo(() => ["runPages", runId, userId], [runId, userId]);

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

            const { ids } = await fetchRunPage({
                runId: runId!,
                pageIdx,
                userId: userId!,
            });

            // ids -> 후보자 fetch
            const items = ids.length
                ? await fetchCandidatesByIds(ids, userId!, runId!)
                : [];

            return { pageIdx, ids, items };
        },
        getNextPageParam: (lastPage) => {
            if (!lastPage?.ids?.length) return undefined;
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
