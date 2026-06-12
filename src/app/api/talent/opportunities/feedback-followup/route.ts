import { NextRequest, NextResponse } from "next/server";
import { createTalentOpportunityFeedbackFollowUpReply } from "@/lib/career/historyActionReply";
import type { TalentOpportunityFeedbackReplyTrigger } from "@/lib/career/historyActionReply";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { isMobileRequest } from "@/lib/requestDevice";
import {
  fetchTalentOpportunityHistoryByIds,
  type TalentOpportunityFeedback,
  type TalentOpportunityHistoryItem,
} from "@/lib/talentOpportunity";
import {
  fetchInternalOpportunityCallRequestById,
  fetchPendingInternalOpportunityCallRequests,
  isOpenInternalOpportunityCallRequestStatus,
  maybeCreateInternalOpportunityCallRequest,
  type InternalOpportunityCallRequest,
} from "@/lib/talentOnboarding/internalOpportunityCallRequest";

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
  return trigger === "immediate_internal_feedback" ? [] : null;
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

    const assistantMessage = await createTalentOpportunityFeedbackFollowUpReply(
      {
        action: feedback,
        admin,
        allowedToolNames: getAllowedToolNamesForFeedbackFollowUp(trigger),
        conversationId,
        feedbackReason,
        internalCallRequest,
        isMobile: isMobileRequest(req),
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
