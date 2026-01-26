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
    .order("created_at", {
      referencedTable: "runs",
      ascending: false,
    })
    .limit(1, { referencedTable: "runs" })
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

    // Query row updates → invalidate → refetch
    const channel = supabase
      .channel(`queries:${queryId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "queries",
          filter: `query_id=eq.${queryId}`, // column name must match your table
        },
        () => {
          qc.invalidateQueries({ queryKey: queryKey(queryId) });
        }
      )
      .subscribe((status) => {
        // Optional: if you want to react to subscription state
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryId, qc]);

  return q;
}
