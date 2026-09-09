import { NextRequest, NextResponse } from "next/server";
import { canUseOrgDevControls } from "@/lib/internalAccess";
import {
  getOrgRoleMatchingHealthToolResult,
  OrgRoleMatchingHealthError,
} from "@/lib/org/agent/roleMatchingHealthServer";
import { assertOrgRoleAccess, OrgHttpError } from "@/lib/org/server";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function errorResponse(error: unknown) {
  if (error instanceof OrgRoleMatchingHealthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof OrgHttpError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/dev/role-matching-health]", error);
  return NextResponse.json(
    { error: "Role matching-health 결과를 불러오지 못했습니다." },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    if (!canUseOrgDevControls(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const workspaceId = text(req.nextUrl.searchParams.get("workspaceId"));
    const roleId = text(req.nextUrl.searchParams.get("roleId"));
    if (!workspaceId || !roleId) {
      throw new OrgHttpError(400, "workspaceId and roleId are required");
    }

    const admin = getSupabaseAdmin();
    await assertOrgRoleAccess({
      admin,
      permission: "view",
      roleId,
      user,
      workspaceId,
    });
    const result = await getOrgRoleMatchingHealthToolResult({
      admin,
      roleId,
      workspaceId,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
