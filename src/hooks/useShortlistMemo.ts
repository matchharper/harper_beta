import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

type UpsertShortlistMemoArgs = {
  userId: string;
  candidId: string;
  memo: string;
};

export const shortlistMemoKey = (userId?: string, candidId?: string) =>
  ["shortlistMemo", userId, candidId] as const;

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
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["connections", vars.userId] });
      qc.invalidateQueries({
        queryKey: shortlistMemoKey(vars.userId, vars.candidId),
      });
    },
  });
}
