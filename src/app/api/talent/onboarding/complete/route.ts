import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { completeTalentOnboardingManually } from "@/lib/talentOnboarding/manualCompletion";
import {
  getTalentSupabaseAdmin,
  toTalentMessageResponse,
  type TalentConversationRow,
} from "@/lib/talentOnboarding/server";
import { isMobileRequest } from "@/lib/requestDevice";

type Body = {
  conversationId?: string;
  regenerateWrapup?: boolean;
};

const DEV_ONBOARDING_COMPLETION_TEST_EMAILS = new Set([
  "hyunbin.bk@gmail.com",
  "khj605123@gmail.com",
]);

const canRunDevOnboardingCompletionTest = (
  email: string | null | undefined
) => {
  if (process.env.NODE_ENV !== "production") return true;
  const normalizedEmail = String(email ?? "")
    .trim()
    .toLowerCase();
  return (
    normalizedEmail.endsWith("@matchharper.com") ||
    DEV_ONBOARDING_COMPLETION_TEST_EMAILS.has(normalizedEmail)
  );
};

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const isMobile = isMobileRequest(req);
    const conversationId = body.conversationId?.trim();
    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }
    const regenerateWrapup = body.regenerateWrapup === true;
    if (
      regenerateWrapup &&
      !canRunDevOnboardingCompletionTest(user.email ?? null)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      isMobile,
      latestUserMessageId:
        typeof latestUserMessage?.id === "number"
          ? latestUserMessage.id
          : null,
      regenerateWrapup,
      source: regenerateWrapup
        ? "career_dev_onboarding_completion_test"
        : "career_chat_manual_completion",
      userId: user.id,
    });
    const assistantMessage = result.wrapupMessage
      ? toTalentMessageResponse(result.wrapupMessage)
      : null;
    const nextStepsMessage = result.nextStepsMessage
      ? toTalentMessageResponse(result.nextStepsMessage)
      : null;
    const assistantMessages = [assistantMessage, nextStepsMessage].filter(
      (message): message is ReturnType<typeof toTalentMessageResponse> =>
        message !== null
    );

    return NextResponse.json({
      ok: true,
      assistantMessage,
      assistantMessages,
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
