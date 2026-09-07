import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/supabaseServer";
import {
  getTalentSupabaseAdmin,
  toTalentMessageResponse,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import { upsertRecommendJobPostingStatusLog } from "@/lib/talentOnboarding/recommendJobPostingStatus";
import { isMobileRequest, withIsMobile } from "@/lib/requestDevice";
import { stripPostgresUnsafeChars } from "@/lib/textSanitization";

type Body = {
  assistantMessage?: {
    content?: unknown;
    recommendationStatusAfterCharCount?: unknown;
    thinkingLogs?: unknown;
  };
  conversationId?: unknown;
  userMessageId?: unknown;
};

const parseMessageId = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const conversationId = String(body.conversationId ?? "").trim();
    const userMessageId = parseMessageId(body.userMessageId);
    const assistantContent =
      typeof body.assistantMessage?.content === "string"
        ? stripPostgresUnsafeChars(body.assistantMessage.content).trim()
        : "";
    const recommendationStatusAfterCharCount =
      typeof body.assistantMessage?.recommendationStatusAfterCharCount ===
        "number" &&
      Number.isFinite(
        body.assistantMessage.recommendationStatusAfterCharCount
      ) &&
      body.assistantMessage.recommendationStatusAfterCharCount > 0 &&
      body.assistantMessage.recommendationStatusAfterCharCount <=
        assistantContent.length
        ? Math.floor(body.assistantMessage.recommendationStatusAfterCharCount)
        : null;
    if (!conversationId || !userMessageId) {
      return NextResponse.json(
        { error: "conversationId and userMessageId are required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const { data: sourceMessage, error: sourceError } = await admin
      .from("talent_messages")
      .select("*")
      .eq("id", userMessageId)
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .eq("role", "user")
      .maybeSingle();

    if (sourceError) {
      throw new Error(sourceError.message ?? "Failed to load chat turn");
    }
    if (!sourceMessage) {
      return NextResponse.json(
        { error: "Chat turn not found" },
        { status: 404 }
      );
    }

    const stoppedStatus = { state: "stopped" } as const;
    const thinkingLogs = upsertRecommendJobPostingStatusLog(
      sourceMessage.thinking_logs,
      stoppedStatus
    );
    const { data: stoppedMessage, error: stopError } = await admin
      .from("talent_messages")
      .update({ thinking_logs: thinkingLogs })
      .eq("id", userMessageId)
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .eq("role", "user")
      .select("*")
      .single();

    if (stopError || !stoppedMessage) {
      throw new Error(stopError?.message ?? "Failed to stop chat turn");
    }

    let stoppedAssistant: TalentMessageRow | null = null;
    if (assistantContent) {
      const assistantThinkingLogs = upsertRecommendJobPostingStatusLog(
        body.assistantMessage?.thinkingLogs,
        stoppedStatus
      );
      const { data: existingStoppedAssistant, error: existingAssistantError } =
        await admin
          .from("talent_messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .eq("user_id", user.id)
          .eq("role", "assistant")
          .eq("content", assistantContent)
          .gt("id", userMessageId)
          .order("id", { ascending: true })
          .limit(1)
          .maybeSingle();

      if (existingAssistantError) {
        throw new Error(
          existingAssistantError.message ??
            "Failed to load stopped assistant message"
        );
      }

      if (existingStoppedAssistant) {
        const { data: updatedStoppedAssistant, error: assistantError } =
          await admin
            .from("talent_messages")
            .update({ thinking_logs: assistantThinkingLogs })
            .eq("id", existingStoppedAssistant.id)
            .eq("conversation_id", conversationId)
            .eq("user_id", user.id)
            .eq("role", "assistant")
            .select("*")
            .single();

        if (assistantError || !updatedStoppedAssistant) {
          throw new Error(
            assistantError?.message ??
              "Failed to update stopped assistant message"
          );
        }
        stoppedAssistant = updatedStoppedAssistant as TalentMessageRow;
      } else {
        const { data: insertedStoppedAssistant, error: assistantError } =
          await admin
            .from("talent_messages")
            .insert(
              withIsMobile(
                {
                  conversation_id: conversationId,
                  user_id: user.id,
                  role: "assistant",
                  content: assistantContent,
                  message_type: "chat",
                  thinking_logs: assistantThinkingLogs,
                },
                isMobileRequest(req)
              )
            )
            .select("*")
            .single();

        if (assistantError || !insertedStoppedAssistant) {
          throw new Error(
            assistantError?.message ??
              "Failed to save stopped assistant message"
          );
        }
        stoppedAssistant = insertedStoppedAssistant as TalentMessageRow;
      }
    }

    const stoppedAssistantResponse = stoppedAssistant
      ? {
          ...toTalentMessageResponse(stoppedAssistant),
          ...(recommendationStatusAfterCharCount === null
            ? {}
            : { recommendationStatusAfterCharCount }),
        }
      : null;

    return NextResponse.json({
      ok: true,
      userMessage: toTalentMessageResponse(
        stoppedMessage as unknown as TalentMessageRow
      ),
      assistantMessage: stoppedAssistantResponse,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to stop chat turn";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
