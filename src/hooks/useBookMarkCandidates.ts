import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CandidateType } from "@/types/type";
import { CandidateTypeWithConnection } from "./useSearchCandidates";
import { useState } from "react";

export type ConnectionTyped = 0 | 1 | 2;

export const connectionsKey = (
  userId?: string,
  typed: ConnectionTyped = 0,
  pageIdx: number = 0,
  pageSize: number = 10
) => ["connections", userId, typed, pageIdx, pageSize] as const;

export function useCandidatesByConnectionTyped(
  userId?: string,
  typed: ConnectionTyped = 0,
  pageIdx: number = 0,
  pageSize: number = 10
) {
  const [isLoading, setIsLoading] = useState(false);

  return useQuery({
    queryKey: connectionsKey(userId, typed, pageIdx, pageSize),
    enabled: !!userId && !isLoading,
    queryFn: async () => {
      setIsLoading(true);
      if (!userId) {
        setIsLoading(false);
        return {
          items: [] as CandidateTypeWithConnection[],
          hasNext: false,
          total: 0,
        };
      }

      const from = pageIdx * pageSize;
      const to = from + pageSize - 1;

      // 1) connection 페이지 단위 + total count
      const {
        data: rows,
        error: e1,
        count,
      } = await supabase
        .from("connection")
        .select("candid_id", { count: "exact" })
        .eq("user_id", userId)
        .eq("typed", typed)
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

      // 2) candid 상세 조회
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

      // ids 순서 유지
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

// 기존 API 유지하고 싶으면 thin wrapper만 둠
export function useBookmarkedCandidates(
  userId?: string,
  pageIdx = 0,
  pageSize = 10
) {
  return useCandidatesByConnectionTyped(userId, 0, pageIdx, pageSize);
}

export function useRequestedCandidates(
  userId?: string,
  pageIdx = 0,
  pageSize = 10
) {
  return useCandidatesByConnectionTyped(userId, 1, pageIdx, pageSize);
}

export function useConnectedCandidates(
  userId?: string,
  pageIdx = 0,
  pageSize = 10
) {
  return useCandidatesByConnectionTyped(userId, 2, pageIdx, pageSize);
}

export const connectionsCountKey = (userId?: string) =>
  ["connectionsCount", userId] as const;

async function fetchConnectionCount(userId: string, typed: ConnectionTyped) {
  const { count, error } = await supabase
    .from("connection")
    .select("id", { count: "exact", head: true }) // ✅ rows 없이 count만
    .eq("user_id", userId)
    .eq("typed", typed);

  if (error) throw error;
  return count ?? 0;
}

export function useConnectionCounts(userId?: string) {
  return useQuery({
    queryKey: connectionsCountKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const uid = userId!;
      const [bookmark, request, connected] = await Promise.all([
        fetchConnectionCount(uid, 0),
        fetchConnectionCount(uid, 1),
        fetchConnectionCount(uid, 2),
      ]);

      return { bookmark, request, connected };
    },

    // "그때그때 바뀌는 값 반영"을 위해 보통 이 조합이 무난
    staleTime: 3_000, // 캐시 유지(짧게)
    refetchInterval: 10_000, // 10초마다 자동 갱신 (원하면 끄거나 조정)
    refetchOnWindowFocus: true, // 탭 다시 보면 갱신
  });
}
