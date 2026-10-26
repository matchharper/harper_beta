import { withOrgRequestScope } from "@/lib/org/requestScope.server";
import { billingErrorResponse } from "@/lib/org/billing/http";
import { after, NextRequest, NextResponse } from "next/server";
import {
  OrgHttpError,
  passOrgCompanyIntro,
  requestOrgCompanyIntro,
  type OrgCompanyIntroMutationResponse,
} from "@/lib/org/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { enqueueOrgAgentWebActionTurn } from "@/lib/org/agent/webActionTurn";

function actionIdentity(value: unknown) {
  return (
    String(value ?? "")
      .trim()
      .slice(0, 200) || crypto.randomUUID()
  );
}

async function readIntroUpdate(introCandidateId: string, workspaceId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await (
    admin.from("company_intro_candidates" as any) as any
  )
    .select(
      "role_id, talent_id, status, requested_at, candidate_sent_at, talent_decision_at, close_reason, company_appeal, next_stage_id, updated_at"
    )
    .eq("id", introCandidateId)
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  const roleId = String(data?.role_id ?? "").trim() || null;
  const candidateUpdate: OrgCompanyIntroMutationResponse["candidateUpdate"] =
    data &&
    data.close_reason !== "route_replaced" &&
    ["ready", "awaiting_talent", "connecting", "closed", "passed"].includes(
      data.status
    )
      ? {
          roleId: data.role_id,
          talentId: data.talent_id,
          status: data.status,
          requestedAt: data.requested_at,
          candidateSentAt: data.candidate_sent_at,
          talentDecisionAt: data.talent_decision_at,
          closeReason: data.close_reason,
          companyAppeal: data.company_appeal,
          nextStageId: data.next_stage_id,
          updatedAt: data.updated_at,
        }
      : undefined;
  return { roleId, candidateUpdate };
}

function errorResponse(error: unknown) {
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
  console.error("[org/company-intro]", error);
  return NextResponse.json(
    { error: "제안을 처리하지 못했습니다." },
    { status: 500 }
  );
}

export async function POST(req: NextRequest) {
  return withOrgRequestScope(() => handlePost(req), after, { cachePermissions: true });
}

async function handlePost(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? "").trim();
    const common = {
      introCandidateId: String(body.introCandidateId ?? "").trim(),
      user,
      workspaceId: String(body.workspaceId ?? "").trim(),
    };
    if (action === "pass") {
      const payload = await passOrgCompanyIntro({
        ...common,
        reason:
          typeof body.reason === "string"
            ? body.reason.trim().slice(0, 2000)
            : undefined,
      });
      let agentJobId: string | null = null;
      let candidateUpdate: OrgCompanyIntroMutationResponse["candidateUpdate"];
      try {
        const update = await readIntroUpdate(
          common.introCandidateId,
          common.workspaceId
        );
        candidateUpdate = update.candidateUpdate;
        const queued = await enqueueOrgAgentWebActionTurn({
          actionContext: {
            decision: "pass",
            introCandidateId: payload.introCandidateId,
            status: payload.status,
          },
          actionName: "company_intro_decision",
          idempotencyKey: [
            "org-web",
            common.workspaceId,
            user.id,
            "company-intro",
            common.introCandidateId,
            "pass",
            actionIdentity(body.agentActionId),
          ].join(":"),
          roleId: update.roleId,
          user,
          workspaceId: common.workspaceId,
        });
        agentJobId = queued.jobId;
      } catch (agentError) {
        console.error("[org/company-intro:agent-wake]", agentError);
      }
      return NextResponse.json({ ...payload, agentJobId, candidateUpdate });
    }
    if (action === "request") {
      const payload = await requestOrgCompanyIntro({
        ...common,
        companyAppeal: String(body.companyAppeal ?? ""),
        introRecipientEmails: Array.isArray(body.introRecipientEmails)
          ? body.introRecipientEmails.map((value) => String(value))
          : [],
        nextStageId: String(body.nextStageId ?? "").trim(),
      });
      let agentJobId: string | null = null;
      let candidateUpdate: OrgCompanyIntroMutationResponse["candidateUpdate"];
      try {
        const update = await readIntroUpdate(
          common.introCandidateId,
          common.workspaceId
        );
        candidateUpdate = update.candidateUpdate;
        const queued = await enqueueOrgAgentWebActionTurn({
          actionContext: {
            decision: "request_intro",
            candidateAcceptedAt: payload.candidateAcceptedAt,
            currentStageTag: payload.stageTag,
            newIntroCreated: payload.newIntroCreated,
            introCandidateId: payload.introCandidateId,
            nextStageId: String(body.nextStageId ?? "").trim(),
            status: payload.status,
          },
          actionName: "company_intro_decision",
          idempotencyKey: [
            "org-web",
            common.workspaceId,
            user.id,
            "company-intro",
            common.introCandidateId,
            "request",
            actionIdentity(body.agentActionId),
          ].join(":"),
          roleId: update.roleId,
          user,
          workspaceId: common.workspaceId,
        });
        agentJobId = queued.jobId;
      } catch (agentError) {
        console.error("[org/company-intro:agent-wake]", agentError);
      }
      return NextResponse.json({ ...payload, agentJobId, candidateUpdate });
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
