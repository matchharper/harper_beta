import { NextRequest, NextResponse } from "next/server";
import { assertOrgRoleAccess, OrgHttpError } from "@/lib/org/server";
import { fetchCompanyRoleCalibrationResponse } from "@/lib/org/roleCalibrationServer";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const workspaceId = text(searchParams.get("workspaceId"));
    const roleId = text(searchParams.get("roleId"));
    const calibrationId = text(searchParams.get("calibrationId"));
    const profileId = text(searchParams.get("profileId"));
    if (!workspaceId || !roleId) {
      throw new OrgHttpError(400, "workspaceId and roleId are required");
    }
    const admin = getSupabaseAdmin();
    await assertOrgRoleAccess({ admin, roleId, user, workspaceId });
    const response = await fetchCompanyRoleCalibrationResponse({
      admin,
      calibrationId: calibrationId || null,
      profileId: profileId || null,
      roleId,
      workspaceId,
    });
    if ((calibrationId || profileId) && !response.calibration) {
      throw new OrgHttpError(404, "Calibration profile not found");
    }
    if (profileId && response.calibration?.profiles.length !== 1) {
      throw new OrgHttpError(404, "Calibration profile not found");
    }
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof OrgHttpError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[org/role-calibration]", error);
    return NextResponse.json(
      { error: "Failed to load Role calibration" },
      { status: 500 }
    );
  }
}
