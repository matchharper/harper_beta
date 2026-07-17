import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { fetchOrgBoard, OrgHttpError } from "@/lib/org/server";

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
  console.error("[org/board]", error);
  return NextResponse.json(
    { error: "Failed to load candidates" },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const payload = await fetchOrgBoard({
      query: req.nextUrl.searchParams.get("query"),
      recommendedDate: req.nextUrl.searchParams.get("recommendedDate"),
      recommendedFromDate: req.nextUrl.searchParams.get("recommendedFromDate"),
      recommendedToDate: req.nextUrl.searchParams.get("recommendedToDate"),
      roleId: req.nextUrl.searchParams.get("roleId"),
      user,
      workspaceId: req.nextUrl.searchParams.get("workspaceId") ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
