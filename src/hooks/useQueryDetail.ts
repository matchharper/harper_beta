import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { QueryType } from "@/types/type";
import { logger } from "@/utils/logger";

type QueryTypeWithCompanyUser = QueryType & {
  runs?: {
    id: string;
    created_at: string;
    criteria: string[];
  }[];
  company_users: {
    user_id: string;
    name: string;
  };
};

export const queryKey = (id?: string) => ["query", id] as const;

async function fetchQueryDetail(id: string) {
  const { data, error } = await supabase
    .from("queries")
    .select(
      `
      *,
      runs (
        id,
        created_at,
        criteria
      ),
      company_users (
        user_id,
        name
      )
    `
    )
    .eq("query_id", id)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error) throw error;
  return data as QueryTypeWithCompanyUser | null;
}

export function useQueryDetail(queryId?: string) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: queryKey(queryId),
    enabled: !!queryId,
    queryFn: () => fetchQueryDetail(queryId!),
    staleTime: 60_000,
    retry: false,
  });


  useEffect(() => {
    if (!queryId) return;

    // 1) 같은 이름 채널이 남아있을 가능성 대비해서 먼저 정리
    // (특히 dev StrictMode / hot reload 에서 중요)
    supabase.getChannels?.().forEach((ch: any) => {
      if (ch.topic === `realtime:queries:${queryId}`) {
        supabase.removeChannel(ch);
      }
    });

    // 2) 채널 이름을 "완전 고유"하게 (최소 queryId 포함, 필요하면 랜덤도)
    const channel = supabase
      .channel(`queries:${queryId}:${Date.now()}`) // <- 핵심
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "queries",
          filter: `query_id=eq.${queryId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: queryKey(queryId) });
        }
      )
      .subscribe((status, err) => {
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryId, qc]);


  return q;
}
