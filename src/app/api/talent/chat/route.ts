import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  buildTalentProfileContext,
  countAdditionalOnboardingQuestionSelections,
  countUserChatTurns,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  TalentMessageRow,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
  normalizeTalentEngagementTypes,
  normalizeTalentInsightContent,
  sanitizeTalentCareerMoveIntent,
  toTalentMessageResponse,
} from "@/lib/talentOnboarding/server";
import {
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
} from "@/lib/talentOnboarding/recommendationSettings";
import { TALENT_INTERVIEW_FINAL_STEP } from "@/lib/talentOnboarding/progress";
import {
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE,
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP,
  TALENT_ONBOARDING_ADDITIONAL_QUESTION_MAX,
} from "@/lib/talentOnboarding/onboarding";
import {
  buildCareerTextChatPromptBlocks,
  buildCareerInsightExtractionPrompt,
} from "@/lib/career/prompts";
import {
  runCareerChatAssistant,
  runCareerChatAssistantStream,
} from "@/lib/career/llm";
import {
  executeTalentTool,
  getOpenAIChatTools,
  getStopAfterTalentToolNames,
  TALENT_TOOL_NAMES,
} from "@/lib/talentOnboarding/tools";
import {
  fetchRecentMessagesWithSummary,
  maybeSummarizeTalentConversation,
} from "@/lib/talentOnboarding/conversationSummary";
import { createOnboardingCompletionWrapupMessage } from "@/lib/talentOnboarding/onboardingCompletionWrapup";
import { getTalentCareerMoveIntentLabel } from "@/lib/talentNetworkOptions";
import { extractAndPersistChatInsights } from "@/lib/talentOnboarding/chatInsights";
import {
  TALENT_ONBOARDING_DONE_MARKER,
  resolveTalentOnboardingCompletion,
  stripTalentOnboardingCompletionMarker,
} from "@/lib/talentOnboarding/completion";
import {
  completeOnboardingAndQueueInitialOpportunityRun,
  getActiveOpportunityRun,
  serializeOpportunityRun,
} from "@/lib/opportunityDiscovery/store";
import {
  createRecommendJobPostingStatusLog,
  type RecommendJobPostingStatus,
} from "@/lib/talentOnboarding/recommendJobPostingStatus";
import {
  fetchLatestTalentActivityEvent,
  fetchPendingOpportunityFeedbackPromptContext,
  fetchRecentTalentActivitySummaries,
} from "@/lib/talentOnboarding/activityEvents";
import {
  fetchTalentPostingCardsByRoleIds,
  type TalentOpportunityHistoryItem,
} from "@/lib/talentOpportunity";
import { extractPostingRoleIdsFromText } from "@/lib/career/postingLinks";
import {
  COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
  fetchRecentCompanySnapshot,
  formatCompanySnapshotMessage,
  getOrCreateCompanySnapshot,
  touchConversation,
} from "@/lib/career/companySnapshot";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
import { logger } from "@/utils/logger";

export const maxDuration = 180;

type Body = {
  channel?: string;
  conversationId?: string;
  message?: string;
  link?: string;
};

type CompanySnapshotToolResult = {
  messages: ReturnType<typeof toTalentMessageResponse>[];
};

const EMPTY_ASSISTANT_TEXT_FALLBACK =
  "말씀해주신 내용 확인했습니다. 이어서 조금만 더 여쭤볼게요.";
const INSIGHT_EXTRACTION_THINKING_LOG = "인사이트 추출";

const toResponseMessage = toTalentMessageResponse;

async function attachPostingPreviewsToMessages(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  messages: ReturnType<typeof toTalentMessageResponse>[];
  userId: string;
}) {
  const roleIdsByMessageId = new Map<number, string[]>();

  for (const message of args.messages) {
    const messageId = Number(message.id);
    if (!Number.isFinite(messageId)) continue;

    const roleIds = extractPostingRoleIdsFromText(message.content ?? "");
    if (roleIds.length > 0) {
      roleIdsByMessageId.set(messageId, roleIds);
    }
  }

  const roleIds = Array.from(
    new Set(Array.from(roleIdsByMessageId.values()).flatMap((ids) => ids))
  );
  if (roleIds.length === 0) return args.messages;

  const postingCards = await fetchTalentPostingCardsByRoleIds({
    admin: args.admin,
    roleIds,
    userId: args.userId,
  });
  const postingCardByRoleId = new Map(
    postingCards.map((item) => [item.roleId, item])
  );

  return args.messages.map((message) => {
    const messageId = Number(message.id);
    const messageRoleIds = roleIdsByMessageId.get(messageId) ?? [];
    const opportunityPreview = messageRoleIds
      .map((roleId) => postingCardByRoleId.get(roleId))
      .filter(
        (item): item is TalentOpportunityHistoryItem => item !== undefined
      );

    if (opportunityPreview.length === 0) return message;
    return {
      ...message,
      opportunityPreview,
    };
  });
}

const wantsSseStream = (req: NextRequest) =>
  (req.headers.get("accept") ?? "").includes("text/event-stream");

const createSseMessage = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const createSseHeaders = () => ({
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "Content-Type": "text/event-stream; charset=utf-8",
  "X-Accel-Buffering": "no",
});

function startOpportunityDiscoveryInBackground(runId: string) {
  console.info("[opportunity-discovery] queued for harper_worker", {
    runId,
  });
}

async function buildTalentProfileSnapshot(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  userId: string;
}) {
  const [setting, insights] = await Promise.all([
    fetchTalentSetting({ admin: args.admin, userId: args.userId }),
    fetchTalentInsights({ admin: args.admin, userId: args.userId }),
  ]);
  const careerMoveIntent = sanitizeTalentCareerMoveIntent(
    setting?.career_move_intent
  );
  return {
    talentPreferences: {
      engagementTypes: normalizeTalentEngagementTypes(
        setting?.engagement_types ?? []
      ),
      preferredLocations: [],
      careerMoveIntent,
      careerMoveIntentLabel: getTalentCareerMoveIntentLabel(careerMoveIntent),
      isOnboardingDone: Boolean(setting?.is_onboarding_done),
      periodicIntervalDays: normalizeTalentPeriodicIntervalDays(
        setting?.periodic_interval_days
      ),
      recommendationBatchSize: normalizeTalentRecommendationBatchSize(
        setting?.recommendation_batch_size
      ),
    },
    talentInsights: normalizeTalentInsightContent(insights?.content ?? null),
    preferencesUpdatedAt: setting?.updated_at ?? null,
    insightUpdatedAt: insights?.last_updated_at ?? null,
  };
}

const optionalToolString = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};

function countPromptChars(value: string | null | undefined) {
  return typeof value === "string" ? value.length : 0;
}

function countMessageContentChars(
  messages: Array<{ content: string | null | undefined }>
) {
  return messages.reduce(
    (sum, message) => sum + countPromptChars(message.content),
    0
  );
}

function countSerializedChars(value: unknown) {
  try {
    const serialized = JSON.stringify(value);
    return serialized ? serialized.length : 0;
  } catch {
    return 0;
  }
}

function countPromptBlockChars(
  blocks: Array<{ text: string | null | undefined }>
) {
  return blocks.reduce((sum, block) => sum + countPromptChars(block.text), 0);
}

const TOOL_UI_STATUS_MESSAGE_KEY = "_uiStatusMessage";

function splitToolUiStatus(input: Record<string, unknown>) {
  const { [TOOL_UI_STATUS_MESSAGE_KEY]: rawStatus, ...toolInput } = input;
  const status =
    typeof rawStatus === "string"
      ? rawStatus.replace(/\s+/g, " ").trim().slice(0, 160)
      : "";

  return {
    status,
    toolInput,
  };
}

function appendThinkingLog(logs: string[], status: string) {
  const normalized = status.replace(/\s+/g, " ").trim().slice(0, 160);
  if (!normalized) return logs;
  if (logs[logs.length - 1] === normalized) return logs;
  return [...logs, normalized].slice(-12);
}

function appendRecommendationStatusLog(
  logs: string[],
  status: RecommendJobPostingStatus
) {
  return appendThinkingLog(logs, createRecommendJobPostingStatusLog(status));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((entry) => String(entry ?? "").trim())
        .filter((entry) => entry.length > 0)
    : [];
}

function shouldAutoRecommendAfterProfileUpdate(result: unknown) {
  return (
    isRecord(result) &&
    result.ok === true &&
    result.impactLevel === "high" &&
    result.shouldRecommendJobPostings === true
  );
}

function buildAutoRecommendationRequest(args: {
  latestUserMessage: string;
  profileUpdateResult: Record<string, unknown>;
}) {
  const trigger: Record<string, unknown> = isRecord(
    args.profileUpdateResult.recommendationTrigger
  )
    ? args.profileUpdateResult.recommendationTrigger
    : {};
  const changedPreferenceFields = getStringArray(
    trigger.changedPreferenceFields
  );
  const updatedTalentInsightKeys = getStringArray(
    trigger.updatedTalentInsightKeys
  );
  const changeSummary =
    optionalToolString(trigger.changeSummary) ??
    "사용자의 추천 조건에 큰 변경이 생겼습니다.";

  return [
    "사용자의 방금 high-impact 프로필/선호 변경을 반영해 새로운 맞춤 채용공고를 추천해 주세요.",
    `변경 요약: ${changeSummary}`,
    changedPreferenceFields.length > 0
      ? `변경된 preference 필드: ${changedPreferenceFields.join(", ")}`
      : "",
    updatedTalentInsightKeys.length > 0
      ? `변경된 insight 키: ${updatedTalentInsightKeys.join(", ")}`
      : "",
    `사용자 최신 메시지: ${args.latestUserMessage}`,
    "이미 저장된 최신 talent_preferences/talent_insights를 우선 기준으로 삼고, 직전 변경 사항과 맞지 않는 공고는 제외해 주세요.",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .slice(0, 1400);
}

async function persistThinkingLogsForMessage(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  conversationId: string;
  messageId: number | string | null | undefined;
  thinkingLogs: string[];
  userId: string;
}) {
  const messageId =
    typeof args.messageId === "number"
      ? args.messageId
      : typeof args.messageId === "string" && /^\d+$/.test(args.messageId)
        ? Number(args.messageId)
        : null;
  if (!messageId || args.thinkingLogs.length === 0) return;

  const { error } = await args.admin
    .from("talent_messages")
    .update({ thinking_logs: args.thinkingLogs })
    .eq("id", messageId)
    .eq("conversation_id", args.conversationId)
    .eq("user_id", args.userId);

  if (error) {
    throw new Error(error.message ?? "Failed to persist thinking logs");
  }
}

function attachThinkingLogsToLastMessage<
  T extends { id: number | string; thinkingLogs?: string[] },
>(messages: T[], thinkingLogs: string[]) {
  if (messages.length === 0 || thinkingLogs.length === 0) return messages;
  const lastIndex = messages.length - 1;
  return messages.map((message, index) =>
    index === lastIndex ? { ...message, thinkingLogs } : message
  );
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const conversationId = body.conversationId?.trim();
    const message = body.message?.trim();
    const link = body.link?.trim();
    const requestChannel = body.channel === "voice" ? "voice" : "chat";
    const streamResponse = wantsSseStream(req);

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }
    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const { data: conversation, error: conversationError } = await admin
      .from("talent_conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (conversationError) {
      return NextResponse.json(
        { error: conversationError.message ?? "Failed to read conversation" },
        { status: 500 }
      );
    }
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const activeRun = await getActiveOpportunityRun({
      admin,
      conversationId,
      userId: user.id,
    });

    const summarizeConversationInBackground = (options?: {
      maxToMessageId?: number | null;
    }) => {
      void maybeSummarizeTalentConversation({
        admin,
        conversationId,
        maxToMessageId: options?.maxToMessageId,
        userId: user.id,
      }).catch((error) => {
        console.error("[TalentChat] Failed to summarize conversation", {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
          userId: user.id,
        });
      });
    };

    const [
      profile,
      currentInsights,
      talentSetting,
      additionalQuestionSelectionCount,
      onboardingCompletionEvent,
      pendingOpportunityFeedbackContext,
      recentActivitySummaries,
    ] = await Promise.all([
      fetchTalentUserProfile({ admin, userId: user.id }),
      fetchTalentInsights({ admin, userId: user.id }),
      fetchTalentSetting({ admin, userId: user.id }),
      countAdditionalOnboardingQuestionSelections({
        admin,
        conversationId,
      }),
      fetchLatestTalentActivityEvent({
        admin,
        conversationId,
        eventType: "onboarding_completed",
        userId: user.id,
      }),
      fetchPendingOpportunityFeedbackPromptContext({
        admin,
        conversationId,
        limit: 10,
        userId: user.id,
      }),
      fetchRecentTalentActivitySummaries({
        admin,
        limit: 5,
        userId: user.id,
      }),
    ]);
    const structuredProfile = await fetchTalentStructuredProfile({
      admin,
      userId: user.id,
      talentUser: profile,
    });
    const structuredProfileText = buildTalentProfileContext({
      profile,
      structuredProfile,
      setting: talentSetting,
      maxResumeChars: 3000,
    });

    const currentInsightContent = (currentInsights?.content ?? null) as Record<
      string,
      string
    > | null;
    const shouldAutoExtractInsights = !Boolean(
      talentSetting?.is_onboarding_done
    );
    const extractTurnInsights = (assistantContent: string) =>
      shouldAutoExtractInsights
        ? extractAndPersistChatInsights({
            admin,
            assistantContent,
            buildPrompt: (promptArgs) =>
              buildCareerInsightExtractionPrompt({
                currentInsightContent: promptArgs.currentInsightContent,
              }),
            conversationId,
            currentInsightContent,
            logPrefix: "TalentChat",
            userId: user.id,
          })
        : Promise.resolve(0);

    const normalizedContent = link
      ? `${message}\n\n참고 링크: ${link}`
      : message;

    const { data: insertedUserMessage, error: userMessageError } = await admin
      .from("talent_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "user",
        content: normalizedContent,
        message_type: "chat",
      })
      .select("*")
      .single();

    if (userMessageError) {
      return NextResponse.json(
        { error: userMessageError.message ?? "Failed to insert user message" },
        { status: 500 }
      );
    }

    summarizeConversationInBackground({
      maxToMessageId: insertedUserMessage.id - 1,
    });

    const userTurnCount = await countUserChatTurns({ admin, conversationId });
    const currentProgressStep = Math.min(
      userTurnCount,
      TALENT_INTERVIEW_FINAL_STEP
    );
    const recentMessages = await fetchRecentMessagesWithSummary({
      admin,
      conversationId,
      recentLimit: 12,
      userId: user.id,
    });

    const llmMessages = recentMessages
      .filter(
        (item) =>
          item.message_type !==
            TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE &&
          item.message_type !== TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP
      )
      .map((item) => ({
        role: item.role as "user" | "assistant",
        content: formatTalentMessageContentForLlmPrompt(item),
      }))
      .filter((item) => item.content.trim().length > 0);

    const availableChatTools = getOpenAIChatTools("chat");
    const isOnboardingActiveForTools = !Boolean(
      talentSetting?.is_onboarding_done
    );
    const canSelectAdditionalOnboardingQuestion =
      additionalQuestionSelectionCount <
      TALENT_ONBOARDING_ADDITIONAL_QUESTION_MAX;
    // During onboarding, suppress all chat tools EXCEPT the silent profile writer
    // and, for text chat only, the additional-question selector. Voice onboarding
    // should ask directly instead of exposing this selector as a callable tool.
    // After onboarding, keep the selector hidden because it is only meaningful
    // inside onboarding. The selector is also hidden after the hard max so the
    // model cannot keep asking extras.
    const toolDefinitions = isOnboardingActiveForTools
      ? availableChatTools.filter(
          (tool) =>
            tool.function.name === TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE ||
            (requestChannel !== "voice" &&
              tool.function.name === TALENT_TOOL_NAMES.OPEN_URL) ||
            (requestChannel !== "voice" &&
              canSelectAdditionalOnboardingQuestion &&
              tool.function.name ===
                TALENT_TOOL_NAMES.SELECT_ADDITIONAL_ONBOARDING_QUESTION)
        )
      : availableChatTools.filter(
          (tool) =>
            tool.function.name !==
            TALENT_TOOL_NAMES.SELECT_ADDITIONAL_ONBOARDING_QUESTION
        );
    const currentPreferences = {
      periodicIntervalDays: talentSetting?.periodic_interval_days ?? null,
      recommendationBatchSize: talentSetting?.recommendation_batch_size ?? null,
    };
    const serializedActiveRun = serializeOpportunityRun(activeRun);
    const opportunityStatus = activeRun
      ? {
          activeRunCreatedAt: activeRun.created_at ?? null,
          activeRunStatus: activeRun.status ?? null,
          isInitialSearchRunning:
            Boolean(serializedActiveRun?.inputLocked) &&
            activeRun.run_mode === "initial",
          onboardingCompletedAt: onboardingCompletionEvent?.occurred_at ?? null,
        }
      : onboardingCompletionEvent
        ? {
            onboardingCompletedAt: onboardingCompletionEvent.occurred_at,
          }
        : null;
    const { promptBlocks } = buildCareerTextChatPromptBlocks({
      additionalQuestionSelectionCount,
      currentInsightContent,
      currentPreferences,
      isOnboardingDone: talentSetting?.is_onboarding_done,
      opportunityStatus,
      pendingOpportunityFeedbackContext,
      profile,
      recentActivitySummaries,
      structuredProfileText,
      toolNames: toolDefinitions.map((tool) => tool.function.name),
    });
    const systemBlocks = promptBlocks;

    console.info("[career-chat:prompt-breakdown]", {
      cacheableSystemBlockKeys: systemBlocks
        .filter((block) => block.cacheable)
        .map((block) => block.key),
      label: "career/chat:assistant",
      conversationId,
      historyChars: countMessageContentChars(llmMessages),
      historyMessageCount: llmMessages.length,
      profileChars: countPromptChars(structuredProfileText),
      systemBlockChars: countPromptBlockChars(systemBlocks),
      systemBlockCount: systemBlocks.length,
      toolSchemaChars: countSerializedChars(toolDefinitions),
      userId: user.id,
    });

    // logger.log("\n\n [toolPolicy] : ", toolPolicy);

    // --- Conversation LLM call (natural language, no JSON mode) ---
    const preparedCompanySnapshotRef: {
      current: CompanySnapshotToolResult | null;
    } = { current: null };
    const selectedAdditionalQuestionRef: {
      current: string | null;
    } = { current: null };
    let thinkingLogs: string[] = [];
    let emitToolStatus: ((message: string) => void) | null = null;
    let emitRecommendationStatus:
      | ((status: RecommendJobPostingStatus) => void)
      | null = null;
    let autoRecommendationAttemptedAfterProfileUpdate = false;
    const canAutoRecommendJobPostings = toolDefinitions.some(
      (tool) => tool.function.name === TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS
    );
    const recordThinkingLog = (status: string) => {
      const normalized = status.replace(/\s+/g, " ").trim().slice(0, 160);
      if (!normalized) return;
      const previousLast = thinkingLogs[thinkingLogs.length - 1];
      thinkingLogs = appendThinkingLog(thinkingLogs, normalized);
      if (previousLast !== normalized) {
        emitToolStatus?.(normalized);
      }
    };
    const recordRecommendationStatus = (
      status: RecommendJobPostingStatus,
      options?: { persist?: boolean }
    ) => {
      emitRecommendationStatus?.(status);
      if (options?.persist) {
        thinkingLogs = appendRecommendationStatusLog(thinkingLogs, status);
      }
    };
    const persistInsightExtractionThinkingLogForMessage = async (args: {
      messageId: number | string | null | undefined;
      thinkingLogs: string[];
    }) => {
      const nextThinkingLogs = appendThinkingLog(
        args.thinkingLogs,
        INSIGHT_EXTRACTION_THINKING_LOG
      );
      if (nextThinkingLogs === args.thinkingLogs) return args.thinkingLogs;

      await persistThinkingLogsForMessage({
        admin,
        conversationId,
        messageId: args.messageId,
        thinkingLogs: nextThinkingLogs,
        userId: user.id,
      });
      return nextThinkingLogs;
    };
    const executeRecommendJobPostings = async (
      input: Record<string, unknown>
    ) => {
      recordRecommendationStatus({ state: "running" });

      try {
        const result = await executeTalentTool({
          context: {
            admin,
            conversationId,
            userMessageId: insertedUserMessage.id,
            userId: user.id,
          },
          name: TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS,
          input,
        });
        const recommendationResult = isRecord(result) ? result : {};
        const recommendations = Array.isArray(
          recommendationResult.recommendations
        )
          ? recommendationResult.recommendations
          : [];
        const completedStatus: RecommendJobPostingStatus = {
          candidateCount:
            typeof recommendationResult.candidateCount === "number"
              ? recommendationResult.candidateCount
              : null,
          recommendationCount: recommendations.length,
          state: "completed",
        };
        recordRecommendationStatus(completedStatus, { persist: true });
        return result;
      } catch (error) {
        recordRecommendationStatus({ state: "error" }, { persist: true });
        throw error;
      }
    };
    const executeDefaultTalentTool = async (toolArgs: {
      input: Record<string, unknown>;
      name: string;
    }) => {
      const { toolInput } = splitToolUiStatus(toolArgs.input);
      if (
        toolArgs.name === TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS &&
        autoRecommendationAttemptedAfterProfileUpdate
      ) {
        return {
          assistantInstruction:
            "A fresh recommendation search has already been run automatically after the high-impact profile update. Use the existing autoRecommendation result instead of calling recommend_job_postings again this turn.",
          ok: false,
          reason: "auto_recommendation_already_ran_this_turn",
          skipped: true,
        };
      }

      if (toolArgs.name === TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS) {
        return executeRecommendJobPostings(toolInput);
      }

      const result = await executeTalentTool({
        context: {
          admin,
          conversationId,
          userMessageId: insertedUserMessage.id,
          userId: user.id,
        },
        logging: false,
        name: toolArgs.name,
        input: toolInput,
      });

      if (
        toolArgs.name === TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE &&
        canAutoRecommendJobPostings &&
        shouldAutoRecommendAfterProfileUpdate(result)
      ) {
        const profileUpdateResult = result as Record<string, unknown>;
        const request = buildAutoRecommendationRequest({
          latestUserMessage: normalizedContent,
          profileUpdateResult,
        });
        autoRecommendationAttemptedAfterProfileUpdate = true;
        recordThinkingLog(
          "Finding fresh job postings based on the updated high-impact preferences."
        );

        try {
          const recommendationResult = await executeRecommendJobPostings({
            request,
          });

          return {
            ...profileUpdateResult,
            assistantInstruction:
              "The profile update was high-impact, so a fresh job-posting recommendation search has already been run. Answer in Korean using autoRecommendation.result.answerDraft, keep ranked roles, reasons, concerns, and links visible, and do not call recommend_job_postings again this turn.",
            autoRecommendation: {
              triggered: true,
              request,
              result: recommendationResult,
            },
          };
        } catch (error) {
          return {
            ...profileUpdateResult,
            assistantInstruction:
              "The profile update was high-impact, so Harper attempted a fresh job-posting recommendation search, but it failed. Answer naturally in Korean: acknowledge the saved update, explain briefly that fresh recommendations could not be loaded right now, and continue without another tool call.",
            autoRecommendation: {
              error:
                error instanceof Error
                  ? error.message
                  : "Fresh recommendation search failed.",
              request,
              triggered: true,
            },
          };
        }
      }

      if (
        toolArgs.name ===
          TALENT_TOOL_NAMES.SELECT_ADDITIONAL_ONBOARDING_QUESTION &&
        result &&
        typeof result === "object"
      ) {
        const assistantMessage = String(
          (result as { assistantMessage?: unknown }).assistantMessage ?? ""
        ).trim();
        if (assistantMessage) {
          selectedAdditionalQuestionRef.current = assistantMessage;
        }
      }

      return result;
    };

    if (streamResponse) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(createSseMessage(event, data)));
          };
          emitToolStatus = (message) => send("tool_status", { message });
          emitRecommendationStatus = (status) =>
            send("recommendation_search_status", status);
          let pendingAssistantText = "";
          let streamedAssistantText = "";
          const sendVisibleTextDelta = (delta: string) => {
            pendingAssistantText = (pendingAssistantText + delta).replaceAll(
              TALENT_ONBOARDING_DONE_MARKER,
              ""
            );
            const safeLength = Math.max(
              0,
              pendingAssistantText.length - TALENT_ONBOARDING_DONE_MARKER.length
            );
            if (safeLength <= 0) return;

            const visibleDelta = pendingAssistantText.slice(0, safeLength);
            pendingAssistantText = pendingAssistantText.slice(safeLength);
            streamedAssistantText += visibleDelta;
            send("text_delta", { delta: visibleDelta });
          };
          const flushVisibleText = (finalText: string) => {
            const missingText = finalText.startsWith(streamedAssistantText)
              ? finalText.slice(streamedAssistantText.length)
              : pendingAssistantText.replaceAll(
                  TALENT_ONBOARDING_DONE_MARKER,
                  ""
                );
            pendingAssistantText = "";
            if (!missingText) return;
            streamedAssistantText += missingText;
            send("text_delta", { delta: missingText });
          };
          const runInsightExtractionForStream = async (args: {
            content: string;
            messageId: number | string | null | undefined;
            thinkingLogs: string[];
          }) => {
            if (!shouldAutoExtractInsights || !args.content.trim()) {
              return args.thinkingLogs;
            }

            try {
              const changedKeysCount = await extractTurnInsights(args.content);
              if (changedKeysCount > 0) {
                const nextThinkingLogs =
                  await persistInsightExtractionThinkingLogForMessage({
                    messageId: args.messageId,
                    thinkingLogs: args.thinkingLogs,
                  });
                console.info("[TalentChat] stream insight extraction done", {
                  changedKeysCount,
                  conversationId,
                  userId: user.id,
                });
                return nextThinkingLogs;
              }
              console.info("[TalentChat] stream insight extraction done", {
                changedKeysCount,
                conversationId,
                userId: user.id,
              });
              return args.thinkingLogs;
            } catch (error) {
              console.error("[TalentChat] Failed to extract stream insights", {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
                userId: user.id,
              });
              return args.thinkingLogs;
            }
          };
          try {
            send("user_message", {
              message: toResponseMessage(
                insertedUserMessage as TalentMessageRow
              ),
            });

            const assistantText = await runCareerChatAssistantStream({
              messages: llmMessages,
              tools: toolDefinitions,
              stopAfterToolNames: getStopAfterTalentToolNames("chat"),
              systemBlocks,
              onTextDelta: (delta) => {
                sendVisibleTextDelta(delta);
              },
              executeTool: async ({ name, input }) => {
                const { status, toolInput } = splitToolUiStatus(input);
                if (status) {
                  recordThinkingLog(status);
                }

                if (name === TALENT_TOOL_NAMES.RESEARCH_COMPANY) {
                  const companyName =
                    optionalToolString(toolInput.company_name) ??
                    optionalToolString(toolInput.companyName);
                  if (!companyName) {
                    throw new Error("research_company requires company_name.");
                  }

                  const cachedSnapshot = await fetchRecentCompanySnapshot({
                    admin,
                    companyName,
                  });
                  if (cachedSnapshot) {
                    const messageContent = formatCompanySnapshotMessage({
                      reused: true,
                      snapshot: cachedSnapshot,
                    });
                    const { data: cacheMessage, error: cacheMessageError } =
                      await admin
                        .from("talent_messages")
                        .insert({
                          content: messageContent,
                          conversation_id: conversationId,
                          message_type: COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
                          role: "assistant",
                          user_id: user.id,
                        })
                        .select("*")
                        .single();
                    if (cacheMessageError || !cacheMessage) {
                      throw new Error(
                        cacheMessageError?.message ??
                          "Failed to insert company_snapshot result message."
                      );
                    }
                    await touchConversation(admin, conversationId, user.id);
                    preparedCompanySnapshotRef.current = {
                      messages: [
                        toResponseMessage(cacheMessage as TalentMessageRow),
                      ],
                    };
                    return { ok: true, cached: true };
                  }

                  // Intentional double cache-fetch: route checked cache above for fast-path,
                  // but getOrCreateCompanySnapshot rechecks for idempotency (another request
                  // may have created the snapshot between the two calls).
                  const result = await getOrCreateCompanySnapshot({
                    admin,
                    companyName,
                    reason: optionalToolString(toolInput.reason),
                    userId: user.id,
                  });
                  const messageContent = formatCompanySnapshotMessage({
                    reused: result.reused,
                    snapshot: result.snapshot,
                  });
                  const { data: researchMessage, error: researchMessageError } =
                    await admin
                      .from("talent_messages")
                      .insert({
                        content: messageContent,
                        conversation_id: conversationId,
                        message_type: COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
                        role: "assistant",
                        user_id: user.id,
                      })
                      .select("*")
                      .single();
                  if (researchMessageError || !researchMessage) {
                    throw new Error(
                      researchMessageError?.message ??
                        "Failed to insert company_snapshot result message."
                    );
                  }
                  await touchConversation(admin, conversationId, user.id);
                  preparedCompanySnapshotRef.current = {
                    messages: [
                      toResponseMessage(researchMessage as TalentMessageRow),
                    ],
                  };
                  return { ok: true, cached: result.reused };
                }

                return executeDefaultTalentTool({ name, input: toolInput });
              },
            });

            const preparedCompanySnapshot = preparedCompanySnapshotRef.current;
            if (preparedCompanySnapshot) {
              const preparedAssistantText =
                preparedCompanySnapshot.messages[
                  preparedCompanySnapshot.messages.length - 1
                ]?.content ?? "";
              const preparedMessageId =
                preparedCompanySnapshot.messages[
                  preparedCompanySnapshot.messages.length - 1
                ]?.id;
              await persistThinkingLogsForMessage({
                admin,
                conversationId,
                messageId: preparedMessageId,
                thinkingLogs,
                userId: user.id,
              });
              const finalThinkingLogs = await runInsightExtractionForStream({
                content: preparedAssistantText,
                messageId: preparedMessageId,
                thinkingLogs,
              });
              const messagesWithThinkingLogs = attachThinkingLogsToLastMessage(
                preparedCompanySnapshot.messages,
                finalThinkingLogs
              );
              summarizeConversationInBackground();

              send("assistant_messages", {
                messages: messagesWithThinkingLogs,
              });
              send("progress", {
                progress: {
                  answeredCount: userTurnCount,
                  completed: false,
                  currentStep: currentProgressStep,
                  targetCount: TALENT_INTERVIEW_FINAL_STEP,
                },
              });
              const profileSnapshot = await buildTalentProfileSnapshot({
                admin,
                userId: user.id,
              });
              send("talent_profile", profileSnapshot);
              send("done", { ok: true });
              return;
            }

            const assistantTextSource =
              selectedAdditionalQuestionRef.current ?? assistantText.trim();
            const assistantTextWithMarkers =
              assistantTextSource || EMPTY_ASSISTANT_TEXT_FALLBACK;

            const completion = resolveTalentOnboardingCompletion({
              assistantContent: assistantTextWithMarkers,
            });

            const safeAssistantText =
              stripTalentOnboardingCompletionMarker(assistantTextWithMarkers) ||
              EMPTY_ASSISTANT_TEXT_FALLBACK;
            flushVisibleText(safeAssistantText);

            const { data: insertedAssistantMessage, error: assistantError } =
              await admin
                .from("talent_messages")
                .insert({
                  conversation_id: conversationId,
                  user_id: user.id,
                  role: "assistant",
                  content: safeAssistantText,
                  message_type: "chat",
                  thinking_logs: thinkingLogs,
                })
                .select("*")
                .single();

            if (assistantError) {
              throw new Error(
                assistantError.message ?? "Failed to insert assistant message"
              );
            }

            const finalAssistantThinkingLogs =
              await runInsightExtractionForStream({
                content: safeAssistantText,
                messageId: insertedAssistantMessage.id,
                thinkingLogs,
              });
            summarizeConversationInBackground();

            const isCompleted = completion.completed;
            const now = new Date().toISOString();
            await admin
              .from("talent_conversations")
              .update({
                stage: isCompleted ? "completed" : "chat",
                updated_at: now,
              })
              .eq("id", conversationId)
              .eq("user_id", user.id);

            const completedOpportunityRun =
              isCompleted && completion.reason
                ? await completeOnboardingAndQueueInitialOpportunityRun({
                    admin,
                    completionReason: completion.reason,
                    conversationId,
                    source: "career_chat_completion",
                    userId: user.id,
                  })
                : null;
            if (completedOpportunityRun) {
              startOpportunityDiscoveryInBackground(completedOpportunityRun.id);
            }

            let sentFinalAssistantMessage = false;
            let insertedCompletionWrapupMessage: TalentMessageRow | null = null;
            if (isCompleted) {
              send("assistant_message", {
                message: {
                  ...toResponseMessage(
                    insertedAssistantMessage as TalentMessageRow
                  ),
                  thinkingLogs: finalAssistantThinkingLogs,
                },
              });
              sentFinalAssistantMessage = true;
              send("onboarding_wrapup_status", {
                state: "running",
              });
              insertedCompletionWrapupMessage =
                await createOnboardingCompletionWrapupMessage({
                  admin,
                  conversationId,
                  latestUserMessageId: insertedUserMessage.id,
                  userId: user.id,
                });
            }
            const assistantResponseMessages =
              await attachPostingPreviewsToMessages({
                admin,
                messages: [
                  {
                    ...toResponseMessage(
                      insertedAssistantMessage as TalentMessageRow
                    ),
                    thinkingLogs: finalAssistantThinkingLogs,
                  },
                  insertedCompletionWrapupMessage
                    ? toResponseMessage(insertedCompletionWrapupMessage)
                    : null,
                ].filter(
                  (message): message is ReturnType<typeof toResponseMessage> =>
                    message !== null
                ),
                userId: user.id,
              });

            if (assistantResponseMessages.length > 1) {
              send("assistant_messages", {
                messages: assistantResponseMessages,
              });
            } else if (!sentFinalAssistantMessage) {
              send("assistant_message", {
                message: assistantResponseMessages[0],
              });
            }
            if (isCompleted) {
              send("onboarding_wrapup_status", {
                state: insertedCompletionWrapupMessage ? "completed" : "error",
              });
            }
            send("opportunity_run", {
              opportunityDiscoveryQueued: Boolean(completedOpportunityRun),
              opportunityRun: serializeOpportunityRun(
                completedOpportunityRun ?? activeRun
              ),
            });
            send("progress", {
              progress: {
                answeredCount: userTurnCount,
                targetCount: TALENT_INTERVIEW_FINAL_STEP,
                completed: isCompleted,
                currentStep: currentProgressStep,
              },
            });
            const profileSnapshot = await buildTalentProfileSnapshot({
              admin,
              userId: user.id,
            });
            send("talent_profile", profileSnapshot);
            send("done", { ok: true });
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Failed to process talent chat";
            send("error", { error: message });
          } finally {
            emitToolStatus = null;
            emitRecommendationStatus = null;
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: createSseHeaders(),
      });
    }

    const assistantText = await runCareerChatAssistant({
      messages: llmMessages,
      tools: toolDefinitions,
      stopAfterToolNames: getStopAfterTalentToolNames("chat"),
      systemBlocks,
      executeTool: async ({ name, input }) => {
        const { status, toolInput } = splitToolUiStatus(input);
        if (status) {
          recordThinkingLog(status);
        }

        if (name === TALENT_TOOL_NAMES.RESEARCH_COMPANY) {
          const companyName =
            optionalToolString(toolInput.company_name) ??
            optionalToolString(toolInput.companyName);
          if (!companyName) {
            throw new Error("research_company requires company_name.");
          }

          const cachedSnapshot = await fetchRecentCompanySnapshot({
            admin,
            companyName,
          });
          if (cachedSnapshot) {
            const messageContent = formatCompanySnapshotMessage({
              reused: true,
              snapshot: cachedSnapshot,
            });
            const { data: cacheMessage, error: cacheMessageError } = await admin
              .from("talent_messages")
              .insert({
                content: messageContent,
                conversation_id: conversationId,
                message_type: COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
                role: "assistant",
                user_id: user.id,
              })
              .select("*")
              .single();
            if (cacheMessageError || !cacheMessage) {
              throw new Error(
                cacheMessageError?.message ??
                  "Failed to insert company_snapshot result message."
              );
            }
            await touchConversation(admin, conversationId, user.id);
            preparedCompanySnapshotRef.current = {
              messages: [toResponseMessage(cacheMessage as TalentMessageRow)],
            };
            return { ok: true, cached: true };
          }

          // Intentional double cache-fetch: route checked cache above for fast-path,
          // but getOrCreateCompanySnapshot rechecks for idempotency (another request
          // may have created the snapshot between the two calls).
          const result = await getOrCreateCompanySnapshot({
            admin,
            companyName,
            reason: optionalToolString(toolInput.reason),
            userId: user.id,
          });
          const messageContent = formatCompanySnapshotMessage({
            reused: result.reused,
            snapshot: result.snapshot,
          });
          const { data: researchMessage, error: researchMessageError } =
            await admin
              .from("talent_messages")
              .insert({
                content: messageContent,
                conversation_id: conversationId,
                message_type: COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
                role: "assistant",
                user_id: user.id,
              })
              .select("*")
              .single();
          if (researchMessageError || !researchMessage) {
            throw new Error(
              researchMessageError?.message ??
                "Failed to insert company_snapshot result message."
            );
          }
          await touchConversation(admin, conversationId, user.id);
          preparedCompanySnapshotRef.current = {
            messages: [toResponseMessage(researchMessage as TalentMessageRow)],
          };
          return { ok: true, cached: result.reused };
        }

        return executeDefaultTalentTool({ name, input: toolInput });
      },
    });

    const preparedCompanySnapshot = preparedCompanySnapshotRef.current;
    if (preparedCompanySnapshot) {
      const preparedAssistantText =
        preparedCompanySnapshot.messages[
          preparedCompanySnapshot.messages.length - 1
        ]?.content ?? "";
      const insightChangedKeysCount = await extractTurnInsights(
        preparedAssistantText
      );
      const finalThinkingLogs =
        insightChangedKeysCount > 0
          ? await persistInsightExtractionThinkingLogForMessage({
              messageId:
                preparedCompanySnapshot.messages[
                  preparedCompanySnapshot.messages.length - 1
                ]?.id,
              thinkingLogs,
            })
          : thinkingLogs;
      const messagesWithThinkingLogs = attachThinkingLogsToLastMessage(
        preparedCompanySnapshot.messages,
        finalThinkingLogs
      );
      if (insightChangedKeysCount === 0 && finalThinkingLogs.length > 0) {
        await persistThinkingLogsForMessage({
          admin,
          conversationId,
          messageId:
            messagesWithThinkingLogs[messagesWithThinkingLogs.length - 1]?.id,
          thinkingLogs: finalThinkingLogs,
          userId: user.id,
        });
      }
      summarizeConversationInBackground();
      const profileSnapshot = await buildTalentProfileSnapshot({
        admin,
        userId: user.id,
      });

      return NextResponse.json({
        ok: true,
        assistantMessage:
          messagesWithThinkingLogs[messagesWithThinkingLogs.length - 1],
        assistantMessages: messagesWithThinkingLogs,
        progress: {
          answeredCount: userTurnCount,
          completed: false,
          currentStep: currentProgressStep,
          targetCount: TALENT_INTERVIEW_FINAL_STEP,
        },
        userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
        ...profileSnapshot,
      });
    }

    logger.log("\n\nassistantText : ", assistantText, "\n\n");

    const assistantTextSource =
      selectedAdditionalQuestionRef.current ?? assistantText.trim();
    const assistantTextWithMarkers =
      assistantTextSource || EMPTY_ASSISTANT_TEXT_FALLBACK;

    const completion = resolveTalentOnboardingCompletion({
      assistantContent: assistantTextWithMarkers,
    });

    const safeAssistantText =
      stripTalentOnboardingCompletionMarker(assistantTextWithMarkers) ||
      EMPTY_ASSISTANT_TEXT_FALLBACK;

    // --- Save assistant message ---
    const { data: insertedAssistantMessage, error: assistantError } =
      await admin
        .from("talent_messages")
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: safeAssistantText,
          message_type: "chat",
          thinking_logs: thinkingLogs,
        })
        .select("*")
        .single();

    if (assistantError) {
      return NextResponse.json(
        {
          error: assistantError.message ?? "Failed to insert assistant message",
        },
        { status: 500 }
      );
    }

    const insightChangedKeysCount =
      await extractTurnInsights(safeAssistantText);
    const finalAssistantThinkingLogs =
      insightChangedKeysCount > 0
        ? await persistInsightExtractionThinkingLogForMessage({
            messageId: insertedAssistantMessage.id,
            thinkingLogs,
          })
        : thinkingLogs;
    summarizeConversationInBackground();

    // --- Completion check: explicit LLM onboarding-done marker only. ---
    const isCompleted = completion.completed;

    const now = new Date().toISOString();
    await admin
      .from("talent_conversations")
      .update({
        stage: isCompleted ? "completed" : "chat",
        updated_at: now,
      })
      .eq("id", conversationId)
      .eq("user_id", user.id);

    const completedOpportunityRun =
      isCompleted && completion.reason
        ? await completeOnboardingAndQueueInitialOpportunityRun({
            admin,
            completionReason: completion.reason,
            conversationId,
            source: "career_chat_completion",
            userId: user.id,
          })
        : null;
    if (completedOpportunityRun) {
      startOpportunityDiscoveryInBackground(completedOpportunityRun.id);
    }
    const insertedCompletionWrapupMessage = isCompleted
      ? await createOnboardingCompletionWrapupMessage({
          admin,
          conversationId,
          latestUserMessageId: insertedUserMessage.id,
          userId: user.id,
        })
      : null;

    const profileSnapshot = await buildTalentProfileSnapshot({
      admin,
      userId: user.id,
    });
    const assistantResponseMessages = await attachPostingPreviewsToMessages({
      admin,
      messages: [
        {
          ...toResponseMessage(insertedAssistantMessage as TalentMessageRow),
          thinkingLogs: finalAssistantThinkingLogs,
        },
        insertedCompletionWrapupMessage
          ? toResponseMessage(insertedCompletionWrapupMessage)
          : null,
      ].filter(
        (message): message is ReturnType<typeof toResponseMessage> =>
          message !== null
      ),
      userId: user.id,
    });
    const insertedAssistantResponseMessage = assistantResponseMessages.find(
      (message) => message.id === insertedAssistantMessage.id
    );

    return NextResponse.json({
      ok: true,
      userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
      assistantMessage:
        insertedAssistantResponseMessage ??
        toResponseMessage(insertedAssistantMessage as TalentMessageRow),
      assistantMessages: assistantResponseMessages,
      opportunityDiscoveryQueued: Boolean(completedOpportunityRun),
      opportunityRun: serializeOpportunityRun(
        completedOpportunityRun ?? activeRun
      ),
      progress: {
        answeredCount: userTurnCount,
        targetCount: TALENT_INTERVIEW_FINAL_STEP,
        completed: isCompleted,
        currentStep: currentProgressStep,
      },
      ...profileSnapshot,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process talent chat";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
