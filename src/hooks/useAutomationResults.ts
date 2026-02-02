import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { CandidateTypeWithConnection } from "./useSearchChatCandidates";
import { useState } from "react";

export const automationResultsKey = (
  userId?: string,
  automationId?: string,
  pageIdx: number = 0,
  pageSize: number = 10
) => ["automationResults", userId, automationId, pageIdx, pageSize] as const;

export function useAutomationResults(
  userId?: string,
  automationId?: string,
  pageIdx: number = 0,
  pageSize: number = 10
) {
  const [isLoading, setIsLoading] = useState(false);

  return useQuery({
    queryKey: automationResultsKey(userId, automationId, pageIdx, pageSize),
    enabled: !!userId && !!automationId && !isLoading,
    queryFn: async () => {
      setIsLoading(true);
      if (!userId || !automationId) {
        setIsLoading(false);
        return {
          items: [] as CandidateTypeWithConnection[],
          hasNext: false,
          total: 0,
        };
      }

      const from = pageIdx * pageSize;
      const to = from + pageSize - 1;

      const {
        data: rows,
        error: e1,
        count,
      } = await supabase
        .from("automation_results")
        .select("candid_id", { count: "exact" })
        .eq("user_id", userId)
        .eq("automation_id", automationId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (e1) throw e1;

      const ids = (rows ?? [])
        .map((r: any) => r.candid_id)
        .filter(Boolean) as string[];

      if (ids.length === 0) {
        setIsLoading(false);
        return {
          items: [] as CandidateTypeWithConnection[],
          hasNext: false,
          total: count ?? 0,
        };
      }

      const { data: cands, error: e2 } = await supabase
        .from("candid")
        .select(
          `
        id,
        headline,
        bio,
        linkedin_url,
        location,
        name,
        profile_picture,
        edu_user (
          school,
          degree,
          field,
          start_date,
          end_date
        ),
        experience_user (
          role,
          start_date,
          end_date,
          company_id,
          company_db (
            name,
            logo,
            linkedin_url
          )
        ),
        connection (
          user_id,
          typed
        )
          `
        )
        .in("id", ids)
        .eq("connection.user_id", userId);

      if (e2) throw e2;

      const map = new Map((cands ?? []).map((c: any) => [c.id, c]));
      const items = ids
        .map((id) => map.get(id))
        .filter(Boolean) as CandidateTypeWithConnection[];

      const total = count ?? 0;
      const hasNext = to + 1 < total;
      setIsLoading(false);

      return { items, hasNext, total };
    },
    staleTime: 10_000,
  });
}
