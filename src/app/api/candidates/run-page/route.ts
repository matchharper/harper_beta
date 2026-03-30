import { NextRequest, NextResponse } from "next/server";
import type { CandidateMarkStatus } from "@/lib/candidateMark";
import {
  applyListRevealState,
  fetchBaseCandidatesByIds,
  fetchCandidateMarkMapForUser,
  fetchGithubPreviewByCandidateIds,
  fetchRevealMapForUser,
  fetchScholarPreviewByCandidateIds,
  fetchShortlistMemoMapForUser,
  getSupabaseAdmin,
  loadRunPageCandidateWindow,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json();

    const runId = String(body?.runId ?? "").trim();
    const pageIdx = Math.max(0, Number(body?.pageIdx ?? 0) || 0);
    const excludedMarkStatuses = Array.isArray(body?.excludedMarkStatuses)
      ? (body.excludedMarkStatuses as CandidateMarkStatus[])
      : [];

    if (!runId) {
      return NextResponse.json({ error: "runId required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { ids, total, evidenceByCandidateId, rankByCandidateId } =
      await loadRunPageCandidateWindow({
        supabaseAdmin,
        runId,
        pageIdx,
        userId: user.id,
        excludedMarkStatuses,
      });

    if (ids.length === 0) {
      return NextResponse.json({ pageIdx, ids, items: [], total });
    }

    const [
      candidates,
      revealMap,
      candidateMarkMap,
      shortlistMemoMap,
      scholarPreviewByCandidateId,
      githubPreviewByCandidateId,
    ] = await Promise.all([
      fetchBaseCandidatesByIds({
        supabaseAdmin,
        ids,
        userId: user.id,
        runId,
      }),
      fetchRevealMapForUser(supabaseAdmin, user.id, ids),
      fetchCandidateMarkMapForUser(supabaseAdmin, user.id, ids),
      fetchShortlistMemoMapForUser(supabaseAdmin, user.id, ids),
      fetchScholarPreviewByCandidateIds(supabaseAdmin, ids),
      fetchGithubPreviewByCandidateIds(supabaseAdmin, ids),
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
          github_profile_preview: githubPreviewByCandidateId.get(id) ?? null,
          search_evidence: evidenceByCandidateId.get(id) ?? null,
          search_rank: rankByCandidateId.get(id) ?? null,
          candidate_mark: candidateMarkMap.get(id) ?? null,
          shortlist_memo: isRevealed ? shortlistMemoMap.get(id) ?? "" : "",
        };

        return applyListRevealState(payload, isRevealed);
      })
      .filter(Boolean);

    return NextResponse.json({ pageIdx, ids, items, total });
  } catch (error: any) {
    const message = String(error?.message ?? "Unknown error");
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
