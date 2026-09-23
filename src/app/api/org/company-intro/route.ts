import { NextRequest, NextResponse } from "next/server";
import {
  OrgHttpError,
  passOrgCompanyIntro,
  requestOrgCompanyIntro,
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

async function roleIdForIntro(introCandidateId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await (
    admin.from("company_intro_candidates" as any) as any
  )
    .select("role_id")
    .eq("id", introCandidateId)
    .maybeSingle();
  if (error) throw error;
  return String(data?.role_id ?? "").trim() || null;
}

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
  console.error("[org/company-intro]", error);
  return NextResponse.json(
    { error: "제안을 처리하지 못했습니다." },
    { status: 500 }
  );
}

export async function POST(req: NextRequest) {
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
      const payload = await passOrgCompanyIntro(common);
      let agentJobId: string | null = null;
      try {
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
          roleId: await roleIdForIntro(common.introCandidateId),
          user,
          workspaceId: common.workspaceId,
        });
        agentJobId = queued.jobId;
      } catch (agentError) {
        console.error("[org/company-intro:agent-wake]", agentError);
      }
      return NextResponse.json({ ...payload, agentJobId });
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
      try {
        const queued = await enqueueOrgAgentWebActionTurn({
          actionContext: {
            decision: "request_intro",
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
          roleId: await roleIdForIntro(common.introCandidateId),
          user,
          workspaceId: common.workspaceId,
        });
        agentJobId = queued.jobId;
      } catch (agentError) {
        console.error("[org/company-intro:agent-wake]", agentError);
      }
      return NextResponse.json({ ...payload, agentJobId });
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
