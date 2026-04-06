import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";

export const runKey = (id?: string) => queryKeys.run.detail(id ?? "");
const TERMINAL_STATUSES = new Set(["finished", "error", "stopped"]);

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

  const currentStatus = String((q.data as any)?.status ?? "").toLowerCase();
  const isTerminal = !!currentStatus && TERMINAL_STATUSES.has(currentStatus);
  const refetchRun = q.refetch;

  useEffect(() => {
    if (!runId || isTerminal) return;

    const poll = () => {
      refetchRun().catch(() => {
        // Keep polling: realtime misses or transient fetch errors should recover automatically.
      });
    };

    poll();
    const timer = window.setInterval(poll, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [runId, isTerminal, refetchRun]);

  useEffect(() => {
    if (!runId) return;

    const channel = supabase
      .channel(`runs:${runId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [runId, qc]);

  return q;
}
