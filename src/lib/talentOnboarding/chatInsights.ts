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
  getCareerOnboardingChecklistCoverage,
  getTalentSupabaseAdmin,
  mergeCareerOnboardingChecklistCoverage,
  upsertTalentInsights,
} from "@/lib/talentOnboarding/server";
import {
  ONBOARDING_QUESTION_BY_INSIGHT_KEY,
  ONBOARDING_QUESTION_CHECKLIST_KEY_SET,
} from "@/lib/talentOnboarding/insightChecklist";
import { logger } from "@/utils/logger";

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

type ExtractionConversationMessage = {
  content: string;
  id?: number | string;
  messageType?: string | null;
  role: "user" | "assistant";
};

type BuildPromptArgs = {
  currentChecklistCoverage: Record<string, "covered"> | null;
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
  let parsed: {
    covered_checklist?: unknown;
    covered_onboarding_checklist?: unknown;
    covered_onboarding_questions?: unknown;
    extracted_insights?: Record<string, unknown>;
  } = {};
  let parseOk = false;
  const cleaned = rawExtraction
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const hasSupportedExtractionFields = (value: unknown) =>
    Boolean(
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      ("extracted_insights" in value ||
        "covered_onboarding_checklist" in value ||
        "covered_checklist" in value ||
        "covered_onboarding_questions" in value)
    );

  try {
    parsed = JSON.parse(cleaned);
    parseOk = hasSupportedExtractionFields(parsed);
  } catch {
    const candidates = extractJsonObjectCandidates(cleaned);
    for (const candidate of candidates) {
      try {
        const candidateParsed = JSON.parse(candidate);
        if (hasSupportedExtractionFields(candidateParsed)) {
          parsed = candidateParsed;
          parseOk = true;
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
    coveredChecklistKeys: normalizeExtractedChecklistKeys(
      parsed.covered_onboarding_checklist ??
        parsed.covered_checklist ??
        parsed.covered_onboarding_questions
    ),
    insights: normalizeExtractedInsights(
      (parsed.extracted_insights as Record<string, unknown>) ?? null
    ),
    parseOk,
  };
}

function normalizeExtractedChecklistKeys(value: unknown): string[] {
  const keys: string[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== "string") continue;
      const key = item.trim();
      if (ONBOARDING_QUESTION_CHECKLIST_KEY_SET.has(key)) {
        keys.push(key);
      }
    }
    return Array.from(new Set(keys));
  }

  if (value && typeof value === "object") {
    for (const [rawKey, rawStatus] of Object.entries(value)) {
      const key = rawKey.trim();
      if (!ONBOARDING_QUESTION_CHECKLIST_KEY_SET.has(key)) continue;
      if (
        rawStatus === "covered" ||
        rawStatus === true ||
        (rawStatus &&
          typeof rawStatus === "object" &&
          (rawStatus as { status?: unknown }).status === "covered")
      ) {
        keys.push(key);
      }
    }
  }

  return Array.from(new Set(keys));
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

function formatRecentMessagesForLog(messages: ExtractionConversationMessage[]) {
  return messages.slice(-2).map((message) => ({
    content: clamp(message.content.replace(/\s+/g, " ").trim(), 800),
    id: message.id ?? null,
    messageType: message.messageType ?? null,
    role: message.role,
  }));
}

export async function extractAndPersistChatInsights(args: {
  admin: AdminClient;
  assistantContent: string;
  buildPrompt: (args: BuildPromptArgs) => string;
  conversationId: string;
  currentInsightContent: Record<string, string> | null;
  logPrefix: string;
  sourceChannel?: "text_chat" | "voice_call" | "unknown";
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
            id: item.id,
            messageType: item.message_type,
            role: item.role as "user" | "assistant",
            content: formatTalentMessageContentForLlmPrompt(item).trim(),
          }) satisfies ExtractionConversationMessage
      )
      .filter((item) => item.content.length > 0);
    const recentMessagesForLog = formatRecentMessagesForLog(
      recentExtractionMessages
    );

    const conversationMessages = buildExtractionConversationMessages({
      assistantContent,
      recentMessages: recentExtractionMessages,
    });
    const currentChecklistCoverage = await getCareerOnboardingChecklistCoverage(
      {
        admin: args.admin,
        conversationId: args.conversationId,
        currentInsightContent: args.currentInsightContent,
        userId: args.userId,
      }
    );

    const systemPrompt = args.buildPrompt({
      currentChecklistCoverage,
      currentInsightContent: args.currentInsightContent,
    });
    let rawExtraction = await runCareerInsightExtraction({
      systemPrompt,
      conversationMessages, // 최근 6개의 메세지가 들어감
    });

    logger.log("[llm-output]", {
      label: "career/chat:insight_extraction",
      model: CAREER_LLM_CONFIG.insightExtraction.model,
      // systemPrompt: systemPrompt,
      // conversationMessages: conversationMessages,
      output: rawExtraction,
      // recentMessages: recentMessagesForLog,
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
      logger.log("[llm-output]", {
        label: "career/chat:insight_extraction:fallback",
        logPrefix: args.logPrefix,
        model: CAREER_LLM_CONFIG.insightExtraction.fallbackModel,
        output: rawExtraction,
        recentMessages: recentMessagesForLog,
        sourceChannel: args.sourceChannel ?? "unknown",
      });
      parsedExtraction = parseExtractedInsights({
        logPrefix: args.logPrefix,
        rawExtraction,
      });
    }

    const extractedInsights = parsedExtraction.insights;
    const coveredChecklistKeys = new Set(parsedExtraction.coveredChecklistKeys);
    if (!extractedInsights && coveredChecklistKeys.size === 0) {
      return 0;
    }

    const processedInsights: Record<string, string> = {};

    for (const [rawKey, extracted] of Object.entries(extractedInsights ?? {})) {
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
      const checklistKey = ONBOARDING_QUESTION_BY_INSIGHT_KEY.get(key);
      if (checklistKey) {
        coveredChecklistKeys.add(checklistKey);
      }
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

    const changedKeysCount = Object.keys(processedInsights).length;
    let changedChecklistCount = 0;

    if (changedKeysCount > 0) {
      const finalContent: Record<string, string> = {
        ...(args.currentInsightContent ?? {}),
        ...processedInsights,
      };

      await upsertTalentInsights({
        admin: args.admin,
        userId: args.userId,
        content: finalContent,
      });
    }

    if (coveredChecklistKeys.size > 0) {
      const coverageResult = await mergeCareerOnboardingChecklistCoverage({
        admin: args.admin,
        conversationId: args.conversationId,
        coveredKeys: Array.from(coveredChecklistKeys),
        currentInsightContent: {
          ...(args.currentInsightContent ?? {}),
          ...processedInsights,
        },
        userId: args.userId,
      });
      changedChecklistCount = coverageResult.changedCount;
    }

    return changedKeysCount + changedChecklistCount;
  } catch (insightError) {
    logger.log(`[${args.logPrefix}] Failed to extract insights`, {
      userId: args.userId,
      error:
        insightError instanceof Error ? insightError.message : "Unknown error",
    });
    return 0;
  }
}
