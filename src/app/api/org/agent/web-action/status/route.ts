import { NextRequest, NextResponse } from "next/server";
import { assertOrgWorkspacePermission, OrgHttpError } from "@/lib/org/server";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";

const TERMINAL_STATUSES = new Set([
  "completed_silent",
  "completed_message",
  "superseded",
  "failed",
]);

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const jobId = String(req.nextUrl.searchParams.get("jobId") ?? "").trim();
    const workspaceId = String(
      req.nextUrl.searchParams.get("workspaceId") ?? ""
    ).trim();
    if (!jobId || !workspaceId) {
      throw new OrgHttpError(400, "jobId and workspaceId are required");
    }
    const admin = getSupabaseAdmin();
    await assertOrgWorkspacePermission({
      admin,
      permission: "view",
      user,
      workspaceId,
    });
    const { data, error } = await (
      admin.from("company_agent_web_action_jobs" as any) as any
    )
      .select("progress_message_id, role_id, status, terminal_message_id")
      .eq("id", jobId)
      .eq("company_workspace_id", workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new OrgHttpError(404, "Agent turn not found");
    const status = String(data.status ?? "").trim();
    return NextResponse.json({
      done: TERMINAL_STATUSES.has(status),
      ok: true,
      progressMessageId: Number(data.progress_message_id || 0) || null,
      roleId: String(data.role_id ?? "").trim() || null,
      status,
      terminalMessageId: Number(data.terminal_message_id || 0) || null,
    });
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
    console.error("[org-agent/web-action:status]", error);
    return NextResponse.json(
      { error: "Failed to read agent turn" },
      { status: 500 }
    );
  }
}
