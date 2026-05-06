import { NextRequest, NextResponse } from "next/server";
import { createTalentOpportunityFeedbackFollowUpReply } from "@/lib/career/historyActionReply";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      conversationId?: string | null;
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
        trigger: "delayed_external_feedback",
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
