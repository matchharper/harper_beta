import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  TALENT_PENDING_QUESTION_PREFIX,
  TalentConversationRow,
  TalentMessageRow,
  ensureTalentUserRecord,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentResumeSignedUrl,
  getTalentSupabaseAdmin,
  toTalentDisplayName,
} from "@/lib/talentOnboarding/server";
import { ingestTalentProfileFromLinkedin } from "@/lib/talentOnboarding/profileIngestion";
import { generateTalentKickoff } from "@/lib/talentOnboarding/kickoff";
import { logger } from "@/utils/logger";

type Body = {
  conversationId?: string;
  resumeFileName?: string;
  resumeStoragePath?: string;
  resumeText?: string;
  links?: string[];
};

type TalentProfileUpdatePayload = {
  resume_links: string[];
  updated_at: string;
  resume_text?: string;
  resume_file_name?: string;
  resume_storage_path?: string;
};

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const conversationId = body.conversationId?.trim();
    const resumeFileName = body.resumeFileName?.trim();
    const resumeStoragePath = body.resumeStoragePath?.trim();
    const resumeText = body.resumeText?.trim() ?? "";
    const links = (body.links ?? [])
      .map((link) => String(link).trim())
      .filter(Boolean);

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({ admin, user });
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

    const now = new Date().toISOString();

    const profileUpdatePayload: TalentProfileUpdatePayload = {
      resume_links: links,
      updated_at: now,
    };

    if (typeof body.resumeText === "string") {
      profileUpdatePayload.resume_text = resumeText.slice(0, 20000);
    }
    if (resumeFileName) {
      profileUpdatePayload.resume_file_name = resumeFileName;
    }
    if (resumeStoragePath) {
      profileUpdatePayload.resume_storage_path = resumeStoragePath;
    }

    const { error: profileUpdateError } = await admin
      .from("talent_users")
      .update(profileUpdatePayload)
      .eq("user_id", user.id);

    if (profileUpdateError) {
      return NextResponse.json(
        { error: profileUpdateError.message ?? "Failed to update talent profile" },
        { status: 500 }
      );
    }

    const displayName = toTalentDisplayName(user);
    const kickoffLlmPromise = generateTalentKickoff({
      displayName,
      links,
      resumeFileName,
      resumeText,
    });

    const profileIngestionPromise = (async () => {
      try {
        const ingestion = await ingestTalentProfileFromLinkedin({
          admin,
          userId: user.id,
          links,
          resumeText,
          resumeFileName,
          resumeStoragePath,
        });
        return {
          ok: true,
          linkedinUrl: ingestion.linkedinUrl,
          stats: ingestion.stats,
        } as {
          ok: boolean;
          linkedinUrl?: string;
          stats?: Record<string, number>;
          error?: string;
        };
      } catch (ingestionError) {
        const ingestionMessage =
          ingestionError instanceof Error
            ? ingestionError.message
            : "Failed to ingest talent profile";
        logger.log("[TalentOnboardingStart] profile ingestion failed", {
          userId: user.id,
          error: ingestionMessage,
        });
        return {
          ok: false,
          error: ingestionMessage,
        };
      }
    })();

    const [llmRaw, profileIngestion] = await Promise.all([
      kickoffLlmPromise,
      profileIngestionPromise,
    ]);

    const kickoff = llmRaw;

    const messagePayloads = [
      {
        conversation_id: conversationId,
        user_id: user.id,
        role: "user",
        content: "이력서와 주요 링크를 제출했습니다.",
        message_type: "profile_submit",
      },
      {
        conversation_id: conversationId,
        user_id: user.id,
        role: "assistant",
        content: `${kickoff.acknowledgement}\n\n<< ${kickoff.insight} >>`,
        message_type: "system",
      },
      {
        conversation_id: conversationId,
        user_id: user.id,
        role: "assistant",
        content: `${TALENT_PENDING_QUESTION_PREFIX}질문 1. ${kickoff.firstQuestion}`,
        message_type: "system",
      },
    ];

    const { data: insertedMessages, error: messageInsertError } = await admin
      .from("talent_messages")
      .insert(messagePayloads)
      .select("*");

    if (messageInsertError) {
      return NextResponse.json(
        {
          error:
            messageInsertError.message ?? "Failed to insert onboarding messages",
        },
        { status: 500 }
      );
    }

    const insertedRows = (insertedMessages ?? []) as TalentMessageRow[];

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
      const insertedIds = insertedRows.map((item) => item.id);
      if (insertedIds.length > 0) {
        await admin.from("talent_messages").delete().in("id", insertedIds);
      }
      return NextResponse.json(
        {
          error:
            conversationUpdateError.message ?? "Failed to update conversation",
        },
        { status: 500 }
      );
    }

    const toResponseMessage = (message: TalentMessageRow) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      messageType: message.message_type ?? "chat",
      createdAt: message.created_at,
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
    const insertedUserMessage = insertedRows.find((item) => item.role === "user");
    if (!insertedUserMessage) {
      return NextResponse.json(
        { error: "Failed to create profile submit message" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      conversation: {
        id: (updatedConversation as TalentConversationRow).id,
        stage: (updatedConversation as TalentConversationRow).stage,
        resumeFileName: profile?.resume_file_name ?? null,
        resumeStoragePath: profile?.resume_storage_path ?? null,
        resumeDownloadUrl,
        resumeLinks: profile?.resume_links ?? [],
      },
      talentProfile,
      userMessage: toResponseMessage(insertedUserMessage),
      assistantMessages: insertedRows
        .filter(
          (item) =>
            item.role === "assistant" &&
            !item.content.startsWith(TALENT_PENDING_QUESTION_PREFIX)
        )
        .map(toResponseMessage),
      profileIngestion,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to start talent onboarding";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
