import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { logger } from "@/utils/logger";

export const runKey = (id?: string) => ["run", id] as const;

async function fetchRunDetail(id: string) {
  const { data, error } = await supabase
    .from("runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function useRunDetail(runId?: string) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: runKey(runId),
    enabled: !!runId,
    queryFn: () => fetchRunDetail(runId!),
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!runId) return;

    const channel = supabase
      .channel(`runs:${runId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "runs",
          filter: `id=eq.${runId}`,
        },
        () => {
          qc.refetchQueries({
            queryKey: runKey(runId),
            exact: true,
            type: "active",
          });
          // qc.invalidateQueries({ queryKey: runKey(runId) });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [runId, qc]);

  return q;
}
