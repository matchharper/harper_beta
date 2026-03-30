import { NextRequest, NextResponse } from "next/server";
import {
  applyListRevealState,
  fetchBaseCandidatesByIds,
  fetchRevealMapForUser,
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json();

    const automationId = String(body?.automationId ?? "").trim();
    const pageIdx = Math.max(0, Number(body?.pageIdx ?? 0) || 0);
    const pageSize = Math.min(
      30,
      Math.max(1, Number(body?.pageSize ?? 10) || 10)
    );

    if (!automationId) {
      return NextResponse.json(
        { error: "automationId required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const from = pageIdx * pageSize;
    const to = from + pageSize - 1;

    const {
      data: rows,
      error,
      count,
    } = await ((supabaseAdmin.from("automation_results" as any) as any)
      .select("candid_id", { count: "exact" })
      .eq("user_id", user.id)
      .eq("automation_id", automationId)
      .order("created_at", { ascending: false })
      .range(from, to));

    if (error) throw error;

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

    const [candidates, revealMap] = await Promise.all([
      fetchBaseCandidatesByIds({
        supabaseAdmin,
        ids,
        userId: user.id,
      }),
      fetchRevealMapForUser(supabaseAdmin, user.id, ids),
    ]);

    const byId = new Map(candidates.map((candidate: any) => [candidate.id, candidate]));
    const items = ids
      .map((id: string) => {
        const candidate = byId.get(id);
        if (!candidate) return null;
        return applyListRevealState(candidate, revealMap.get(id) === true);
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
