import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  TALENT_FIRST_VISIT_TEXT,
  TalentConversationRow,
  ensureTalentUserRecord,
  fetchVisibleMessagesPage,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentResumeSignedUrl,
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

      const { error: firstMessageError } = await admin
        .from("talent_messages")
        .insert({
          conversation_id: conversation.id,
          user_id: user.id,
          role: "assistant",
          content: TALENT_FIRST_VISIT_TEXT,
          message_type: "system",
        });

      if (firstMessageError) {
        await admin
          .from("talent_conversations")
          .delete()
          .eq("id", conversation.id)
          .eq("user_id", user.id);

        return NextResponse.json(
          {
            error:
              firstMessageError.message ??
              "Failed to initialize first onboarding message",
          },
          { status: 500 }
        );
      }
    }

    const rawLimit = Number(req.nextUrl.searchParams.get("messageLimit") ?? "20");
    const messageLimit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(Math.floor(rawLimit), 100))
      : 20;
    const rawBeforeMessageId = req.nextUrl.searchParams.get("beforeMessageId");
    const beforeMessageId =
      rawBeforeMessageId && /^\d+$/.test(rawBeforeMessageId)
        ? Number(rawBeforeMessageId)
        : null;

    const { messages, nextBeforeMessageId } = await fetchVisibleMessagesPage({
      admin,
      conversationId: conversation.id,
      limit: messageLimit,
      beforeMessageId,
    });
    const profile = await fetchTalentUserProfile({ admin, userId: user.id });
    const talentProfile = await fetchTalentStructuredProfile({
      admin,
      userId: user.id,
      talentUser: profile,
    });
    const resumeDownloadUrl = await getTalentResumeSignedUrl({
      admin,
      storagePath: profile?.resume_storage_path,
    });

    return NextResponse.json({
      ok: true,
      conversation: {
        id: conversation.id,
        stage: conversation.stage,
        title: conversation.title,
        resumeFileName: profile?.resume_file_name ?? null,
        resumeStoragePath: profile?.resume_storage_path ?? null,
        resumeDownloadUrl,
        resumeLinks: profile?.resume_links ?? [],
        reliefNudgeSent: Boolean(conversation.relief_nudge_sent),
      },
      talentProfile,
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        messageType: message.message_type ?? "chat",
        createdAt: message.created_at,
      })),
      nextBeforeMessageId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load talent session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
