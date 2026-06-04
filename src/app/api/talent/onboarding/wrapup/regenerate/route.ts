import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  getTalentSupabaseAdmin,
  toTalentMessageResponse,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import { regenerateOnboardingCompletionMessages } from "@/lib/talentOnboarding/onboardingCompletionWrapup";
import { isMobileRequest } from "@/lib/requestDevice";

function isRegenerateEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_ONBOARDING_WRAPUP_REGENERATE === "1" ||
    process.env.NEXT_PUBLIC_ENABLE_ONBOARDING_WRAPUP_REGENERATE === "1"
  );
}

export async function POST(request: NextRequest) {
  if (!isRegenerateEnabled()) {
    return NextResponse.json({ error: "Disabled" }, { status: 403 });
  }

  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    conversationId?: string;
  };
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
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (conversationError) {
    throw new Error(
      conversationError.message ?? "Failed to read talent_conversations"
    );
  }
  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  const { nextStepsMessage, wrapupMessage } =
    await regenerateOnboardingCompletionMessages({
      admin,
      conversationId,
      isMobile: isMobileRequest(request),
      userId: user.id,
    });
  const message = wrapupMessage
    ? toTalentMessageResponse(wrapupMessage as TalentMessageRow)
    : null;
  const nextMessage = nextStepsMessage
    ? toTalentMessageResponse(nextStepsMessage as TalentMessageRow)
    : null;
  const messages = [message, nextMessage].filter(
    (item): item is ReturnType<typeof toTalentMessageResponse> => item !== null
  );

  return NextResponse.json({
    message,
    messages,
    ok: true,
  });
}
