import { NextRequest, NextResponse } from "next/server";
import { assertOrgWorkspaceAccess, OrgHttpError } from "@/lib/org/server";
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
    if (!workspaceId || !roleId) {
      throw new OrgHttpError(400, "workspaceId and roleId are required");
    }

    const admin = getSupabaseAdmin();
    await assertOrgWorkspaceAccess({ admin, user, workspaceId });

    const { data: role, error: roleError } = await (
      admin.from("company_roles" as any) as any
    )
      .select("role_id")
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      .maybeSingle();
    if (roleError) throw roleError;
    if (!role) throw new OrgHttpError(404, "Role not found");

    const { data: activeRun, error: runError } = await (
      admin.from("company_first_search_runs" as any) as any
    )
      .select("id")
      .eq("company_workspace_id", workspaceId)
      .eq("trigger_reason", "company_requested")
      .contains("requested_role_ids", [roleId])
      .in("status", ["queued", "running", "delivery_pending"])
      .limit(1)
      .maybeSingle();
    if (runError) throw runError;

    return NextResponse.json({ active: Boolean(activeRun), ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
