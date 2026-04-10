import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  getTalentSupabaseAdmin,
  fetchTalentInsights,
  fetchTalentUserProfile,
  fetchTalentStructuredProfile,
  fetchMessages,
  buildTalentProfileContext,
  upsertTalentInsights,
  normalizeTalentInsightKey,
  getMergedChecklist,
  getEmptyInsightKeys,
} from "@/lib/talentOnboarding/server";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import type { TalentChatMessage } from "@/lib/talentOnboarding/llm";

export const runtime = "nodejs";

function buildRefreshExtractionPrompt(args: {
  emptyKeys: Array<{ key: string; label: string; promptHint: string | null }>;
  profileContext: string;
}): string {
  const keyList = args.emptyKeys
    .map((item) => {
      const hint = item.promptHint ?? `Information about: ${item.label}`;
      return `- "${item.key}" (${item.label}): ${hint}`;
    })
    .join("\n");

  return `You are an expert talent analyst. Extract career insights from the provided data.

## Data Sources
You have access to:
1. The talent's full conversation history (provided as chat messages)
2. Their structured profile and resume

## Target Keys
Extract values ONLY for these keys. Return Korean text for values.
${keyList}

## Rules
- Only include a key if you found clear, specific information
- Use Korean for all values
- If information is ambiguous or not found, omit the key entirely (do NOT guess)
- Be concise but informative (1-3 sentences per key)
- Do NOT include keys that are not in the target list above

## Response Format
Return a valid JSON object with exactly one field:
{
  "extracted_insights": {
    "key_name": "extracted Korean value"
  }
}

If no information is found for any key, return:
{ "extracted_insights": {} }`;
}

function parseRefreshResponse(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw);
    const insights = parsed.extracted_insights;
    if (insights && typeof insights === "object") return insights;
    return {};
  } catch {
    // Regex fallback: extract JSON from LLM prose wrapping
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
  try {
    await requireInternalApiUser(req);

    const body = await req.json();
    const { userId } = body as { userId?: unknown };

    if (typeof userId !== "string" || !userId.trim()) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();

    // Fetch latest conversation
    const { data: conversations } = await admin
      .from("talent_conversations")
      .select("id")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1);

    const conversationId = conversations?.[0]?.id ?? null;
    if (!conversationId) {
      return NextResponse.json({ ok: true, insights: {}, extractedCount: 0 });
    }

    // Fetch insights, profile, and merged checklist in parallel
    const [currentInsights, profile, mergedChecklist] = await Promise.all([
      fetchTalentInsights({ admin, userId }),
      fetchTalentUserProfile({ admin, userId }),
      getMergedChecklist({ admin }),
    ]);

    // Fetch messages and structured profile in parallel
    const [allMessages, structuredProfile] = await Promise.all([
      fetchMessages({ admin, conversationId }),
      fetchTalentStructuredProfile({ admin, userId, talentUser: profile }),
    ]);

    // Cap messages at 200 to bound LLM context
    const messages = allMessages.slice(0, 200);

    const profileContext = buildTalentProfileContext({
      profile,
      structuredProfile,
      maxResumeChars: 6000,
    });

    const currentContent = (currentInsights?.content as Record<string, string> | null) ?? {};

    // Get empty keys from merged checklist
    const emptyKeys = await getEmptyInsightKeys(currentContent, mergedChecklist);
    if (emptyKeys.length === 0) {
      return NextResponse.json({
        ok: true,
        insights: currentContent,
        extractedCount: 0,
      });
    }

    // Build messages for LLM
    const llmMessages: TalentChatMessage[] = [
      {
        role: "system",
        content: buildRefreshExtractionPrompt({ emptyKeys, profileContext }),
      },
      {
        role: "system",
        content: `[Profile & Resume]\n${profileContext}`,
      },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const rawResponse = await runTalentAssistantCompletion({
      messages: llmMessages,
      temperature: 0.2,
      jsonMode: true,
    });

    const extracted = parseRefreshResponse(rawResponse);

    // CRITICAL: Start with a COPY of existing content, only fill empty keys
    const existingContent = { ...currentContent };
    let extractedCount = 0;

    for (const [rawKey, value] of Object.entries(extracted)) {
      const normalizedKey = normalizeTalentInsightKey(rawKey);
      if (!normalizedKey || typeof value !== "string" || !value.trim()) continue;

      const existingValue = existingContent[normalizedKey];
      if (existingValue && existingValue.trim()) continue; // NEVER overwrite non-empty

      existingContent[normalizedKey] = value.trim();
      extractedCount++;
    }

    // Pass the FULL merged object to upsert (it replaces entire content)
    await upsertTalentInsights({ admin, userId, content: existingContent });

    return NextResponse.json({
      ok: true,
      insights: existingContent,
      extractedCount,
    });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to refresh insights");
  }
}
