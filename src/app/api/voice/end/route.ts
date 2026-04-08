import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { extractAndMergeInsights } from "@/lib/talentOnboarding/insightExtraction";
import { logger } from "@/utils/logger";

export const runtime = "nodejs";

type Body = {
  conversationId: string;
  transcript: string;
  durationSeconds: number;
};

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const { conversationId, transcript, durationSeconds } = body;

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();

    // Save transcript to talent_messages
    // Note: uses "voice_call_transcript" (not "vapi_call_transcript" used by VAPI webhook)
    if (transcript?.trim()) {
      const { error: msgError } = await admin.from("talent_messages").insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "assistant",
        content: `[음성 통화 ${Math.ceil((durationSeconds || 0) / 60)}분]\n\n${transcript}`,
        message_type: "voice_call_transcript",
      });
      if (msgError) {
        logger.log("[VoiceEnd] Failed to save transcript", {
          error: msgError.message,
        });
      }
    }

    // Extract insights from transcript
    const { extractedCount } = await extractAndMergeInsights({
      userId: user.id,
      transcript: transcript || "",
    });

    logger.log("[VoiceEnd] Call ended", {
      userId: user.id,
      conversationId,
      durationSeconds,
      extractedCount,
    });

    return NextResponse.json({ ok: true, extractedCount });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Voice end processing failed";
    logger.log("[VoiceEnd] Error", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
