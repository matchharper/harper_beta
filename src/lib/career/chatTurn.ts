import { hasDeliveredCareerContact } from "./background/contactHistory";
import { createCareerAssistantMessageWriter } from "./assistantMessageWriter";
import { readCareerConversationVersion } from "./conversationVersion";
import { readCareerReengagementOpportunities, REENGAGEMENT_OPPORTUNITY_PRELOAD } from "./reengagementOpportunities";
import { createCareerFormPresenter } from "./forms/server";
import { watchCareerTurnCancellation } from "./turnCancellation.server";
import { prepareCareerAgentTurn } from "./agentTurnRuntime.server";
import { readCareerSourceTextChatModel, resolveCareerTextChatModel, type CareerTextChatModelId } from "./textChatModelConfig";
import { readCareerConversationTextChatModel } from "./conversationTextChatModel.server";
import type { CareerReplyCheckpoint } from "./capabilities/runtime";
import { throwIfToolControlError } from "@/lib/llm/toolError";
import { isCareerCapabilityTurn, readCareerCapabilityCoaching } from "@/lib/career/capabilities/server";
import { getCareerCapabilityMode } from "@/lib/career/capabilities/registry";
import { initialCareerCapabilityPayload } from "@/lib/career/capabilities/lease";
import { hydrateMockInterviewOffers } from "@/lib/career/mockInterviewOffers.server";
import { after } from "next/server";
import type { OpenAIResponsesReasoningEffort } from "@/lib/llm/responsesChatAdapter";
import type { ChatCompletionReasoningEffort } from "@/lib/llm/llm";
import {
  buildCareerInsightExtractionPrompt,
  buildCareerConversationPromptPlan,
} from "@/lib/career/prompts";
import {
  recoverCareerChatAssistantText,
  runCareerChatAssistant,
  runCareerChatAssistantStream,
} from "@/lib/career/llm";
import { normalizeNoMessageContent } from "@/lib/career/noMessageContent";
import {
  buildTalentProfileContext,
  buildTalentMemoryRetrievalQuery,
  countUserChatTurns,
  fetchAllTalentContexts,
  fetchTalentContextPromptSnapshot,
  fetchTalentContextsUpdatedAt,
  fetchRecentMessages,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentDocuments,
  serializeTalentDocuments,
  fetchTalentUserProfile,
  getCareerOnboardingChecklistCoverage,
  getCareerOnboardingChecklistProgress,
  getOnboardingChecklistCoverageStats,
  normalizeTalentEngagementTypes,
  projectBriefsToLegacyInsights,
  renderTalentContextPrompt,
  toTalentContextResponse,
  toTalentMessageResponse,
  type TalentAdminClient,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import type { OnboardingChecklistProgress } from "@/lib/talentOnboarding/calls";
import {
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
} from "@/lib/talentOnboarding/recommendationSettings";
import {
  fetchRecentMessagesWithSummary,
  maybeSummarizeTalentConversation,
} from "@/lib/talentOnboarding/conversationSummary";
import { extractAndPersistChatInsights } from "@/lib/talentOnboarding/chatInsights";
import { buildSavedProfileChangesForExtractor } from "@/lib/talentOnboarding/profileChangesForExtractor";
import {
  executeTalentTool,
  TALENT_TOOL_NAMES,
} from "@/lib/talentOnboarding/tools";
import { fetchActiveInternalFitHoldQuestion } from "@/lib/talentOnboarding/internalFitHoldQuestion";
import { commitDeliveredProcessClosureNotices } from "@/lib/talentOnboarding/processClosureNotice";
import type { PendingProcessClosureNotice } from "@/lib/talentOnboarding/tools";
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
  fetchSerializedOpportunityRunForTalent,
  getActiveOpportunityRun,
  hasActiveConversationCompletedOpportunityRun,
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
import {
  formatTalentMessageContentForLlmPrompt,
  formatTalentConversationReferencesForLlm,
} from "@/lib/career/opportunityFeedbackNote";
import { stripCareerReengagementActions } from "@/lib/career/reengagementActions";
import { getCareerToolStartThinkingLog } from "@/lib/career/toolThinkingLog";
import { fetchTalentCompanyContactContext } from "@/lib/companyTalentRequests/server";
import { withIsMobile } from "@/lib/requestDevice";
import {
  sanitizeSingleLineDbText,
  stripPostgresUnsafeChars,
} from "@/lib/textSanitization";
import { notifyUnsupportedUnicodeEscapeError } from "@/lib/errorAlert";
import { OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE } from "@/lib/officialJobs";
import {
  extractRecommendJobPostingsReceipt,
  type RecommendJobPostingsReceipt,
} from "@/lib/opportunityDiscovery/onDemandJobSearch";
import {
  ensureOpportunityRunMarker,
  stripOpportunityRunMarkers,
} from "@/lib/opportunityDiscovery/messageMarker";
import { fetchActiveTalentGmailIntegration } from "@/lib/integrations/gmail";
import { fetchCareerPostOnboardingContext } from "@/lib/career/postOnboardingContext";

type TalentMessageResponse = ReturnType<typeof toTalentMessageResponse>;

export function includeCareerSourceMessage(
  recentMessages: TalentMessageRow[],
  sourceMessage?: TalentMessageRow
) {
  const messages = [...recentMessages];
  if (!sourceMessage || messages.some(row => Number(row.id) === Number(sourceMessage.id))) return messages;
  const index = messages.findIndex(row => row.message_type !== "conversation_summary" && Number(row.id) > Number(sourceMessage.id));
  messages.splice(index < 0 ? messages.length : index, 0, sourceMessage);
  return messages;
}

export type CareerChatTurnChannel = "chat" | "voice";

// Server channels can reuse the existing turn without changing the web route,
// its prompt builder, provider loop, or domain tool registry.
export type CareerTextTurnAdapter = {
  replyJobId?: string;
  /** Whether saved cards/forms themselves reach the user on this transport. */
  artifactsVisible?: boolean;
  onboardingActive?: boolean;
  sourceMessage: TalentMessageRow;
  adaptPromptBlocks: (blocks: Parameters<typeof runCareerChatAssistant>[0]["systemBlocks"]) => Parameters<typeof runCareerChatAssistant>[0]["systemBlocks"];
  adaptTools: (selection: ReturnType<typeof resolveCareerChatTools>) => ReturnType<typeof resolveCareerChatTools>;
  executeTool: (args: {
    name: string;
    input: Record<string, unknown>;
    executeDefault: () => Promise<unknown>;
  }) => Promise<unknown>;
  beforeAssistantFinalization?: () => Promise<void>;
  persistAssistant: (args: {
    content: string;
    notices: PendingProcessClosureNotice[];
    agentTurn?: ReturnType<Awaited<ReturnType<typeof prepareCareerAgentTurn>>["getCompletionPayload"]>;
  }) => Promise<TalentMessageRow>;
};

export type RunCareerChatTurnArgs = {
  inboxId?: string;
  pendingInputMessageId?: number;
  resumeDependenciesPending?: boolean;
  workId?: string;
  workRevision?: number;
  backgroundInvocation?: import("./background/types").CareerBackgroundInvocation;
  scheduleAfter?: (task: () => Promise<void>) => void;
  adapter?: CareerTextTurnAdapter;
  existingSourceMessage?: TalentMessageRow;
  agentReplyId?: string;
  sourceMessageCursor?: number;
  abortSignal?: AbortSignal;
  deadlineAt?: number;
  onAgentCheckpoint?: (checkpoint: CareerReplyCheckpoint) => Promise<void>;
  onAgentTurnStarted?: (claimId: string) => Promise<void>;
  onArtifactMessage?: (message: TalentMessageResponse) => void;
  admin: TalentAdminClient;
  assistantMessagePayload?: TalentMessageRow["payload"];
  allowedToolNames?: readonly string[] | null;
  assistantModel?: string;
  assistantAnthropicEffort?: Parameters<typeof runCareerChatAssistant>[0]["anthropicEffort"];
  textChatModel?: CareerTextChatModelId;
  assistantChatCompletionReasoningEffort?: ChatCompletionReasoningEffort;
  assistantMessagePrefix?: string | null;
  assistantOpenAIResponsesReasoningEffort?: OpenAIResponsesReasoningEffort;
  assistantTemperature?: number;
  assistantMessageType?: string;
  channel?: CareerChatTurnChannel;
  conversationId: string;
  isMobile?: boolean | null;
  link?: string | null;
  noMessageMarker?: string;
  onRecommendationStatus?: (status: RecommendJobPostingStatus) => void;
  onThinkingLog?: (status: string, logs: string[]) => void;
  onTextDelta?: (delta: string) => void | Promise<void>;
  pendingOpportunityFeedbackContext?: string | null;
  proactiveContext?: string | null;
  /** Verified application event; never persisted as user speech or authorization. */
  applicationEvent?: string;
  shouldInsertAssistantMessage?: () => Promise<boolean>;
  skipConversationWrites?: boolean;
  suppressOnboarding?: boolean;
  timeZone?: string | null;
  transformAssistantTextBeforeInsert?: (content: string) => string;
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
  onboardingChecklistProgress: OnboardingChecklistProgress | null;
  progress: {
    answeredCount: number;
    completed: boolean;
    currentStep: number;
    targetCount: number;
  };
  userMessage: TalentMessageResponse | null;
  talentInsights: Record<string, string> | null;
  talentBrief: ReturnType<typeof toTalentContextResponse>[];
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
  talentContextsUpdatedAt: string | null;
  preferencesUpdatedAt: string | null;
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

async function attachPostingPreviewsToMessages(args: {
  admin: TalentAdminClient;
  messages: TalentMessageResponse[];
  userId: string;
}) {
  args.messages = await hydrateMockInterviewOffers(args);
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



async function buildTalentProfileSnapshot(args: {
  admin: TalentAdminClient;
  conversationId: string;
  includeDocuments?: boolean;
  userId: string;
}) {
  const [setting, brief, talentContextsUpdatedAt, talentProfile] =
    await Promise.all([
      fetchTalentSetting({ admin: args.admin, userId: args.userId }),
      fetchAllTalentContexts({
        admin: args.admin,
        collection: "brief",
        userId: args.userId,
      }),
      fetchTalentContextsUpdatedAt({ admin: args.admin, userId: args.userId }),
      fetchTalentStructuredProfile({ admin: args.admin, userId: args.userId }),
    ]);
  const normalizedInsights = projectBriefsToLegacyInsights(brief);
  const onboardingChecklistProgress = !Boolean(setting?.is_onboarding_done)
    ? await getCareerOnboardingChecklistProgress({
        admin: args.admin,
        context: talentProfile.talentUser,
        conversationId: args.conversationId,
        currentInsightContent: normalizedInsights,
        userId: args.userId,
      })
    : null;

  return {
    onboardingChecklistProgress,
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
    talentInsights: normalizedInsights,
    talentBrief: brief.map(toTalentContextResponse),
    talentProfile: {
      ...talentProfile,
      ...(args.includeDocuments
        ? {
            documents: await serializeTalentDocuments({
              admin: args.admin,
              documents: await fetchTalentDocuments({
                admin: args.admin,
                userId: args.userId,
              }),
            }),
          }
        : {}),
    },
    preferencesUpdatedAt: setting?.updated_at ?? null,
    insightUpdatedAt: talentContextsUpdatedAt,
    talentContextsUpdatedAt,
  };
}

function startOpportunityDiscoveryInBackground(runId: string) {
  console.info("[opportunity-discovery] queued for harper_worker", {
    runId,
  });
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
  const requestStartedAt = Date.now();
  const scheduleAfter = args.scheduleAfter ?? after;
  const existingSourceMessage = args.adapter?.sourceMessage ?? args.existingSourceMessage;
  const sourceModel = args.assistantModel ? undefined : (
    readCareerSourceTextChatModel(existingSourceMessage?.payload) ?? (
      args.textChatModel ? resolveCareerTextChatModel(args.textChatModel)
        : existingSourceMessage ? resolveCareerTextChatModel(undefined)
        : await readCareerConversationTextChatModel({ admin, userId, conversationId })
    )
  );
  const assistantModel = args.assistantModel ?? sourceModel?.model;
  const requestChannel = args.channel === "voice" ? "voice" : "chat";
  if (existingSourceMessage && (existingSourceMessage.user_id !== userId || existingSourceMessage.conversation_id !== conversationId || existingSourceMessage.role !== "user")) {
    throw new Error("Server channel source message does not belong to this turn");
  }
  const assistantMessageType =
    String(args.assistantMessageType ?? "").trim() || "chat";
  const isMobile = args.isMobile;
  const skipConversationWrites = Boolean(args.skipConversationWrites);
  const suppressOnboarding = Boolean(args.suppressOnboarding);
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
  const assistantMessagePrefix = stripPostgresUnsafeChars(
    String(args.assistantMessagePrefix ?? "")
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
    scheduleAfter(async () => {
      try {
        await maybeSummarizeTalentConversation({
          admin,
          conversationId,
          maxToMessageId: options?.maxToMessageId,
          userId,
        });
      } catch (error) {
        console.error("[TalentChatTurn] Failed to summarize conversation", {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
          userId,
        });
      }
    });
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
    talentContextSnapshot,
    talentSetting,
    onboardingCompletionEvent,
    officialJobSignupIntentEvent,
    postOnboardingContext,
    fetchedPendingOpportunityFeedbackContext,
    recentActivitySummaries,
    recentRecommendedOpportunities,
    activeGmailIntegration,
    isConversationCompletedOpportunityRunActive,
  ] = await Promise.all([
    fetchTalentUserProfile({ admin, userId }),
    (async () => {
      const recentContextMessages = await fetchRecentMessages({
        admin,
        conversationId,
        limit: 6,
      });
      return fetchTalentContextPromptSnapshot({
        admin,
        query: buildTalentMemoryRetrievalQuery([
          ...recentContextMessages
            .slice(-5)
            .map((item) => formatTalentMessageContentForLlmPrompt(item)),
          rawUserMessage,
        ]),
        userId,
      });
    })(),
    fetchTalentSetting({ admin, userId }),
    fetchLatestTalentActivityEvent({
      admin,
      conversationId,
      eventType: "onboarding_completed",
      userId,
    }),
    fetchLatestTalentActivityEvent({
      admin,
      conversationId,
      eventType: OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE,
      userId,
    }),
    fetchCareerPostOnboardingContext({
      admin,
      conversationId,
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
    fetchActiveTalentGmailIntegration({
      admin,
      talentId: userId,
    }),
    hasActiveConversationCompletedOpportunityRun({ admin, userId }),
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

  const currentInsightContent = projectBriefsToLegacyInsights(
    talentContextSnapshot.allBriefs
  );
  const talentContextSection = renderTalentContextPrompt(talentContextSnapshot);
  // The reply language comes from the saved language only. A lasting request
  // goes through update_language_setting and a one-off request is followed by
  // the model for that reply; conversation text such as "영어로 문서 작성 가능"
  // describes the talent and must not switch the reply language.
  const responseLocale = talentSetting?.preferred_locale ?? null;
  const continuingCareer = !talentSetting?.is_onboarding_done && !suppressOnboarding &&
    await hasDeliveredCareerContact({ admin, userId, conversationId });
  const isOnboardingActiveForTurn =
    !Boolean(talentSetting?.is_onboarding_done) &&
    (!suppressOnboarding || args.adapter?.onboardingActive === true) && !continuingCareer;
  const onboardingChecklistCoverage = isOnboardingActiveForTurn
    ? await getCareerOnboardingChecklistCoverage({
        admin,
        conversationId,
        currentInsightContent,
        userId,
      })
    : null;
  const isSessionReengagement =
    (args.assistantMessagePayload as { kind?: string } | null)?.kind ===
      "session_reengagement";
  const reengagementOpportunities = isSessionReengagement && !isOnboardingActiveForTurn
    ? await readCareerReengagementOpportunities({
        admin,
        userId,
        blockedCompanies: talentSetting?.blocked_companies ?? [],
      }).catch((error) => {
        console.warn("[career] re-engagement opportunities unavailable", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        return "Saved search results could not be read for this return. Their absence is unknown; the ordinary matching tools can read current facts.";
      })
    : "";
  const turnRuntimeInstruction = [proactiveContext, args.applicationEvent, reengagementOpportunities]
    .filter(Boolean)
    .join("\n\n");
  const shouldAutoExtractInsights = isOnboardingActiveForTurn && !suppressOnboarding;
  const savedProfileChangesForExtraction = new Set<string>();
  const canUseInternalFitHoldQuestionTool = false;
  const activeInternalFitHoldQuestion =
    talentSetting?.is_onboarding_done &&
    talentSetting.profile_visibility !== "dont_share" &&
    canUseInternalFitHoldQuestionTool
      ? await fetchActiveInternalFitHoldQuestion({
          admin,
          locale: responseLocale,
          userId,
        })
      : null;
  const companyContactContext = talentSetting?.is_onboarding_done
    ? await fetchTalentCompanyContactContext({
        admin: admin as any,
        talentId: userId,
      })
    : null;
  const extractTurnInsights = (assistantContent: string) =>
    shouldAutoExtractInsights
      ? extractAndPersistChatInsights({
          admin,
          assistantContent,
          buildPrompt: (promptArgs) =>
            buildCareerInsightExtractionPrompt({
              currentChecklistCoverage: promptArgs.currentChecklistCoverage,
              onboardingChecklistContext: promptArgs.onboardingChecklistContext,
              preferredLocale: responseLocale,
            }),
          conversationId,
          logPrefix: "TalentChatTurn",
          onboardingChecklistContext: profile,
          profileChangesAlreadySaved: Array.from(
            savedProfileChangesForExtraction
          ).join("\n"),
          sourceChannel:
            requestChannel === "voice" ? "voice_call" : "text_chat",
          scheduleAfter,
          userId,
        })
      : Promise.resolve(0);

  const capabilityMode = getCareerCapabilityMode();
  const trackCapabilities = isCareerCapabilityTurn({ channel: requestChannel, isOnboardingDone: !isOnboardingActiveForTurn, allowedToolNames: args.allowedToolNames });
  const careerCoachingActivity = trackCapabilities ? await readCareerCapabilityCoaching({ admin, userId, conversationId, expire: true }) : null;
  let insertedUserMessage: TalentMessageRow | null = existingSourceMessage ?? null;
  const normalizedContent = link
    ? `${rawUserMessage}\n\nReference link: ${link}`
    : rawUserMessage;
  if (rawUserMessage && !insertedUserMessage) {
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
            ...((trackCapabilities || sourceModel) ? { payload: {
              ...(trackCapabilities ? initialCareerCapabilityPayload(capabilityMode) : {}),
              ...(sourceModel ? { careerTextChatModel: sourceModel.model } : {}),
            } } : {}),
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
    recentLimit: 16,
    pendingUserMessageId: args.inboxId ? args.pendingInputMessageId : undefined,
    userId,
  });

  // The source identifies authorization and usage; it is not a history cutoff.
  // Current Career conversation includes work delivered while an external run
  // was in flight. Email adapters retain their existing inbound-message window.
  const sourceWindow = args.inboxId ? recentMessages : includeCareerSourceMessage(
    args.adapter && !args.workId
      ? recentMessages.filter(item => Number(item.id) <= Number(args.adapter!.sourceMessage.id))
      : recentMessages,
    existingSourceMessage
  );
  const llmMessages = sourceWindow
    .filter(
      (item) =>
        item.message_type !==
          TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE &&
        item.message_type !== TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP
    )
    .map((item) => ({
      role: item.role as "user" | "assistant",
      content: formatTalentMessageContentForLlmPrompt(item, {
        includeCreatedAt: item.message_type !== "conversation_summary",
        preferredLocale: responseLocale,
        timeZone: args.timeZone,
      }),
    }))
    .filter((item) => item.content.trim().length > 0);

  if (args.applicationEvent || (isSessionReengagement && proactiveContext)) {
    // A real app event opens a new model turn after the historical transcript.
    // Ending on an assistant message would be an unsupported Claude prefill.
    // This transport message is never persisted as candidate speech/consent.
    llmMessages.push({
      role: "user",
      content: `Application event (not a user-authored message or new authorization):\n\n${args.applicationEvent || proactiveContext}`,
    });
  }

  const defaultToolSelection = resolveCareerChatTools({
    background: Boolean(args.backgroundInvocation),
    activeInternalFitHoldQuestion: Boolean(activeInternalFitHoldQuestion),
    allowedToolNames: args.allowedToolNames,
    channel: requestChannel,
    hasActiveGmailIntegration: Boolean(activeGmailIntegration),
    isOnboardingDone: !isOnboardingActiveForTurn,
    responseLocale,
  });
  const toolSelection = args.adapter?.adaptTools(defaultToolSelection) ?? defaultToolSelection;
  const gmailCapability = activeGmailIntegration
    ? toolSelection.toolNames.includes(TALENT_TOOL_NAMES.SEARCH_CONNECTED_GMAIL)
      ? ("available" as const)
      : ("connected_but_unavailable_this_turn" as const)
    : ("not_connected" as const);
  let toolDefinitions = toolSelection.tools;
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

  const capabilityPromptArgs: Parameters<typeof buildCareerConversationPromptPlan>[0] = {
      isMobile,
      careerCoachingActivity,
      conversationMode: careerCoachingActivity?.status === "active" ? "career_coaching" : "default",
      activeInternalFitHoldQuestion,
      channel: "chat",
      backgroundInvocation: Boolean(args.backgroundInvocation),
      companyTalentRequestText: companyContactContext,
      talentContextSection,
      currentPreferences,
      gmailCapability,
      isConversationCompletedOpportunityRunActive,
      isOnboardingDone: !isOnboardingActiveForTurn,
      officialJobSignupIntentPrompt: isOnboardingActiveForTurn
        ? officialJobSignupIntentEvent?.summary
        : null,
      onboardingChecklistCoverage,
      opportunityStatus,
      pendingOpportunityFeedbackContext:
        fetchedPendingOpportunityFeedbackContext,
      postOnboardingContext,
      profile,
      runtimeInstruction: [
        isSessionReengagement ? reengagementOpportunities : turnRuntimeInstruction,
        formatTalentConversationReferencesForLlm(sourceWindow, {
          preferredLocale: responseLocale,
          timeZone: args.timeZone,
        }),
      ].filter(Boolean).join("\n\n"),
      recentActivitySummaries,
      recentRecommendedOpportunitiesText,
      structuredProfileText,
      timeZone: args.timeZone,
      toolNames: toolSelection.toolNames,
    };
  const { isOnboardingActive, promptBlocks } = buildCareerConversationPromptPlan(capabilityPromptArgs);
  const capabilityTurn = trackCapabilities ? await prepareCareerAgentTurn({
    origin: "server",
    admin, userId, conversationId, sourceMessage: insertedUserMessage, mode: capabilityMode,
    eligibleTools: toolSelection.tools, promptArgs: capabilityPromptArgs,
    agentReplyId: args.agentReplyId,
    inboxId: args.inboxId,
    resumeDependenciesPending: args.resumeDependenciesPending,
    workId: args.workId,
    workRevision: args.workRevision,
    backgroundRunId: args.backgroundInvocation?.runId,
    sourceMessageCursor: args.backgroundInvocation?.sourceMessageCursor ?? args.sourceMessageCursor,
    ...(args.backgroundInvocation ? { selectionSnapshot: {
      capabilityIds: ["schedules", "career_delivery", "company_contact"],
      handbookIds: ["proactive_career"], status: "selected" as const, elapsedMs: 0,
    } } : isSessionReengagement ? { selectionSnapshot: REENGAGEMENT_OPPORTUNITY_PRELOAD } : {}),
    continuation: {
      channel: args.backgroundInvocation ? "background" : args.adapter ? "adapter" : "career",
      ...(args.assistantModel ? { assistantModel: args.assistantModel } : {}),
      ...(sourceModel ? { textChatModel: sourceModel.model } : {}),
      ...(args.backgroundInvocation ? { backgroundRunId: args.backgroundInvocation.runId, sourceMessageCursor: args.backgroundInvocation.sourceMessageCursor } : {}),
      ...(args.adapter?.replyJobId ? { emailReplyJobId: args.adapter.replyJobId } : {}),
      ...(insertedUserMessage ? { sourceMessageId: insertedUserMessage.id } : {}),
      ...(turnRuntimeInstruction ? { runtimeInstruction: turnRuntimeInstruction } : {}),
      ...(noMessageMarker ? { noMessageMarker } : {}),
    },
    abortSignal: args.abortSignal,
    // The shared server path is also used by routes with a 240-second budget.
    // Leave time to persist the transcript and hand it to the continuation queue.
    deadlineAt: args.deadlineAt ?? (args.onAgentCheckpoint ? requestStartedAt + 200_000 : undefined),
    onCheckpoint: args.onAgentCheckpoint,
    selectorInput: {
      messages: llmMessages,
      currentContext: [
        `Gmail: ${gmailCapability}.`,
        proactiveContext,
        fetchedPendingOpportunityFeedbackContext,
      ].filter(Boolean).join("\n\n"),
    },
    adaptPromptBlocks: args.adapter
      ? blocks => args.adapter!.adaptPromptBlocks(blocks) as typeof blocks
      : undefined,
  }) : undefined;
  const standaloneCancellation = !capabilityTurn && insertedUserMessage
    ? watchCareerTurnCancellation({ admin, userId, conversationId, sourceMessageId: insertedUserMessage.id }, args.abortSignal) : undefined;
  args = { ...args, abortSignal: capabilityTurn?.runtime.abortSignal ?? standaloneCancellation?.signal ?? args.abortSignal };
  let messageWriter: Awaited<ReturnType<typeof createCareerAssistantMessageWriter>> | null = null;
  try {
  if (capabilityTurn) await args.onAgentTurnStarted?.(capabilityTurn.claimId);
  await standaloneCancellation?.check();
  const initialCapabilityStep = capabilityTurn?.runtime.resolveStep(false);
  if (initialCapabilityStep) toolDefinitions = initialCapabilityStep.tools;
  const defaultSystemBlocks = initialCapabilityStep?.systemBlocks ?? promptBlocks;
  const systemBlocks = initialCapabilityStep ? defaultSystemBlocks
    : args.adapter?.adaptPromptBlocks(defaultSystemBlocks) ?? defaultSystemBlocks;

  const artifactMessages = new Map<string | number, TalentMessageResponse>();
  const onArtifactMessage = (message: TalentMessageResponse) => {
    artifactMessages.set(message.id, message);
    args.onArtifactMessage?.(message);
  };
  const formPresenter = createCareerFormPresenter(
    { admin, userId, conversationId }, onArtifactMessage,
    capabilityTurn?.replyId ?? args.agentReplyId ?? `message:${insertedUserMessage?.id}`
  );
  let documentsChanged = false;
  let thinkingLogs: string[] = [];
  let pendingRecommendationPostingRoleIds: string[] = [];
  const pendingProcessClosureNotices = new Map<string, PendingProcessClosureNotice>();
  const registerProcessClosureNotices = (notices: PendingProcessClosureNotice[]) => {
    for (const notice of notices) pendingProcessClosureNotices.set(notice.recommendationId, notice);
  };
  const recommendationReceiptRef: {
    current: RecommendJobPostingsReceipt | null;
  } = { current: null };
  const recordThinkingLog = (status: string) => {
    const previousLast = thinkingLogs[thinkingLogs.length - 1];
    thinkingLogs = appendThinkingLog(thinkingLogs, status);
    const currentLast = thinkingLogs[thinkingLogs.length - 1];
    if (currentLast && currentLast !== previousLast) {
      onThinkingLog?.(currentLast, thinkingLogs);
      void messageWriter?.logs(thinkingLogs).then(row => {
        if (row) onArtifactMessage(toTalentMessageResponse(row));
      });
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
  const persistInsightExtractionForAssistantMessage = async (payload: {
    content: string;
    messageId: number | string | null | undefined;
  }) => {
    if (!shouldAutoExtractInsights || !payload.content.trim()) {
      return;
    }

    await extractTurnInsights(payload.content);
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
          scheduleAfter,
          userMessageId: insertedUserMessage?.id ?? null,
          resumeRequestId: capabilityTurn?.replyId ?? args.agentReplyId,
          abortSignal: args.abortSignal,
          onArtifactMessage,
          userId,
        },
        name: TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS,
        input,
      });
      recommendationReceiptRef.current =
        extractRecommendJobPostingsReceipt(result);
      rememberRecommendationPostingRoleIds(result);
      if (recommendationReceiptRef.current) return result;
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
        state:
          recommendationResult.initialRecommendationPending === true
            ? "stopped"
            : "completed",
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

    const result = await executeTalentTool({
      context: {
        admin,
        conversationId,
        isMobile,
        responseLocale,
        registerProcessClosureNotices,
        scheduleAfter,
        userMessageId: capabilityTurn?.runtime.options.inputInbox?.messageIds().at(-1) ?? insertedUserMessage?.id ?? null,
        userMessageIds: capabilityTurn?.runtime.options.inputInbox?.messageIds(),
        resumeRequestId: capabilityTurn?.replyId ?? args.agentReplyId,
        backgroundInvocation: args.backgroundInvocation,
        workId: args.workId,
        workRevision: args.workRevision,
        agentClaimId: capabilityTurn?.claimId,
        abortSignal: args.abortSignal,
        deadlineAt: capabilityTurn?.runtime.deadlineAt ?? args.deadlineAt,
        onArtifactMessage,
        presentForm: formPresenter.presentForm,
        userId,
      },
      logging: false,
      name: toolArgs.name,
      input: toolArgs.input,
    });
    rememberRecommendationPostingRoleIds(result);
    if (
      shouldAutoExtractInsights &&
      toolArgs.name === TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE &&
      isRecord(result) &&
      result.ok === true
    ) {
      const savedProfileChanges = buildSavedProfileChangesForExtractor({
        input: toolArgs.input,
        result,
      });
      if (savedProfileChanges) {
        savedProfileChangesForExtraction.add(savedProfileChanges);
      }
    }
    return result;
  };

  const mergeAssistantText = !noMessageMarker && !isOnboardingActiveForTurn && !args.adapter && !args.backgroundInvocation && requestChannel === "chat" &&
    assistantMessageType === "chat" && readCareerConversationVersion(insertedUserMessage?.payload) === "professional";
  messageWriter = mergeAssistantText ? await createCareerAssistantMessageWriter({
    admin, userId, conversationId, isMobile,
    replyId: capabilityTurn?.replyId ?? args.agentReplyId ?? `message:${insertedUserMessage?.id ?? requestStartedAt}`,
    startedAt: new Date(requestStartedAt).toISOString(),
    check: async () => {
      await (capabilityTurn?.runtime.options.checkCancellation ?? standaloneCancellation?.check)?.();
      return shouldInsertAssistantMessage ? shouldInsertAssistantMessage() : true;
    },
  }) : null;
  const initialActivity = await messageWriter?.start();
  if (initialActivity) onArtifactMessage(toTalentMessageResponse(initialActivity));
  let assistantText: string;
  try {
    const assistantArgs: Omit<Parameters<typeof runCareerChatAssistant>[0], "onToolStart"> = {
      toolRuntime: capabilityTurn?.runtime,
      hasDeliveredArtifact: () => (!args.adapter || args.adapter.artifactsVisible === true) && (Array.from(artifactMessages.values()).some(message => message.messageType !== "career_turn_activity" || message.workEvents?.some(event => event.kind === "message")) || formPresenter.hasPending()),
      onAssistantMessage: args.backgroundInvocation || args.adapter ? undefined : async (text) => {
        const visibleText = normalizeNoMessageContent(text, noMessageMarker);
        if (!visibleText) return;
        const content = stripPostgresUnsafeChars(stripTalentOnboardingCompletionMarker(
          args.transformAssistantTextBeforeInsert?.(visibleText) ?? visibleText
        ));
        if (!content.trim()) return;
        if (shouldInsertAssistantMessage && !(await shouldInsertAssistantMessage())) return;
        if (messageWriter) {
          const row = await messageWriter.progress(content, thinkingLogs);
          if (row) onArtifactMessage(toTalentMessageResponse(row));
          return;
        }
        const row = args.adapter
          ? await args.adapter.persistAssistant({ content, notices: [] })
          : await (async () => {
              const { data, error } = await admin.from("talent_messages").insert(withIsMobile({
                conversation_id: conversationId, user_id: userId, role: "assistant", content,
                message_type: "chat", thinking_logs: thinkingLogs,
                payload: { ...(sourceModel ? { careerTextChatModel: sourceModel.model } : {}), workStartedAt: new Date(requestStartedAt).toISOString(), workCompletedAt: new Date().toISOString() },
              }, isMobile)).select("*").single();
              if (error || !data) throw new Error(error?.message ?? "Failed to save assistant progress");
              return data as TalentMessageRow;
            })();
        onArtifactMessage(toTalentMessageResponse(row));
        thinkingLogs = [];
      },
      abortSignal: args.abortSignal,
      executeTool: async ({ name, input }) => {
        const { _uiStatusMessage: rawStatus, ...toolInput } = input;
        const status =
          typeof rawStatus === "string"
            ? stripPostgresUnsafeChars(rawStatus)
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 160)
            : "";
        // Without Harper's own status, name what this call opens or searches.
        const shown =
          status ||
          getCareerToolStartThinkingLog(name, responseLocale, toolInput);
        if (shown) {
          recordThinkingLog(shown);
        }

        if (args.adapter) {
          return args.adapter.executeTool({
            name,
            input: toolInput,
            executeDefault: () => executeDefaultTalentTool({ name, input: toolInput }),
          });
        }


        return executeDefaultTalentTool({ name, input: toolInput });
      },
      isOnboardingActive,
      messages: llmMessages,
      ...((args.assistantChatCompletionReasoningEffort ?? sourceModel?.chatCompletionReasoningEffort)
        ? { chatCompletionReasoningEffort: args.assistantChatCompletionReasoningEffort ?? sourceModel?.chatCompletionReasoningEffort }
        : {}),
      openAIResponsesReasoningEffort:
        args.assistantOpenAIResponsesReasoningEffort ?? sourceModel?.openAIResponsesReasoningEffort,
      primaryModel: assistantModel,
      anthropicEffort: args.assistantAnthropicEffort,
      responseLocale,
      stopAfterToolNames: toolSelection.stopAfterToolNames,
      systemBlocks,
      temperature: args.assistantTemperature,
      tools: toolDefinitions,
      usageLabel: args.usageLabel,
    };
    assistantText = args.onTextDelta || (messageWriter && !args.transformAssistantTextBeforeInsert)
      ? await runCareerChatAssistantStream({
          ...assistantArgs,
          onTextDelta: async (delta) => {
            await args.onTextDelta?.(delta);
            const row = !args.transformAssistantTextBeforeInsert && await messageWriter?.delta(stripPostgresUnsafeChars(stripTalentOnboardingCompletionMarker(delta)), thinkingLogs);
            if (row) onArtifactMessage(toTalentMessageResponse(row));
          },
        })
      : await runCareerChatAssistant(assistantArgs);
  } catch (error) {
    const row = await messageWriter?.interrupt().catch(() => null);
    if (row) onArtifactMessage(toTalentMessageResponse(row));
    throwIfToolControlError(error);
    args.abortSignal?.throwIfAborted();
    const receipt = recommendationReceiptRef.current;
    if (!receipt) throw error;
    console.warn(
      "[TalentChatTurn] Falling back to deterministic recommendation receipt",
      {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
        outcome: receipt.outcome,
        runId: receipt.statusRunId,
        userId,
      }
    );
    assistantText = receipt.answerDraft;
  }

  const progress = {
    answeredCount: userTurnCount,
    targetCount: TALENT_INTERVIEW_FINAL_STEP,
    completed: false,
    currentStep: currentProgressStep,
  };

  const buildResult = async (
    assistantMessages: TalentMessageResponse[],
    options?: {
      completed?: boolean;
      opportunityRun?: typeof activeRun | null;
      opportunityDiscoveryQueued?: boolean;
      recommendationSearchRun?: ReturnType<typeof serializeOpportunityRun>;
    }
  ): Promise<CareerChatTurnResult> => {
    const profileSnapshot = await buildTalentProfileSnapshot({
      admin,
      conversationId,
      includeDocuments: documentsChanged,
      userId,
    });
    const completed = options?.completed === true;
    const responseMessages = await attachPostingPreviewsToMessages({
      admin,
      messages: [...new Map([...artifactMessages.values(), ...assistantMessages].map(message => [message.id, message])).values()].sort((a, b) => Number(a.id) - Number(b.id)),
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
      opportunityDiscoveryQueued: Boolean(
        options?.opportunityRun || options?.opportunityDiscoveryQueued
      ),
      opportunityRun:
        serializeOpportunityRun(options?.opportunityRun ?? null) ??
        options?.recommendationSearchRun ??
        serializeOpportunityRun(activeRun),
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


  // A transport may yield durable work before generating a reply that cannot
  // yet be delivered. Persistence rechecks ownership after finalization.
  await args.adapter?.beforeAssistantFinalization?.();
  if (args.backgroundInvocation) {
    // Only deliver_career_email emits candidate-visible output. Empty or
    // intermediate assistant text is a normal background outcome, not a reason
    // to call a second writer or synthesize a user/assistant chat message.
    await capabilityTurn?.complete();
    return buildResult([]);
  }
  let assistantTextSource = assistantText.trim();
  const { readCareerDelegatedEvents } = await import("./work/events");
  const delegatedEvents = await readCareerDelegatedEvents({admin, userId, conversationId}, capabilityTurn?.runtime.options.inputInbox?.eventIds?.()).catch(error => {
    console.warn("[career] Delegated display logs unavailable", String(error));
    return [];
  });
  if (recommendationReceiptRef.current) {
    assistantTextSource = recommendationReceiptRef.current.answerDraft;
  }
  if (!assistantTextSource && (!args.adapter || args.adapter.artifactsVisible === true) && (!isOnboardingActiveForTurn || artifactMessages.size > 0 || formPresenter.hasPending())) {
    // An empty final message can follow already delivered progress, a form or
    // delegated work. A second writer without that execution transcript/tools
    // would invent a new account of what happened.
    const row = await messageWriter?.finish("", thinkingLogs, undefined, delegatedEvents);
    if (row) onArtifactMessage(toTalentMessageResponse(row));
    await formPresenter.flush();
    await capabilityTurn?.complete();
    await commitDeliveredProcessClosureNotices({
      admin, notices: pendingProcessClosureNotices.values(), talentId: userId,
    });
    return buildResult(Array.from(artifactMessages.values()));
  }
  if (!assistantTextSource && !noMessageMarker) {
    assistantTextSource = (
      await recoverCareerChatAssistantText({
          checkCancellation: capabilityTurn?.runtime.options.checkCancellation ?? standaloneCancellation?.check,
          abortSignal: args.abortSignal,
        primaryModel: assistantModel,
        anthropicEffort: args.assistantAnthropicEffort,
        latestUserMessage: normalizedContent || proactiveContext,
        messages: llmMessages,
        responseLocale,
        systemBlocks,
        usageLabel: args.usageLabel,
      })
    ).trim();
  }
  let normalizedNoMessageContent = normalizeNoMessageContent(
    assistantTextSource,
    noMessageMarker
  );
  if (assistantMessagePrefix) {
    normalizedNoMessageContent = [
      assistantMessagePrefix,
      normalizedNoMessageContent,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  if (!normalizedNoMessageContent && noMessageMarker) {
    await capabilityTurn?.complete({ delivered: false });
    const profileSnapshot = await buildTalentProfileSnapshot({
      admin,
      conversationId,
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
          checkCancellation: capabilityTurn?.runtime.options.checkCancellation ?? standaloneCancellation?.check,
          abortSignal: args.abortSignal,
        primaryModel: assistantModel,
        anthropicEffort: args.assistantAnthropicEffort,
        latestUserMessage: normalizedContent || proactiveContext,
        messages: llmMessages,
        responseLocale,
        systemBlocks,
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
  // Web cards need fallback links/markers. Transport adapters author their
  // complete reply through the model and supply usable links in its context.
  if (!args.adapter) safeAssistantText = ensureStandalonePostingLinksInText(
    safeAssistantText,
    pendingRecommendationPostingRoleIds
  );
  if (
    !args.adapter &&
    recommendationReceiptRef.current?.statusRunId &&
    recommendationReceiptRef.current.statusRelation
  ) {
    safeAssistantText = ensureOpportunityRunMarker(safeAssistantText, {
      relation: recommendationReceiptRef.current.statusRelation,
      runId: recommendationReceiptRef.current.statusRunId,
    });
  } else {
    safeAssistantText = stripOpportunityRunMarkers(safeAssistantText);
  }
  if (args.transformAssistantTextBeforeInsert) {
    safeAssistantText = stripPostgresUnsafeChars(
      args.transformAssistantTextBeforeInsert(safeAssistantText)
    ).trim();
    if (!safeAssistantText) {
      throw new Error("Career assistant text transform returned no content.");
    }
  }

  if (shouldInsertAssistantMessage && !(await shouldInsertAssistantMessage())) {
    await capabilityTurn?.complete({ delivered: false });
    const profileSnapshot = await buildTalentProfileSnapshot({
      admin,
      conversationId,
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

  const { data: insertedAssistantMessage, error: assistantError } = args.adapter
    ? { data: await args.adapter.persistAssistant({ content: safeAssistantText, notices: Array.from(pendingProcessClosureNotices.values()), agentTurn: capabilityTurn?.getCompletionPayload() }), error: null }
    : messageWriter
      ? { data: await messageWriter.finish(safeAssistantText, thinkingLogs, {
          ...(args.assistantMessagePayload as Record<string, unknown> ?? {}),
          ...(sourceModel ? { careerTextChatModel: sourceModel.model } : {}),
          ...(capabilityTurn ? { agentTurn: capabilityTurn.getCompletionPayload() } : {}),
        }, delegatedEvents), error: null }
    : await admin
    .from("talent_messages")
    .insert(
      withIsMobile(
        {
          conversation_id: conversationId,
          user_id: userId,
          role: "assistant",
          content: safeAssistantText,
          message_type: assistantMessageType,
          ...((args.assistantMessagePayload !== undefined || capabilityTurn || sourceModel)
            ? { payload: {
                ...(args.assistantMessagePayload as Record<string, unknown> ?? {}),
                ...(sourceModel ? { careerTextChatModel: sourceModel.model } : {}),
                workStartedAt: new Date(requestStartedAt).toISOString(), workCompletedAt: new Date().toISOString(),
                ...(capabilityTurn ? { agentTurn: capabilityTurn.getCompletionPayload() } : {}),
              } as TalentMessageRow["payload"] }
            : {}),
          thinking_logs: thinkingLogs,
        },
        isMobile
      )
    )
    .select("*")
    .single();

  if (assistantError || !insertedAssistantMessage) {
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
      assistantError?.message ?? "Failed to insert assistant message"
    );
  }


  if (!args.adapter) {
    await commitDeliveredProcessClosureNotices({
      admin,
      notices: pendingProcessClosureNotices.values(),
      talentId: userId,
    });
  }

  if (!args.workId) await persistInsightExtractionForAssistantMessage({
    content: stripCareerReengagementActions(
      stripOpportunityRunMarkers(safeAssistantText)
    ),
    messageId: insertedAssistantMessage.id,
  });
  const finalAssistantThinkingLogs = thinkingLogs;
  if (!args.workId) summarizeConversationInBackground();

  const latestChecklistCoverage = isOnboardingActiveForTurn
    ? await getCareerOnboardingChecklistCoverage({
        admin,
        conversationId,
        currentInsightContent: projectBriefsToLegacyInsights(
          await fetchAllTalentContexts({
            admin,
            collection: "brief",
            userId,
          })
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
          opportunityRunId: completedOpportunityRun?.id ?? null,
          userId,
        })
      : null;
  const insertedCompletionWrapupMessage =
    completionMessages?.wrapupMessage ?? null;
  const insertedInitialSearchStartedMessage =
    completionMessages?.initialSearchStartedMessage ?? null;
  const insertedCompletionNextStepsMessage =
    completionMessages?.nextStepsMessage ?? null;

  await formPresenter.flush();
  await capabilityTurn?.complete();

  const recommendationSearchRun = recommendationReceiptRef.current?.statusRunId
    ? await fetchSerializedOpportunityRunForTalent({
        admin,
        runId: recommendationReceiptRef.current.statusRunId,
        userId,
      }).catch((error) => {
        console.error(
          "[TalentChatTurn] Failed to hydrate queued recommendation run",
          {
            error: error instanceof Error ? error.message : String(error),
            runId: recommendationReceiptRef.current?.statusRunId,
            userId,
          }
        );
        return null;
      })
    : null;
  return buildResult(
    [
      {
        ...toTalentMessageResponse(
          insertedAssistantMessage as TalentMessageRow
        ),
        thinkingLogs: finalAssistantThinkingLogs,
        ...(recommendationSearchRun
          ? {
              recommendationSearchRelation:
                recommendationReceiptRef.current?.statusRelation ?? null,
              recommendationSearchRun,
            }
          : {}),
      },
      insertedCompletionWrapupMessage
        ? toTalentMessageResponse(insertedCompletionWrapupMessage)
        : null,
      insertedInitialSearchStartedMessage
        ? {
            ...toTalentMessageResponse(insertedInitialSearchStartedMessage),
            recommendationSearchRelation: "accepted" as const,
            recommendationSearchRun: serializeOpportunityRun(
              completedOpportunityRun
            ),
          }
        : null,
      insertedCompletionNextStepsMessage
        ? toTalentMessageResponse(insertedCompletionNextStepsMessage)
        : null,
    ].filter((message): message is TalentMessageResponse => message !== null),
    {
      completed: shouldApplyCompletion,
      opportunityRun: completedOpportunityRun,
      opportunityDiscoveryQueued:
        recommendationReceiptRef.current?.newRunCreated === true,
      recommendationSearchRun,
    }
  );  } finally {
    await messageWriter?.interrupt().catch(() => undefined);
    standaloneCancellation?.dispose();
    await capabilityTurn?.release().catch(error => {
      console.warn("[TalentChatTurn] Failed to release agent reply", {
        replyId: capabilityTurn.replyId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}
