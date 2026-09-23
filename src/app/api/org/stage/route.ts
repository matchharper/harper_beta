import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import {
  OrgHttpError,
  setOrgCandidateStage,
  type OrgStageId,
} from "@/lib/org/server";
import type { InternalConnectionConfirmationEmailMode } from "@/lib/ops/connectionConfirmationEmail";
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
    return NextResponse.json(
      { error: "로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요." },
      { status: 401 }
    );
  }
  console.error("[org/stage]", error);
  return NextResponse.json(
    {
      error:
        "후보자 상태 변경 결과를 확인하지 못했어요. 소개 이메일이나 후보자 안내가 전달됐을 수 있으니 바로 다시 시도하지 말고, 현재 상태와 메일을 먼저 확인해 주세요.",
    },
    { status: 500 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      acceptReason?: string | null;
      agentActionId?: unknown;
      attendeeEmails?: string[];
      contactDirectly?: boolean;
      durationMinutes?: unknown;
      emailMode?: unknown;
      additionalMessage?: unknown;
      additionalMessageVisibility?: unknown;
      meetingCandidateMessage?: unknown;
      meetingPurpose?: unknown;
      recommendationId?: string;
      reengagementActionId?: unknown;
      reengagementResolution?: unknown;
      introEmails?: string[] | null;
      roleId?: string;
      scheduleInterview?: boolean;
      sourceStage?: OrgStageId;
      stage?: OrgStageId;
      stopNote?: string | null;
      talentId?: string;
      title?: unknown;
      workspaceId?: string;
    };
    const emailMode = String(body.emailMode ?? "schedule").trim();
    if (!["schedule", "send_now", "skip"].includes(emailMode)) {
      throw new OrgHttpError(400, "이메일 전달 방식을 확인해 주세요.");
    }
    const stage = body.stage ?? "pending_connection";
    const reengagementResolution = String(
      body.reengagementResolution ?? ""
    ).trim();
    if (
      reengagementResolution &&
      !["ask_candidate", "company_confirmed"].includes(reengagementResolution)
    ) {
      throw new OrgHttpError(400, "복구 진행 방식을 확인해 주세요.");
    }
    if (body.scheduleInterview === true) {
      throw new OrgHttpError(
        410,
        "인터뷰 일정 조율은 Harper에게 채팅으로 요청해 주세요."
      );
    }

    const payload = await setOrgCandidateStage({
      acceptReason: body.acceptReason ?? null,
      contactDirectly: body.contactDirectly === true,
      emailMode: emailMode as InternalConnectionConfirmationEmailMode,
      expectedPreviousStage: body.sourceStage,
      introEmails: body.introEmails ?? null,
      recommendationId: body.recommendationId ?? "",
      reengagementActionId:
        typeof body.reengagementActionId === "string"
          ? body.reengagementActionId
          : null,
      reengagementResolution: reengagementResolution
        ? (reengagementResolution as "ask_candidate" | "company_confirmed")
        : null,
      roleId: body.roleId ?? "",
      scheduleInterview: false,
      stage,
      stopNote: body.stopNote ?? null,
      talentId: body.talentId ?? "",
      user,
      workspaceId: body.workspaceId ?? "",
    });
    let agentJobId: string | null = null;
    try {
      const queued = await enqueueOrgAgentWebActionTurn({
        actionContext: {
          closureNotificationDelivered:
            "closureNotificationDelivered" in payload
              ? payload.closureNotificationDelivered
              : null,
          previousStage: body.sourceStage ?? null,
          recommendationId: body.recommendationId ?? "",
          roleId: payload.roleId,
          stage: "stage" in payload ? payload.stage : payload.requestedStage,
          status: "status" in payload ? payload.status : "completed",
          talentId: payload.talentId,
        },
        actionName: "candidate_stage_changed",
        idempotencyKey: [
          "org-web",
          body.workspaceId ?? "",
          user.id,
          "candidate-stage",
          payload.roleId,
          payload.talentId,
          "stage" in payload ? payload.stage : payload.requestedStage,
          actionIdentity(body.agentActionId),
        ].join(":"),
        roleId: payload.roleId,
        user,
        workspaceId: body.workspaceId ?? "",
      });
      agentJobId = queued.jobId;
    } catch (agentError) {
      console.error("[org/stage:agent-wake]", agentError);
    }
    return NextResponse.json({
      ...payload,
      agentJobId,
      meetingSchedule: null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
