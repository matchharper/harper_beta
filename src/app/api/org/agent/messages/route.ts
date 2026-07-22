import { NextRequest, NextResponse } from "next/server";
import { fetchOrgAgentMessages } from "@/lib/org/agent/store";
import { OrgHttpError } from "@/lib/org/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";

function toErrorResponse(error: unknown) {
  if (error instanceof OrgHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/agent/messages]", error);
  return NextResponse.json(
    { error: "Failed to load recruiter agent messages" },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const beforeMessageId = Number.parseInt(
      req.nextUrl.searchParams.get("beforeMessageId") ?? "",
      10
    );
    const limit = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10);
    const payload = await fetchOrgAgentMessages({
      beforeMessageId: Number.isFinite(beforeMessageId)
        ? beforeMessageId
        : null,
      limit: Number.isFinite(limit) ? limit : null,
      roleId: req.nextUrl.searchParams.get("roleId") ?? "",
      user,
      workspaceId: req.nextUrl.searchParams.get("workspaceId") ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
