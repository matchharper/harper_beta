import { NextRequest, NextResponse } from "next/server";
import { fetchOrgBoardProfileLabels, OrgHttpError } from "@/lib/org/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";

function toErrorResponse(error: unknown) {
  if (error instanceof OrgHttpError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/board/profile-labels]", error);
  return NextResponse.json(
    { error: "Failed to load candidate profile labels" },
    { status: 500 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      recommendationIds?: unknown;
      workspaceId?: unknown;
    };
    const recommendationIds = Array.isArray(body.recommendationIds)
      ? body.recommendationIds.map((value) => String(value ?? ""))
      : [];
    const payload = await fetchOrgBoardProfileLabels({
      recommendationIds,
      user,
      workspaceId: String(body.workspaceId ?? ""),
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
