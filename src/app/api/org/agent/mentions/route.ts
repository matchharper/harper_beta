import { NextRequest, NextResponse } from "next/server";
import { searchOrgAgentMentionCandidates } from "@/lib/org/agent/context";
import { OrgHttpError } from "@/lib/org/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";

function toErrorResponse(error: unknown) {
  if (error instanceof OrgHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/agent/mentions]", error);
  return NextResponse.json(
    { error: "Failed to load mention candidates" },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const candidates = await searchOrgAgentMentionCandidates({
      query: req.nextUrl.searchParams.get("query"),
      roleId: req.nextUrl.searchParams.get("roleId") ?? "",
      user,
      workspaceId: req.nextUrl.searchParams.get("workspaceId") ?? "",
    });
    return NextResponse.json({ candidates, ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
