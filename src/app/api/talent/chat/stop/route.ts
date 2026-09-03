import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/supabaseServer";
import { careerT } from "@/lib/career/translatedCareerMessage";
import {
  getTalentSupabaseAdmin,
  toTalentMessageResponse,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import { upsertRecommendJobPostingStatusLog } from "@/lib/talentOnboarding/recommendJobPostingStatus";

type Body = {
  conversationId?: unknown;
  locale?: unknown;
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

    const thinkingLogs = upsertRecommendJobPostingStatusLog(
      sourceMessage.thinking_logs,
      { state: "stopped" }
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

    const stoppedAssistantContent = careerT(
      String(body.locale ?? ""),
      "career.common.career.1clmbsb",
      "요청한 검색을 중지했습니다."
    );
    const { data: existingStoppedAssistant, error: existingAssistantError } =
      await admin
        .from("talent_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id)
        .eq("role", "assistant")
        .eq("content", stoppedAssistantContent)
        .gt("id", userMessageId)
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (existingAssistantError) {
      throw new Error(
        existingAssistantError.message ?? "Failed to load stopped chat reply"
      );
    }

    let stoppedAssistant = existingStoppedAssistant;
    if (!stoppedAssistant) {
      const { data: insertedStoppedAssistant, error: assistantError } =
        await admin
          .from("talent_messages")
          .insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: "assistant",
            content: stoppedAssistantContent,
            message_type: "chat",
            thinking_logs: [],
          })
          .select("*")
          .single();

      if (assistantError || !insertedStoppedAssistant) {
        throw new Error(
          assistantError?.message ?? "Failed to save stopped chat reply"
        );
      }
      stoppedAssistant = insertedStoppedAssistant;
    }

    return NextResponse.json({
      ok: true,
      userMessage: toTalentMessageResponse(
        stoppedMessage as unknown as TalentMessageRow
      ),
      assistantMessage: toTalentMessageResponse(
        stoppedAssistant as unknown as TalentMessageRow
      ),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to stop chat turn";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
