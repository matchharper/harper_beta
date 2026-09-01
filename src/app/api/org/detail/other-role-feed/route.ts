import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { fetchOrgTalentOtherRoleFeed, OrgHttpError } from "@/lib/org/server";

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
  console.error("[org/detail/other-role-feed]", error);
  return NextResponse.json(
    { error: "Failed to load other Role activity" },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const payload = await fetchOrgTalentOtherRoleFeed({
      excludeRoleId: req.nextUrl.searchParams.get("excludeRoleId") ?? "",
      talentId: req.nextUrl.searchParams.get("talentId") ?? "",
      user,
      workspaceId: req.nextUrl.searchParams.get("workspaceId") ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
