import { NextRequest, NextResponse } from "next/server";
import { recordCandidateProfileView } from "@/lib/org/candidateProfileView";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";
import { fetchOrgTalentDetail, OrgHttpError } from "@/lib/org/server";

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
  console.error("[org/detail]", error);
  return NextResponse.json({ error: "Failed to load talent" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const payload = await fetchOrgTalentDetail({
      recommendationId: req.nextUrl.searchParams.get("recommendationId"),
      roleId: req.nextUrl.searchParams.get("roleId"),
      talentId: req.nextUrl.searchParams.get("talentId") ?? "",
      user,
      workspaceId: req.nextUrl.searchParams.get("workspaceId") ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}

// Explicit display acknowledgment; GETs and any future prefetches do not count as views.
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    if (isInternalDomainEmail(user.email))
      return NextResponse.json({ ok: true });
    const body = await req.json();
    if (
      !body ||
      typeof body.workspaceId !== "string" ||
      typeof body.talentId !== "string" ||
      typeof body.roleId !== "string" ||
      (body.recommendationId != null &&
        typeof body.recommendationId !== "string")
    ) {
      return NextResponse.json(
        { error: "Invalid candidate reference" },
        { status: 400 }
      );
    }
    // Reuse the complete role, sharing, and team-access checks from the detail reader.
    const detail = await fetchOrgTalentDetail({
      recommendationId: body.recommendationId,
      roleId: body.roleId,
      talentId: body.talentId,
      workspaceId: body.workspaceId,
      user,
    });
    await recordCandidateProfileView({
      admin: getSupabaseAdmin(),
      companyUserId: user.id,
      email: user.email,
      roleId: detail.role.roleId,
      source: "web",
      talentId: detail.talent.userId,
      workspaceId: detail.workspace.workspaceId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
