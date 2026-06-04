import { NextRequest, NextResponse } from "next/server";
import { createTalentOpportunityFeedbackFollowUpReply } from "@/lib/career/historyActionReply";
import type { TalentOpportunityFeedbackReplyTrigger } from "@/lib/career/historyActionReply";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { isMobileRequest } from "@/lib/requestDevice";

function normalizeFeedbackFollowUpTrigger(
  value: unknown
): TalentOpportunityFeedbackReplyTrigger {
  return value === "all_recommended_opportunities_cleared"
    ? "all_recommended_opportunities_cleared"
    : "delayed_external_feedback";
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      conversationId?: string | null;
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
    const assistantMessage = await createTalentOpportunityFeedbackFollowUpReply(
      {
        admin,
        conversationId,
        isMobile: isMobileRequest(req),
        trigger: normalizeFeedbackFollowUpTrigger(body.trigger),
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
