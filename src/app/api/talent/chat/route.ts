import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import {
  countUserChatTurns,
  fetchRecentMessages,
  TalentConversationRow,
  TalentMessageRow,
  TalentUserProfileRow,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";

type Body = {
  conversationId?: string;
  message?: string;
  link?: string;
};

function buildSystemPrompt(args: {
  profile: TalentUserProfileRow | null;
  shouldSendReliefNudge: boolean;
  userTurnCount: number;
}) {
  const { profile, shouldSendReliefNudge, userTurnCount } = args;
  const linkText = (profile?.resume_links ?? []).join(", ");

  return [
    "You are Harper, a Korean AI talent agent for candidate onboarding.",
    "Always answer in Korean.",
    "Be concise, clear, and warm.",
    "Given the conversation, do all of the following:",
    "1) brief acknowledgement",
    "2) short guidance or summary",
    "3) one next question (if needed).",
    "Avoid markdown tables and long bullet dumps.",
    "",
    `Current user turn count: ${userTurnCount}`,
    `Resume file: ${profile?.resume_file_name ?? "(none)"}`,
    `Resume links: ${linkText || "(none)"}`,
    `Resume text snippet: ${(profile?.resume_text ?? "").slice(0, 3000)}`,
    "",
    shouldSendReliefNudge
      ? [
          "IMPORTANT: Include this exact nudge once in your response:",
          "지금은 여기까지 해도 됩니다.",
          "지금 정보만으로도 매칭을 시작할 수 있습니다.",
          "After that, optionally ask one lightweight follow-up question.",
        ].join("\n")
      : "Keep the flow moving with one high-signal follow-up question when useful.",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const conversationId = body.conversationId?.trim();
    const message = body.message?.trim();
    const link = body.link?.trim();

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
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
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const profile = await fetchTalentUserProfile({ admin, userId: user.id });

    const normalizedContent = link ? `${message}\n\n참고 링크: ${link}` : message;

    const { data: insertedUserMessage, error: userMessageError } = await admin
      .from("talent_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "user",
        content: normalizedContent,
        message_type: "chat",
      })
      .select("*")
      .single();

    if (userMessageError) {
      return NextResponse.json(
        { error: userMessageError.message ?? "Failed to insert user message" },
        { status: 500 }
      );
    }

    const userTurnCount = await countUserChatTurns({ admin, conversationId });
    const recentMessages = await fetchRecentMessages({
      admin,
      conversationId,
      limit: 24,
    });

    const shouldSendReliefNudge =
      userTurnCount >= 5 && !Boolean((conversation as TalentConversationRow).relief_nudge_sent);

    const llmMessages = recentMessages
      .map((item) => ({
        role: item.role as "user" | "assistant",
        content: item.content,
      }))
      .filter((item) => item.content.trim().length > 0);

    const assistantText = await runTalentAssistantCompletion({
      messages: [
        {
          role: "system",
          content: buildSystemPrompt({
            profile,
            shouldSendReliefNudge,
            userTurnCount,
          }),
        },
        ...llmMessages,
      ],
      temperature: 0.45,
    });

    const safeAssistantText =
      assistantText.trim() ||
      "좋은 정보 감사합니다. 이어서 가장 우선순위인 조건을 하나만 더 알려주세요.";

    const { data: insertedAssistantMessage, error: assistantError } = await admin
      .from("talent_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "assistant",
        content: safeAssistantText,
        message_type: "chat",
      })
      .select("*")
      .single();

    if (assistantError) {
      return NextResponse.json(
        { error: assistantError.message ?? "Failed to insert assistant message" },
        { status: 500 }
      );
    }

    const now = new Date().toISOString();
    const { error: conversationUpdateError } = await admin
      .from("talent_conversations")
      .update({
        stage: "chat",
        relief_nudge_sent: shouldSendReliefNudge
          ? true
          : Boolean((conversation as TalentConversationRow).relief_nudge_sent),
        updated_at: now,
      })
      .eq("id", conversationId)
      .eq("user_id", user.id);

    if (conversationUpdateError) {
      return NextResponse.json(
        {
          error:
            conversationUpdateError.message ??
            "Failed to update conversation progress",
        },
        { status: 500 }
      );
    }

    const toResponseMessage = (item: TalentMessageRow) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      messageType: item.message_type ?? "chat",
      createdAt: item.created_at,
    });

    return NextResponse.json({
      ok: true,
      userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
      assistantMessage: toResponseMessage(insertedAssistantMessage as TalentMessageRow),
      progress: {
        answeredCount: Math.min(userTurnCount, 5),
        targetCount: 5,
        completed: userTurnCount >= 5,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process talent chat";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
