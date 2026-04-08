import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import {
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import { extractAndMergeInsights } from "@/lib/talentOnboarding/insightExtraction";
import { logger } from "@/utils/logger";

export const runtime = "nodejs";

function validateVapiWebhook(req: NextRequest): boolean {
  const secret = process.env.VAPI_SERVER_SECRET;
  if (!secret) {
    logger.log("[VapiWebhook] VAPI_SERVER_SECRET not configured");
    return false;
  }
  const headerSecret = req.headers.get("x-vapi-secret") ?? "";
  if (!headerSecret || headerSecret.length !== secret.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(headerSecret),
      Buffer.from(secret)
    );
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!validateVapiWebhook(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const messageType = body?.message?.type;

    if (messageType !== "end-of-call-report") {
      return NextResponse.json({ ok: true });
    }

    const call = body.message.call ?? {};
    const metadata = call.assistantOverrides?.metadata ?? call.metadata ?? {};
    const userId = metadata.userId as string | undefined;
    const conversationId = metadata.conversationId as string | undefined;
    const transcript = body.message.transcript ?? "";
    const durationSeconds = Math.round(
      ((call.endedAt ? new Date(call.endedAt).getTime() : Date.now()) -
        (call.startedAt ? new Date(call.startedAt).getTime() : Date.now())) /
        1000
    );

    if (!userId) {
      logger.log("[VapiWebhook] Missing userId in call metadata");
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const admin = getTalentSupabaseAdmin();

    // Save transcript to talent_messages
    if (conversationId && transcript) {
      const { error: msgError } = await admin.from("talent_messages").insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "assistant",
        content: `[음성 통화 ${Math.ceil(durationSeconds / 60)}분]\n\n${transcript}`,
        message_type: "vapi_call_transcript",
      });
      if (msgError) {
        logger.log("[VapiWebhook] Failed to save transcript", {
          error: msgError.message,
        });
      }
    }

    // Extract insights from transcript using shared module
    const { extractedCount } = await extractAndMergeInsights({
      userId,
      transcript,
    });

    return NextResponse.json({ ok: true, extractedCount });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook processing failed";
    logger.log("[VapiWebhook] Error", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
