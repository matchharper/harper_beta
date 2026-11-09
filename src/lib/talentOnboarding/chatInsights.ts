import {
  CAREER_LLM_CONFIG,
  runCareerInsightExtraction,
} from "@/lib/career/llm";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
import {
  buildTalentMemoryRetrievalQuery,
  createTalentContextMutationRequestId,
  fetchTalentContextPromptSnapshot,
  fetchTalentContextsByRefs,
  fetchRecentMessages,
  getTalentSupabaseAdmin,
  mutateTalentContextsFromAgent,
  refreshTalentContextEmbeddings,
  renderTalentContextPrompt,
  type TalentContextAgentChange,
  type TalentMemoryImportance,
} from "@/lib/talentOnboarding/server";
import { ONBOARDING_QUESTION_BY_INSIGHT_KEY, type OnboardingChecklistLocationContext } from "@/lib/talentOnboarding/insightChecklist";
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
  onboardingChecklistContext?: OnboardingChecklistLocationContext;
};


function clampForLog(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function compactOlderTranscriptMessage(value: string, maxLength = 2_400) {
  if (value.length <= maxLength) return value;
  const marker = " … [older message truncated] … ";
  const sideLength = Math.floor((maxLength - marker.length) / 2);
  return `${value.slice(0, sideLength)}${marker}${value.slice(-sideLength)}`;
}

export function buildExtractionConversationMessages(args: {
  assistantContent: string;
  recentMessages: Array<{ content: string; role: "user" | "assistant" }>;
  includeFullTranscript?: boolean;
}) {
  const { assistantContent, recentMessages } = args;
  const messages =
    !assistantContent || (recentMessages.length > 0 &&
    recentMessages[recentMessages.length - 1]?.role === "assistant" &&
    recentMessages[recentMessages.length - 1]?.content === assistantContent)
      ? recentMessages
      : [
          ...recentMessages,
          { role: "assistant" as const, content: assistantContent },
        ];
  const latestUserIndex = messages.findLastIndex(
    (message) => message.role === "user"
  );

  const startIndex = args.includeFullTranscript ? 0 : Math.max(0, messages.length - 5);
  const transcript = messages
    .slice(startIndex)
    .map((message, index) => {
      const role = message.role === "user" ? "User" : "Harper";
      const normalized = message.content.replace(/\s+/g, " ").trim();
      const originalIndex = startIndex + index;
      const content =
        args.includeFullTranscript || originalIndex === latestUserIndex
          ? normalized
          : compactOlderTranscriptMessage(normalized);
      return `[${index + 1}] ${role}: ${content}`;
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

function normalizeExtractedContextChanges(
  value: unknown
): TalentContextAgentChange[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const changes: TalentContextAgentChange[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const op = typeof record.op === "string" ? record.op : "";
    if (op === "add") {
      const collection = record.collection;
      const content =
        typeof record.content === "string" ? record.content.trim() : "";
      const label = typeof record.label === "string" ? record.label.trim() : "";
      const key = typeof record.key === "string" ? record.key.trim() : "";
      const requestedImportance = Number(record.importance);
      const importance =
        Number.isInteger(requestedImportance) &&
        requestedImportance >= 1 &&
        requestedImportance <= 3
          ? requestedImportance
          : 1;
      if (
        (collection !== "brief" && collection !== "memory") ||
        !content ||
        Array.from(content).length > 8_000 ||
        (collection === "brief" &&
          (Array.from(label).length > 160 || Array.from(key).length > 160))
      ) {
        return null;
      }
      if (collection === "brief") {
        changes.push({
          collection,
          content,
          ...(label ? { label } : {}),
          ...(key && ONBOARDING_QUESTION_BY_INSIGHT_KEY.has(key)
            ? { key }
            : {}),
          op,
        });
      } else {
        changes.push({
          collection,
          content,
          importance: importance as TalentMemoryImportance,
          op,
        });
      }
      continue;
    }
    const ref = Number(record.ref);
    if (!Number.isSafeInteger(ref) || ref <= 0) return null;
    if (op === "delete") {
      changes.push({ op, ref });
      continue;
    }
    if (op !== "update") return null;
    const hasContent = Object.prototype.hasOwnProperty.call(record, "content");
    const suppliedLabel = Object.prototype.hasOwnProperty.call(record, "label");
    const suppliedImportance = Object.prototype.hasOwnProperty.call(
      record,
      "importance"
    );
    const content = hasContent
      ? String(record.content ?? "").trim()
      : undefined;
    const label = suppliedLabel ? String(record.label ?? "").trim() : undefined;
    const requestedImportance = suppliedImportance
      ? Number(record.importance)
      : undefined;
    const hasLabel = Boolean(label);
    const hasImportance =
      Number.isInteger(requestedImportance) &&
      requestedImportance! >= 1 &&
      requestedImportance! <= 3;
    const importance = hasImportance
      ? (requestedImportance as TalentMemoryImportance)
      : undefined;
    if (
      (!hasContent && !hasLabel && !hasImportance) ||
      (hasContent && !content) ||
      (hasContent && Array.from(content ?? "").length > 8_000) ||
      (hasLabel && Array.from(label ?? "").length > 160)
    ) {
      return null;
    }
    changes.push({
      ...(hasContent ? { content } : {}),
      ...(hasImportance
        ? { importance: importance as TalentMemoryImportance }
        : {}),
      ...(hasLabel ? { label } : {}),
      op,
      ref,
    });
  }
  return changes;
}

function parseExtractedContext(args: { logPrefix: string; rawExtraction: string }) {
  const cleaned = args.rawExtraction.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  for (const candidate of [cleaned, ...extractJsonObjectCandidates(cleaned)]) {
    try {
      const parsed = JSON.parse(candidate);
      const changes = normalizeExtractedContextChanges(parsed?.changes);
      if (changes !== null) return { changes, parseOk: true };
    } catch { /* Try the next balanced JSON object. */ }
  }
  logger.log(`[${args.logPrefix}] Context extraction returned invalid changes`);
  return { changes: null, parseOk: false };
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
    content: clampForLog(message.content.replace(/\s+/g, " ").trim(), 800),
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
  logPrefix: string;
  onboardingChecklistContext?: OnboardingChecklistLocationContext;
  profileChangesAlreadySaved?: string | null;
  sourceChannel?: "text_chat" | "voice_call" | "unknown";
  /** Final call reconciliation reuses this extractor with the whole spoken context. */
  transcript?: ExtractionConversationMessage[];
  scheduleAfter?: (task: () => Promise<void>) => void;
  userId: string;
}) {
  const assistantContent = args.assistantContent.trim();
  if (!assistantContent && !args.transcript?.length) return 0;

  try {
    const recentExtractionMessages = args.transcript ?? (
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
      includeFullTranscript: Boolean(args.transcript),
    });
    const talentContextSnapshot = await fetchTalentContextPromptSnapshot({
      admin: args.admin,
      query: buildTalentMemoryRetrievalQuery(
        recentExtractionMessages.slice(-5).map((message) => message.content)
      ),
      userId: args.userId,
    });
    const savedProfileChanges = args.profileChangesAlreadySaved?.trim();
    const systemPrompt = args
      .buildPrompt({
        currentChecklistCoverage: null,
        onboardingChecklistContext: args.onboardingChecklistContext,
      })
      .concat(
        savedProfileChanges
          ? `\n\n## Profile information saved earlier in this turn\n${savedProfileChanges}`
          : ""
      )
      .concat(
        "\n\n## Current saved context\n",
        renderTalentContextPrompt(talentContextSnapshot, {
          includeCompatibilityKeys: true,
        })
      );
    logger.log("[systemPrompt]", {
      systemPrompt,
    });
    let rawExtraction = await runCareerInsightExtraction({
      systemPrompt,
      conversationMessages,
    });

    logger.log("[llm-output]", {
      label: "career/chat:insight_extraction",
      model: CAREER_LLM_CONFIG.insightExtraction.model,
      // systemPrompt: systemPrompt,
      // conversationMessages: conversationMessages,
      output: rawExtraction,
      // recentMessages: recentMessagesForLog,
    });

    let parsedExtraction = parseExtractedContext({
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
      parsedExtraction = parseExtractedContext({
        logPrefix: args.logPrefix,
        rawExtraction,
      });
    }

    if (!parsedExtraction.parseOk || parsedExtraction.changes === null) {
      throw new Error("Onboarding context extraction returned invalid output");
    }
    const changes = parsedExtraction.changes;
    const refs = changes.flatMap((change) =>
      change.op === "add" ? [] : [change.ref]
    );
    const referencedRows = await fetchTalentContextsByRefs({
      admin: args.admin,
      refs,
      userId: args.userId,
    });
    if (new Set(refs).size !== referencedRows.length) {
      throw new Error("Extraction referenced unavailable talent context rows");
    }
    if (changes.length === 0) return 0;

    let changedContextCount = 0;

    if (changes.length > 0) {
      const lastUserMessage = [...recentExtractionMessages]
        .reverse()
        .find((message) => message.role === "user");
      const requestId = createTalentContextMutationRequestId([
        "onboarding_extraction",
        args.userId,
        args.conversationId,
        lastUserMessage?.id ?? null,
        changes,
      ]);
      const mutation = await mutateTalentContextsFromAgent({
        admin: args.admin,
        changes,
        referencedRows,
        requestId,
        sourceRefs: [
          {
            type: "onboarding_extraction",
            conversationId: args.conversationId,
            messageId: lastUserMessage?.id ?? null,
          },
        ],
        userId: args.userId,
      });
      changedContextCount = mutation.changedIds.length;
      const refreshEmbeddings = () =>
        refreshTalentContextEmbeddings({
          admin: args.admin,
          ids: mutation.changedIds,
          userId: args.userId,
        }).catch((error) => {
          logger.log(`[${args.logPrefix}] Failed to embed extracted memories`, {
            error: error instanceof Error ? error.message : "Unknown error",
          });
        });
      if (args.scheduleAfter) args.scheduleAfter(refreshEmbeddings);
      else void refreshEmbeddings();
    }

    return changedContextCount;
  } catch (insightError) {
    logger.log(`[${args.logPrefix}] Failed to extract insights`, {
      userId: args.userId,
      error:
        insightError instanceof Error ? insightError.message : "Unknown error",
    });
    throw insightError;
  }
}
