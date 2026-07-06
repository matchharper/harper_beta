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
import { TALENT_TOOL_NAMES } from "@/lib/talentOnboarding/tools";
import {
  CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER,
  isCareerOpportunityFeedbackFollowUpTrigger,
} from "@/lib/career/prompts/types";

const FEEDBACK_FOLLOW_UP_TRIGGER =
  CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER;

function normalizeFeedbackFollowUpTrigger(
  value: unknown
): TalentOpportunityFeedbackReplyTrigger {
  if (isCareerOpportunityFeedbackFollowUpTrigger(value)) {
    return value;
  }
  return FEEDBACK_FOLLOW_UP_TRIGGER.DelayedExternalFeedback;
}

function normalizeFeedback(value: unknown): TalentOpportunityFeedback | null {
  return value === "positive" || value === "negative" ? value : null;
}

function getAllowedToolNamesForFeedbackFollowUp(
  trigger: TalentOpportunityFeedbackReplyTrigger
): readonly string[] | null {
  return trigger === FEEDBACK_FOLLOW_UP_TRIGGER.ImmediateInternalFeedback
    ? []
    : [TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS];
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
      opportunityId?: string | null;
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
    const requestIsMobile = isMobileRequest(req);
    const opportunityId = String(body.opportunityId ?? "").trim();
    let opportunity: TalentOpportunityHistoryItem | null = null;

    if (opportunityId && feedback) {
      const [matchedOpportunity] = await fetchTalentOpportunityHistoryByIds({
        admin,
        ids: [opportunityId],
        userId: user.id,
      });
      opportunity = matchedOpportunity ?? null;
    }

    const assistantMessage = await createTalentOpportunityFeedbackFollowUpReply(
      {
        action: feedback,
        admin,
        allowedToolNames: getAllowedToolNamesForFeedbackFollowUp(trigger),
        conversationId,
        feedbackReason,
        isMobile: requestIsMobile,
        opportunity,
        trigger,
        userId: user.id,
      }
    );

    return NextResponse.json({
      assistantMessage,
      ok: true,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create opportunity feedback follow-up";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
