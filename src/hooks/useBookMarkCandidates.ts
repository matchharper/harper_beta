import { useQuery } from "@tanstack/react-query";
import { ScholarProfilePreview } from "@/lib/scholarPreview";
import { supabase } from "@/lib/supabase";
import { CandidateTypeWithConnection } from "./useSearchChatCandidates";
import { fetchCandidateMarkMap } from "./useCandidateMark";

export type ConnectionTyped = 0 | 1 | 2 | 3;

export const connectionsKey = (
  userId?: string,
  typed: ConnectionTyped = 0,
  pageIdx: number = 0,
  pageSize: number = 10,
  folderId: number | null = null
) => ["connections", userId, typed, pageIdx, pageSize, folderId] as const;

async function fetchScholarPreviewByCandidateIds(ids: string[]) {
  const { data: profiles, error: profileError } = await supabase
    .from("scholar_profile")
    .select("id, candid_id, affiliation, topics, h_index, total_citations_num")
    .in("candid_id", ids);

  if (profileError) throw profileError;

  const profileRows = Array.isArray(profiles) ? profiles : [];
  if (profileRows.length === 0) {
    return new Map<string, ScholarProfilePreview>();
  }

  const profileIds = profileRows.map((row) => row.id);
  const { data: contributions, error: contributionError } = await supabase
    .from("scholar_contributions")
    .select("scholar_profile_id")
    .in("scholar_profile_id", profileIds);

  if (contributionError) throw contributionError;

  const paperCountByProfileId = new Map<string, number>();
  for (const row of contributions ?? []) {
    const profileId = String((row as any)?.scholar_profile_id ?? "");
    if (!profileId) continue;
    paperCountByProfileId.set(
      profileId,
      (paperCountByProfileId.get(profileId) ?? 0) + 1
    );
  }

  return new Map<string, ScholarProfilePreview>(
    profileRows
      .filter((row) => Boolean(row.candid_id))
      .map((row) => [
        row.candid_id as string,
        {
          scholarProfileId: row.id,
          affiliation: row.affiliation,
          topics: row.topics,
          hIndex: row.h_index,
          paperCount: paperCountByProfileId.get(row.id) ?? 0,
          citationCount: row.total_citations_num ?? 0,
        },
      ])
  );
}

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

      const from = pageIdx * pageSize;
      const to = from + pageSize - 1;

      // 1) connection 페이지 단위 + total count
      let rows: any[] | null = null;
      let count: number | null = 0;
      let e1: any = null;

      if (typed === 0 && folderId !== null) {
        const res = await ((supabase.from("bookmark_folder_item" as any) as any)
          .select("candid_id", { count: "exact" })
          .eq("user_id", userId)
          .eq("folder_id", folderId)
          .order("created_at", { ascending: false })
          .range(from, to));
        rows = res.data;
        e1 = res.error;
        count = res.count;
      } else {
        const res = await supabase
          .from("connection")
          .select("candid_id", { count: "exact" })
          .eq("user_id", userId)
          .eq("typed", typed)
          .order("created_at", { ascending: false })
          .range(from, to);
        rows = res.data;
        e1 = res.error;
        count = res.count;
      }

      if (e1) throw e1;

      const ids = (rows ?? [])
        .map((r: any) => r.candid_id)
        .filter(Boolean) as string[];

      if (ids.length === 0) {
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
        links,
        location,
        name,
        profile_picture,
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
          company_id,
          company_db (
            name,
            logo,
            linkedin_url
          )
        ),
        connection (
          user_id,
          typed,
          text
        ),
        s:summary (
          text
        )
          `
        )
        .in("id", ids)
        .eq("connection.user_id", userId);

      if (e2) throw e2;

      const scholarPreviewByCandidateId =
        await fetchScholarPreviewByCandidateIds(ids);
      const candidateMarkByCandidateId = await fetchCandidateMarkMap(
        userId,
        ids
      );

      const memoByCandidId = new Map<string, string>();
      const { data: memoRows, error: e3 } = await (
        supabase.from("shortlist_memo" as any) as any
      )
        .select("candid_id, memo")
        .eq("user_id", userId)
        .in("candid_id", ids);

      if (!e3 && Array.isArray(memoRows)) {
        for (const row of memoRows) {
          const cid = String(row?.candid_id ?? "");
          if (!cid) continue;
          memoByCandidId.set(cid, String(row?.memo ?? ""));
        }
      }

      // ids 순서 유지
      const map = new Map((cands ?? []).map((c: any) => [c.id, c]));
      const items = ids
        .map((id) => {
          const cand = map.get(id);
          if (!cand) return null;
          return {
            ...cand,
            candidate_mark: candidateMarkByCandidateId.get(id) ?? null,
            scholar_profile_preview:
              scholarPreviewByCandidateId.get(id) ?? null,
            shortlist_memo: memoByCandidId.get(id) ?? "",
          };
        })
        .filter(Boolean) as CandidateTypeWithConnection[];

      const total = count ?? 0;
      const hasNext = to + 1 < total;

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
      const [bookmark, picked] = await Promise.all([
        fetchConnectionCount(uid, 0),
        fetchConnectionCount(uid, 3),
      ]);

      return { bookmark, picked };
    },

    // "그때그때 바뀌는 값 반영"을 위해 보통 이 조합이 무난
    staleTime: 3_000, // 캐시 유지(짧게)
    refetchInterval: 10_000, // 10초마다 자동 갱신 (원하면 끄거나 조정)
    refetchOnWindowFocus: true, // 탭 다시 보면 갱신
  });
}
