import { after } from "next/server";
import {
  buildCareerInsightExtractionPrompt,
  buildCareerTextChatPromptBlocks,
} from "@/lib/career/prompts";
import {
  recoverCareerChatAssistantText,
  runCareerChatAssistant,
} from "@/lib/career/llm";
import {
  buildTalentProfileContext,
  countAdditionalOnboardingQuestionSelections,
  countUserChatTurns,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  normalizeTalentEngagementTypes,
  normalizeTalentInsightContent,
  sanitizeTalentCareerMoveIntent,
  toTalentMessageResponse,
  type TalentAdminClient,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import {
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
} from "@/lib/talentOnboarding/recommendationSettings";
import {
  fetchRecentMessagesWithSummary,
  maybeSummarizeTalentConversation,
} from "@/lib/talentOnboarding/conversationSummary";
import { extractAndPersistChatInsights } from "@/lib/talentOnboarding/chatInsights";
import {
  executeTalentTool,
  TALENT_TOOL_NAMES,
} from "@/lib/talentOnboarding/tools";
import { insertTalentToolUsageLog } from "@/lib/talentOnboarding/toolUsageLog";
import { resolveCareerChatTools } from "@/lib/career/llmTools";
import {
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE,
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP,
} from "@/lib/talentOnboarding/onboarding";
import { TALENT_INTERVIEW_FINAL_STEP } from "@/lib/talentOnboarding/progress";
import {
  TALENT_ONBOARDING_DONE_MARKER,
  resolveTalentOnboardingCompletion,
  stripTalentOnboardingCompletionMarker,
} from "@/lib/talentOnboarding/completion";
import { createOnboardingCompletionMessages } from "@/lib/talentOnboarding/onboardingCompletionWrapup";
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
import { getTalentCareerMoveIntentLabel } from "@/lib/talentNetworkOptions";
import {
  fetchTalentPostingCardsByRoleIds,
  type TalentOpportunityHistoryItem,
} from "@/lib/talentOpportunity";
import { extractPostingRoleIdsFromText } from "@/lib/career/postingLinks";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
import {
  COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
  fetchRecentCompanySnapshot,
  formatCompanySnapshotMessage,
  getOrCreateCompanySnapshot,
  touchConversation,
} from "@/lib/career/companySnapshot";

type TalentMessageResponse = ReturnType<typeof toTalentMessageResponse>;

type CompanySnapshotToolResult = {
  messages: TalentMessageResponse[];
};

export type CareerChatTurnChannel = "chat" | "voice";

export type RunCareerChatTurnArgs = {
  admin: TalentAdminClient;
  allowedToolNames?: readonly string[] | null;
  assistantMessageType?: string;
  channel?: CareerChatTurnChannel;
  conversationId: string;
  inlineInsightExtraction?: boolean;
  link?: string | null;
  noMessageMarker?: string;
  onRecommendationStatus?: (status: RecommendJobPostingStatus) => void;
  onThinkingLog?: (status: string) => void;
  pendingOpportunityFeedbackContext?: string | null;
  proactiveContext?: string | null;
  shouldInsertAssistantMessage?: () => Promise<boolean>;
  skipConversationWrites?: boolean;
  userId: string;
  userMessage?: string | null;
};

export type CareerChatTurnResult = {
  assistantMessage: TalentMessageResponse | null;
  assistantMessages: TalentMessageResponse[];
  completed: boolean;
  noMessage: boolean;
  ok: true;
  opportunityDiscoveryQueued: boolean;
  opportunityRun: ReturnType<typeof serializeOpportunityRun>;
  progress: {
    answeredCount: number;
    completed: boolean;
    currentStep: number;
    targetCount: number;
  };
  userMessage: TalentMessageResponse | null;
  talentInsights: Record<string, string> | null;
  talentProfile: Awaited<ReturnType<typeof fetchTalentStructuredProfile>>;
  talentPreferences: {
    careerMoveIntent: string | null;
    careerMoveIntentLabel: string | null;
    engagementTypes: string[];
    isOnboardingDone: boolean;
    periodicIntervalDays: number | null;
    preferredLocations: string[];
    recommendationBatchSize: number | null;
  };
  insightUpdatedAt: string | null;
  preferencesUpdatedAt: string | null;
};

const optionalToolString = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};

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

function getToolStartThinkingLog(toolName: string) {
  switch (toolName) {
    case TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE:
      return "프로필과 추천 선호를 업데이트하고 있습니다.";
    case TALENT_TOOL_NAMES.SELECT_ADDITIONAL_ONBOARDING_QUESTION:
      return "다음에 확인할 온보딩 질문을 고르고 있습니다.";
    case TALENT_TOOL_NAMES.OPEN_URL:
      return "공유된 링크 내용을 확인하고 있습니다.";
    case TALENT_TOOL_NAMES.RESEARCH_COMPANY:
      return "회사 정보를 확인하고 있습니다.";
    default:
      return "";
  }
}

function shouldAutoRecommendAfterProfileUpdate(result: unknown) {
  return (
    isRecord(result) &&
    result.ok === true &&
    // result.impactLevel === "high" &&
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

async function attachPostingPreviewsToMessages(args: {
  admin: TalentAdminClient;
  messages: TalentMessageResponse[];
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

async function persistThinkingLogsForMessage(args: {
  admin: TalentAdminClient;
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

function attachThinkingLogsToLastMessage<T extends { thinkingLogs?: string[] }>(
  messages: T[],
  thinkingLogs: string[]
) {
  if (messages.length === 0 || thinkingLogs.length === 0) return messages;
  const lastIndex = messages.length - 1;
  return messages.map((message, index) =>
    index === lastIndex ? { ...message, thinkingLogs } : message
  );
}

async function buildTalentProfileSnapshot(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const [setting, insights, talentProfile] = await Promise.all([
    fetchTalentSetting({ admin: args.admin, userId: args.userId }),
    fetchTalentInsights({ admin: args.admin, userId: args.userId }),
    fetchTalentStructuredProfile({ admin: args.admin, userId: args.userId }),
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
    talentProfile,
    preferencesUpdatedAt: setting?.updated_at ?? null,
    insightUpdatedAt: insights?.last_updated_at ?? null,
  };
}

function startOpportunityDiscoveryInBackground(runId: string) {
  console.info("[opportunity-discovery] queued for harper_worker", {
    runId,
  });
}

function normalizeNoMessageContent(content: string, marker?: string) {
  const normalized = content
    .replace(/^[`"'“”]+|[`"'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  if (!marker) return normalized;
  const markerCandidate = normalized
    .replace(/^[`"'“”]+|[`"'“”.。]+$/g, "")
    .trim();
  return markerCandidate === marker ? null : normalized;
}

export async function runCareerChatTurn(
  args: RunCareerChatTurnArgs
): Promise<CareerChatTurnResult> {
  const {
    admin,
    conversationId,
    noMessageMarker,
    onRecommendationStatus,
    onThinkingLog,
    shouldInsertAssistantMessage,
    userId,
  } = args;
  const requestChannel = args.channel === "voice" ? "voice" : "chat";
  const inlineInsightExtraction = args.inlineInsightExtraction === true;
  const assistantMessageType =
    String(args.assistantMessageType ?? "").trim() || "chat";
  const skipConversationWrites = Boolean(args.skipConversationWrites);
  const rawUserMessage = String(args.userMessage ?? "").trim();
  const link = String(args.link ?? "").trim();
  const explicitPendingOpportunityFeedbackContext =
    args.pendingOpportunityFeedbackContext === undefined
      ? undefined
      : String(args.pendingOpportunityFeedbackContext ?? "").trim();
  const proactiveContext = String(args.proactiveContext ?? "").trim();

  const { data: conversation, error: conversationError } = await admin
    .from("talent_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (conversationError) {
    throw new Error(conversationError.message ?? "Failed to read conversation");
  }
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const activeRun = await getActiveOpportunityRun({
    admin,
    conversationId,
    userId,
  });

  const summarizeConversationInBackground = (options?: {
    maxToMessageId?: number | null;
  }) => {
    void maybeSummarizeTalentConversation({
      admin,
      conversationId,
      maxToMessageId: options?.maxToMessageId,
      userId,
    }).catch((error) => {
      console.error("[TalentChatTurn] Failed to summarize conversation", {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
    });
  };
  const touchConversationIfAllowed = async () => {
    if (skipConversationWrites) return;
    await touchConversation(admin, conversationId, userId);
  };
  const updateConversationStageIfAllowed = async (isCompleted: boolean) => {
    if (skipConversationWrites) return;
    const now = new Date().toISOString();
    await admin
      .from("talent_conversations")
      .update({
        stage: isCompleted ? "completed" : "chat",
        updated_at: now,
      })
      .eq("id", conversationId)
      .eq("user_id", userId);
  };

  const [
    profile,
    currentInsights,
    talentSetting,
    additionalQuestionSelectionCount,
    onboardingCompletionEvent,
    fetchedPendingOpportunityFeedbackContext,
    recentActivitySummaries,
  ] = await Promise.all([
    fetchTalentUserProfile({ admin, userId }),
    fetchTalentInsights({ admin, userId }),
    fetchTalentSetting({ admin, userId }),
    countAdditionalOnboardingQuestionSelections({
      admin,
      conversationId,
    }),
    fetchLatestTalentActivityEvent({
      admin,
      conversationId,
      eventType: "onboarding_completed",
      userId,
    }),
    explicitPendingOpportunityFeedbackContext === undefined
      ? fetchPendingOpportunityFeedbackPromptContext({
          admin,
          conversationId,
          limit: 10,
          userId,
        })
      : Promise.resolve(explicitPendingOpportunityFeedbackContext),
    fetchRecentTalentActivitySummaries({
      admin,
      limit: 5,
      userId,
    }),
  ]);

  const structuredProfile = await fetchTalentStructuredProfile({
    admin,
    userId,
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
  const shouldAutoExtractInsights = !Boolean(talentSetting?.is_onboarding_done);
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
          logPrefix: "TalentChatTurn",
          sourceChannel:
            requestChannel === "voice" ? "voice_call" : "text_chat",
          userId,
        })
      : Promise.resolve(0);

  let insertedUserMessage: TalentMessageRow | null = null;
  const normalizedContent = link
    ? `${rawUserMessage}\n\n참고 링크: ${link}`
    : rawUserMessage;

  if (rawUserMessage) {
    const { data, error } = await admin
      .from("talent_messages")
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "user",
        content: normalizedContent,
        message_type: "chat",
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message ?? "Failed to insert user message");
    }
    insertedUserMessage = data as TalentMessageRow;
    summarizeConversationInBackground({
      maxToMessageId: insertedUserMessage.id - 1,
    });
  }

  const userTurnCount = await countUserChatTurns({ admin, conversationId });
  const currentProgressStep = Math.min(
    userTurnCount,
    TALENT_INTERVIEW_FINAL_STEP
  );
  const recentMessages = await fetchRecentMessagesWithSummary({
    admin,
    conversationId,
    recentLimit: 12,
    userId,
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
  const assistantTurnMessages = [...llmMessages];
  if (
    !rawUserMessage &&
    proactiveContext &&
    assistantTurnMessages[assistantTurnMessages.length - 1]?.role !== "user"
  ) {
    assistantTurnMessages.push({
      role: "user",
      content: [
        "[Application-triggered follow-up]",
        "Use the runtime context above to write the next assistant message now.",
        "Do not mention this application event.",
      ].join("\n"),
    });
  }

  const toolSelection = resolveCareerChatTools({
    additionalQuestionSelectionCount,
    allowedToolNames: args.allowedToolNames,
    channel: requestChannel,
    isOnboardingDone: talentSetting?.is_onboarding_done,
  });
  const toolDefinitions = toolSelection.tools;
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
    pendingOpportunityFeedbackContext: fetchedPendingOpportunityFeedbackContext,
    profile,
    proactiveTurnInstruction: proactiveContext,
    recentActivitySummaries,
    structuredProfileText,
    toolNames: toolSelection.toolNames,
  });

  const preparedCompanySnapshotRef: {
    current: CompanySnapshotToolResult | null;
  } = { current: null };
  const selectedAdditionalQuestionRef: {
    current: string | null;
  } = { current: null };
  let thinkingLogs: string[] = [];
  let autoRecommendationAttemptedAfterProfileUpdate = false;
  const canAutoRecommendJobPostings = toolDefinitions.some(
    (tool) => tool.function.name === TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS
  );
  const recordThinkingLog = (status: string) => {
    const previousLast = thinkingLogs[thinkingLogs.length - 1];
    thinkingLogs = appendThinkingLog(thinkingLogs, status);
    const currentLast = thinkingLogs[thinkingLogs.length - 1];
    if (currentLast && currentLast !== previousLast) {
      onThinkingLog?.(currentLast);
    }
  };
  const recordRecommendationStatus = (
    status: RecommendJobPostingStatus,
    options?: { persist?: boolean }
  ) => {
    onRecommendationStatus?.(status);
    if (options?.persist) {
      thinkingLogs = appendRecommendationStatusLog(thinkingLogs, status);
    }
  };
  const scheduleInsightExtractionForAssistantMessage = async (payload: {
    content: string;
    messageId: number | string | null | undefined;
  }) => {
    if (!shouldAutoExtractInsights || !payload.content.trim()) {
      return;
    }

    const runBackgroundInsightExtraction = async () => {
      try {
        await extractTurnInsights(payload.content);
      } catch (error) {
        console.error("[TalentChatTurn] Failed to extract insights", {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
          messageId: payload.messageId ?? null,
          userId,
        });
      }
    };

    try {
      if (inlineInsightExtraction) {
        await runBackgroundInsightExtraction();
      } else {
        after(runBackgroundInsightExtraction);
      }
    } catch {
      if (inlineInsightExtraction) {
        await runBackgroundInsightExtraction();
      } else {
        void runBackgroundInsightExtraction();
      }
    }
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
          userMessageId: insertedUserMessage?.id ?? null,
          userId,
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
      return executeRecommendJobPostings(toolArgs.input);
    }

    const result = await executeTalentTool({
      context: {
        admin,
        conversationId,
        userMessageId: insertedUserMessage?.id ?? null,
        userId,
      },
      logging: false,
      name: toolArgs.name,
      input: toolArgs.input,
    });

    if (
      toolArgs.name === TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE &&
      canAutoRecommendJobPostings &&
      shouldAutoRecommendAfterProfileUpdate(result)
    ) {
      const profileUpdateResult = result as Record<string, unknown>;
      const request = buildAutoRecommendationRequest({
        latestUserMessage: normalizedContent || proactiveContext,
        profileUpdateResult,
      });
      autoRecommendationAttemptedAfterProfileUpdate = true;
      recordThinkingLog(
        "변경된 추천 조건을 반영해 새 채용공고를 찾고 있습니다."
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

  const assistantText = await runCareerChatAssistant({
    onToolStart: ({ name }) => {
      if (name === TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS) {
        recordRecommendationStatus({ state: "running" });
        return;
      }

      const status = getToolStartThinkingLog(name);
      if (status) {
        recordThinkingLog(status);
      }
    },
    executeTool: async ({ name, input }) => {
      const { _uiStatusMessage: rawStatus, ...toolInput } = input;
      const status =
        typeof rawStatus === "string"
          ? rawStatus.replace(/\s+/g, " ").trim().slice(0, 160)
          : "";
      if (status) {
        recordThinkingLog(status);
      }

      if (name === TALENT_TOOL_NAMES.RESEARCH_COMPANY) {
        await insertTalentToolUsageLog({
          admin,
          name,
          userId,
        });

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
              user_id: userId,
            })
            .select("*")
            .single();
          if (cacheMessageError || !cacheMessage) {
            throw new Error(
              cacheMessageError?.message ??
                "Failed to insert company_snapshot result message."
            );
          }
          await touchConversationIfAllowed();
          preparedCompanySnapshotRef.current = {
            messages: [
              toTalentMessageResponse(cacheMessage as TalentMessageRow),
            ],
          };
          return { ok: true, cached: true };
        }

        const result = await getOrCreateCompanySnapshot({
          admin,
          companyName,
          reason: optionalToolString(toolInput.reason),
          userId,
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
              user_id: userId,
            })
            .select("*")
            .single();
        if (researchMessageError || !researchMessage) {
          throw new Error(
            researchMessageError?.message ??
              "Failed to insert company_snapshot result message."
          );
        }
        await touchConversationIfAllowed();
        preparedCompanySnapshotRef.current = {
          messages: [
            toTalentMessageResponse(researchMessage as TalentMessageRow),
          ],
        };
        return { ok: true, cached: result.reused };
      }

      return executeDefaultTalentTool({ name, input: toolInput });
    },
    messages: assistantTurnMessages,
    stopAfterToolNames: toolSelection.stopAfterToolNames,
    systemBlocks: promptBlocks,
    tools: toolDefinitions,
  });

  const progress = {
    answeredCount: userTurnCount,
    targetCount: TALENT_INTERVIEW_FINAL_STEP,
    completed: false,
    currentStep: currentProgressStep,
  };

  const buildResult = async (
    assistantMessages: TalentMessageResponse[],
    options?: { completed?: boolean; opportunityRun?: typeof activeRun | null }
  ): Promise<CareerChatTurnResult> => {
    const profileSnapshot = await buildTalentProfileSnapshot({
      admin,
      userId,
    });
    const completed = options?.completed === true;
    const responseMessages = await attachPostingPreviewsToMessages({
      admin,
      messages: assistantMessages,
      userId,
    });
    const assistantMessage =
      responseMessages.find(
        (message) =>
          assistantMessages[assistantMessages.length - 1] &&
          message.id === assistantMessages[assistantMessages.length - 1].id
      ) ??
      responseMessages[responseMessages.length - 1] ??
      null;

    return {
      ok: true,
      assistantMessage,
      assistantMessages: responseMessages,
      completed,
      noMessage: responseMessages.length === 0,
      opportunityDiscoveryQueued: Boolean(options?.opportunityRun),
      opportunityRun: serializeOpportunityRun(
        options?.opportunityRun ?? activeRun
      ),
      progress: {
        ...progress,
        completed,
      },
      userMessage: insertedUserMessage
        ? toTalentMessageResponse(insertedUserMessage)
        : null,
      ...profileSnapshot,
    };
  };

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
    await scheduleInsightExtractionForAssistantMessage({
      content: preparedAssistantText,
      messageId: preparedMessageId,
    });
    const finalThinkingLogs = thinkingLogs;
    const messagesWithThinkingLogs = attachThinkingLogsToLastMessage(
      preparedCompanySnapshot.messages,
      finalThinkingLogs
    );
    if (finalThinkingLogs.length > 0) {
      await persistThinkingLogsForMessage({
        admin,
        conversationId,
        messageId: preparedMessageId,
        thinkingLogs: finalThinkingLogs,
        userId,
      });
    }
    summarizeConversationInBackground();
    return buildResult(messagesWithThinkingLogs);
  }

  let assistantTextSource =
    selectedAdditionalQuestionRef.current ?? assistantText.trim();
  if (!assistantTextSource && !noMessageMarker) {
    assistantTextSource = (
      await recoverCareerChatAssistantText({
        latestUserMessage: normalizedContent || proactiveContext,
        messages: assistantTurnMessages,
        systemBlocks: promptBlocks,
      })
    ).trim();
  }
  const normalizedNoMessageContent = normalizeNoMessageContent(
    assistantTextSource,
    noMessageMarker
  );
  if (!normalizedNoMessageContent && noMessageMarker) {
    const profileSnapshot = await buildTalentProfileSnapshot({
      admin,
      userId,
    });
    return {
      ok: true,
      assistantMessage: null,
      assistantMessages: [],
      completed: false,
      noMessage: true,
      opportunityDiscoveryQueued: false,
      opportunityRun: serializeOpportunityRun(activeRun),
      progress,
      userMessage: insertedUserMessage
        ? toTalentMessageResponse(insertedUserMessage)
        : null,
      ...profileSnapshot,
    };
  }

  if (!normalizedNoMessageContent) {
    throw new Error(
      "Career assistant returned no visible text after recovery."
    );
  }

  let assistantTextWithMarkers = normalizedNoMessageContent;
  const completion = resolveTalentOnboardingCompletion({
    assistantContent: assistantTextWithMarkers,
  });
  let safeAssistantText = stripTalentOnboardingCompletionMarker(
    assistantTextWithMarkers
  );
  if (!safeAssistantText) {
    const recoveredText = (
      await recoverCareerChatAssistantText({
        latestUserMessage: normalizedContent || proactiveContext,
        messages: assistantTurnMessages,
        systemBlocks: promptBlocks,
      })
    ).trim();
    if (!recoveredText) {
      throw new Error(
        "Career assistant returned only control markers after recovery."
      );
    }
    assistantTextWithMarkers = completion.completed
      ? `${recoveredText}\n\n${TALENT_ONBOARDING_DONE_MARKER}`
      : recoveredText;
    safeAssistantText = stripTalentOnboardingCompletionMarker(
      assistantTextWithMarkers
    );
  }

  if (shouldInsertAssistantMessage && !(await shouldInsertAssistantMessage())) {
    const profileSnapshot = await buildTalentProfileSnapshot({
      admin,
      userId,
    });
    return {
      ok: true,
      assistantMessage: null,
      assistantMessages: [],
      completed: false,
      noMessage: true,
      opportunityDiscoveryQueued: false,
      opportunityRun: serializeOpportunityRun(activeRun),
      progress,
      userMessage: insertedUserMessage
        ? toTalentMessageResponse(insertedUserMessage)
        : null,
      ...profileSnapshot,
    };
  }

  const { data: insertedAssistantMessage, error: assistantError } = await admin
    .from("talent_messages")
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      role: "assistant",
      content: safeAssistantText,
      message_type: assistantMessageType,
      thinking_logs: thinkingLogs,
    })
    .select("*")
    .single();

  if (assistantError) {
    throw new Error(
      assistantError.message ?? "Failed to insert assistant message"
    );
  }

  await scheduleInsightExtractionForAssistantMessage({
    content: safeAssistantText,
    messageId: insertedAssistantMessage.id,
  });
  const finalAssistantThinkingLogs = thinkingLogs;
  summarizeConversationInBackground();

  const isCompleted = Boolean(insertedUserMessage && completion.completed);
  const shouldApplyCompletion = isCompleted && !skipConversationWrites;
  await updateConversationStageIfAllowed(isCompleted);

  const completedOpportunityRun =
    shouldApplyCompletion && completion.reason
      ? await completeOnboardingAndQueueInitialOpportunityRun({
          admin,
          completionReason: completion.reason,
          conversationId,
          source: "career_chat_completion",
          userId,
        })
      : null;
  if (completedOpportunityRun) {
    startOpportunityDiscoveryInBackground(completedOpportunityRun.id);
  }
  const completionMessages =
    shouldApplyCompletion && insertedUserMessage
      ? await createOnboardingCompletionMessages({
          admin,
          conversationId,
          latestUserMessageId: insertedUserMessage.id,
          userId,
        })
      : null;
  const insertedCompletionWrapupMessage =
    completionMessages?.wrapupMessage ?? null;
  const insertedCompletionNextStepsMessage =
    completionMessages?.nextStepsMessage ?? null;

  return buildResult(
    [
      {
        ...toTalentMessageResponse(
          insertedAssistantMessage as TalentMessageRow
        ),
        thinkingLogs: finalAssistantThinkingLogs,
      },
      insertedCompletionWrapupMessage
        ? toTalentMessageResponse(insertedCompletionWrapupMessage)
        : null,
      insertedCompletionNextStepsMessage
        ? toTalentMessageResponse(insertedCompletionNextStepsMessage)
        : null,
    ].filter((message): message is TalentMessageResponse => message !== null),
    {
      completed: shouldApplyCompletion,
      opportunityRun: completedOpportunityRun,
    }
  );
}
