import { NextRequest, NextResponse } from "next/server";
import {
  applyListRevealState,
  fetchBaseCandidatesByIds,
  fetchCandidateMarkMapForUser,
  fetchRevealMapForUser,
  fetchScholarPreviewByCandidateIds,
  fetchShortlistMemoMapForUser,
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json();

    const typed = Number(body?.typed ?? 0);
    const pageIdx = Math.max(0, Number(body?.pageIdx ?? 0) || 0);
    const pageSize = Math.min(
      30,
      Math.max(1, Number(body?.pageSize ?? 10) || 10)
    );
    const folderId =
      body?.folderId == null ? null : Number(body.folderId) || null;

    const supabaseAdmin = getSupabaseAdmin();
    const from = pageIdx * pageSize;
    const to = from + pageSize - 1;

    let rows: any[] | null = null;
    let count: number | null = 0;

    if (typed === 0 && folderId !== null) {
      const res = await ((supabaseAdmin.from("bookmark_folder_item" as any) as any)
        .select("candid_id", { count: "exact" })
        .eq("user_id", user.id)
        .eq("folder_id", folderId)
        .order("created_at", { ascending: false })
        .range(from, to));
      rows = res.data;
      count = res.count;
      if (res.error) throw res.error;
    } else {
      const res = await ((supabaseAdmin.from("connection" as any) as any)
        .select("candid_id", { count: "exact" })
        .eq("user_id", user.id)
        .eq("typed", typed)
        .order("created_at", { ascending: false })
        .range(from, to));
      rows = res.data;
      count = res.count;
      if (res.error) throw res.error;
    }

    const ids = (rows ?? [])
      .map((row: any) => String(row?.candid_id ?? "").trim())
      .filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({
        items: [],
        total: count ?? 0,
        hasNext: false,
      });
    }

    const [
      candidates,
      revealMap,
      candidateMarkMap,
      shortlistMemoMap,
      scholarPreviewByCandidateId,
    ] = await Promise.all([
      fetchBaseCandidatesByIds({
        supabaseAdmin,
        ids,
        userId: user.id,
      }),
      fetchRevealMapForUser(supabaseAdmin, user.id, ids),
      fetchCandidateMarkMapForUser(supabaseAdmin, user.id, ids),
      fetchShortlistMemoMapForUser(supabaseAdmin, user.id, ids),
      fetchScholarPreviewByCandidateIds(supabaseAdmin, ids),
    ]);

    const byId = new Map(candidates.map((candidate: any) => [candidate.id, candidate]));
    const items = ids
      .map((id) => {
        const candidate = byId.get(id);
        if (!candidate) return null;
        const isRevealed = revealMap.get(id) === true;

        const payload = {
          ...candidate,
          scholar_profile_preview: scholarPreviewByCandidateId.get(id) ?? null,
          candidate_mark: candidateMarkMap.get(id) ?? null,
          shortlist_memo: isRevealed ? shortlistMemoMap.get(id) ?? "" : "",
        };

        return applyListRevealState(payload, isRevealed);
      })
      .filter(Boolean);

    const total = count ?? 0;
    return NextResponse.json({
      items,
      total,
      hasNext: to + 1 < total,
    });
  } catch (error: any) {
    const message = String(error?.message ?? "Unknown error");
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
