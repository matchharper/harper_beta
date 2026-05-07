import {
  CAREER_LLM_CONFIG,
  runCareerInsightExtraction,
} from "@/lib/career/llm";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
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

function clamp(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function buildExtractionConversationMessages(args: {
  assistantContent: string;
  recentMessages: Array<{ content: string; role: "user" | "assistant" }>;
}) {
  const { assistantContent, recentMessages } = args;
  const messages =
    recentMessages.length > 0 &&
    recentMessages[recentMessages.length - 1]?.role === "assistant" &&
    recentMessages[recentMessages.length - 1]?.content === assistantContent
      ? recentMessages
      : [
          ...recentMessages,
          { role: "assistant" as const, content: assistantContent },
        ];

  const transcript = messages
    .slice(-5)
    .map((message, index) => {
      const role = message.role === "user" ? "User" : "Harper";
      return `[${index + 1}] ${role}: ${clamp(
        message.content.replace(/\s+/g, " ").trim(),
        1200
      )}`;
    })
    .join("\n");

  return [
    {
      role: "user" as const,
      content: [
        "Extract durable career matching insights from the transcript below.",
        "Use User lines as the source of truth. Harper lines are context only.",
        "If the user gives a clear preference, constraint, priority, or correction, extract it even if Harper's reply is generic.",
        "",
        "## Recent transcript",
        transcript || "(empty)",
      ].join("\n"),
    },
  ];
}

function parseExtractedInsights(args: {
  logPrefix: string;
  rawExtraction: string;
}) {
  const { logPrefix, rawExtraction } = args;
  let parsed: { extracted_insights?: Record<string, unknown> } = {};
  let parseOk = false;
  const cleaned = rawExtraction
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    parsed = JSON.parse(cleaned);
    parseOk =
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      parsed.extracted_insights !== undefined;
  } catch {
    const candidates = extractJsonObjectCandidates(cleaned);
    for (const candidate of candidates) {
      try {
        const candidateParsed = JSON.parse(candidate);
        if (
          candidateParsed &&
          typeof candidateParsed === "object" &&
          !Array.isArray(candidateParsed)
        ) {
          parsed = candidateParsed;
          parseOk = parsed.extracted_insights !== undefined;
          break;
        }
      } catch {
        // Try the next balanced object candidate.
      }
    }
  }

  if (!parseOk) {
    logger.log(`[${logPrefix}] Insight extraction returned no parseable JSON`, {
      preview: cleaned.slice(0, 300),
    });
  }

  return {
    insights: normalizeExtractedInsights(
      (parsed.extracted_insights as Record<string, unknown>) ?? null
    ),
    parseOk,
  };
}

function extractJsonObjectCandidates(value: string) {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(value.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return candidates;
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
        limit: 6,
      })
    )
      .map(
        (item) =>
          ({
            role: item.role as "user" | "assistant",
            content: formatTalentMessageContentForLlmPrompt(item).trim(),
          }) satisfies ExtractionConversationMessage
      )
      .filter((item) => item.content.length > 0);

    const conversationMessages = buildExtractionConversationMessages({
      assistantContent,
      recentMessages: recentExtractionMessages,
    });

    const systemPrompt = args.buildPrompt({
      currentInsightContent: args.currentInsightContent,
    });
    let rawExtraction = await runCareerInsightExtraction({
      systemPrompt,
      conversationMessages,
    });

    let parsedExtraction = parseExtractedInsights({
      logPrefix: args.logPrefix,
      rawExtraction,
    });
    if (
      !parsedExtraction.parseOk &&
      CAREER_LLM_CONFIG.insightExtraction.fallbackModel
    ) {
      logger.log(
        `[${args.logPrefix}] Retrying insight extraction with fallback model`,
        {
          fallbackModel: CAREER_LLM_CONFIG.insightExtraction.fallbackModel,
        }
      );
      rawExtraction = await runCareerInsightExtraction({
        fallbackModel: null,
        model: CAREER_LLM_CONFIG.insightExtraction.fallbackModel,
        systemPrompt,
        conversationMessages,
        usageLabel: "career/chat:insight_extraction:fallback",
      });
      parsedExtraction = parseExtractedInsights({
        logPrefix: args.logPrefix,
        rawExtraction,
      });
    }

    const extractedInsights = parsedExtraction.insights;
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
