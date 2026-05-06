import { runCareerInsightExtraction } from "@/lib/career/llm";
import {
  normalizeExtractedInsights,
  normalizeGeneratedTalentInsightEntry,
} from "@/lib/talentOnboarding/insights";
import {
  fetchRecentMessages,
  getTalentSupabaseAdmin,
  upsertTalentInsights,
} from "@/lib/talentOnboarding/server";
import { logger } from "@/utils/logger";

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

type ExtractionConversationMessage = {
  content: string;
  role: "user" | "assistant";
};

type BuildPromptArgs = {
  currentInsightContent: Record<string, string> | null;
};

function buildExtractionConversationMessages(args: {
  assistantContent: string;
  recentMessages: Array<{ content: string; role: "user" | "assistant" }>;
}) {
  const { assistantContent, recentMessages } = args;
  if (
    recentMessages.length > 0 &&
    recentMessages[recentMessages.length - 1]?.role === "assistant" &&
    recentMessages[recentMessages.length - 1]?.content === assistantContent
  ) {
    return recentMessages;
  }

  return [
    ...recentMessages,
    { role: "assistant" as const, content: assistantContent },
  ].slice(-3);
}

function parseExtractedInsights(args: {
  logPrefix: string;
  rawExtraction: string;
}) {
  const { logPrefix, rawExtraction } = args;
  let parsed: { extracted_insights?: Record<string, unknown> } = {};

  try {
    parsed = JSON.parse(rawExtraction);
  } catch {
    const match = rawExtraction.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        logger.log(`[${logPrefix}] JSON regex fallback parse failed`);
      }
    }
  }

  return normalizeExtractedInsights(
    (parsed.extracted_insights as Record<string, unknown>) ?? null
  );
}

export async function extractAndPersistChatInsights(args: {
  admin: AdminClient;
  assistantContent: string;
  buildPrompt: (args: BuildPromptArgs) => string;
  conversationId: string;
  currentInsightContent: Record<string, string> | null;
  logPrefix: string;
  userId: string;
}) {
  const assistantContent = args.assistantContent.trim();
  if (!assistantContent) return 0;

  try {
    const recentExtractionMessages = (
      await fetchRecentMessages({
        admin: args.admin,
        conversationId: args.conversationId,
        limit: 3,
      })
    )
      .map(
        (item) =>
          ({
            role: item.role as "user" | "assistant",
            content: item.content.trim(),
          }) satisfies ExtractionConversationMessage
      )
      .filter((item) => item.content.length > 0);

    const conversationMessages = buildExtractionConversationMessages({
      assistantContent,
      recentMessages: recentExtractionMessages,
    });

    const rawExtraction = await runCareerInsightExtraction({
      systemPrompt: args.buildPrompt({
        currentInsightContent: args.currentInsightContent,
      }),
      conversationMessages,
    });

    const extractedInsights = parseExtractedInsights({
      logPrefix: args.logPrefix,
      rawExtraction,
    });
    if (!extractedInsights) {
      return 0;
    }

    const processedInsights: Record<string, string> = {};

    for (const [rawKey, extracted] of Object.entries(extractedInsights)) {
      const normalized = normalizeGeneratedTalentInsightEntry({
        rawKey,
        rawValue: extracted.value,
        rejectProfileRowFactKeys: true,
      });
      if (!normalized.ok) {
        logger.log(`[${args.logPrefix}] Skipped invalid talent insight`, {
          key: normalized.key ?? rawKey,
          reason: normalized.reason,
        });
        continue;
      }

      const { key, value } = normalized;
      const existingValue = args.currentInsightContent?.[key]?.trim();
      if (extracted.action === "update") {
        if (existingValue === value) continue;
        processedInsights[key] = value;
        continue;
      }

      if (!existingValue) {
        processedInsights[key] = value;
      }
    }

    if (Object.keys(processedInsights).length === 0) {
      return 0;
    }

    const changedKeysCount = Object.keys(processedInsights).length;
    const finalContent: Record<string, string> = {
      ...(args.currentInsightContent ?? {}),
      ...processedInsights,
    };

    await upsertTalentInsights({
      admin: args.admin,
      userId: args.userId,
      content: finalContent,
    });

    return changedKeysCount;
  } catch (insightError) {
    logger.log(`[${args.logPrefix}] Failed to extract insights`, {
      userId: args.userId,
      error:
        insightError instanceof Error ? insightError.message : "Unknown error",
    });
    return 0;
  }
}
