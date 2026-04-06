import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { CandidateTypeWithConnection } from "./useSearchChatCandidates";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { queryKeys } from "@/lib/queryKeys";

export type ConnectionTyped = 0 | 1 | 2 | 3;

export const connectionsKey = (
  userId?: string,
  typed: ConnectionTyped = 0,
  pageIdx: number = 0,
  pageSize: number = 10,
  folderId: number | null = null
) => ["connections", userId, typed, pageIdx, pageSize, folderId] as const;

export function useCandidatesByConnectionTyped(
  userId?: string,
  typed: ConnectionTyped = 0,
  pageIdx: number = 0,
  pageSize: number = 10,
  folderId: number | null = null
) {
  return useQuery({
    queryKey: connectionsKey(userId, typed, pageIdx, pageSize, folderId),
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) {
        return {
          items: [] as CandidateTypeWithConnection[],
          hasNext: false,
          total: 0,
        };
      }

      return fetchWithInternalAuth<{
        items: CandidateTypeWithConnection[];
        hasNext: boolean;
        total: number;
      }>("/api/candidates/by-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          typed,
          pageIdx,
          pageSize,
          folderId,
        }),
      });
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

export function usePickedCandidates(
  userId?: string,
  pageIdx = 0,
  pageSize = 10
) {
  return useCandidatesByConnectionTyped(userId, 3, pageIdx, pageSize);
}

export function useConnectedCandidates(
  userId?: string,
  pageIdx = 0,
  pageSize = 10
) {
  return useCandidatesByConnectionTyped(userId, 2, pageIdx, pageSize);
}

export const connectionsCountKey = (userId?: string) =>
  queryKeys.connections.count(userId ?? "");

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
      const [bookmark, picked] = await Promise.all([
        fetchConnectionCount(uid, 0),
        fetchConnectionCount(uid, 3),
      ]);

      return { bookmark, picked };
    },

    // refetchInterval 제거: 글로벌 스케일에서 DoS 벡터. 수동 invalidation으로 전환.
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
