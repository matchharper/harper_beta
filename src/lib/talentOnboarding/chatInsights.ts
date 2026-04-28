import type { CareerPromptInsightItem } from "@/lib/career/prompts";
import { runCareerInsightExtraction } from "@/lib/career/llm";
import { normalizeExtractedInsights } from "@/lib/talentOnboarding/insights";
import {
  fetchRecentMessages,
  getTalentSupabaseAdmin,
  normalizeTalentInsightKey,
  upsertTalentInsights,
} from "@/lib/talentOnboarding/server";
import { logger } from "@/utils/logger";

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

type ExtractionConversationMessage = {
  content: string;
  role: "user" | "assistant";
};

type BuildPromptArgs = {
  coveredCount: number;
  currentInsightContent: Record<string, string> | null;
  totalCount: number;
  uncoveredItems: CareerPromptInsightItem[];
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
  coveredCount: number;
  currentInsightContent: Record<string, string> | null;
  logPrefix: string;
  totalCount: number;
  uncoveredItems: CareerPromptInsightItem[];
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
        coveredCount: args.coveredCount,
        currentInsightContent: args.currentInsightContent,
        totalCount: args.totalCount,
        uncoveredItems: args.uncoveredItems,
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
      const key = normalizeTalentInsightKey(rawKey);
      if (!key || !extracted.value) continue;

      const existingValue = args.currentInsightContent?.[key]?.trim();
      if (extracted.action === "update") {
        processedInsights[key] = extracted.value;
        continue;
      }

      if (!existingValue) {
        processedInsights[key] = extracted.value;
      }
    }

    if (Object.keys(processedInsights).length === 0) {
      return 0;
    }

    const newKeysCount = Object.keys(processedInsights).filter(
      (key) => !args.currentInsightContent?.[key]?.trim()
    ).length;
    const finalContent: Record<string, string> = {
      ...(args.currentInsightContent ?? {}),
      ...processedInsights,
    };

    await upsertTalentInsights({
      admin: args.admin,
      userId: args.userId,
      content: finalContent,
    });

    return newKeysCount;
  } catch (insightError) {
    logger.log(`[${args.logPrefix}] Failed to extract insights`, {
      userId: args.userId,
      error:
        insightError instanceof Error ? insightError.message : "Unknown error",
    });
    return 0;
  }
}
