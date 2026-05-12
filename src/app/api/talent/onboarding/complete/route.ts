import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { completeTalentOnboardingManually } from "@/lib/talentOnboarding/manualCompletion";
import {
  getTalentSupabaseAdmin,
  toTalentMessageResponse,
  type TalentConversationRow,
} from "@/lib/talentOnboarding/server";

type Body = {
  conversationId?: string;
};

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const conversationId = body.conversationId?.trim();
    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const { data: conversation, error: conversationError } = await admin
      .from("talent_conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (conversationError) {
      return NextResponse.json(
        { error: conversationError.message ?? "Failed to read conversation" },
        { status: 500 }
      );
    }
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }
    if ((conversation as TalentConversationRow).stage === "profile") {
      return NextResponse.json(
        { error: "Profile submission is required before completion" },
        { status: 400 }
      );
    }

    const { data: latestUserMessage, error: latestUserMessageError } =
      await admin
        .from("talent_messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id)
        .eq("role", "user")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (latestUserMessageError) {
      return NextResponse.json(
        {
          error:
            latestUserMessageError.message ??
            "Failed to read latest user message",
        },
        { status: 500 }
      );
    }

    const result = await completeTalentOnboardingManually({
      admin,
      conversationId,
      latestUserMessageId:
        typeof latestUserMessage?.id === "number"
          ? latestUserMessage.id
          : null,
      source: "career_chat_manual_completion",
      userId: user.id,
    });
    const assistantMessage = result.wrapupMessage
      ? toTalentMessageResponse(result.wrapupMessage)
      : null;

    return NextResponse.json({
      ok: true,
      assistantMessage,
      assistantMessages: assistantMessage ? [assistantMessage] : [],
      conversation: {
        id: conversationId,
        stage: "completed",
      },
      insightUpdatedAt: result.insightUpdatedAt,
      opportunityDiscoveryQueued: result.opportunityDiscoveryQueued,
      opportunityRun: result.opportunityRun,
      progress: {
        completed: true,
      },
      talentInsights: result.talentInsights,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to complete onboarding";
    console.error("[onboarding-complete] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
