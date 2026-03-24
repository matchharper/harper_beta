import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CandidateMarkRecord,
  CandidateMarkStatus,
  isCandidateMarkStatus,
} from "@/lib/candidateMark";
import { supabase } from "@/lib/supabase";

type SetCandidateMarkArgs = {
  userId: string;
  candidId: string;
  status: CandidateMarkStatus | null;
};

function isMissingRelationError(error: any, relation: string) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "");
  return (
    code === "PGRST205" ||
    message.includes(`public.${relation}`) ||
    message.includes(`relation "${relation}" does not exist`)
  );
}

export async function fetchCandidateMarkMap(
  userId: string | undefined,
  ids: string[]
) {
  if (!userId || ids.length === 0) {
    return new Map<string, CandidateMarkRecord>();
  }

  const { data, error } = await ((supabase.from("candidate_mark" as any) as any)
    .select("candid_id, status, created_at, updated_at")
    .eq("user_id", userId)
    .in("candid_id", ids));

  if (error) {
    if (isMissingRelationError(error, "candidate_mark")) {
      return new Map<string, CandidateMarkRecord>();
    }
    throw error;
  }

  const records = new Map<string, CandidateMarkRecord>();
  for (const row of data ?? []) {
    const candidId = String(row?.candid_id ?? "").trim();
    const status = row?.status;
    if (!candidId || !isCandidateMarkStatus(status)) continue;
    records.set(candidId, {
      candidId,
      status,
      createdAt: row?.created_at ?? null,
      updatedAt: row?.updated_at ?? null,
    });
  }

  return records;
}

export function useSetCandidateMark() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, candidId, status }: SetCandidateMarkArgs) => {
      if (!status) {
        const { error } = await ((supabase.from("candidate_mark" as any) as any)
          .delete()
          .eq("user_id", userId)
          .eq("candid_id", candidId));

        if (error) throw error;
        return { status: null };
      }

      const { error } = await ((supabase.from("candidate_mark" as any) as any)
        .upsert(
          {
            user_id: userId,
            candid_id: candidId,
            status,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,candid_id" }
        ));

      if (error) throw error;
      return { status };
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["connections", vars.userId] });
      qc.invalidateQueries({ queryKey: ["searchCandidatesByRun"] });
      qc.invalidateQueries({ queryKey: ["runPages"] });
    },
  });
}
