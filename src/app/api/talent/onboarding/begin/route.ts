import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  TALENT_PENDING_QUESTION_PREFIX,
  TalentConversationRow,
  TalentMessageRow,
  getTalentSupabaseAdmin,
  stripPendingQuestionPrefix,
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

    const body = (await req.json()) as Body;
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

    const { data: pendingMessage, error: pendingMessageError } = await admin
      .from("talent_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .eq("role", "assistant")
      .eq("message_type", "system")
      .like("content", `${TALENT_PENDING_QUESTION_PREFIX}%`)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (pendingMessageError) {
      return NextResponse.json(
        {
          error:
            pendingMessageError.message ??
            "Failed to read pending onboarding question",
        },
        { status: 500 }
      );
    }

    if (!pendingMessage) {
      return NextResponse.json({
        ok: true,
        conversation: {
          id: (conversation as TalentConversationRow).id,
          stage: (conversation as TalentConversationRow).stage,
        },
        assistantMessage: null,
      });
    }

    const now = new Date().toISOString();
    const pendingRow = pendingMessage as TalentMessageRow;
    const activatedContent = stripPendingQuestionPrefix(pendingRow.content);

    // Delete the old pending message and insert a new row so the new message
    // receives a higher ID than any messages created during the defer flow.
    // Without this, the reused low ID would sort before the PAUSE_CLOSE
    // message and `shouldShowContinueConversationAction` would keep showing
    // the "continue conversation" button.
    const { error: deleteError } = await admin
      .from("talent_messages")
      .delete()
      .eq("id", pendingRow.id)
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id);

    if (deleteError) {
      return NextResponse.json(
        {
          error:
            deleteError.message ?? "Failed to remove pending onboarding question",
        },
        { status: 500 }
      );
    }

    const { data: activatedMessage, error: insertError } = await admin
      .from("talent_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: pendingRow.role,
        content: activatedContent,
        message_type: "chat",
      })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json(
        {
          error:
            insertError.message ?? "Failed to activate onboarding question",
        },
        { status: 500 }
      );
    }

    const { data: updatedConversation, error: conversationUpdateError } = await admin
      .from("talent_conversations")
      .update({
        stage: "chat",
        updated_at: now,
      })
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (conversationUpdateError) {
      return NextResponse.json(
        {
          error:
            conversationUpdateError.message ??
            "Failed to update conversation stage",
        },
        { status: 500 }
      );
    }

    const message = activatedMessage as TalentMessageRow;
    return NextResponse.json({
      ok: true,
      conversation: {
        id: (updatedConversation as TalentConversationRow).id,
        stage: (updatedConversation as TalentConversationRow).stage,
      },
      assistantMessage: {
        id: message.id,
        role: message.role,
        content: message.content,
        messageType: message.message_type ?? "chat",
        createdAt: message.created_at,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to begin talent onboarding";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
