import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { fetchMatchCandidates } from "@/lib/match/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      pageIdx?: number;
      pageSize?: number;
      roleId?: string | null;
      workspaceId?: string | null;
    };

    const data = await fetchMatchCandidates({
      pageIdx: body.pageIdx,
      pageSize: body.pageSize,
      roleId: body.roleId,
      userId: user.id,
      workspaceId: body.workspaceId,
    });

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load matched candidates";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
