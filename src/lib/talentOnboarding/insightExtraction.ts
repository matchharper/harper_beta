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
} from "@/lib/talentOnboarding/server";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import type { TalentChatMessage } from "@/lib/talentOnboarding/llm";
import { logger } from "@/utils/logger";

export function buildTranscriptExtractionPrompt(args: {
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

export function parseExtractionResponse(raw: string): Record<string, string> {
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
      } catch {
        /* fall through */
      }
    }
    return {};
  }
}

/**
 * Full insight extraction pipeline: fetch current insights, call LLM, merge results.
 * Shared by both VAPI webhook and vanilla voice end endpoint.
 */
export async function extractAndMergeInsights(args: {
  userId: string;
  transcript: string;
}): Promise<{ extractedCount: number }> {
  const { userId, transcript } = args;

  if (!transcript.trim()) {
    return { extractedCount: 0 };
  }

  const admin = getTalentSupabaseAdmin();

  const [currentInsights, profile, mergedChecklist] = await Promise.all([
    fetchTalentInsights({ admin, userId }),
    fetchTalentUserProfile({ admin, userId }),
    getMergedChecklist({ admin }),
  ]);

  const currentContent =
    (currentInsights?.content as Record<string, string> | null) ?? {};
  const emptyKeys = await getEmptyInsightKeys(currentContent, mergedChecklist);

  if (emptyKeys.length === 0) {
    logger.log("[InsightExtraction] All insight keys already covered", {
      userId,
    });
    return { extractedCount: 0 };
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

  const mergedContent = { ...currentContent };
  let extractedCount = 0;

  for (const [rawKey, value] of Object.entries(extracted)) {
    const normalizedKey = normalizeTalentInsightKey(rawKey);
    if (!normalizedKey || typeof value !== "string" || !value.trim()) continue;
    const existingValue = mergedContent[normalizedKey];
    if (existingValue && existingValue.trim()) continue;
    mergedContent[normalizedKey] = value.trim();
    extractedCount++;
  }

  if (extractedCount > 0) {
    await upsertTalentInsights({ admin, userId, content: mergedContent });
    logger.log("[InsightExtraction] Insights extracted from call", {
      userId,
      extractedCount,
    });
  }

  return { extractedCount };
}
