import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

type Args = {
  userId: string;
  candidId: string;
};

export function useToggleRequest() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, candidId }: Args) => {
      // existing?
      const { data: existing, error: e1 } = await supabase
        .from("connection")
        .select("id")
        .eq("user_id", userId)
        .eq("candid_id", candidId)
        .eq("typed", 1)
        .maybeSingle();

      if (e1) throw e1;

      if (existing?.id) {
        // if existing, delete it
        const { error: e2 } = await supabase
          .from("connection")
          .delete()
          .eq("id", existing.id);

        if (e2) throw e2;
        return { requested: false as const };
      }

      // if not existing, insert it
      const { error: e3 } = await supabase.from("connection").insert({
        user_id: userId,
        candid_id: candidId,
        typed: 1,
      });

      if (e3) throw e3;
      return { requested: true as const };
    },

    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["connections", vars.userId] });
      qc.invalidateQueries({ queryKey: ["connectionsCount", vars.userId] });
      qc.invalidateQueries({ queryKey: ["candidate"] });
      qc.invalidateQueries({ queryKey: ["searchCandidatesByRun"] });
    },
  });
}
