import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { postLogEvent } from "@/lib/logEvent";

type UpsertShortlistMemoArgs = {
  userId: string;
  candidId: string;
  memo: string;
};

export const shortlistMemoKey = (userId?: string, candidId?: string) =>
  ["shortlistMemo", userId, candidId] as const;

export async function fetchShortlistMemoMap(
  userId: string | undefined,
  ids: string[]
) {
  if (!userId || ids.length === 0) {
    return new Map<string, string>();
  }

  const memoByCandidId = new Map<string, string>();
  const { data, error } = await ((supabase.from("shortlist_memo" as any) as any)
    .select("candid_id, memo")
    .eq("user_id", userId)
    .in("candid_id", ids));

  if (error) throw error;

  for (const row of data ?? []) {
    const candidId = String(row?.candid_id ?? "").trim();
    if (!candidId) continue;
    memoByCandidId.set(candidId, String(row?.memo ?? ""));
  }

  return memoByCandidId;
}

export function useShortlistMemo(userId?: string, candidId?: string) {
  return useQuery({
    queryKey: shortlistMemoKey(userId, candidId),
    enabled: !!userId && !!candidId,
    queryFn: async () => {
      const uid = userId!;
      const cid = candidId!;
      const { data, error } = await (supabase.from("shortlist_memo" as any) as any)
        .select("memo")
        .eq("user_id", uid)
        .eq("candid_id", cid)
        .maybeSingle();

      if (error) throw error;
      return String(data?.memo ?? "");
    },
    staleTime: 60_000,
  });
}

export function useUpsertShortlistMemo() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, candidId, memo }: UpsertShortlistMemoArgs) => {
      const trimmedMemo = memo.trim();

      if (!trimmedMemo) {
        const { error } = await (supabase.from("shortlist_memo" as any) as any)
          .delete()
          .eq("user_id", userId)
          .eq("candid_id", candidId);
        if (error) throw error;
        return { memo: "" };
      }

      const { error } = await (supabase.from("shortlist_memo" as any) as any)
        .upsert(
          {
            user_id: userId,
            candid_id: candidId,
            memo: trimmedMemo,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,candid_id" }
        );

      if (error) throw error;
      return { memo: trimmedMemo };
    },
    onSuccess: (result, vars) => {
      qc.invalidateQueries({ queryKey: ["connections", vars.userId] });
      qc.invalidateQueries({ queryKey: ["searchCandidatesByRun"] });
      qc.invalidateQueries({ queryKey: ["runPages"] });
      qc.invalidateQueries({
        queryKey: ["candidate", vars.candidId, vars.userId],
      });
      qc.invalidateQueries({
        queryKey: shortlistMemoKey(vars.userId, vars.candidId),
      });

      if (String(result?.memo ?? "").trim()) {
        void postLogEvent(`shortlist_memo_saved:${vars.candidId}`);
      }
    },
  });
}
