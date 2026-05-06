import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  getTalentSupabaseAdmin,
  toTalentMessageResponse,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import { regenerateOnboardingCompletionWrapupMessage } from "@/lib/talentOnboarding/onboardingCompletionWrapup";

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

  const message = await regenerateOnboardingCompletionWrapupMessage({
    admin,
    conversationId,
    userId: user.id,
  });

  return NextResponse.json({
    message: toTalentMessageResponse(message as TalentMessageRow),
    ok: true,
  });
}
