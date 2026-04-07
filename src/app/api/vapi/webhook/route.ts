import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import {
  getTalentSupabaseAdmin,
  fetchTalentInsights,
  upsertTalentInsights,
  normalizeTalentInsightKey,
  getEmptyInsightKeys,
  getMergedChecklist,
  fetchTalentUserProfile,
  fetchTalentStructuredProfile,
  buildTalentProfileContext,
  fetchMessages,
} from "@/lib/talentOnboarding/server";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import type { TalentChatMessage } from "@/lib/talentOnboarding/llm";
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

function buildTranscriptExtractionPrompt(args: {
  emptyKeys: Array<{ key: string; label: string; promptHint: string | null }>;
  existingInsights: Record<string, string>;
}): string {
  const keyList = args.emptyKeys
    .map((item) => {
      const hint = item.promptHint ?? `Information about: ${item.label}`;
      return `- "${item.key}" (${item.label}): ${hint}`;
    })
    .join("\n");

  const existingList = Object.entries(args.existingInsights)
    .map(([key, value]) => `- "${key}": "${value}"`)
    .join("\n");

  return `You are an expert talent analyst. Extract career insights from a voice call transcript.

## Already Known Insights (do NOT re-extract)
${existingList || "(none)"}

## Target Keys (extract ONLY these)
${keyList}

## Rules
- Only include a key if you found clear, specific information in the transcript
- Use Korean for all values
- If information is ambiguous or not found, omit the key entirely
- Be concise but informative (1-3 sentences per key)
- Do NOT include keys not in the target list
- Do NOT re-extract already known insights unless the transcript clearly contradicts them

## Response Format
Return a valid JSON object:
{ "extracted_insights": { "key_name": "extracted Korean value" } }

If nothing found: { "extracted_insights": {} }`;
}

function parseExtractionResponse(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw);
    const insights = parsed.extracted_insights;
    if (insights && typeof insights === "object") return insights;
    return {};
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        const insights = parsed.extracted_insights;
        if (insights && typeof insights === "object") return insights;
      } catch { /* fall through */ }
    }
    return {};
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

    // Extract insights from transcript
    if (!transcript.trim()) {
      return NextResponse.json({ ok: true, extractedCount: 0 });
    }

    const [currentInsights, profile, mergedChecklist] = await Promise.all([
      fetchTalentInsights({ admin, userId }),
      fetchTalentUserProfile({ admin, userId }),
      getMergedChecklist({ admin }),
    ]);

    const currentContent =
      (currentInsights?.content as Record<string, string> | null) ?? {};
    const emptyKeys = await getEmptyInsightKeys(currentContent, mergedChecklist);

    if (emptyKeys.length === 0) {
      logger.log("[VapiWebhook] All insight keys already covered", { userId });
      return NextResponse.json({ ok: true, extractedCount: 0 });
    }

    const structuredProfile = await fetchTalentStructuredProfile({
      admin,
      userId,
      talentUser: profile,
    });
    const profileContext = buildTalentProfileContext({
      profile,
      structuredProfile,
      maxResumeChars: 3000,
    });

    const llmMessages: TalentChatMessage[] = [
      {
        role: "system",
        content: buildTranscriptExtractionPrompt({
          emptyKeys,
          existingInsights: currentContent,
        }),
      },
      {
        role: "system",
        content: `[Profile]\n${profileContext}`,
      },
      {
        role: "user",
        content: `[Voice Call Transcript]\n${transcript}`,
      },
    ];

    const rawResponse = await runTalentAssistantCompletion({
      messages: llmMessages,
      temperature: 0.2,
      jsonMode: true,
    });

    const extracted = parseExtractionResponse(rawResponse);

    // Fetch-then-merge: preserve existing, only fill empty keys
    const mergedContent = { ...currentContent };
    let extractedCount = 0;

    for (const [rawKey, value] of Object.entries(extracted)) {
      const normalizedKey = normalizeTalentInsightKey(rawKey);
      if (!normalizedKey || typeof value !== "string" || !value.trim())
        continue;
      const existingValue = mergedContent[normalizedKey];
      if (existingValue && existingValue.trim()) continue;
      mergedContent[normalizedKey] = value.trim();
      extractedCount++;
    }

    if (extractedCount > 0) {
      await upsertTalentInsights({ admin, userId, content: mergedContent });
      logger.log("[VapiWebhook] Insights extracted from call", {
        userId,
        extractedCount,
      });
    }

    return NextResponse.json({ ok: true, extractedCount });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook processing failed";
    logger.log("[VapiWebhook] Error", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
