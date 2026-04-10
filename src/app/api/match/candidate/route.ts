import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import {
  fetchMatchCandidateDetail,
  updateMatchCandidateDecision,
} from "@/lib/match/server";
import type { MatchDecisionStatus } from "@/lib/match/shared";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const candidId = String(searchParams.get("candidId") ?? "").trim();
    const roleId = String(searchParams.get("roleId") ?? "").trim();
    const workspaceId = String(searchParams.get("workspaceId") ?? "").trim();

    if (!candidId) {
      return NextResponse.json({ error: "candidId is required" }, { status: 400 });
    }

    const data = await fetchMatchCandidateDetail({
      candidId,
      roleId: roleId || null,
      userId: user.id,
      workspaceId: workspaceId || null,
    });

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load matched candidate";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      candidId?: string;
      feedbackText?: string;
      roleId?: string;
      status?: MatchDecisionStatus;
      workspaceId?: string | null;
    };

    const candidId = String(body.candidId ?? "").trim();
    const roleId = String(body.roleId ?? "").trim();
    if (!candidId || !roleId) {
      return NextResponse.json(
        { error: "candidId and roleId are required" },
        { status: 400 }
      );
    }

    const data = await updateMatchCandidateDecision({
      candidId,
      feedbackText: String(body.feedbackText ?? ""),
      roleId,
      status: (body.status ?? "pending") as Exclude<MatchDecisionStatus, "pending">,
      userId: user.id,
      workspaceId: body.workspaceId,
    });

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update match candidate";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
