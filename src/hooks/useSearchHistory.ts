import {
  useInfiniteQuery, // useQuery 대신 사용
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export const queriesHistoryKey = (userId?: string) =>
  ["queriesHistory", userId] as const;

// fetcher: pageParam(마지막 아이템의 생성일자)을 인자로 받음
export async function fetchQueriesHistory({
  userId,
  limit = 5,
  pageParam,
}: {
  userId: string;
  limit?: number;
  pageParam?: string;
}) {
  let query = supabase
    .from("queries")
    .select("*")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  // 커서가 있다면 해당 시간보다 이전(lt)의 데이터만 가져옴
  if (pageParam) {
    query = query.lt("created_at", pageParam);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export function useQueriesHistory(userId?: string, limit = 8) {
  return useInfiniteQuery({
    queryKey: queriesHistoryKey(userId),
    queryFn: ({ pageParam }) =>
      fetchQueriesHistory({ userId: userId!, limit, pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      // 가져온 데이터가 limit보다 적으면 더 이상 데이터가 없는 것으로 판단
      if (lastPage.length < limit) return undefined;
      // 마지막 아이템의 created_at을 다음 페이지의 시작점으로 반환
      return lastPage[lastPage.length - 1].created_at;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

// Invalidate 로직은 동일하게 유지 (모든 페이지를 무효화함)
export function refreshQueriesHistory(
  queryClient: QueryClient,
  userId: string
) {
  return queryClient.invalidateQueries({ queryKey: queriesHistoryKey(userId) });
}
