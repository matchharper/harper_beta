import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { OrgHttpError, updateOrgRole } from "@/lib/org/server";
import { enqueueOrgAgentWebActionTurn } from "@/lib/org/agent/webActionTurn";

function actionIdentity(value: unknown) {
  return (
    String(value ?? "")
      .trim()
      .slice(0, 200) || crypto.randomUUID()
  );
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
  console.error("[org/role]", error);
  return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      criteria?: unknown;
      agentActionId?: unknown;
      description?: string | null;
      employmentTypes?: string[] | null;
      externalJdUrl?: string | null;
      expectedCriteria?: unknown;
      isCompanyFirstSearch?: boolean;
      isExpired?: boolean | null;
      locationText?: string | null;
      name?: string | null;
      request?: string | null;
      roleId?: string;
      salaryRange?: string | null;
      status?: string | null;
      workMode?: string | null;
      workspaceId?: string;
    };
    const payload = await updateOrgRole({
      criteria: body.criteria,
      description: body.description,
      employmentTypes: body.employmentTypes,
      externalJdUrl: body.externalJdUrl,
      expectedCriteria: body.expectedCriteria,
      isCompanyFirstSearch: body.isCompanyFirstSearch,
      isExpired: body.isExpired,
      locationText: body.locationText,
      name: body.name,
      request: body.request,
      roleId: body.roleId ?? "",
      salaryRange: body.salaryRange,
      status: body.status,
      user,
      workMode: body.workMode,
      workspaceId: body.workspaceId ?? "",
    });
    let agentJobId: string | null = null;
    const wakesCompanySideLlm =
      body.status !== undefined || body.isExpired !== undefined;
    if (wakesCompanySideLlm) {
      try {
        const changedFields = ["isExpired", "status"].filter(
          (field) => body[field as keyof typeof body] !== undefined
        );
        const queued = await enqueueOrgAgentWebActionTurn({
          actionContext: {
            changedFields,
            role: {
              locationText: payload.role.locationText,
              name: payload.role.name,
              roleId: payload.role.roleId,
              status: payload.role.status,
              updatedAt: payload.role.updatedAt,
              workMode: payload.role.workMode,
            },
            status: "completed",
          },
          actionName: "role_lifecycle_changed",
          idempotencyKey: [
            "org-web",
            body.workspaceId ?? "",
            user.id,
            "role-lifecycle",
            body.roleId ?? "",
            actionIdentity(body.agentActionId),
          ].join(":"),
          roleId: body.roleId ?? "",
          user,
          workspaceId: body.workspaceId ?? "",
        });
        agentJobId = queued.jobId;
      } catch (agentError) {
        console.error("[org/role:agent-wake]", agentError);
      }
    }
    return NextResponse.json({ ...payload, agentJobId });
  } catch (error) {
    return toErrorResponse(error);
  }
}
