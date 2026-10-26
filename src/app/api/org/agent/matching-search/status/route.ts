import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertOrgRoleAccess, OrgHttpError } from "@/lib/org/server";
import { readRoleMatchingActivity } from "@/lib/companyFirstSearch/activity.server";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return String(value ?? "").trim();
}

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
  console.error("[org/agent/matching-search/status]", error);
  return NextResponse.json(
    { error: "Failed to load matching search status" },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const workspaceId = text(req.nextUrl.searchParams.get("workspaceId"));
    const roleId = text(req.nextUrl.searchParams.get("roleId"));
    if (!z.string().uuid().safeParse(workspaceId).success || !z.string().uuid().safeParse(roleId).success) {
      throw new OrgHttpError(400, "Valid workspaceId and roleId are required");
    }

    const admin = getSupabaseAdmin();
    await assertOrgRoleAccess({ admin, user, workspaceId, roleId, permission: "view" });

    const { data: role, error: roleError } = await (
      admin.from("company_roles" as any) as any
    )
      .select("role_id")
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      .maybeSingle();
    if (roleError) throw roleError;
    if (!role) throw new OrgHttpError(404, "Role not found");

    return NextResponse.json(await readRoleMatchingActivity({ admin, workspaceId, roleId }), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
