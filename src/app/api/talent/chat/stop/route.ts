import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/supabaseServer";
import {
  getTalentSupabaseAdmin,
  toTalentMessageResponse,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import { upsertRecommendJobPostingStatusLog } from "@/lib/talentOnboarding/recommendJobPostingStatus";

type Body = {
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

    return NextResponse.json({
      ok: true,
      userMessage: toTalentMessageResponse(
        stoppedMessage as unknown as TalentMessageRow
      ),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to stop chat turn";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
