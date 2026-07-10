import { after } from "next/server";
import {
  buildCareerInsightExtractionPrompt,
  buildCareerConversationPromptPlan,
} from "@/lib/career/prompts";
import {
  recoverCareerChatAssistantText,
  runCareerChatAssistant,
} from "@/lib/career/llm";
import {
  buildTalentProfileContext,
  countUserChatTurns,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getCareerOnboardingChecklistCoverage,
  getOnboardingChecklistCoverageStats,
  normalizeTalentEngagementTypes,
  normalizeTalentInsightContent,
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
  withTalentToolAssistantInstruction,
} from "@/lib/talentOnboarding/tools";
import { fetchActiveInternalFitHoldQuestion } from "@/lib/talentOnboarding/internalFitHoldQuestion";
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
import {
  fetchRecentRecommendedOpportunitiesForPrompt,
  fetchTalentPostingCardsByRoleIds,
  formatRecentRecommendedOpportunitiesForPrompt,
  type TalentOpportunityHistoryItem,
} from "@/lib/talentOpportunity";
import {
  ensureStandalonePostingLinksInText,
  extractPostingRoleIdsFromText,
  normalizePostingRoleIds,
} from "@/lib/career/postingLinks";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
import { careerT } from "@/lib/career/translatedCareerMessage";
import {
  COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
  fetchRecentCompanySnapshot,
  formatCompanySnapshotMessage,
  getOrCreateCompanySnapshot,
  touchConversation,
} from "@/lib/career/companySnapshot";
import { withIsMobile } from "@/lib/requestDevice";
import {
  sanitizeSingleLineDbText,
  stripPostgresUnsafeChars,
} from "@/lib/textSanitization";
import { notifyUnsupportedUnicodeEscapeError } from "@/lib/errorAlert";
import { OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE } from "@/lib/officialJobs";

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
  isMobile?: boolean | null;
  link?: string | null;
  noMessageMarker?: string;
  onRecommendationStatus?: (status: RecommendJobPostingStatus) => void;
  onThinkingLog?: (status: string) => void;
  pendingOpportunityFeedbackContext?: string | null;
  proactiveContext?: string | null;
  shouldInsertAssistantMessage?: () => Promise<boolean>;
  skipConversationWrites?: boolean;
  usageLabel?: string;
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
    engagementTypes: string[];
    getExternalRecommendation: boolean;
    getInternalRecommendation: boolean;
    isOnboardingDone: boolean;
    periodicIntervalDays: number | null;
    recommendationBatchSize: number | null;
  };
  insightUpdatedAt: string | null;
  preferencesUpdatedAt: string | null;
};

const optionalToolString = (value: unknown) => {
  const text =
    typeof value === "string" ? stripPostgresUnsafeChars(value).trim() : "";
  return text || null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractRecommendationPostingRoleIds(result: unknown) {
  if (!isRecord(result)) return [];

  const roleIdsFromResult = Array.isArray(result.postingRoleIds)
    ? result.postingRoleIds
    : [];
  const roleIdsFromDraft =
    typeof result.answerDraft === "string"
      ? extractPostingRoleIdsFromText(result.answerDraft)
      : [];

  return normalizePostingRoleIds([...roleIdsFromResult, ...roleIdsFromDraft]);
}

function appendThinkingLog(logs: string[], status: string) {
  const normalized = stripPostgresUnsafeChars(status)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
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

function getToolStartThinkingLog(toolName: string, locale?: string | null) {
  switch (toolName) {
    case TALENT_TOOL_NAMES.UPDATE_SETTING:
      return careerT(
        locale,
        "career.chat.tool.update_setting.start",
        "추천 발송 설정을 업데이트하고 있습니다."
      );
    case TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE:
      return careerT(
        locale,
        "career.chat.tool.update_talent_profile.start",
        "프로필 정보를 업데이트하고 있습니다."
      );
    case TALENT_TOOL_NAMES.OPEN_URL:
      return careerT(
        locale,
        "career.chat.tool.open_url.start",
        "공유된 링크 내용을 확인하고 있습니다."
      );
    case TALENT_TOOL_NAMES.RESEARCH_COMPANY:
      return careerT(
        locale,
        "career.chat.tool.research_company.start",
        "회사 정보를 확인하고 있습니다."
      );
    case TALENT_TOOL_NAMES.REQUEST_INTERNAL_ROLE_PRIORITY_REVIEW:
      return careerT(
        locale,
        "career.chat.tool.request_internal_role_priority_review.start",
        "포지션 우선 검토 요청을 저장하고 있습니다."
      );
    default:
      return "";
  }
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
  return {
    talentPreferences: {
      engagementTypes: normalizeTalentEngagementTypes(
        setting?.engagement_types ?? []
      ),
      getExternalRecommendation: setting?.get_external_recommendation ?? true,
      getInternalRecommendation: true,
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
  const isMobile = args.isMobile;
  const skipConversationWrites = Boolean(args.skipConversationWrites);
  const rawUserMessage = stripPostgresUnsafeChars(
    String(args.userMessage ?? "")
  ).trim();
  const link = sanitizeSingleLineDbText(args.link, 2000) ?? "";
  const explicitPendingOpportunityFeedbackContext =
    args.pendingOpportunityFeedbackContext === undefined
      ? undefined
      : stripPostgresUnsafeChars(
          String(args.pendingOpportunityFeedbackContext ?? "")
        ).trim();
  const proactiveContext = stripPostgresUnsafeChars(
    String(args.proactiveContext ?? "")
  ).trim();

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
    onboardingCompletionEvent,
    officialJobSignupIntentEvent,
    fetchedPendingOpportunityFeedbackContext,
    recentActivitySummaries,
    recentRecommendedOpportunities,
  ] = await Promise.all([
    fetchTalentUserProfile({ admin, userId }),
    fetchTalentInsights({ admin, userId }),
    fetchTalentSetting({ admin, userId }),
    fetchLatestTalentActivityEvent({
      admin,
      conversationId,
      eventType: "onboarding_completed",
      userId,
    }),
    fetchLatestTalentActivityEvent({
      admin,
      eventType: OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE,
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
    fetchRecentRecommendedOpportunitiesForPrompt({
      admin,
      limit: 10,
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
  const recentRecommendedOpportunitiesText =
    formatRecentRecommendedOpportunitiesForPrompt(
      recentRecommendedOpportunities
    );

  const currentInsightContent = (currentInsights?.content ?? null) as Record<
    string,
    string
  > | null;
  const responseLocale = talentSetting?.preferred_locale ?? null;
  const onboardingChecklistCoverage = !Boolean(
    talentSetting?.is_onboarding_done
  )
    ? await getCareerOnboardingChecklistCoverage({
        admin,
        conversationId,
        currentInsightContent,
        userId,
      })
    : null;
  const shouldAutoExtractInsights = !Boolean(talentSetting?.is_onboarding_done);
  const canUseInternalFitHoldQuestionTool =
    !Array.isArray(args.allowedToolNames) ||
    args.allowedToolNames.includes(
      TALENT_TOOL_NAMES.RECORD_INTERNAL_FIT_REEVALUATION_INFORMATION
    );
  const activeInternalFitHoldQuestion =
    talentSetting?.is_onboarding_done &&
    talentSetting.profile_visibility !== "dont_share" &&
    canUseInternalFitHoldQuestionTool
      ? await fetchActiveInternalFitHoldQuestion({ admin, userId })
      : null;
  const extractTurnInsights = (assistantContent: string) =>
    shouldAutoExtractInsights
      ? extractAndPersistChatInsights({
          admin,
          assistantContent,
          buildPrompt: (promptArgs) =>
            buildCareerInsightExtractionPrompt({
              currentChecklistCoverage: promptArgs.currentChecklistCoverage,
              currentInsightContent: promptArgs.currentInsightContent,
              onboardingChecklistContext: promptArgs.onboardingChecklistContext,
              preferredLocale: responseLocale,
            }),
          conversationId,
          currentInsightContent,
          logPrefix: "TalentChatTurn",
          onboardingChecklistContext: profile,
          sourceChannel:
            requestChannel === "voice" ? "voice_call" : "text_chat",
          userId,
        })
      : Promise.resolve(0);

  let insertedUserMessage: TalentMessageRow | null = null;
  const normalizedContent = link
    ? `${rawUserMessage}\n\nReference link: ${link}`
    : rawUserMessage;

  if (rawUserMessage) {
    const { data, error } = await admin
      .from("talent_messages")
      .insert(
        withIsMobile(
          {
            conversation_id: conversationId,
            user_id: userId,
            role: "user",
            content: normalizedContent,
            message_type: "chat",
          },
          isMobile
        )
      )
      .select("*")
      .single();

    if (error) {
      await notifyUnsupportedUnicodeEscapeError({
        conversationId,
        error,
        metadata: {
          assistantMessageType,
          channel: requestChannel,
          hasLink: Boolean(link),
          normalizedContentLength: normalizedContent.length,
        },
        route: "runCareerChatTurn",
        stage: "talent_messages.insert:user_message",
        userId,
      });
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
    activeInternalFitHoldQuestion: Boolean(activeInternalFitHoldQuestion),
    allowedToolNames: args.allowedToolNames,
    channel: requestChannel,
    isOnboardingDone: talentSetting?.is_onboarding_done,
    responseLocale,
  });
  const toolDefinitions = toolSelection.tools;
  const currentPreferences = {
    getExternalRecommendation:
      talentSetting?.get_external_recommendation ?? true,
    periodicIntervalDays: talentSetting
      ? normalizeTalentPeriodicIntervalDays(
          talentSetting.periodic_interval_days
        )
      : null,
    preferredLocale: responseLocale,
    profileVisibility: talentSetting?.profile_visibility ?? null,
    recommendationBatchSize: talentSetting
      ? normalizeTalentRecommendationBatchSize(
          talentSetting.recommendation_batch_size
        )
      : null,
    talentSettingStatus: talentSetting?.status ?? null,
  };
  const serializedActiveRun = serializeOpportunityRun(activeRun);
  const opportunityStatus = activeRun
    ? {
        activeRunCreatedAt: activeRun.created_at ?? null,
        activeRunStatus: activeRun.status ?? null,
        isInitialSearchRunning:
          Boolean(serializedActiveRun?.inputLocked) &&
          activeRun.run_mode === "initial",
        onboardingCompletedAt: onboardingCompletionEvent?.created_at ?? null,
      }
    : onboardingCompletionEvent
      ? {
          onboardingCompletedAt: onboardingCompletionEvent.created_at,
        }
      : null;

  const { isOnboardingActive, promptBlocks } =
    buildCareerConversationPromptPlan({
      activeInternalFitHoldQuestion,
      channel: "chat",
      currentInsightContent,
      currentPreferences,
      isOnboardingDone: talentSetting?.is_onboarding_done,
      officialJobSignupIntentPrompt: talentSetting?.is_onboarding_done
        ? null
        : officialJobSignupIntentEvent?.summary,
      onboardingChecklistCoverage,
      opportunityStatus,
      pendingOpportunityFeedbackContext:
        fetchedPendingOpportunityFeedbackContext,
      profile,
      runtimeInstruction: proactiveContext,
      recentActivitySummaries,
      recentRecommendedOpportunitiesText,
      structuredProfileText,
      toolNames: toolSelection.toolNames,
    });

  const preparedCompanySnapshotRef: {
    current: CompanySnapshotToolResult | null;
  } = { current: null };
  let thinkingLogs: string[] = [];
  let pendingRecommendationPostingRoleIds: string[] = [];
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
  const rememberRecommendationPostingRoleIds = (result: unknown) => {
    pendingRecommendationPostingRoleIds = normalizePostingRoleIds([
      ...pendingRecommendationPostingRoleIds,
      ...extractRecommendationPostingRoleIds(result),
    ]);
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
          isMobile,
          responseLocale,
          userMessageId: insertedUserMessage?.id ?? null,
          userId,
        },
        name: TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS,
        input,
      });
      rememberRecommendationPostingRoleIds(result);
      const recommendationResult = isRecord(result) ? result : {};
      const completedStatus: RecommendJobPostingStatus = {
        candidateCount:
          typeof recommendationResult.candidateCount === "number"
            ? recommendationResult.candidateCount
            : null,
        recommendationCount:
          typeof recommendationResult.recommendationCount === "number"
            ? recommendationResult.recommendationCount
            : null,
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
    if (toolArgs.name === TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS) {
      return executeRecommendJobPostings(toolArgs.input);
    }

    return executeTalentTool({
      context: {
        admin,
        conversationId,
        isMobile,
        responseLocale,
        userMessageId: insertedUserMessage?.id ?? null,
        userId,
      },
      logging: false,
      name: toolArgs.name,
      input: toolArgs.input,
    });
  };

  const assistantText = await runCareerChatAssistant({
    onToolStart: ({ name }) => {
      if (name === TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS) {
        recordRecommendationStatus({ state: "running" });
        return;
      }

      const status = getToolStartThinkingLog(name, responseLocale);
      if (status) {
        recordThinkingLog(status);
      }
    },
    executeTool: async ({ name, input }) => {
      const { _uiStatusMessage: rawStatus, ...toolInput } = input;
      const status =
        typeof rawStatus === "string"
          ? stripPostgresUnsafeChars(rawStatus)
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 160)
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
          preferredLocale: responseLocale,
        });
        if (cachedSnapshot) {
          const messageContent = stripPostgresUnsafeChars(
            formatCompanySnapshotMessage({
              preferredLocale: responseLocale,
              reused: true,
              snapshot: cachedSnapshot,
            })
          );
          const { data: cacheMessage, error: cacheMessageError } = await admin
            .from("talent_messages")
            .insert(
              withIsMobile(
                {
                  content: messageContent,
                  conversation_id: conversationId,
                  message_type: COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
                  role: "assistant",
                  user_id: userId,
                },
                isMobile
              )
            )
            .select("*")
            .single();
          if (cacheMessageError || !cacheMessage) {
            await notifyUnsupportedUnicodeEscapeError({
              conversationId,
              error: cacheMessageError,
              metadata: {
                companyName,
                messageContentLength: messageContent.length,
                reusedSnapshot: true,
              },
              route: "runCareerChatTurn",
              stage: "talent_messages.insert:company_snapshot_cached",
              userId,
            });
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
          return withTalentToolAssistantInstruction({
            ok: true,
            cached: true,
          });
        }

        const result = await getOrCreateCompanySnapshot({
          admin,
          companyName,
          preferredLocale: responseLocale,
          reason: optionalToolString(toolInput.reason),
          userId,
        });
        const messageContent = stripPostgresUnsafeChars(
          formatCompanySnapshotMessage({
            preferredLocale: responseLocale,
            reused: result.reused,
            snapshot: result.snapshot,
          })
        );
        const { data: researchMessage, error: researchMessageError } =
          await admin
            .from("talent_messages")
            .insert(
              withIsMobile(
                {
                  content: messageContent,
                  conversation_id: conversationId,
                  message_type: COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
                  role: "assistant",
                  user_id: userId,
                },
                isMobile
              )
            )
            .select("*")
            .single();
        if (researchMessageError || !researchMessage) {
          await notifyUnsupportedUnicodeEscapeError({
            conversationId,
            error: researchMessageError,
            metadata: {
              companyName,
              messageContentLength: messageContent.length,
              reusedSnapshot: result.reused,
            },
            route: "runCareerChatTurn",
            stage: "talent_messages.insert:company_snapshot",
            userId,
          });
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
        return withTalentToolAssistantInstruction({
          ok: true,
          cached: result.reused,
        });
      }

      return executeDefaultTalentTool({ name, input: toolInput });
    },
    isOnboardingActive,
    messages: assistantTurnMessages,
    responseLocale,
    stopAfterToolNames: toolSelection.stopAfterToolNames,
    systemBlocks: promptBlocks,
    tools: toolDefinitions,
    usageLabel: args.usageLabel,
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

  let assistantTextSource = assistantText.trim();
  if (!assistantTextSource && !noMessageMarker) {
    assistantTextSource = (
      await recoverCareerChatAssistantText({
        latestUserMessage: normalizedContent || proactiveContext,
        messages: assistantTurnMessages,
        responseLocale,
        systemBlocks: promptBlocks,
        usageLabel: args.usageLabel,
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
  let safeAssistantText = stripPostgresUnsafeChars(
    stripTalentOnboardingCompletionMarker(assistantTextWithMarkers)
  );
  if (!safeAssistantText) {
    const recoveredText = (
      await recoverCareerChatAssistantText({
        latestUserMessage: normalizedContent || proactiveContext,
        messages: assistantTurnMessages,
        responseLocale,
        systemBlocks: promptBlocks,
        usageLabel: args.usageLabel,
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
    safeAssistantText = stripPostgresUnsafeChars(
      stripTalentOnboardingCompletionMarker(assistantTextWithMarkers)
    );
  }
  safeAssistantText = ensureStandalonePostingLinksInText(
    safeAssistantText,
    pendingRecommendationPostingRoleIds
  );

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
    .insert(
      withIsMobile(
        {
          conversation_id: conversationId,
          user_id: userId,
          role: "assistant",
          content: safeAssistantText,
          message_type: assistantMessageType,
          thinking_logs: thinkingLogs,
        },
        isMobile
      )
    )
    .select("*")
    .single();

  if (assistantError) {
    await notifyUnsupportedUnicodeEscapeError({
      conversationId,
      error: assistantError,
      metadata: {
        assistantMessageType,
        assistantTextLength: safeAssistantText.length,
        channel: requestChannel,
        thinkingLogCount: thinkingLogs.length,
      },
      route: "runCareerChatTurn",
      stage: "talent_messages.insert:assistant_message",
      userId,
    });
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

  const latestChecklistCoverage = !Boolean(talentSetting?.is_onboarding_done)
    ? await getCareerOnboardingChecklistCoverage({
        admin,
        conversationId,
        currentInsightContent: normalizeTalentInsightContent(
          (await fetchTalentInsights({ admin, userId }))?.content ?? null
        ),
        userId,
      })
    : null;
  const checklistCompleted =
    latestChecklistCoverage &&
    getOnboardingChecklistCoverageStats(latestChecklistCoverage, profile)
      .isComplete;
  const resolvedCompletion = completion.completed
    ? completion
    : checklistCompleted
      ? {
          completed: true,
          reason: "question_checklist_covered" as const,
        }
      : completion;
  const isCompleted = Boolean(
    insertedUserMessage && resolvedCompletion.completed
  );
  const shouldApplyCompletion = isCompleted && !skipConversationWrites;
  await updateConversationStageIfAllowed(isCompleted);

  const completedOpportunityRun =
    shouldApplyCompletion && resolvedCompletion.reason
      ? await completeOnboardingAndQueueInitialOpportunityRun({
          admin,
          completionReason: resolvedCompletion.reason,
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
          isMobile,
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
