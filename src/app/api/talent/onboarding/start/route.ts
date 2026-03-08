import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import {
  TALENT_PENDING_QUESTION_PREFIX,
  TalentConversationRow,
  TalentMessageRow,
  fetchTalentUserProfile,
  getTalentResumeSignedUrl,
  getTalentSupabaseAdmin,
  toTalentDisplayName,
} from "@/lib/talentOnboarding/server";

type Body = {
  conversationId?: string;
  resumeFileName?: string;
  resumeStoragePath?: string;
  resumeText?: string;
  links?: string[];
};

type LlmKickoff = {
  acknowledgement: string;
  insight: string;
  firstQuestion: string;
};

function parseKickoffPayload(raw: string): LlmKickoff | null {
  const normalized = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(normalized) as Partial<LlmKickoff>;
    if (!parsed || typeof parsed !== "object") return null;

    const acknowledgement =
      typeof parsed.acknowledgement === "string"
        ? parsed.acknowledgement.trim()
        : "";
    const insight =
      typeof parsed.insight === "string" ? parsed.insight.trim() : "";
    const firstQuestion =
      typeof parsed.firstQuestion === "string"
        ? parsed.firstQuestion.trim()
        : "";

    if (!acknowledgement || !insight || !firstQuestion) return null;
    return { acknowledgement, insight, firstQuestion };
  } catch {
    return null;
  }
}

const FALLBACK_KICKOFF: LlmKickoff = {
  acknowledgement: "정보를 알려주셔서 감사합니다.",
  insight:
    "제출해주신 이력서/링크 기반으로 볼 때 강점이 분명해서 하퍼가 찾을 수 있는 기회 폭이 넓습니다.",
  firstQuestion: "가장 선호하는 역할과 포지션 레벨은 무엇인가요?",
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
    if (!resumeFileName) {
      return NextResponse.json(
        { error: "resumeFileName is required" },
        { status: 400 }
      );
    }
    if (!resumeStoragePath) {
      return NextResponse.json(
        { error: "resumeStoragePath is required" },
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

    const now = new Date().toISOString();

    const { error: profileUpdateError } = await admin
      .from("talent_users")
      .update({
        resume_file_name: resumeFileName,
        resume_storage_path: resumeStoragePath,
        resume_text: resumeText.slice(0, 20000),
        resume_links: links,
        updated_at: now,
      })
      .eq("user_id", user.id);

    if (profileUpdateError) {
      return NextResponse.json(
        { error: profileUpdateError.message ?? "Failed to update talent profile" },
        { status: 500 }
      );
    }

    const displayName = toTalentDisplayName(user);
    const llmRaw = await runTalentAssistantCompletion({
      messages: [
        {
          role: "system",
          content: [
            "You are Harper, an AI talent agent onboarding assistant.",
            "Always write in Korean.",
            "Return JSON only.",
            "JSON format:",
            "{",
            '  "acknowledgement": "...",',
            '  "insight": "...",',
            '  "firstQuestion": "..."',
            "}",
            "Rules:",
            '- acknowledgement should greet user naturally (e.g. "안녕하세요 OO님.") and thank for sharing.',
            '- insight should mention one impressive point using << >> wrapping style.',
            "- firstQuestion should be one concrete recruiting question.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `이름: ${displayName}`,
            `이력서 파일명: ${resumeFileName}`,
            `링크: ${links.join(", ") || "(없음)"}`,
            `이력서 텍스트(일부): ${resumeText.slice(0, 8000) || "(없음)"}`,
          ].join("\n"),
        },
      ],
      temperature: 0.25,
    });

    const kickoff = parseKickoffPayload(llmRaw) ?? FALLBACK_KICKOFF;

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
      userMessage: toResponseMessage(insertedUserMessage),
      assistantMessages: insertedRows
        .filter(
          (item) =>
            item.role === "assistant" &&
            !item.content.startsWith(TALENT_PENDING_QUESTION_PREFIX)
        )
        .map(toResponseMessage),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to start talent onboarding";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
