import { createCareerAssistantMessageWriter } from "@/lib/career/assistantMessageWriter";
import { CareerTurnCancelled, watchCareerTurnCancellation } from "@/lib/career/turnCancellation.server";
import { createCareerFormPresenter } from "@/lib/career/forms/server";
import { throwIfToolControlError } from "@/lib/llm/toolError";
import { prepareCareerAgentTurn, CareerAgentReplyUnavailable } from "@/lib/career/agentTurnRuntime.server";
import { CareerReplyContinuation } from "@/lib/career/capabilities/runtime";
import { dispatchCareerCheckpoint } from "@/lib/career/agentContinuation";

import { formatToolResultText } from "@/lib/llm/promptText";
import { internalCallSubmissionSchema } from "@/lib/career/internalCallAnswers";
import { saveInternalCallChatSubmission } from "@/lib/career/internalCallAnswersDatabase.server";
import { reportToolDiagnostic } from "@/lib/llm/toolExecution";
import { extractCareerDocumentLinks } from "@/lib/career/documentLinks";
import { orderApplicationMessages } from "@/lib/career/simulation/presentation";
import { careerT } from "@/lib/career/translatedCareerMessage";
import { isCareerCapabilityTurn } from "@/lib/career/capabilities/server";
import { getCareerCapabilityMode } from "@/lib/career/capabilities/registry";
import { initialCareerCapabilityPayload } from "@/lib/career/capabilities/lease";
import { hydrateMockInterviewOffers } from "@/lib/career/mockInterviewOffers.server";
import { after, NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  buildTalentProfileContext,
  buildTalentMemoryRetrievalQuery,
  countUserChatTurns,
  fetchAllTalentContexts,
  fetchTalentDocuments,
  fetchTalentDocumentsByIds,
  fetchTalentContextPromptSnapshot,
  fetchTalentContextsUpdatedAt,
  fetchRecentMessages,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  type TalentConversationRow,
  TalentMessageRow,
  fetchTalentUserProfile,
  getCareerOnboardingChecklistCoverage,
  getCareerOnboardingChecklistProgress,
  getTalentSupabaseAdmin,
  normalizeTalentEngagementTypes,
  projectBriefsToLegacyInsights,
  renderTalentContextPrompt,
  toTalentContextResponse,
  serializeTalentDocuments,
  toTalentMessageResponse,
} from "@/lib/talentOnboarding/server";
import {
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
} from "@/lib/talentOnboarding/recommendationSettings";
import { TALENT_INTERVIEW_FINAL_STEP } from "@/lib/talentOnboarding/progress";
import {
  TALENT_MESSAGE_TYPE_OPEN_POSITION_RECOMMENDATION_REQUEST,
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE,
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP,
  type TalentUserChatMessageType,
} from "@/lib/talentOnboarding/onboarding";
import {
  buildCareerConversationPromptPlan,
  buildCareerInsightExtractionPrompt,
} from "@/lib/career/prompts";
import {
  recoverCareerChatAssistantText,
  runCareerChatAssistant,
  runCareerChatAssistantStream,
} from "@/lib/career/llm";
import {
  executeTalentTool,
  TALENT_TOOL_NAMES,
} from "@/lib/talentOnboarding/tools";
import { fetchActiveInternalFitHoldQuestion } from "@/lib/talentOnboarding/internalFitHoldQuestion";
import { commitDeliveredProcessClosureNotices } from "@/lib/talentOnboarding/processClosureNotice";
import type { PendingProcessClosureNotice } from "@/lib/talentOnboarding/tools";
import { resolveCareerChatTools } from "@/lib/career/llmTools";
import {
  fetchRecentMessagesWithSummary,
  maybeSummarizeTalentConversation,
} from "@/lib/talentOnboarding/conversationSummary";
import { createOnboardingCompletionMessages } from "@/lib/talentOnboarding/onboardingCompletionWrapup";
import { extractAndPersistChatInsights } from "@/lib/talentOnboarding/chatInsights";
import { buildSavedProfileChangesForExtractor } from "@/lib/talentOnboarding/profileChangesForExtractor";
import {
  TALENT_ONBOARDING_DONE_MARKER,
  resolveTalentOnboardingCompletion,
  stripTalentOnboardingCompletionMarker,
} from "@/lib/talentOnboarding/completion";
import {
  completeOnboardingAndQueueInitialOpportunityRun,
  fetchSerializedOpportunityRunForTalent,
  getActiveOpportunityRun,
  hasActiveConversationCompletedOpportunityRun,
  serializeOpportunityRun,
} from "@/lib/opportunityDiscovery/store";
import {
  createRecommendJobPostingStatusLog,
  isRecommendJobPostingSearchStopped,
  type RecommendJobPostingStatus,
} from "@/lib/talentOnboarding/recommendJobPostingStatus";
import {
  fetchLatestTalentActivityEvent,
  fetchPendingOpportunityFeedbackPromptContext,
  fetchRecentTalentActivitySummaries,
} from "@/lib/talentOnboarding/activityEvents";
import {
  fetchRecentRecommendedOpportunitiesForPrompt,
  fetchTalentOpportunityHistoryByIds,
  fetchTalentOpportunityHistoryByRoleIds,
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
import {
  appendCareerOpportunityMentionMetadata,
  normalizeCareerOpportunityMentions,
} from "@/lib/career/opportunityMentionText";
import { appendCareerMessageAttachmentMetadata } from "@/lib/career/messageAttachments";
import { getCareerConversationStarter } from "@/lib/career/prompts/conversationStarters";
import { getCareerToolStartThinkingLog } from "@/lib/career/toolThinkingLog";
import {
  fetchActiveCompanyTalentRequest,
  fetchTalentCompanyContactContext,
  serializeTalentPendingRequest,
} from "@/lib/companyTalentRequests/server";
import { logger } from "@/utils/logger";
import { isMobileRequest, withIsMobile } from "@/lib/requestDevice";
import {
  sanitizeSingleLineDbText,
  stripPostgresUnsafeChars,
} from "@/lib/textSanitization";
import { notifyUnsupportedUnicodeEscapeError } from "@/lib/errorAlert";
import { OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE } from "@/lib/officialJobs";
import { fetchCareerPostOnboardingContext } from "@/lib/career/postOnboardingContext";
import { normalizeCareerPendingActionReference } from "@/lib/career/pendingActions";
import {
  extractRecommendJobPostingsReceipt,
  type RecommendJobPostingsReceipt,
} from "@/lib/opportunityDiscovery/onDemandJobSearch";
import {
  ensureOpportunityRunMarker,
  stripOpportunityRunMarkers,
} from "@/lib/opportunityDiscovery/messageMarker";
import { buildFirstTurnUploadedDocumentContext } from "@/lib/talentOnboarding/documentPromptContext";
import { fetchActiveTalentGmailIntegration } from "@/lib/integrations/gmail";
import { canUseCareerDevControls } from "@/lib/internalAccess";
import { resolveCareerTextChatModelForRequest } from "@/lib/career/textChatModelConfig";
import { resolveCareerRequestTextChatModel } from "@/lib/career/requestTextChatModel";
import { resolveCareerConversationVersion } from "@/lib/career/conversationVersion";
import { loadCareerPromptExperiment } from "@/lib/career/prompts/promptExperiment.server";
import { resolveCareerRequestTimeZone } from "@/lib/career/requestTimeZone";
import {
  expireCurrentCareerCoachingActivity,
  fetchCurrentCareerCoachingActivity,
} from "@/lib/career/careerCoachingActivity";
import type { CareerCoachingActivity } from "@/lib/career/careerCoachingActivitySchema";
import type { TalentMessageResponse } from "@/lib/talentOnboarding/models";

// Includes the bounded 7-minute analysis and its final chat response.
export const maxDuration = 480;

type Body = {
  durable?: boolean;
  internalCallAnswerSubmission?: unknown;
  clientRequestId?: string;
  channel?: string;
  formResponseMessageId?: number;
  simulationAction?: unknown;
  applicationPreparationContinuation?: {sessionMessageId:number; continuationId:string};
  applicationInputSubmission?: {batchId:string; sessionMessageId:number; expectedRevision:number};
  coachingActivityAction?: unknown;
  conversationStarterId?: string;
  conversationId?: string;
  locale?: string;
  message?: string;
  messageType?: unknown;
  opportunityMentions?: unknown;
  viewedRoleId?: unknown;
  pendingAction?: unknown;
  textChatModel?: unknown;
  promptVariant?: unknown;
  conversationVersion?: unknown;
  timeZone?: string;
  uploadedDocumentIds?: unknown;
  link?: string;
};

type CareerCoachingActivityActionReference = {
  action: "start" | "end";
  activityMessageId: number;
  channel: "chat" | "call" | null;
  expectedRevision: number;
};

function normalizeCareerCoachingActivityActionReference(
  value: unknown
): CareerCoachingActivityActionReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const activityMessageId = Number(record.activityMessageId);
  const expectedRevision = Number(record.expectedRevision);
  const action =
    record.action === "start" || record.action === "end" ? record.action : null;
  const channel =
    record.channel === "chat" || record.channel === "call"
      ? record.channel
      : null;
  if (
    !action ||
    !Number.isSafeInteger(activityMessageId) ||
    activityMessageId < 1 ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 1 ||
    (action === "start" && !channel)
  ) {
    return null;
  }
  return { action, activityMessageId, channel, expectedRevision };
}


const toResponseMessage = toTalentMessageResponse;

function normalizeUserChatMessageType(
  value: unknown
): TalentUserChatMessageType {
  if (value === TALENT_MESSAGE_TYPE_OPEN_POSITION_RECOMMENDATION_REQUEST) {
    return TALENT_MESSAGE_TYPE_OPEN_POSITION_RECOMMENDATION_REQUEST;
  }
  return "chat";
}

async function attachPostingPreviewsToMessages(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  messages: ReturnType<typeof toTalentMessageResponse>[];
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
  conversationId: string;
  includeDocuments?: boolean;
  userId: string;
}) {
  const [setting, brief, talentContextsUpdatedAt, talentProfile, documents] =
    await Promise.all([
      fetchTalentSetting({ admin: args.admin, userId: args.userId }),
      fetchAllTalentContexts({
        admin: args.admin,
        collection: "brief",
        userId: args.userId,
      }),
      fetchTalentContextsUpdatedAt({ admin: args.admin, userId: args.userId }),
      fetchTalentStructuredProfile({ admin: args.admin, userId: args.userId }),
      args.includeDocuments
        ? fetchTalentDocuments({ admin: args.admin, userId: args.userId }).then(
            (rows) =>
              serializeTalentDocuments({ admin: args.admin, documents: rows })
          )
        : null,
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
    preferredLocale: setting?.preferred_locale ?? null,
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
    talentProfile: documents
      ? {
          ...talentProfile,
          documents,
        }
      : talentProfile,
    preferencesUpdatedAt: setting?.updated_at ?? null,
    insightUpdatedAt: talentContextsUpdatedAt,
    talentContextsUpdatedAt,
  };
}


function normalizeUploadedDocumentIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            item
          )
        )
    )
  ).slice(0, 5);
}

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
      ? stripPostgresUnsafeChars(rawStatus)
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 160)
      : "";

  return {
    status,
    toolInput,
  };
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

function getOnboardingMarkerPrefixSuffixLength(value: string) {
  const maxLength = Math.min(
    value.length,
    TALENT_ONBOARDING_DONE_MARKER.length - 1
  );
  for (let length = maxLength; length > 0; length -= 1) {
    if (TALENT_ONBOARDING_DONE_MARKER.startsWith(value.slice(-length))) {
      return length;
    }
  }
  return 0;
}

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


async function fetchStoppedRecommendationSourceMessage(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  conversationId: string;
  messageId: number;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_messages")
    .select("*")
    .eq("id", args.messageId)
    .eq("conversation_id", args.conversationId)
    .eq("user_id", args.userId)
    .eq("role", "user")
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load recommendation status");
  }
  if (!data || !isRecommendJobPostingSearchStopped(data.thinking_logs)) {
    return null;
  }
  return data as TalentMessageRow;
}


// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const requestStartedAt = new Date().toISOString();
  let releaseAgentTurn: (() => Promise<void>) | undefined;
  let executionSignal = req.signal;
  let standaloneCancellation: ReturnType<typeof watchCareerTurnCancellation> | undefined;
  let persistedSourceResponse: TalentMessageResponse | undefined;
  const deadlineAt = Date.now() + 430_000;
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const isMobile = isMobileRequest(req);
    const promptTimeZone = resolveCareerRequestTimeZone(req, body.timeZone);
    const conversationId = sanitizeSingleLineDbText(body.conversationId, 80);
    let message =
      typeof body.message === "string"
        ? stripPostgresUnsafeChars(body.message).trim()
        : "";
    const link = sanitizeSingleLineDbText(body.link, 2000);
    const requestedUserMessageType = normalizeUserChatMessageType(
      body.messageType
    );
    const requestChannel = body.channel === "voice" ? "voice" : "chat";
    const canUseInternalFitHoldQuestionTool = false;
    const opportunityMentions = normalizeCareerOpportunityMentions(
      body.opportunityMentions
    );
    const pendingActionReference = normalizeCareerPendingActionReference(
      body.pendingAction
    );
    const coachingActivityAction =
      normalizeCareerCoachingActivityActionReference(
        body.coachingActivityAction
      );
    const uploadedDocumentIds = normalizeUploadedDocumentIds(
      body.uploadedDocumentIds
    );
    const conversationStarterId =
      typeof body.conversationStarterId === "string"
        ? body.conversationStarterId.trim()
        : "";
    const streamResponse = wantsSseStream(req);

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }
    if (!message && uploadedDocumentIds.length === 0 && !body.formResponseMessageId && !body.internalCallAnswerSubmission) {
      return NextResponse.json(
        { error: "message or uploadedDocumentIds is required" },
        { status: 400 }
      );
    }
    if (body.coachingActivityAction && !coachingActivityAction) {
      return NextResponse.json(
        { error: "Invalid career coaching activity action reference" },
        { status: 400 }
      );
    }
    const admin = getTalentSupabaseAdmin();
    let savedFormResponse: TalentMessageRow | null = null;
    if (body.formResponseMessageId !== undefined) {
      if (!Number.isSafeInteger(body.formResponseMessageId) || body.formResponseMessageId <= 0) {
        return NextResponse.json({ error: "Invalid form response" }, { status: 400 });
      }
      const { data, error } = await admin.from("talent_messages").select("*")
        .eq("id", body.formResponseMessageId).eq("user_id", user.id)
        .eq("conversation_id", conversationId).eq("role", "user")
        .eq("message_type", "career_form_response").maybeSingle();
      if (error || !data || (data.payload as Record<string, unknown> | null)?.hidden === true) {
        return NextResponse.json({ error: "Form response unavailable" }, { status: 404 });
      }
      savedFormResponse = data as TalentMessageRow;
      message = savedFormResponse.content;
    }
    const [talentSetting, activeGmailIntegration] = await Promise.all([
      fetchTalentSetting({ admin, userId: user.id }),
      fetchActiveTalentGmailIntegration({
        admin,
        talentId: user.id,
      }),
    ]);
    const responseLocale =
      talentSetting?.preferred_locale ??
      body.locale ??
      req.cookies.get("NEXT_LOCALE")?.value;
    const conversationStarter = conversationStarterId
      ? getCareerConversationStarter(conversationStarterId, responseLocale)
      : null;
    const skipConversationWrites = Boolean(
      conversationStarter?.id !== "career_coaching" &&
      conversationStarter &&
      message === conversationStarter.chatMessage
    );
    const userMessageType = requestedUserMessageType;
    if (conversationStarterId && !conversationStarter) {
      return NextResponse.json(
        { error: "Invalid conversationStarterId" },
        { status: 400 }
      );
    }

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
        .eq("user_id", user.id);
    };
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

    let savedInternalCallAnswers: Awaited<ReturnType<typeof saveInternalCallChatSubmission>> | null = null;
    if (body.internalCallAnswerSubmission) {
      const parsed = internalCallSubmissionSchema.safeParse({
        ...(typeof body.internalCallAnswerSubmission === "object" ? body.internalCallAnswerSubmission : {}),
        conversationId,
      });
      if (!parsed.success) return NextResponse.json({ error: "Invalid call answers" }, { status: 400 });
      try {
        savedInternalCallAnswers = await saveInternalCallChatSubmission({
          input: parsed.data,
          userId: user.id,
          isMobile,
          locale: responseLocale,
          messagePayload: initialCareerCapabilityPayload(getCareerCapabilityMode()),
        });
      } catch (error) {
        const status = Number((error as { status?: number })?.status) || 500;
        if (status === 500) console.error("[internal-call-answers]", error);
        return NextResponse.json({ error: status === 500 ? "Unable to save answers. Please retry." : (error as Error).message }, { status });
      }
      // A retry reuses the saved user message and an already-produced reply.
      if (savedInternalCallAnswers.assistantMessage) return NextResponse.json({
        userMessage: toResponseMessage(savedInternalCallAnswers.message),
        assistantMessage: toResponseMessage(savedInternalCallAnswers.assistantMessage),
      });
      message = savedInternalCallAnswers.message.content;
    }

    const careerCoachingActivityMessageId = talentSetting?.is_onboarding_done
      ? ((conversation as TalentConversationRow)
          .career_coaching_activity_message_id ?? null)
      : null;
    const expiredCareerCoachingActivityMessage = careerCoachingActivityMessageId
      ? await expireCurrentCareerCoachingActivity({
          activityMessageId: careerCoachingActivityMessageId,
          admin,
          conversationId,
          userId: user.id,
        })
      : null;
    let careerCoachingActivity =
      careerCoachingActivityMessageId && !expiredCareerCoachingActivityMessage
        ? await fetchCurrentCareerCoachingActivity({
            activityMessageId: careerCoachingActivityMessageId,
            admin,
            conversationId,
            userId: user.id,
          })
        : null;

    const textChatModel = requestChannel === "chat"
      ? resolveCareerRequestTextChatModel(req, user, body.textChatModel)
      : resolveCareerTextChatModelForRequest(undefined, false);
    const conversationVersion = resolveCareerConversationVersion(body.conversationVersion,
      requestChannel === "chat" && canUseCareerDevControls(user.email));
    const promptExperiment = await loadCareerPromptExperiment(conversationVersion === "professional" ? body.promptVariant : undefined,
      requestChannel === "chat" && Boolean(talentSetting?.is_onboarding_done) && canUseCareerDevControls(user.email));
    const uploadedDocuments = await fetchTalentDocumentsByIds({
      admin,
      documentIds: uploadedDocumentIds,
      userId: user.id,
    });
    if (uploadedDocuments.length !== uploadedDocumentIds.length) {
      return NextResponse.json(
        { error: "One or more uploaded documents were not found" },
        { status: 400 }
      );
    }
    if (!message && uploadedDocuments.length > 0) {
      message = uploadedDocuments
        .map((document) => document.file_name)
        .join(", ");
    }
    const activeRun = await getActiveOpportunityRun({
      admin,
      conversationId,
      userId: user.id,
    });

    const summarizeConversationInBackground = (options?: {
      maxToMessageId?: number | null;
    }) => {
      after(async () => {
        try {
          await maybeSummarizeTalentConversation({
            admin,
            conversationId,
            maxToMessageId: options?.maxToMessageId,
            userId: user.id,
          });
        } catch (error) {
          console.error("[TalentChat] Failed to summarize conversation", {
            conversationId,
            error: error instanceof Error ? error.message : String(error),
            userId: user.id,
          });
        }
      });
    };

    const [
      profile,
      talentContextSnapshot,
      onboardingCompletionEvent,
      officialJobSignupIntentEvent,
      postOnboardingContext,
      pendingOpportunityFeedbackContext,
      recentActivitySummaries,
      recentRecommendedOpportunities,
      isConversationCompletedOpportunityRunActive,
    ] = await Promise.all([
      fetchTalentUserProfile({ admin, userId: user.id }),
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
            message,
          ]),
          userId: user.id,
        });
      })(),
      fetchLatestTalentActivityEvent({
        admin,
        conversationId,
        eventType: "onboarding_completed",
        userId: user.id,
      }),
      fetchLatestTalentActivityEvent({
        admin,
        conversationId,
        eventType: OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE,
        userId: user.id,
      }),
      talentSetting?.is_onboarding_done
        ? fetchCareerPostOnboardingContext({
            admin,
            conversationId,
            userId: user.id,
          })
        : Promise.resolve(null),
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
      fetchRecentRecommendedOpportunitiesForPrompt({
        admin,
        limit: 10,
        userId: user.id,
      }),
      talentSetting?.is_onboarding_done
        ? hasActiveConversationCompletedOpportunityRun({
            admin,
            userId: user.id,
          })
        : Promise.resolve(false),
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
    const recentRecommendedOpportunitiesText =
      formatRecentRecommendedOpportunitiesForPrompt(
        recentRecommendedOpportunities
      );

    const currentInsightContent = projectBriefsToLegacyInsights(
      talentContextSnapshot.allBriefs
    );
    const talentContextSection = renderTalentContextPrompt(
      talentContextSnapshot
    );
    const onboardingChecklistCoverage = !Boolean(
      talentSetting?.is_onboarding_done
    )
      ? await getCareerOnboardingChecklistCoverage({
          admin,
          conversationId,
          currentInsightContent,
          userId: user.id,
        })
      : null;
    const shouldAutoExtractInsights = !Boolean(
      talentSetting?.is_onboarding_done
    );
    const savedProfileChangesForExtraction = new Set<string>();
    const extractTurnInsights = (assistantContent: string) =>
      shouldAutoExtractInsights
        ? extractAndPersistChatInsights({
            admin,
            assistantContent,
            buildPrompt: (promptArgs) =>
              buildCareerInsightExtractionPrompt({
                currentChecklistCoverage: promptArgs.currentChecklistCoverage,
                onboardingChecklistContext:
                  promptArgs.onboardingChecklistContext,
                preferredLocale: responseLocale,
              }),
            conversationId,
            logPrefix: "TalentChat",
            onboardingChecklistContext: profile,
            profileChangesAlreadySaved: Array.from(
              savedProfileChangesForExtraction
            ).join("\n"),
            sourceChannel: "text_chat",
            scheduleAfter: (task) => after(task),
            userId: user.id,
          })
        : Promise.resolve(0);

    let selectedCompanyTalentRequest: Awaited<
      ReturnType<typeof fetchActiveCompanyTalentRequest>
    > = null;
    let selectedInternalFitHoldQuestion: Awaited<
      ReturnType<typeof fetchActiveInternalFitHoldQuestion>
    > = null;
    let selectedInternalOpportunity: TalentOpportunityHistoryItem | null = null;

    if (talentSetting?.is_onboarding_done && pendingActionReference) {
      if (pendingActionReference.kind === "company_request") {
        selectedCompanyTalentRequest = await fetchActiveCompanyTalentRequest({
          admin: admin as any,
          awaitingTalentOnly: true,
          requestId: pendingActionReference.id,
          talentId: user.id,
        });
      } else if (
        pendingActionReference.kind === "internal_fit_question" &&
        talentSetting.profile_visibility !== "dont_share" &&
        canUseInternalFitHoldQuestionTool
      ) {
        const activeQuestion = await fetchActiveInternalFitHoldQuestion({
          admin,
          locale: responseLocale,
          userId: user.id,
        });
        selectedInternalFitHoldQuestion =
          activeQuestion?.fitId === pendingActionReference.id
            ? activeQuestion
            : null;
      } else if (pendingActionReference.kind === "internal_opportunity") {
        const [opportunity] = await fetchTalentOpportunityHistoryByIds({
          admin,
          ids: [pendingActionReference.id],
          locale: responseLocale,
          userId: user.id,
        });
        selectedInternalOpportunity =
          opportunity?.sourceType === "internal" &&
          opportunity.feedback === null &&
          opportunity.savedStage !== "hidden" &&
          !opportunity.isExpired
            ? opportunity
            : null;
      }
    }

    // Resolve the displayed role through the same owner-scoped reader as the UI.
    // Viewing supplies context, not a recommendation decision or sharing consent.
    const viewedRoleId = typeof body.viewedRoleId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.viewedRoleId)
      ? body.viewedRoleId : null;
    const [viewedOpportunity] = viewedRoleId
      ? await fetchTalentOpportunityHistoryByRoleIds({
          admin, userId: user.id, locale: responseLocale, roleIds: [viewedRoleId],
        })
      : [];
    const effectiveOpportunityMentions = selectedInternalOpportunity
      ? normalizeCareerOpportunityMentions([
          ...opportunityMentions.filter(
            (mention) => mention.roleId !== selectedInternalOpportunity?.roleId
          ),
          {
            label: `${selectedInternalOpportunity.companyName} · ${selectedInternalOpportunity.title}`,
            roleId: selectedInternalOpportunity.roleId,
          },
        ])
      : opportunityMentions;
    const normalizedContent = appendCareerMessageAttachmentMetadata(
      appendCareerOpportunityMentionMetadata(
        link ? `${message}\n\nReference link: ${link}` : message,
        effectiveOpportunityMentions
      ),
      uploadedDocuments.map((document) => ({
        mime: document.content_type ?? undefined,
        name: document.file_name,
        size: document.size_bytes ?? undefined,
      }))
    );
    const capabilityMode = getCareerCapabilityMode();
    // The runtime reads current server-owned activity facts on every completion,
    // including activity start and confirmed return to ordinary chat.
    const trackCapabilities = isCareerCapabilityTurn({
      channel: requestChannel,
      isOnboardingDone: Boolean(talentSetting?.is_onboarding_done),
    });
    executionSignal.throwIfAborted();
    // A saved form response already owns a durable wakeup, including requests
    // from a tab opened before this release. Never start a second inline reply.
    if (trackCapabilities && (body.durable === true || savedFormResponse) && !savedInternalCallAnswers && !coachingActivityAction && !conversationStarterId) {
      const { data, error } = savedFormResponse ? { data: savedFormResponse, error: null } : await (admin.rpc as any)("admit_career_request", {
        p_user_id: user.id, p_conversation_id: conversationId, p_content: normalizedContent,
        p_message_type: userMessageType, p_is_mobile: isMobile,
        p_payload: { ...initialCareerCapabilityPayload(capabilityMode), careerTextChatModel: textChatModel.model,
          careerConversationVersion: conversationVersion, clientRequestId: body.clientRequestId ?? crypto.randomUUID(),
          ...(promptExperiment ? { careerPromptExperiment: promptExperiment } : {}),
          ...(viewedOpportunity ? { viewedOpportunity: { roleId: viewedOpportunity.roleId, label: `${viewedOpportunity.companyName} · ${viewedOpportunity.title}` } } : {}),
        },
      });
      if (error) throw error;
      after(async () => {
        const { publishCareerInvocations } = await import("@/lib/career/work/invocations");
        await publishCareerInvocations({ admin, userId: user.id, conversationId });
      });
      return NextResponse.json({ ok: true, accepted: true, userMessage: toResponseMessage(data as TalentMessageRow) }, { status: 202 });
    }
    const { data: insertedUserMessage, error: userMessageError } = savedFormResponse || savedInternalCallAnswers
      ? { data: savedFormResponse ?? savedInternalCallAnswers!.message, error: null }
      : await admin
      .from("talent_messages")
      .insert(
        withIsMobile(
          {
            conversation_id: conversationId,
            user_id: user.id,
            role: "user",
            content: normalizedContent,
            message_type: userMessageType,
            payload: {
              ...(trackCapabilities ? initialCareerCapabilityPayload(capabilityMode) : {}),
              careerTextChatModel: textChatModel.model,
              careerConversationVersion: conversationVersion,
              ...(viewedOpportunity ? { viewedOpportunity: {
                roleId: viewedOpportunity.roleId,
                label: `${viewedOpportunity.companyName} · ${viewedOpportunity.title}`,
              } } : {}),
              ...(body.clientRequestId ? { clientRequestId: body.clientRequestId } : {}),
              ...(promptExperiment ? { careerPromptExperiment: promptExperiment } : {}),
            },
          },
          isMobile
        )
      )
      .select("*")
      .single();

    if (userMessageError) {
      await notifyUnsupportedUnicodeEscapeError({
        conversationId,
        error: userMessageError,
        metadata: {
          channel: requestChannel,
          hasLink: Boolean(link),
          messageLength: message.length,
          normalizedContentLength: normalizedContent.length,
          streamResponse,
        },
        route: "/api/talent/chat",
        stage: "talent_messages.insert:user_message",
        userId: user.id,
      });
      return NextResponse.json(
        { error: userMessageError.message ?? "Failed to insert user message" },
        { status: 500 }
      );
    }

    // Saved form/call responses reuse their original message and retain the
    // exact action payload while recording this server-authorized model choice.
    if (savedFormResponse || savedInternalCallAnswers) {
      const storedPayload = (insertedUserMessage as TalentMessageRow).payload;
      const payload = {
        ...(storedPayload && typeof storedPayload === "object" && !Array.isArray(storedPayload) ? storedPayload : {}),
        careerTextChatModel: textChatModel.model,
        careerConversationVersion: conversationVersion,
        ...(body.clientRequestId ? { clientRequestId: body.clientRequestId } : {}),
        careerPromptExperiment: promptExperiment ?? null,
      };
      const { error } = await admin.from("talent_messages").update({ payload })
        .eq("id", insertedUserMessage.id).eq("user_id", user.id)
        .eq("conversation_id", conversationId);
      if (error) throw error;
      (insertedUserMessage as TalentMessageRow).payload = payload;
    }
    if (body.clientRequestId) {
      const stop = await admin.from("talent_messages").select("id")
        .eq("user_id", user.id).eq("conversation_id", conversationId)
        .eq("message_type", "career_turn_stop").eq("payload->>clientRequestId", body.clientRequestId)
        .limit(1).maybeSingle();
      if (stop.error) throw stop.error;
      if (stop.data || ((insertedUserMessage as TalentMessageRow).payload as { careerTurnStopped?: boolean } | null)?.careerTurnStopped) {
        const payload = (insertedUserMessage as TalentMessageRow).payload;
        const saved = await admin.from("talent_messages").update({ payload: {
          ...(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}), careerTurnStopped: true,
        } }).eq("id", insertedUserMessage.id).eq("user_id", user.id);
        if (saved.error) throw saved.error;
        return NextResponse.json({ ok: true, stopped: true });
      }
    }
    persistedSourceResponse = toResponseMessage(insertedUserMessage as TalentMessageRow);
    if (!trackCapabilities) {
      standaloneCancellation = watchCareerTurnCancellation({ admin, userId: user.id, conversationId, sourceMessageId: insertedUserMessage.id }, executionSignal);
      executionSignal = standaloneCancellation.signal;
      releaseAgentTurn = async () => standaloneCancellation?.dispose();
      await standaloneCancellation.check();
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
      recentLimit: 16,
      userId: user.id,
    });
    const promptMessages = recentMessages;

    const llmMessages = promptMessages
      .filter(
        (item) =>
          item.id !== savedInternalCallAnswers?.message.id &&
          !["simulation_session", "simulation_action"].includes(
            item.message_type ?? ""
          ) &&
          item.message_type !==
            TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE &&
          item.message_type !== TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP
      )
      .map((item) => ({
        role: item.role as "user" | "assistant",
        content: formatTalentMessageContentForLlmPrompt(item, {
          includeCreatedAt: item.message_type !== "conversation_summary",
          preferredLocale: responseLocale,
          timeZone: promptTimeZone,
        }),
      }))
      .filter((item) => item.content.trim().length > 0);

    if (savedInternalCallAnswers) llmMessages.push({
      role: "user",
      content: formatTalentMessageContentForLlmPrompt(savedInternalCallAnswers.message, {
        includeCreatedAt: true, preferredLocale: responseLocale, timeZone: promptTimeZone,
      }),
    });

    const activeInternalFitHoldQuestion =
      selectedInternalFitHoldQuestion ??
      (pendingActionReference?.kind !== "internal_fit_question" &&
      talentSetting?.is_onboarding_done &&
      talentSetting.profile_visibility !== "dont_share" &&
      canUseInternalFitHoldQuestionTool
        ? await fetchActiveInternalFitHoldQuestion({
            admin,
            locale: responseLocale,
            userId: user.id,
          })
        : null);
    if (selectedCompanyTalentRequest?.ops_only) {
      const { error } = await (admin.rpc as any)("bind_ops_candidate_reply_v1", {
        p_request_id: selectedCompanyTalentRequest.id, p_talent_id: user.id,
        p_source_message_id: insertedUserMessage.id,
      });
      if (error) throw error;
    }
    const companyContactContext = talentSetting?.is_onboarding_done
      ? await fetchTalentCompanyContactContext({
          admin: admin as any,
          talentId: user.id,
        })
      : null;
    const toolSelection = resolveCareerChatTools({
      activeInternalFitHoldQuestion: Boolean(activeInternalFitHoldQuestion),
      channel: requestChannel,
      hasActiveGmailIntegration: Boolean(activeGmailIntegration),
      isOnboardingDone: talentSetting?.is_onboarding_done,
      responseLocale,
    });
    const gmailCapability = activeGmailIntegration
      ? toolSelection.toolNames.includes(
          TALENT_TOOL_NAMES.SEARCH_CONNECTED_GMAIL
        )
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
    const selectedPendingActionRuntimeInstruction = selectedCompanyTalentRequest
      ? [
          "The user deliberately selected the active company request shown in the composer before writing the latest message.",
          `Treat the latest message specifically as a response to requestId ${selectedCompanyTalentRequest.id}.`,
          "If it clearly answers or declines the request, use the company-request response tool. If the intent is ambiguous, ask a concise clarification instead of inferring consent or refusal.",
        ].join(" ")
      : selectedInternalFitHoldQuestion
        ? [
            "The user deliberately selected the active internal-fit reevaluation question shown in the composer before writing the latest message.",
            `Treat the latest message as an answer to fitId ${selectedInternalFitHoldQuestion.fitId}.`,
            "Record it when it provides new information; otherwise ask one concise clarification.",
          ].join(" ")
        : selectedInternalOpportunity
          ? [
              "The user deliberately selected an undecided internal connection proposal before writing the latest message.",
              `The exact role is ${selectedInternalOpportunity.title} at ${selectedInternalOpportunity.companyName} (roleId: ${selectedInternalOpportunity.roleId}).`,
              "Answer questions in this role context. Only record positive or negative feedback when the user clearly accepts or rejects; do not infer a decision from a question.",
            ].join(" ")
          : undefined;
    const uploadedDocumentRuntimeInstruction =
      buildFirstTurnUploadedDocumentContext(uploadedDocuments);
    const coachingActivityActionRuntimeInstruction = coachingActivityAction
      ? careerCoachingActivity &&
        coachingActivityAction.activityMessageId ===
          careerCoachingActivity.messageId &&
        coachingActivityAction.expectedRevision ===
          careerCoachingActivity.revision
        ? [
            "The user deliberately selected an action on the currently visible career-coaching card before sending the latest message.",
            `The exact action is ${coachingActivityAction.action}; activityMessageId=${coachingActivityAction.activityMessageId}; expectedRevision=${coachingActivityAction.expectedRevision}; channel=${coachingActivityAction.channel ?? "none"}.`,
            "Treat the visible user message as explicit intent for this exact activity. Use manage_career_coaching_activity with the referenced identifiers. For start, supply the final topic, duration, and a compact agenda; do not mutate a different activity.",
          ].join(" ")
        : "The latest message carries a stale career-coaching card reference. Do not apply that action to another activity. Respond using the current activity state and let the user know briefly if the requested card action is no longer available."
      : undefined;
    const runtimeInstruction = [
      formatTalentConversationReferencesForLlm(promptMessages, { preferredLocale: responseLocale, timeZone: promptTimeZone }),
      savedInternalCallAnswers
        ? `The latest user message contains their written answers and explicit skips for the optional internal-role questionnaire. They are already saved and call request ${savedInternalCallAnswers.call.id} is completed.`
        : undefined,
      selectedPendingActionRuntimeInstruction,
      uploadedDocumentRuntimeInstruction,
      coachingActivityActionRuntimeInstruction,
    ]
      .filter((value): value is string => Boolean(value))
      .join("\n\n");
    const currentPromptArgs = (): Parameters<typeof buildCareerConversationPromptPlan>[0] => ({
        activeInternalFitHoldQuestion,
        conversationVersion,
        careerCoachingActivity,
        channel: "chat",
        companyTalentRequestText:
          [
            selectedCompanyTalentRequest
              ? serializeTalentPendingRequest(selectedCompanyTalentRequest)
              : null,
            companyContactContext,
          ]
            .filter(Boolean)
            .join("\n\n") || null,
        onboardingChecklistCoverage,
        talentContextSection,
        currentPreferences,
        gmailCapability,
        isConversationCompletedOpportunityRunActive,
        isOnboardingDone: talentSetting?.is_onboarding_done,
        officialJobSignupIntentPrompt: talentSetting?.is_onboarding_done
          ? null
          : officialJobSignupIntentEvent?.summary,
        opportunityStatus,
        pendingOpportunityFeedbackContext,
        postOnboardingContext,
        profile,
        conversationMode: careerCoachingActivity?.status === "active"
              ? "career_coaching"
              : conversationStarter?.id === "career_coaching"
                ? "default"
                : (conversationStarter?.id ?? "default"),
        recentActivitySummaries,
        recentRecommendedOpportunitiesText,
        runtimeInstruction,
        structuredProfileText,
        timeZone: promptTimeZone,
        toolNames: toolSelection.toolNames,
      });
    const buildCurrentPromptPlan = () => buildCareerConversationPromptPlan(currentPromptArgs());
    const capabilityPromptArgs = currentPromptArgs();
    const { isOnboardingActive, promptBlocks } = buildCurrentPromptPlan();
    const capabilityTurn = trackCapabilities ? await prepareCareerAgentTurn({
    origin: "web",
      abortSignal: executionSignal, deadlineAt,
      selectorInput: { messages: llmMessages, currentContext: `Current user message ID: ${insertedUserMessage.id}.` },
      onCheckpoint: async (checkpoint) => {
        await dispatchCareerCheckpoint({ admin, userId: user.id, conversationId, checkpoint });
      },
      admin, userId: user.id, conversationId, sourceMessage: insertedUserMessage as TalentMessageRow,
      mode: capabilityMode, eligibleTools: toolSelection.tools, promptArgs: capabilityPromptArgs,
      getPromptArgs: currentPromptArgs,
      getEligibleTools: () => resolveCareerChatTools({
        activeInternalFitHoldQuestion: Boolean(activeInternalFitHoldQuestion),
        channel: requestChannel,
        hasActiveGmailIntegration: Boolean(activeGmailIntegration),
        isOnboardingDone: talentSetting?.is_onboarding_done,
        responseLocale,
      }).tools,
      preloads: [
        ...(uploadedDocuments.length ? ["documents" as const] : []),
        ...(effectiveOpportunityMentions.length ? ["opportunities" as const] : []),
        ...(selectedCompanyTalentRequest ? ["company_contact" as const] : []),
        ...(coachingActivityAction && careerCoachingActivity && coachingActivityAction.activityMessageId === careerCoachingActivity.messageId && coachingActivityAction.expectedRevision === careerCoachingActivity.revision ? ["career_coaching" as const] : []),
      ],
    }) : undefined;
    releaseAgentTurn = capabilityTurn?.release ?? releaseAgentTurn;
    executionSignal = capabilityTurn?.runtime.abortSignal ?? executionSignal;
    const initialCapabilityStep = capabilityTurn?.runtime.resolveStep(false);
    if (initialCapabilityStep) toolDefinitions = initialCapabilityStep.tools;
    const systemBlocks = initialCapabilityStep?.systemBlocks ?? promptBlocks;
    // console.info("[career-chat:prompt-breakdown]", {
    //   cacheableSystemBlockKeys: systemBlocks
    //     .filter((block) => block.cacheable)
    //     .map((block) => block.key),
    //   label: "career/chat:assistant",
    //   conversationId,
    //   historyChars: countMessageContentChars(llmMessages),
    //   historyMessageCount: llmMessages.length,
    //   profileChars: countPromptChars(structuredProfileText),
    //   systemBlockChars: countPromptBlockChars(systemBlocks),
    //   systemBlockCount: systemBlocks.length,
    //   toolSchemaChars: countSerializedChars(toolDefinitions),
    //   userId: user.id,
    // });

    // logger.log("\n\n [toolPolicy] : ", toolPolicy);

    // --- Conversation LLM call (natural language, no JSON mode) ---
    let thinkingLogs: string[] = [];
    let pendingRecommendationPostingRoleIds: string[] = [];
    const pendingProcessClosureNotices = new Map<
      string,
      PendingProcessClosureNotice
    >();
    const registerProcessClosureNotices = (
      notices: PendingProcessClosureNotice[]
    ) => {
      for (const notice of notices)
        pendingProcessClosureNotices.set(notice.recommendationId, notice);
    };
    const recommendationReceiptRef: {
      current: RecommendJobPostingsReceipt | null;
    } = { current: null };
    let opportunityRecommendationsChanged = false;
    let documentsChanged = uploadedDocuments.length > 0;

    const generatedDocumentLinks = new Map<string, string>();
    const withGeneratedDocumentLinks = (text: string) => {
      const visibleIds = new Set(extractCareerDocumentLinks(text).documents.map(document => document.id));
      for (const [id, link] of generatedDocumentLinks) {
        if (!visibleIds.has(id)) text += `\n\n${link}`;
      }
      return text;
    };
    let changedOpportunityRoleId: string | null = null;
    let auxiliaryAssistantMessages: TalentMessageResponse[] =
      expiredCareerCoachingActivityMessage
        ? [expiredCareerCoachingActivityMessage]
        : [];
    let suppressRolePreviews = false;
    let careerCoachingCallReady: CareerCoachingActivity | null = null;
    let emitArtifactMessage: ((message: TalentMessageResponse) => void) | null = null;
    let deliveredArtifact = false;
    const onArtifactMessage = (message: TalentMessageResponse, emit = true) => {
      deliveredArtifact = true;
      auxiliaryAssistantMessages = [...auxiliaryAssistantMessages.filter(item => item.id !== message.id), message];
      if (emit) emitArtifactMessage?.(message);
    };
    const formPresenter = createCareerFormPresenter(
      { admin, userId: user.id, conversationId },
      // Include forms in the final ordered batch, after every text message.
      message => onArtifactMessage(message, false),
      capabilityTurn?.replyId ?? `message:${insertedUserMessage.id}`
    );
    const messageWriter = !isOnboardingActive && conversationVersion === "professional" && requestChannel === "chat"
      ? await createCareerAssistantMessageWriter({ admin, userId: user.id, conversationId, isMobile,
          replyId: capabilityTurn?.replyId ?? `message:${insertedUserMessage.id}`,
          startedAt: requestStartedAt,
          check: capabilityTurn?.runtime.options.checkCancellation ?? standaloneCancellation?.check,
        }) : null;
    const replyPayload = () => ({ suppressRolePreviews, careerTurnSourceMessageId: insertedUserMessage.id,
      ...(capabilityTurn ? { agentTurn: capabilityTurn.getCompletionPayload() } : {}),
      ...(savedInternalCallAnswers ? { internalCallAnswerMessageId: savedInternalCallAnswers.message.id } : {}),
      workStartedAt: requestStartedAt, workCompletedAt: new Date().toISOString(),
    });
    const commitAssistantProgressRow = async (text: string) => {
      const content = stripPostgresUnsafeChars(stripTalentOnboardingCompletionMarker(text));
      if (!content.trim()) return null;
      if (messageWriter) return messageWriter.progress(content, thinkingLogs);
      const { data, error } = await admin.from("talent_messages").insert(withIsMobile({
        conversation_id: conversationId, user_id: user.id, role: "assistant",
        content, message_type: "chat", payload: { suppressRolePreviews, careerTurnSourceMessageId: insertedUserMessage.id, workStartedAt: requestStartedAt, workCompletedAt: new Date().toISOString() }, thinking_logs: thinkingLogs,
      }, isMobile)).select("*").single();
      if (error || !data) throw new Error(error?.message ?? "Failed to save assistant progress");
      return data as TalentMessageRow;
    };
    const finishArtifactOnlyTurn = async () => {
      const row = await messageWriter?.finish("", thinkingLogs, replyPayload());
      if (row) onArtifactMessage(toResponseMessage(row), false);
      await formPresenter.flush();
      await capabilityTurn?.complete();
      await commitDeliveredProcessClosureNotices({
        admin, notices: pendingProcessClosureNotices.values(), talentId: user.id,
      });
      summarizeConversationInBackground();
      const profileSnapshot = await buildTalentProfileSnapshot({
        admin, conversationId, includeDocuments: documentsChanged, userId: user.id,
      });
      const assistantMessages = orderApplicationMessages(await attachPostingPreviewsToMessages({
        admin, messages: auxiliaryAssistantMessages, userId: user.id,
      }));
      const response = {
        ok: true,
        userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
        assistantMessage: assistantMessages.at(-1) ?? null,
        assistantMessages,
        historyChangedRoleId: changedOpportunityRoleId,
        historyShouldRefresh: opportunityRecommendationsChanged,
        careerCoachingCallReady,
        opportunityDiscoveryQueued: false,
        opportunityRun: serializeOpportunityRun(activeRun),
        progress: {
          answeredCount: userTurnCount, targetCount: TALENT_INTERVIEW_FINAL_STEP,
          completed: false, currentStep: currentProgressStep,
        },
        ...profileSnapshot,
      };
      return { response, profileSnapshot };
    };
    let emitToolStatus: ((message: string) => void) | null = null;
    let emitRecommendationStatus:
      | ((status: RecommendJobPostingStatus) => void)
      | null = null;
    let emitOpportunityRecommendationsChanged:
      | ((roleId: string | null) => void)
      | null = null;
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
    const persistInsightExtractionForAssistantMessage = async (args: {
      content: string;
      messageId: number | string | null | undefined;
    }) => {
      if (
        !shouldAutoExtractInsights ||
        !args.content.trim()
      ) {
        return;
      }

      const changedKeysCount = await extractTurnInsights(args.content);
      console.info("[TalentChat] insight extraction done", {
        changedKeysCount,
        conversationId,
        messageId: args.messageId ?? null,
        userId: user.id,
      });
    };
    const rememberRecommendationPostingRoleIds = (result: unknown) => {
      pendingRecommendationPostingRoleIds = normalizePostingRoleIds([
        ...pendingRecommendationPostingRoleIds,
        ...extractRecommendationPostingRoleIds(result),
      ]);
    };
    const rememberCareerCoachingActivityMessage = (result: unknown) => {
      const resultRecord = isRecord(result) ? result : null;
      const activityMessage = isRecord(resultRecord?.activityMessage)
        ? (resultRecord.activityMessage as TalentMessageResponse)
        : null;
      if (!activityMessage || !Number.isFinite(Number(activityMessage.id))) {
        return;
      }
      auxiliaryAssistantMessages = [
        ...auxiliaryAssistantMessages.filter(
          (message) => message.id !== activityMessage.id
        ),
        activityMessage,
      ];
      const uiAction = isRecord(resultRecord?.uiAction)
        ? resultRecord.uiAction
        : null;
      if (
        uiAction?.type === "open_career_coaching_call" &&
        isRecord(uiAction.activity)
      ) {
        careerCoachingCallReady =
          uiAction.activity as unknown as CareerCoachingActivity;
      }
    };
    const ensureRecommendationPostingLinks = (content: string) =>
      ensureStandalonePostingLinksInText(
        content,
        pendingRecommendationPostingRoleIds
      );
    const executeRecommendJobPostings = async (
      input: Record<string, unknown>
    ) => {
      let latestProgress: RecommendJobPostingStatus = { state: "running", phase: "query" };
      recordRecommendationStatus(latestProgress);

      try {
        const result = await executeTalentTool({
          context: {
            admin,
            abortSignal: executionSignal,
            onRecommendationSearchProgress: (progress) => {
              latestProgress = progress;
              recordRecommendationStatus(progress);
            },
            conversationId,
            isMobile,
            responseLocale,
            scheduleAfter: (task) => after(task),
            userMessageId: insertedUserMessage.id,
            userId: user.id,
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
          ...latestProgress,
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
        if (executionSignal.aborted) {
          throw error;
        }
        recordRecommendationStatus({ ...latestProgress, state: "error" }, { persist: true });
        throw error;
      }
    };
    const executeDefaultTalentTool = async (toolArgs: {
      input: Record<string, unknown>;
      name: string;
    }) => {
      const { toolInput } = splitToolUiStatus(toolArgs.input);
      if (toolArgs.name === TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS) {
        return executeRecommendJobPostings(toolInput);
      }

      let result = await executeTalentTool({
        context: {
          admin,
          abortSignal: executionSignal,
          deadlineAt,
          onArtifactMessage,
          presentForm: formPresenter.presentForm,
          conversationId,
          isMobile,
          responseLocale,
          registerProcessClosureNotices,
          scheduleAfter: (task) => after(task),
          userMessageId: insertedUserMessage.id,
          resumeRequestId: capabilityTurn?.replyId ?? `message:${insertedUserMessage.id}`,
          userId: user.id,
        },
        logging: false,
        name: toolArgs.name,
        input: toolInput,
      });
      if ((toolArgs.name === TALENT_TOOL_NAMES.GENERATE_RESUME || toolArgs.name === TALENT_TOOL_NAMES.UPSERT_DOCUMENT) && isRecord(result) && result.ok === true && typeof result.documentId === "string" && typeof result.documentLink === "string") {
        generatedDocumentLinks.set(result.documentId, result.documentLink);
      }
      rememberCareerCoachingActivityMessage(result);
      rememberRecommendationPostingRoleIds(result);

      if (toolArgs.name === TALENT_TOOL_NAMES.UPSERT_DOCUMENT || toolArgs.name === TALENT_TOOL_NAMES.GENERATE_RESUME) {
        documentsChanged = true;
      }

      const resultRecord = isRecord(result) ? result : null;
      if (
        shouldAutoExtractInsights &&
        toolArgs.name === TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE &&
        resultRecord?.ok === true
      ) {
        const savedProfileChanges = buildSavedProfileChangesForExtractor({
          input: toolInput,
          result: resultRecord,
        });
        if (savedProfileChanges) {
          savedProfileChangesForExtraction.add(savedProfileChanges);
        }
      }
      const changedRecommendedOpportunity =
        (toolArgs.name === TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK || toolArgs.name === TALENT_TOOL_NAMES.SAVE_JOB_POSTING) &&
        resultRecord?.ok === true;
      if (changedRecommendedOpportunity) {
        opportunityRecommendationsChanged = true;
        const opportunity = isRecord(resultRecord?.opportunity)
          ? resultRecord.opportunity
          : null;
        changedOpportunityRoleId =
          typeof resultRecord?.roleId === "string"
            ? resultRecord.roleId
            : typeof resultRecord?.targetRoleId === "string"
            ? resultRecord.targetRoleId.trim() || null
            : typeof opportunity?.roleId === "string"
              ? opportunity.roleId.trim() || null
              : null;
        emitOpportunityRecommendationsChanged?.(changedOpportunityRoleId);
      }

      return result;
    };

    if (streamResponse) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: string, data: unknown) => {
            if (req.signal.aborted || (executionSignal.aborted && event !== "done")) return;
            try {
              controller.enqueue(encoder.encode(createSseMessage(event, data)));
            } catch {
              // Client disconnected while a tool or model call was still resolving.
            }
          };
          emitArtifactMessage = (message) =>
            send("artifact_message", { message, suppressRolePreviews });
          emitToolStatus = (message) => send("tool_status", { message });
          emitRecommendationStatus = (status) =>
            send("recommendation_search_status", status);
          emitOpportunityRecommendationsChanged = (roleId) =>
            send("opportunity_recommendations_changed", { roleId });
          let committedAssistantText = "";
          let pendingAssistantText = "";
          let streamedAssistantText = "";
          let recommendationToolStarted = false;
          let recommendationStatusAfterCharCount: number | null = null;
          const sendVisibleTextDelta = (delta: string) => {
            pendingAssistantText = stripPostgresUnsafeChars(
              pendingAssistantText + delta
            ).replaceAll(TALENT_ONBOARDING_DONE_MARKER, "");
            const heldSuffixLength =
              getOnboardingMarkerPrefixSuffixLength(pendingAssistantText);
            const safeLength = Math.min(pendingAssistantText.length - heldSuffixLength, pendingAssistantText.length);
            if (safeLength <= 0) return;

            const visibleDelta = pendingAssistantText.slice(0, safeLength);
            pendingAssistantText = pendingAssistantText.slice(safeLength);
            if (messageWriter && committedAssistantText && streamedAssistantText === committedAssistantText) {
              streamedAssistantText += "\n\n";
              send("text_delta", { delta: "\n\n" });
            }
            streamedAssistantText += visibleDelta;
            send("text_delta", { delta: visibleDelta });
          };
          const flushVisibleText = (finalText: string) => {
            if (!finalText.startsWith(streamedAssistantText)) {
              pendingAssistantText = "";
              streamedAssistantText = finalText;
              send("assistant_text_replace", { content: finalText });
              return;
            }

            const missingText = finalText.slice(streamedAssistantText.length);
            pendingAssistantText = "";
            if (!missingText) return;
            streamedAssistantText += missingText;
            send("text_delta", { delta: missingText });
          };
          const commitAssistantProgress = async (text: string) => {
            const content = stripPostgresUnsafeChars(stripTalentOnboardingCompletionMarker(
              text
            ));
            if (!content.trim()) return;
            const message = await commitAssistantProgressRow(content);
            if (!message) return;
            flushVisibleText(messageWriter ? message.content : content);
            if (messageWriter) {
              committedAssistantText = message.content;
              send("assistant_progress", { message: toResponseMessage(message) });
              onArtifactMessage(toResponseMessage(message), false);
              return;
            }
            send("assistant_message", { message: toResponseMessage(message as TalentMessageRow), continuing: true });
            pendingAssistantText = "";
            streamedAssistantText = "";
            thinkingLogs = [];
          };
          const markRecommendationStatusAnchor = () => {
            if (recommendationStatusAfterCharCount !== null) return;
            recommendationStatusAfterCharCount = streamedAssistantText.length;
            send("recommendation_status_anchor", {
              contentLength: recommendationStatusAfterCharCount,
            });
          };
          const withRecommendationStatusAnchor = <
            T extends Record<string, unknown>,
          >(
            message: T
          ) =>
            recommendationStatusAfterCharCount === null
              ? message
              : {
                  ...message,
                  recommendationStatusAfterCharCount,
                };
          try {
            send("user_message", {
              message: toResponseMessage(insertedUserMessage as TalentMessageRow),
            });
            if(suppressRolePreviews) send("application_mode", {suppressRolePreviews:true});
            let assistantText: string;
            try {
              assistantText = await runCareerChatAssistantStream({
                abortSignal: executionSignal,
                toolRuntime: capabilityTurn?.runtime,
                hasDeliveredArtifact: () => deliveredArtifact || formPresenter.hasPending(),
                chatCompletionReasoningEffort:
                  textChatModel.chatCompletionReasoningEffort,
                messages: llmMessages,
                tools: toolDefinitions,
                isOnboardingActive,
                stopAfterToolNames: toolSelection.stopAfterToolNames,
                systemBlocks,
                responseLocale,
                onTextDelta: (delta) => {
                  if (!recommendationToolStarted) sendVisibleTextDelta(delta);
                },
                onAssistantMessage: commitAssistantProgress,
                onToolStart: (tool) => {
                  if (tool.name === TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS) {
                    recommendationToolStarted = true;
                    markRecommendationStatusAnchor();
                    recordRecommendationStatus({ state: "running" });
                    return;
                  }

                  const status = getCareerToolStartThinkingLog(
                    tool.name,
                    responseLocale
                  );
                  if (status) {
                    recordThinkingLog(status);
                  }
                },
                openAIResponsesReasoningEffort:
                  textChatModel.openAIResponsesReasoningEffort,
                primaryModel: textChatModel.model,
                executeTool: async ({ name, input }) => {
                  const { status, toolInput } = splitToolUiStatus(input);
                  if (name === TALENT_TOOL_NAMES.UPDATE_LANGUAGE_SETTING) {
                    const languageStatus = getCareerToolStartThinkingLog(
                      name,
                      responseLocale,
                      toolInput
                    );
                    if (languageStatus) recordThinkingLog(languageStatus);
                  }
                  if (status) {
                    recordThinkingLog(status);
                  }


                  return executeDefaultTalentTool({ name, input: toolInput });
                },
              });
            } catch (error) {
              throwIfToolControlError(error);
              executionSignal.throwIfAborted();
              const receipt = recommendationReceiptRef.current;
              if (!receipt) throw error;
              console.warn(
                "[TalentChat] Falling back to deterministic streamed recommendation receipt",
                {
                  conversationId,
                  error: error instanceof Error ? error.message : String(error),
                  outcome: receipt.outcome,
                  runId: receipt.statusRunId,
                  userId: user.id,
                }
              );
              assistantText = receipt.answerDraft;
            }


            let assistantTextSource = withGeneratedDocumentLinks(assistantText);
            if (recommendationReceiptRef.current) {
              assistantTextSource =
                recommendationReceiptRef.current.answerDraft;
            }
            if (!assistantTextSource.trim() && (deliveredArtifact || formPresenter.hasPending())) {
              const { response, profileSnapshot } = await finishArtifactOnlyTurn();
              send("assistant_text_done", { ok: true });
              send("assistant_messages", { messages: response.assistantMessages });
              send("progress", { progress: response.progress });
              send("talent_profile", profileSnapshot);
              if (response.careerCoachingCallReady) {
                send("career_coaching_call_ready", { activity: response.careerCoachingCallReady });
              }
              send("done", { ok: true });
              return;
            }
            if (!assistantTextSource) {
              assistantTextSource = (
                await recoverCareerChatAssistantText({
          checkCancellation: capabilityTurn?.runtime.options.checkCancellation ?? standaloneCancellation?.check,
          abortSignal: executionSignal,
                  latestUserMessage: normalizedContent,
                  messages: llmMessages,
                  onTextDelta: sendVisibleTextDelta,
                  responseLocale,
                  systemBlocks,
                })
              ).trim();
            }
            if (!assistantTextSource) {
              throw new Error(
                "Career assistant returned no visible text after recovery."
              );
            }

            let assistantTextWithMarkers = assistantTextSource;

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
          abortSignal: executionSignal,
                  latestUserMessage: normalizedContent,
                  messages: llmMessages,
                  onTextDelta: sendVisibleTextDelta,
                  responseLocale,
                  systemBlocks,
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
            safeAssistantText =
              ensureRecommendationPostingLinks(safeAssistantText);
            if (
              recommendationReceiptRef.current?.statusRunId &&
              recommendationReceiptRef.current.statusRelation
            ) {
              safeAssistantText = ensureOpportunityRunMarker(
                safeAssistantText,
                {
                  relation: recommendationReceiptRef.current.statusRelation,
                  runId: recommendationReceiptRef.current.statusRunId,
                }
              );
            } else {
              safeAssistantText = stripOpportunityRunMarkers(safeAssistantText);
            }
            const stoppedSourceMessage =
              await fetchStoppedRecommendationSourceMessage({
                admin,
                conversationId,
                messageId: insertedUserMessage.id,
                userId: user.id,
              });
            if (stoppedSourceMessage) {
              send("user_message", {
                message: toResponseMessage(stoppedSourceMessage),
              });
              send("done", { ok: true, stopped: true });
              return;
            }
            flushVisibleText(messageWriter ? [committedAssistantText, safeAssistantText].filter(Boolean).join("\n\n") : safeAssistantText);
            send("assistant_text_done", { ok: true });

            const { data: insertedAssistantMessage, error: assistantError } = messageWriter
              ? { data: await messageWriter.finish(safeAssistantText, thinkingLogs, replyPayload()), error: null }
              : await admin
                .from("talent_messages")
                .insert(
                  withIsMobile(
                    {
                      conversation_id: conversationId,
                      user_id: user.id,
                      role: "assistant",
                      content: safeAssistantText,
                      message_type: "chat",
                      payload: replyPayload(),
                      thinking_logs: thinkingLogs,
                    },
                    isMobile
                  )
                )
                .select("*")
                .single();

            if (assistantError || !insertedAssistantMessage) {
              throw new Error(
                assistantError?.message ?? "Failed to insert assistant message"
              );
            }

            // Reconcile the streamed placeholder with its durable ID before
            // onboarding extraction or other post-processing refreshes history.
            send("assistant_message", {
              message: toResponseMessage(insertedAssistantMessage as TalentMessageRow),
              continuing: true,
            });

            await commitDeliveredProcessClosureNotices({
              admin,
              notices: pendingProcessClosureNotices.values(),
              talentId: user.id,
            });

            await persistInsightExtractionForAssistantMessage({
              content: stripOpportunityRunMarkers(safeAssistantText),
              messageId: insertedAssistantMessage.id,
            });
            const finalAssistantThinkingLogs = thinkingLogs;
            summarizeConversationInBackground();

            const isCompleted = completion.completed;
            const shouldApplyCompletion =
              isCompleted && !skipConversationWrites;
            await updateConversationStageIfAllowed(isCompleted);

            const completedOpportunityRun =
              shouldApplyCompletion && completion.reason
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
            let insertedInitialSearchStartedMessage: TalentMessageRow | null =
              null;
            let insertedCompletionNextStepsMessage: TalentMessageRow | null =
              null;
            if (shouldApplyCompletion) {
              send("assistant_message", {
                message: withRecommendationStatusAnchor({
                  ...toResponseMessage(
                    insertedAssistantMessage as TalentMessageRow
                  ),
                  thinkingLogs: finalAssistantThinkingLogs,
                }),
              });
              sentFinalAssistantMessage = true;
              send("onboarding_wrapup_status", {
                state: "running",
              });
              const completionMessages =
                await createOnboardingCompletionMessages({
                  admin,
                  conversationId,
                  isMobile,
                  latestUserMessageId: insertedUserMessage.id,
                  opportunityRunId: completedOpportunityRun?.id ?? null,
                  userId: user.id,
                });
              insertedCompletionWrapupMessage =
                completionMessages.wrapupMessage;
              insertedInitialSearchStartedMessage =
                completionMessages.initialSearchStartedMessage;
              insertedCompletionNextStepsMessage =
                completionMessages.nextStepsMessage;
            }
            await formPresenter.flush();
            await capabilityTurn?.complete();
            const recommendationSearchRun = recommendationReceiptRef.current
              ?.statusRunId
              ? await fetchSerializedOpportunityRunForTalent({
                  admin,
                  runId: recommendationReceiptRef.current.statusRunId,
                  userId: user.id,
                }).catch((error) => {
                  console.error(
                    "[TalentChat] Failed to hydrate queued recommendation run",
                    {
                      error:
                        error instanceof Error ? error.message : String(error),
                      runId: recommendationReceiptRef.current?.statusRunId,
                      userId: user.id,
                    }
                  );
                  return null;
                })
              : null;
            const assistantResponseMessages =
              await attachPostingPreviewsToMessages({
                admin,
                messages: [
                  ...auxiliaryAssistantMessages.filter(message => message.id !== insertedAssistantMessage.id),
                  withRecommendationStatusAnchor({
                    ...toResponseMessage(
                      insertedAssistantMessage as TalentMessageRow
                    ),
                    thinkingLogs: finalAssistantThinkingLogs,
                    ...(recommendationSearchRun
                      ? {
                          recommendationSearchRelation:
                            recommendationReceiptRef.current?.statusRelation ??
                            null,
                          recommendationSearchRun,
                        }
                      : {}),
                  }),
                  insertedCompletionWrapupMessage
                    ? toResponseMessage(insertedCompletionWrapupMessage)
                    : null,
                  insertedInitialSearchStartedMessage
                    ? {
                        ...toResponseMessage(
                          insertedInitialSearchStartedMessage
                        ),
                        recommendationSearchRelation: "accepted" as const,
                        recommendationSearchRun: serializeOpportunityRun(
                          completedOpportunityRun
                        ),
                      }
                    : null,
                  insertedCompletionNextStepsMessage
                    ? toResponseMessage(insertedCompletionNextStepsMessage)
                    : null,
                ].filter(
                  (message): message is ReturnType<typeof toResponseMessage> =>
                    message !== null
                ),
                userId: user.id,
              });
            assistantResponseMessages.splice(0, assistantResponseMessages.length, ...orderApplicationMessages(assistantResponseMessages));
            if (assistantResponseMessages.length > 1) {
              send("assistant_messages", {
                messages: assistantResponseMessages,
              });
            } else if (!sentFinalAssistantMessage) {
              send("assistant_message", {
                message: assistantResponseMessages[0],
              });
            }
            if (careerCoachingCallReady) {
              send("career_coaching_call_ready", {
                activity: careerCoachingCallReady,
              });
            }
            if (shouldApplyCompletion) {
              send("onboarding_wrapup_status", {
                state: insertedCompletionWrapupMessage ? "completed" : "error",
              });
            }
            send("opportunity_run", {
              opportunityDiscoveryQueued: Boolean(
                completedOpportunityRun ||
                recommendationReceiptRef.current?.newRunCreated
              ),
              opportunityRun:
                serializeOpportunityRun(completedOpportunityRun) ??
                recommendationSearchRun ??
                serializeOpportunityRun(activeRun),
            });
            send("progress", {
              progress: {
                answeredCount: userTurnCount,
                targetCount: TALENT_INTERVIEW_FINAL_STEP,
                completed: shouldApplyCompletion,
                currentStep: currentProgressStep,
              },
            });
            const profileSnapshot = await buildTalentProfileSnapshot({
              admin,
              conversationId,
              includeDocuments: documentsChanged,
              userId: user.id,
            });
            send("talent_profile", profileSnapshot);
            send("done", { ok: true });
          } catch (error) {
            await messageWriter?.interrupt().catch(() => undefined);
            if (error instanceof CareerReplyContinuation) { send("done", { ok: true, continuationQueued: true }); return; }
            if (error instanceof CareerTurnCancelled || executionSignal.aborted) {
              send("done", { ok: true, stopped: true });
              return;
            }
            await notifyUnsupportedUnicodeEscapeError({
              conversationId,
              error,
              metadata: {
                channel: requestChannel,
                hasLink: Boolean(link),
                messageLength: message.length,
                streamedAssistantLength: streamedAssistantText.length,
                streamResponse: true,
              },
              route: "/api/talent/chat",
              stage: "stream",
              userId: user.id,
            });
            const errorMessage =
              error instanceof Error
                ? error.message
                : "Failed to process talent chat";
            send("error", { error: errorMessage });
          } finally {
            await releaseAgentTurn?.();
            emitArtifactMessage = null;
            emitToolStatus = null;
            emitRecommendationStatus = null;
            emitOpportunityRecommendationsChanged = null;
            try {
              controller.close();
            } catch {
              // Stream may already be closed after client abort.
            }
          }
        },
      });

      return new Response(stream, {
        headers: createSseHeaders(),
      });
    }

    let assistantText: string;
    try {
      assistantText = await runCareerChatAssistant({
        abortSignal: executionSignal,
        onAssistantMessage: async (text) => {
          const row = await commitAssistantProgressRow(text);
          if (!row) return;
          onArtifactMessage(toResponseMessage(row), false);
          if (!messageWriter) thinkingLogs = [];
        },
        toolRuntime: capabilityTurn?.runtime,
                hasDeliveredArtifact: () => deliveredArtifact || formPresenter.hasPending(),
        chatCompletionReasoningEffort:
          textChatModel.chatCompletionReasoningEffort,
        messages: llmMessages,
        tools: toolDefinitions,
        isOnboardingActive,
        stopAfterToolNames: toolSelection.stopAfterToolNames,
        systemBlocks,
        responseLocale,
        openAIResponsesReasoningEffort:
          textChatModel.openAIResponsesReasoningEffort,
        primaryModel: textChatModel.model,
        onToolStart: ({ name, input }) => {
          const status = getCareerToolStartThinkingLog(
            name,
            responseLocale,
            input
          );
          if (status) recordThinkingLog(status);
        },
        executeTool: async ({ name, input }) => {
          const { status, toolInput } = splitToolUiStatus(input);
          if (status) {
            recordThinkingLog(status);
          }


          return executeDefaultTalentTool({ name, input: toolInput });
        },
      });
    } catch (error) {
      throwIfToolControlError(error);
      executionSignal.throwIfAborted();
      const receipt = recommendationReceiptRef.current;
      if (!receipt) throw error;
      console.warn(
        "[TalentChat] Falling back to deterministic recommendation receipt",
        {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
          outcome: receipt.outcome,
          runId: receipt.statusRunId,
          userId: user.id,
        }
      );
      assistantText = receipt.answerDraft;
    }


    if (generatedDocumentLinks.size === 0) {
      logger.log("\n\nassistantText : ", assistantText, "\n\n");
    }

    let assistantTextSource = withGeneratedDocumentLinks(assistantText);
    if (recommendationReceiptRef.current) {
      assistantTextSource = recommendationReceiptRef.current.answerDraft;
    }
    if (!assistantTextSource.trim() && (deliveredArtifact || formPresenter.hasPending())) {
      const { response } = await finishArtifactOnlyTurn();
      await releaseAgentTurn?.();
      return NextResponse.json(response);
    }
    if (!assistantTextSource) {
      assistantTextSource = (
        await recoverCareerChatAssistantText({
          checkCancellation: capabilityTurn?.runtime.options.checkCancellation ?? standaloneCancellation?.check,
          abortSignal: executionSignal,
          latestUserMessage: normalizedContent,
          messages: llmMessages,
          responseLocale,
          systemBlocks,
        })
      ).trim();
    }
    if (!assistantTextSource) {
      throw new Error(
        "Career assistant returned no visible text after recovery."
      );
    }

    let assistantTextWithMarkers = assistantTextSource;

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
          abortSignal: executionSignal,
          latestUserMessage: normalizedContent,
          messages: llmMessages,
          responseLocale,
          systemBlocks,
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
    safeAssistantText = ensureRecommendationPostingLinks(safeAssistantText);
    if (
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

    const stoppedSourceMessage = await fetchStoppedRecommendationSourceMessage({
      admin,
      conversationId,
      messageId: insertedUserMessage.id,
      userId: user.id,
    });
    if (stoppedSourceMessage) {
      await releaseAgentTurn?.();
      return NextResponse.json({
        ok: true,
        stopped: true,
        userMessage: toResponseMessage(stoppedSourceMessage),
        assistantMessages: [],
      });
    }
    // --- Save assistant message ---
    const { data: insertedAssistantMessage, error: assistantError } = messageWriter
      ? { data: await messageWriter.finish(safeAssistantText, thinkingLogs, replyPayload()), error: null }
      : await admin
        .from("talent_messages")
        .insert(
          withIsMobile(
            {
              conversation_id: conversationId,
              user_id: user.id,
              role: "assistant",
              content: safeAssistantText,
              message_type: "chat",
              payload: replyPayload(),
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
          assistantTextLength: safeAssistantText.length,
          channel: requestChannel,
          messageLength: message.length,
          streamResponse: false,
          thinkingLogCount: thinkingLogs.length,
        },
        route: "/api/talent/chat",
        stage: "talent_messages.insert:assistant_message",
        userId: user.id,
      });
      await releaseAgentTurn?.();
      return NextResponse.json(
        {
          error: assistantError?.message ?? "Failed to insert assistant message",
        },
        { status: 500 }
      );
    }

    await commitDeliveredProcessClosureNotices({
      admin,
      notices: pendingProcessClosureNotices.values(),
      talentId: user.id,
    });

    await persistInsightExtractionForAssistantMessage({
      content: stripOpportunityRunMarkers(safeAssistantText),
      messageId: insertedAssistantMessage.id,
    });
    const finalAssistantThinkingLogs = thinkingLogs;
    summarizeConversationInBackground();

    // --- Completion check: explicit LLM onboarding-done marker only. ---
    const isCompleted = completion.completed;
    const shouldApplyCompletion = isCompleted && !skipConversationWrites;

    await updateConversationStageIfAllowed(isCompleted);

    const completedOpportunityRun =
      shouldApplyCompletion && completion.reason
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
    const completionMessages = shouldApplyCompletion
      ? await createOnboardingCompletionMessages({
          admin,
          conversationId,
          isMobile,
          latestUserMessageId: insertedUserMessage.id,
          opportunityRunId: completedOpportunityRun?.id ?? null,
          userId: user.id,
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

    const profileSnapshot = await buildTalentProfileSnapshot({
      admin,
      conversationId,
      includeDocuments: documentsChanged,
      userId: user.id,
    });
    const recommendationSearchRun = recommendationReceiptRef.current
      ?.statusRunId
      ? await fetchSerializedOpportunityRunForTalent({
          admin,
          runId: recommendationReceiptRef.current.statusRunId,
          userId: user.id,
        }).catch((error) => {
          console.error(
            "[TalentChat] Failed to hydrate queued recommendation run",
            {
              error: error instanceof Error ? error.message : String(error),
              runId: recommendationReceiptRef.current?.statusRunId,
              userId: user.id,
            }
          );
          return null;
        })
      : null;
    const assistantResponseMessages = await attachPostingPreviewsToMessages({
      admin,
      messages: [
        ...auxiliaryAssistantMessages.filter(message => message.id !== insertedAssistantMessage.id),
        {
          ...toResponseMessage(insertedAssistantMessage as TalentMessageRow),
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
          ? toResponseMessage(insertedCompletionWrapupMessage)
          : null,
        insertedInitialSearchStartedMessage
          ? {
              ...toResponseMessage(insertedInitialSearchStartedMessage),
              recommendationSearchRelation: "accepted" as const,
              recommendationSearchRun: serializeOpportunityRun(
                completedOpportunityRun
              ),
            }
          : null,
        insertedCompletionNextStepsMessage
          ? toResponseMessage(insertedCompletionNextStepsMessage)
          : null,
      ].filter(
        (message): message is ReturnType<typeof toResponseMessage> =>
          message !== null
      ),
      userId: user.id,
    });
    assistantResponseMessages.splice(0, assistantResponseMessages.length, ...orderApplicationMessages(assistantResponseMessages));
    const insertedAssistantResponseMessage = assistantResponseMessages.find(
      (message) => message.id === insertedAssistantMessage.id
    );

    await releaseAgentTurn?.();
    return NextResponse.json({
      ok: true,
      historyChangedRoleId: changedOpportunityRoleId,
      historyShouldRefresh: opportunityRecommendationsChanged,
      userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
      assistantMessage:
        insertedAssistantResponseMessage ??
        toResponseMessage(insertedAssistantMessage as TalentMessageRow),
      assistantMessages: assistantResponseMessages,
      careerCoachingCallReady,
      opportunityDiscoveryQueued: Boolean(
        completedOpportunityRun ||
        recommendationReceiptRef.current?.newRunCreated
      ),
      opportunityRun:
        serializeOpportunityRun(completedOpportunityRun) ??
        recommendationSearchRun ??
        serializeOpportunityRun(activeRun),
      progress: {
        answeredCount: userTurnCount,
        targetCount: TALENT_INTERVIEW_FINAL_STEP,
        completed: shouldApplyCompletion,
        currentStep: currentProgressStep,
      },
      ...profileSnapshot,
    });
  } catch (error) {
    await releaseAgentTurn?.();
    if (error instanceof CareerTurnCancelled || executionSignal.aborted) return NextResponse.json({ ok: true, stopped: true, userMessage: persistedSourceResponse });
    if (error instanceof CareerReplyContinuation) return NextResponse.json({ ok: true, continuationQueued: true, userMessage: persistedSourceResponse });
    if (error instanceof CareerAgentReplyUnavailable) {
      if (error.completed) return NextResponse.json({ ok: true, alreadyCompleted: true, userMessage: persistedSourceResponse });
      return NextResponse.json({ error: error.message, userMessage: persistedSourceResponse }, { status: 409 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to process talent chat";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
