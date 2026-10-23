import { billingErrorResponse } from "@/lib/org/billing/http";
import { NextRequest, NextResponse } from "next/server";
import { isRegisteredRoleStartRole } from "@/lib/org/roleStart/session";
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
  const billing = billingErrorResponse(error);
  if (billing) return billing;
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
      isPromote?: boolean;
      isAnonymous?: boolean;
      introSearchDate?: unknown;
      introSearchTime?: unknown;
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
    // A Role started from role start changes its Brief text and criteria only
    // through its Brief (/api/org/role-start update_rubric), so the two stay one.
    if (
      (body.request !== undefined || body.criteria !== undefined) &&
      body.roleId &&
      (await isRegisteredRoleStartRole(body.roleId, body.workspaceId ?? ""))
    ) {
      throw new OrgHttpError(409, "이 역할의 기준은 매칭 기준 탭의 Brief에서 고쳐 주세요.");
    }
    const payload = await updateOrgRole({
      criteria: body.criteria,
      description: body.description,
      employmentTypes: body.employmentTypes,
      externalJdUrl: body.externalJdUrl,
      expectedCriteria: body.expectedCriteria,
      isCompanyFirstSearch: body.isCompanyFirstSearch,
      isPromote: body.isPromote,
      isAnonymous: body.isAnonymous,
      introSearchDate: body.introSearchDate,
      introSearchTime: body.introSearchTime,
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
