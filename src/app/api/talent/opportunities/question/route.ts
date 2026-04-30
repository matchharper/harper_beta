import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  createTalentOpportunityQuestion,
  fetchTalentOpportunityHistoryByIds,
} from "@/lib/talentOpportunity";
import { createTalentOpportunityActionReply } from "@/lib/career/historyActionReply";

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      conversationId?: string | null;
      opportunityId?: string;
      question?: string;
    };

    const opportunityId = String(body.opportunityId ?? "").trim();
    if (!opportunityId) {
      return NextResponse.json(
        { error: "opportunityId is required" },
        { status: 400 }
      );
    }

    const question = String(body.question ?? "").trim();
    if (!question) {
      return NextResponse.json(
        { error: "question is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const result = await createTalentOpportunityQuestion({
      admin,
      opportunityId,
      question,
      userId: user.id,
    });

    let assistantMessage: Awaited<
      ReturnType<typeof createTalentOpportunityActionReply>
    > | null = null;
    const conversationId = String(body.conversationId ?? "").trim() || null;
    if (conversationId) {
      try {
        const [opportunity] = await fetchTalentOpportunityHistoryByIds({
          admin,
          ids: [opportunityId],
          userId: user.id,
        });
        assistantMessage = await createTalentOpportunityActionReply({
          action: "question",
          admin,
          conversationId,
          opportunity: opportunity ?? null,
          userId: user.id,
          userQuestion: question,
        });
      } catch (replyError) {
        console.error("[career-history:question-reply]", {
          error:
            replyError instanceof Error
              ? replyError.message
              : String(replyError),
          opportunityId,
          userId: user.id,
        });
      }
    }

    return NextResponse.json({ ...result, assistantMessage });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send question";
    const status = message === "Opportunity not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
