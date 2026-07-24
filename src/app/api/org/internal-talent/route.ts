import { NextRequest, NextResponse } from "next/server";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import { fetchOrgInternalTalentSystem } from "@/lib/org/internalTalentServer";
import { assertOrgWorkspaceAccess, OrgHttpError } from "@/lib/org/server";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof OrgHttpError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/internal-talent]", error);
  return NextResponse.json(
    { error: "내부 Talent 데이터를 불러오지 못했습니다." },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    if (!isInternalDomainEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const talentId = req.nextUrl.searchParams.get("talentId")?.trim() ?? "";
    const workspaceId =
      req.nextUrl.searchParams.get("workspaceId")?.trim() ?? "";
    if (!talentId || !workspaceId) {
      return NextResponse.json(
        { error: "talentId and workspaceId are required" },
        { status: 400 }
      );
    }

    await assertOrgWorkspaceAccess({
      admin: getSupabaseAdmin(),
      user,
      workspaceId,
    });
    const payload = await fetchOrgInternalTalentSystem({ talentId });
    return NextResponse.json(payload);
  } catch (error) {
    return errorResponse(error);
  }
}
