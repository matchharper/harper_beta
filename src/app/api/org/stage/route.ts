import { withOrgRequestScope } from "@/lib/org/requestScope.server";
import { traceStageStep, withStageTiming } from "@/lib/org/stageTiming.server";
import { billingErrorResponse } from "@/lib/org/billing/http";
import { after, NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import {
  OrgHttpError,
  setOrgCandidateStage,
  type OrgStageId,
} from "@/lib/org/server";
import type { InternalConnectionConfirmationEmailMode } from "@/lib/ops/connectionConfirmationEmail";
import { enqueueOrgAgentWebActionTurn } from "@/lib/org/agent/webActionTurn";

import {
  createMeetingScheduleDraft,
  prepareMeetingScheduleDraftForStage,
  fetchMeetingScheduleDetail,
} from "@/lib/meetings/scheduleDraftServer";
import {
  prepareMeetingInvitationPreview,
  queueMeetingInvitation,
} from "@/lib/meetings/invitationServer";
import { getPublicSiteUrlFromRequest } from "@/lib/siteUrl";

export const maxDuration = 120;

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
  return withOrgRequestScope(() => withStageTiming(() => handleStagePost(req)), after, { cachePermissions: true });
}

async function handleStagePost(req: NextRequest) {
  try {
    const user = await traceStageStep("POST:60", async () => (requireAuthenticatedUser(req)));
    const body = (await traceStageStep("POST:61", async () => (req.json().catch(() => ({}))))) as {
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
      notifyCandidateOnClosure?: boolean;
      stopNote?: string | null;
      talentId?: string;
      title?: unknown;
      workspaceId?: string;
    };
    if (
      body.notifyCandidateOnClosure !== undefined &&
      typeof body.notifyCandidateOnClosure !== "boolean"
    ) {
      throw new OrgHttpError(400, "종료 안내 여부를 확인해 주세요.");
    }
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
    const schedulesInterview = body.scheduleInterview === true;
    if (
      schedulesInterview &&
      ((stage !== "connected" && !stage.startsWith("custom:")) ||
        body.contactDirectly ||
        body.sourceStage !== "pending_connection")
    ) {
      throw new OrgHttpError(
        400,
        "연결 대기 후보자를 선택해 인터뷰를 요청해 주세요."
      );
    }
    // Validate setup and prepare the invitation before accepting the candidate.
    // The initial connection has one durable schedule per recommendation, even
    // if a client loses the response and submits again with a new action ID.
    const prepared = schedulesInterview
      ? await traceStageStep("POST:122", async () => (prepareMeetingScheduleDraftForStage({
          attendeeEmails: body.attendeeEmails,
          durationMinutes: body.durationMinutes,
          meetingCandidateMessage: body.meetingCandidateMessage,
          meetingPurpose: body.meetingPurpose,
          recommendationId: body.recommendationId ?? "",
          roleId: body.roleId ?? "",
          sourceStage: body.sourceStage,
          stageId: stage.startsWith("custom:") ? stage.slice(7) : null,
          talentId: body.talentId ?? "",
          title: body.title,
          user,
          workspaceId: body.workspaceId ?? "",
        })))
      : null;
    const meeting = prepared
      ? await traceStageStep("POST:138", async () => (createMeetingScheduleDraft({
          ...prepared,
          sourceCompanyMessageId: null,
          webRequestKey: "initial-connection",
        })))
      : null;
    const meetingDetail = meeting
      ? await traceStageStep("POST:145", async () => (fetchMeetingScheduleDetail({
          scheduleId: meeting.scheduleId,
          user,
          workspaceId: body.workspaceId ?? "",
        })))
      : null;
    const invitation =
      meeting && meetingDetail?.schedule.status === "preparing"
        ? await traceStageStep("POST:153", async () => (prepareMeetingInvitationPreview({
            scheduleId: meeting.scheduleId,
            user,
            workspaceId: body.workspaceId ?? "",
          })))
        : null;
    if (meeting && !invitation) {
      throw new OrgHttpError(
        409,
        "이미 인터뷰 요청이 시작되었어요. 후보자의 현재 진행 상황을 확인해 주세요."
      );
    }

    const payload = await traceStageStep("POST:166", async () => (setOrgCandidateStage({
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
      scheduleInterview: schedulesInterview,
      stage,
      notifyCandidateOnClosure: body.notifyCandidateOnClosure,
      stopNote: body.stopNote ?? null,
      talentId: body.talentId ?? "",
      user,
      workspaceId: body.workspaceId ?? "",
    })));
    if (meeting && invitation && meetingDetail && "stage" in payload) {
      try {
        await traceStageStep("POST:191", async () => (queueMeetingInvitation({
          baseUrl: getPublicSiteUrlFromRequest(req),
          body: invitation.email.body,
          candidateMessage: invitation.email.candidateMessage,
          expectedVersion: meetingDetail.schedule.version,
          scheduleId: meeting.scheduleId,
          sendImmediately: true,
          subject: invitation.email.subject,
          user,
          workspaceId: body.workspaceId ?? "",
        })));
      } catch (error) {
        console.error("[org/stage:interview-invitation]", error);
        throw new OrgHttpError(
          502,
          "후보자 연결은 완료했지만 인터뷰 요청 메일의 발송 상태를 확인하지 못했어요. Harper 채팅에서 이 후보자의 인터뷰 요청 상태를 확인해 주세요."
        );
      }
    }
    let agentJobId: string | null = "companyUpdateJobId" in payload ? payload.companyUpdateJobId ?? null : null;
    try {
      if (!agentJobId) {
      const queued = await traceStageStep("POST:212", async () => (enqueueOrgAgentWebActionTurn({
        actionContext: {
          closureNotificationDelivered:
            "closureNotificationDelivered" in payload
              ? payload.closureNotificationDelivered
              : null,
          meetingScheduleId: meeting?.scheduleId ?? null,
          interviewInvitationRequested: Boolean(meeting && "stage" in payload),
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
      })));
      agentJobId = queued.jobId;
      }
    } catch (agentError) {
      console.error("[org/stage:agent-wake]", agentError);
    }
    return NextResponse.json({
      ...payload,
      agentJobId,
      meetingSchedule:
        meeting && "stage" in payload
          ? { ...meeting, detailPath: "", status: "awaiting_talent" }
          : null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
