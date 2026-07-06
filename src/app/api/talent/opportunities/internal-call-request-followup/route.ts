import { NextRequest, NextResponse } from "next/server";
import { createInternalOpportunityCallRequestFollowUp } from "@/lib/career/internalOpportunityCallRequestFollowUp";
import { isMobileRequest } from "@/lib/requestDevice";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import type { TalentOpportunityFeedback } from "@/lib/talentOpportunity";

function normalizeFeedback(value: unknown): TalentOpportunityFeedback | null {
  return value === "positive" || value === "negative" ? value : null;
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
      opportunityId?: string | null;
    };
    const conversationId = String(body.conversationId ?? "").trim();
    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    const result = await createInternalOpportunityCallRequestFollowUp({
      admin: getTalentSupabaseAdmin(),
      conversationId,
      feedback: normalizeFeedback(body.feedback),
      isMobile: isMobileRequest(req),
      opportunityId: body.opportunityId ?? null,
      userId: user.id,
    });

    return NextResponse.json({
      ...result,
      ok: true,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create internal call request follow-up";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
