import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CandidateType } from "@/types/type";

export type CandidateDetail = CandidateType & {
  connection?: { user_id: string; typed: number }[];
};

export const candidateKey = (id?: string, userId?: string) =>
  ["candidate", id, userId] as const;

export async function fetchCandidateDetail(id: string, userId?: string) {
  const q = supabase
    .from("candid")
    .select(
      `
      *,
      edu_user (
        school,
        degree,
        field,
        start_date,
        end_date,
        url
      ),
      experience_user (
        role,
        start_date,
        end_date,
        description,
        months,
        company_id,
        company_db (
          name,
          logo,
          linkedin_url,
          founded_year,
          employee_count_range,
          specialities,
          investors,
          short_description,
          location
        )
      ),
      publications (
        title,
        link,
        published_at
      ),
      extra_experience(
        *
      ),
      connection (
        user_id,
        typed
      ),
      s:summary ( text )
    `
    )
    .eq("id", id)
    .limit(1)
    .maybeSingle();

  // userId가 있으면 connection을 해당 user로만 필터
  const { data, error } = await q;
  // const { data, error } = userId
  // ? await q.eq("connection.user_id", userId)
  // : await q;

  if (error) throw error;
  return data as CandidateDetail | null;
}

export function useCandidateDetail(userId?: string, candidId?: string) {
  return useQuery({
    queryKey: candidateKey(candidId, userId),
    enabled: !!candidId,
    queryFn: () => fetchCandidateDetail(candidId!, userId),
    staleTime: 60_000,
  });
}
