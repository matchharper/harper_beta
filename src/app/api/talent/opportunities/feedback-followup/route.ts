import { NextRequest, NextResponse } from "next/server";
import { createTalentOpportunityFeedbackFollowUpReply } from "@/lib/career/historyActionReply";
import type { TalentOpportunityFeedbackReplyTrigger } from "@/lib/career/historyActionReply";
import { careerT } from "@/lib/career/translatedCareerMessage";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  fetchTalentSetting,
  getTalentSupabaseAdmin,
  toTalentMessageResponse,
  type TalentAdminClient,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import { isMobileRequest, withIsMobile } from "@/lib/requestDevice";
import {
  fetchTalentOpportunityHistoryByIds,
  type TalentOpportunityFeedback,
  type TalentOpportunityHistoryItem,
} from "@/lib/talentOpportunity";
import {
  appendInternalOpportunityCallRequestMarker,
  fetchInternalOpportunityCallRequestById,
  fetchPendingInternalOpportunityCallRequests,
  isOpenInternalOpportunityCallRequestStatus,
  maybeCreateInternalOpportunityCallRequest,
  type InternalOpportunityCallRequest,
} from "@/lib/talentOnboarding/internalOpportunityCallRequest";
import { TALENT_TOOL_NAMES } from "@/lib/talentOnboarding/tools";

function normalizeFeedbackFollowUpTrigger(
  value: unknown
): TalentOpportunityFeedbackReplyTrigger {
  if (
    value === "all_visible_feedback_submitted" ||
    value === "all_recommended_opportunities_cleared" ||
    value === "immediate_internal_feedback"
  ) {
    return value;
  }
  return "delayed_external_feedback";
}

function normalizeFeedback(value: unknown): TalentOpportunityFeedback | null {
  return value === "positive" || value === "negative" ? value : null;
}

function getAllowedToolNamesForFeedbackFollowUp(
  trigger: TalentOpportunityFeedbackReplyTrigger
): readonly string[] | null {
  return trigger === "immediate_internal_feedback"
    ? []
    : [TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS];
}

async function assertConversationAccess(args: {
  admin: TalentAdminClient;
  conversationId: string;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_conversations")
    .select("id")
    .eq("id", args.conversationId)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to read conversation");
  }
  if (!data) {
    throw new Error("Conversation not found");
  }
}

function buildInternalCallRequestAssistantContent(args: {
  callRequest: InternalOpportunityCallRequest;
  locale?: string | null;
}) {
  const content = careerT(
    args.locale,
    "career.internal_opportunity.call_request_created",
    [
      "추가로, 혹시 저와 짧게 통화 가능하신가요?",
      "",
      "평가 목적의 통화는 아니고, {companyName} {roleTitle} 연결 건으로 회사에 더 정확히 소개드리기 위해 역할 관련 질문 몇 가지만 확인하려고 합니다.",
      "",
      "- 회사 쪽이 보통 궁금해하는 부분을 짧게 확인할 예정이에요",
      "- 답변해주시면 소개 자료를 더 구체적으로 만들 수 있어요",
      "- 통화하지 않으셔도 연결 프로세스는 그대로 진행됩니다",
      "",
      "편하실 때 아래에서 바로 진행해주세요.",
    ].join("\n"),
    {
      values: {
        companyName: args.callRequest.companyName,
        roleTitle: args.callRequest.roleTitle,
      },
    }
  );

  return appendInternalOpportunityCallRequestMarker({
    callRequest: args.callRequest,
    content,
  });
}

async function insertInternalCallRequestAssistantMessage(args: {
  admin: TalentAdminClient;
  callRequest: InternalOpportunityCallRequest;
  conversationId: string;
  isMobile?: boolean | null;
  locale?: string | null;
  userId: string;
}) {
  await assertConversationAccess({
    admin: args.admin,
    conversationId: args.conversationId,
    userId: args.userId,
  });

  const { data, error } = await args.admin
    .from("talent_messages")
    .insert(
      withIsMobile(
        {
          conversation_id: args.conversationId,
          user_id: args.userId,
          role: "assistant",
          content: buildInternalCallRequestAssistantContent({
            callRequest: args.callRequest,
            locale: args.locale,
          }),
          message_type: "chat",
        },
        args.isMobile
      )
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to insert call request message");
  }

  return toTalentMessageResponse(data as TalentMessageRow);
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      conversationId?: string | null;
      feedback?: string | null;
      feedbackReason?: string | null;
      internalCallRequestId?: string | null;
      opportunityId?: string | null;
      callRequestOnly?: boolean;
      shouldCreateInternalCallRequest?: boolean;
      trigger?: string | null;
    };
    const conversationId = String(body.conversationId ?? "").trim();
    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const trigger = normalizeFeedbackFollowUpTrigger(body.trigger);
    const feedback = normalizeFeedback(body.feedback);
    const feedbackReason = String(body.feedbackReason ?? "").trim() || null;
    const isCallRequestOnly = body.callRequestOnly === true;
    const requestIsMobile = isMobileRequest(req);
    const opportunityId = String(body.opportunityId ?? "").trim();
    let opportunity: TalentOpportunityHistoryItem | null = null;
    let internalCallRequest: InternalOpportunityCallRequest | null = null;
    let pendingInternalOpportunityCallRequests:
      | InternalOpportunityCallRequest[]
      | undefined;

    if (opportunityId && (feedback || body.shouldCreateInternalCallRequest)) {
      const [matchedOpportunity] = await fetchTalentOpportunityHistoryByIds({
        admin,
        ids: [opportunityId],
        userId: user.id,
      });
      opportunity = matchedOpportunity ?? null;
    }

    const explicitInternalCallRequestId = String(
      body.internalCallRequestId ?? ""
    ).trim();
    if (explicitInternalCallRequestId) {
      try {
        const request = await fetchInternalOpportunityCallRequestById({
          admin,
          callId: explicitInternalCallRequestId,
          userId: user.id,
        });
        internalCallRequest =
          request && isOpenInternalOpportunityCallRequestStatus(request.status)
            ? request
            : null;
      } catch (error) {
        console.error("[career-history:feedback-follow-up-call-request]", {
          callRequestId: explicitInternalCallRequestId,
          error: error instanceof Error ? error.message : String(error),
          userId: user.id,
        });
      }
    } else if (
      body.shouldCreateInternalCallRequest === true &&
      feedback === "positive" &&
      opportunity?.sourceType === "internal"
    ) {
      try {
        internalCallRequest = await maybeCreateInternalOpportunityCallRequest({
          admin,
          conversationId,
          opportunity,
          userId: user.id,
        });
      } catch (error) {
        console.error("[career-history:feedback-follow-up-call-request]", {
          error: error instanceof Error ? error.message : String(error),
          opportunityId: opportunity.id,
          userId: user.id,
        });
      }
    }

    if (internalCallRequest || body.shouldCreateInternalCallRequest === true) {
      try {
        pendingInternalOpportunityCallRequests =
          await fetchPendingInternalOpportunityCallRequests({
            admin,
            userId: user.id,
          });
      } catch (error) {
        console.error("[career-history:feedback-follow-up-pending-calls]", {
          error: error instanceof Error ? error.message : String(error),
          userId: user.id,
        });
      }
    }

    if (isCallRequestOnly) {
      const talentSetting = internalCallRequest
        ? await fetchTalentSetting({
            admin,
            userId: user.id,
          })
        : null;
      const assistantMessage = internalCallRequest
        ? await insertInternalCallRequestAssistantMessage({
            admin,
            callRequest: internalCallRequest,
            conversationId,
            isMobile: requestIsMobile,
            locale: talentSetting?.preferred_locale ?? null,
            userId: user.id,
          })
        : null;

      return NextResponse.json({
        assistantMessage,
        ok: true,
        pendingInternalOpportunityCallRequest: internalCallRequest,
        pendingInternalOpportunityCallRequests,
      });
    }

    const assistantMessage = await createTalentOpportunityFeedbackFollowUpReply(
      {
        action: feedback,
        admin,
        allowedToolNames: getAllowedToolNamesForFeedbackFollowUp(trigger),
        conversationId,
        feedbackReason,
        internalCallRequest,
        isMobile: requestIsMobile,
        opportunity,
        trigger,
        userId: user.id,
      }
    );

    return NextResponse.json({
      assistantMessage,
      ok: true,
      pendingInternalOpportunityCallRequest: internalCallRequest,
      pendingInternalOpportunityCallRequests,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create opportunity feedback follow-up";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
