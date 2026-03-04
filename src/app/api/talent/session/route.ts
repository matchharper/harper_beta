import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  TALENT_FIRST_VISIT_TEXT,
  TalentConversationRow,
  ensureTalentUserRecord,
  fetchMessages,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({ admin, user });

    const { data: existing, error: existingError } = await admin
      .from("talent_conversations")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message ?? "Failed to read talent_conversations" },
        { status: 500 }
      );
    }

    let conversation = (existing ?? null) as TalentConversationRow | null;

    if (!conversation) {
      const now = new Date().toISOString();
      const { data: inserted, error: insertError } = await admin
        .from("talent_conversations")
        .insert({
          user_id: user.id,
          stage: "profile",
          title: "Career Onboarding",
          resume_links: [],
          relief_nudge_sent: false,
          created_at: now,
          updated_at: now,
        })
        .select("*")
        .single();

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message ?? "Failed to create conversation" },
          { status: 500 }
        );
      }
      conversation = inserted as TalentConversationRow;

      await admin.from("talent_messages").insert({
        conversation_id: conversation.id,
        user_id: user.id,
        role: "assistant",
        content: TALENT_FIRST_VISIT_TEXT,
        message_type: "system",
      });
    }

    const messages = await fetchMessages({
      admin,
      conversationId: conversation.id,
    });

    return NextResponse.json({
      ok: true,
      conversation: {
        id: conversation.id,
        stage: conversation.stage,
        title: conversation.title,
        resumeFileName: conversation.resume_file_name,
        resumeLinks: conversation.resume_links ?? [],
        reliefNudgeSent: Boolean(conversation.relief_nudge_sent),
      },
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        messageType: message.message_type ?? "chat",
        createdAt: message.created_at,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load talent session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
