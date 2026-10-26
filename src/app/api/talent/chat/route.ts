import { reportToolDiagnostic } from "@/lib/llm/toolExecution";
import { extractCareerDocumentLinks } from "@/lib/career/documentLinks";
import { executeApplicationPreparationTool } from "@/lib/career/simulation/toolExecution";
import { awaitApplicationInspection } from "@/lib/career/simulation/applicationInspection";
import { MANAGE_APPLICATION_SUGGESTIONS } from "@/lib/career/simulation/suggestions";
import { READY_FOR_ROLE } from "@/lib/career/simulation/readyForRole";
import { pendingApplicationBatch } from "@/lib/career/simulation/applicationInput";
import { applicationSessionToolResult } from "@/lib/career/simulation/sessionTool";
import { assertApplicationResumeWrite, recordApplicationResume } from "@/lib/career/simulation/resumeWorkflow";
import { documentFingerprint } from "@/lib/career/simulation/resumeAttachment";
import { orderApplicationMessages } from "@/lib/career/simulation/presentation";
import { extractStartOfferPayload, startOfferVisibleLength, type StartOfferPayload } from "@/lib/career/simulation/startOfferPayload";
import { prepareApplicationStartPayload } from "@/lib/career/simulation/startOfferStore";
import { renderableApplicationMarkdown } from "@/lib/career/simulation/applicationMarkdown";
import { after as afterApplicationResponse } from "next/server";
import { APPLY_TO_ROLE } from "@/lib/career/simulation/applicationBrowser";
import { startApplicationBrowser, resumeApplicationBrowser, runApplicationBrowser } from "@/lib/career/simulation/applicationBrowserServer";
import { enqueueApplicationBrowser } from "@/lib/career/simulation/applicationBrowserQueue";
import { stopApplicationBrowser } from "@/lib/career/simulation/agentsApi";

import { allPreparationAnswered } from "@/lib/career/simulation/preparation";
import { respondPreparationFromChat } from "@/lib/career/simulation/preparationService";
import { careerT } from "@/lib/career/translatedCareerMessage";
import { applicationStartRequestSchema } from "@/lib/career/simulation/startOffer";
import { claimApplicationStartOffer } from "@/lib/career/simulation/startOfferStore";
import {
  sessionOperation,
  saveSession,
  persistSimulationProposal,
  type SessionRecord,
} from "@/lib/career/simulation/sessionStore";
import {
  cardRequestSchema,
  resolveAnalysisCardAction,
  sessionMutationSchema,
  mutateSimulationSession,
} from "@/lib/career/simulation/session";
import {
  SIMULATION_TOOL_NAMES,
  SIMULATION_SESSION_TOOL,
  APPLICATION_PREPARATION_SESSION_ACTIONS,
} from "@/lib/career/simulation/sessionTool";
import { createCareerCapabilityTurn, isCareerCapabilityTurn } from "@/lib/career/capabilities/server";
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
  withTalentToolAssistantInstruction,
} from "@/lib/talentOnboarding/tools";
import { fetchActiveInternalFitHoldQuestion } from "@/lib/talentOnboarding/internalFitHoldQuestion";
import { commitDeliveredProcessClosureNotices } from "@/lib/talentOnboarding/processClosureNotice";
import type { PendingProcessClosureNotice } from "@/lib/talentOnboarding/tools";
import { insertTalentToolUsageLog } from "@/lib/talentOnboarding/toolUsageLog";
import { canStartApplication, resolveCareerChatTools } from "@/lib/career/llmTools";
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
  getRecommendJobPostingsChatPreamble,
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
  COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
  fetchRecentCompanySnapshot,
  formatCompanySnapshotMessage,
  getOrCreateCompanySnapshot,
  touchConversation,
} from "@/lib/career/companySnapshot";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
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
  clientRequestId?: string;
  allowedToolNames?: unknown;
  channel?: string;
  simulationAction?: unknown;
  applicationInputSubmission?: {batchId:string; sessionMessageId:number; expectedRevision:number};
  coachingActivityAction?: unknown;
  conversationStarterId?: string;
  conversationId?: string;
  locale?: string;
  message?: string;
  messageType?: unknown;
  opportunityMentions?: unknown;
  pendingAction?: unknown;
  textChatModel?: unknown;
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

type CompanySnapshotToolResult = {
  messages: ReturnType<typeof toTalentMessageResponse>[];
};

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

const optionalToolString = (value: unknown) => {
  const text =
    typeof value === "string" ? stripPostgresUnsafeChars(value).trim() : "";
  return text || null;
};

const normalizeAllowedToolNames = (value: unknown) => {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
};

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
    const allowedToolNames = normalizeAllowedToolNames(body.allowedToolNames);
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
    if (!message && uploadedDocumentIds.length === 0 && !body.applicationInputSubmission) {
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

    const touchConversationIfAllowed = async () => {
      if (skipConversationWrites) return;
      await touchConversation(admin, conversationId, user.id);
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

    const simulationStore = { admin, userId: user.id, conversationId };
    let simulationSession: SessionRecord | null = null;
    let simulationSchemaAvailable = true;
    try {
      simulationSession = await sessionOperation({
        ...simulationStore,
        operation: "touch",
      });
    } catch (error) {
      // Deploying code before its migration must not break ordinary Career chat.
      if (
        error instanceof Error &&
        ["PGRST202", "42883"].includes(
          String((error as Error & { code?: string }).code)
        )
      )
        simulationSchemaAvailable = false;
      else throw error;
    }
    const submission = body.applicationInputSubmission;
    let applicationQuestionsAsked = false;
    let responseStartOffer: StartOfferPayload | undefined;
    const dispatchBrowser = async (record: SessionRecord) => {
      if (process.env.NODE_ENV === "development") afterApplicationResponse(() => runApplicationBrowser(simulationStore, record.messageId));
      else await enqueueApplicationBrowser(user.id, conversationId, record.messageId, record.state.revision);
    };
    if (submission && simulationSession?.state.status === "active" && simulationSession.messageId === submission.sessionMessageId) {
      simulationSession = await awaitApplicationInspection(simulationStore, simulationSession);
    }
    if (submission) {
      const batch = simulationSession?.state.activity?.batches.find(b=>b.id===submission.batchId);
      if (!batch || batch.status!=="submitted" || !["pending","failed"].includes(batch.continuation) || simulationSession?.state.status!=="active" || simulationSession.messageId!==submission.sessionMessageId || simulationSession.state.revision<submission.expectedRevision) {
        return NextResponse.json({error:"Question submission is no longer current"},{status:409});
      }
      if (batch.browser) {
        const resumed=await resumeApplicationBrowser(simulationStore,simulationSession,submission.batchId);
        await dispatchBrowser(resumed);
        return NextResponse.json({ok:true,assistantMessages:"message" in resumed ? [resumed.message] : [],messages:[],conversationId});
      }
      const state=structuredClone(simulationSession.state);
      state.activity!.batches.find(b=>b.id===batch.id)!.continuation="running";
      state.activity!.batches.find(b=>b.id===batch.id)!.continuationStartedAt=new Date().toISOString();
      simulationSession=await saveSession(simulationStore,simulationSession,state,`continue:${batch.id}:${state.revision}`);
      message = `The user submitted application question batch ${batch.id}. Use that batch in the current application context to continue from their answers; do not ask them to repeat the answers.`;
    }
    const finishApplicationContinuation = async (failed=false) => {
      if (!submission) return;
      const latest=await sessionOperation({...simulationStore,operation:"read",messageId:submission.sessionMessageId});
      if (!latest || latest.state.status!=="active") return;
      const state=structuredClone(latest.state), batch=state.activity?.batches.find(b=>b.id===submission.batchId);
      if (!batch || batch.continuation!=="running") return;
      batch.continuation=failed?"failed":"done";
      simulationSession=await saveSession(simulationStore,latest,state,`continued:${batch.id}:${failed}`);
    };
    let requestedApplicationStart: Awaited<
      ReturnType<typeof claimApplicationStartOffer>
    > | null = null;
    const startRequest =
      body.simulationAction &&
      (body.simulationAction as { action?: unknown }).action === "start"
        ? applicationStartRequestSchema.safeParse(body.simulationAction)
        : null;
    if (startRequest) {
      if (!startRequest.success)
        return NextResponse.json(
          { error: "Invalid application start request" },
          { status: 400 }
        );
      if (!canStartApplication({
        channel: requestChannel,
        isOnboardingDone: talentSetting?.is_onboarding_done,
        allowedToolNames,
        responseLocale,
      }))
        return NextResponse.json({ error: "Application preparation is unavailable in this request." }, { status: 403 });
      if (simulationSession?.state.activity?.offerId === startRequest.data.sessionMessageId) {
        return NextResponse.json({ok:true,alreadyStarted:true,assistantMessages:[],messages:[],conversationId});
      }
      if (
        simulationSession?.state.status === "active" ||
        careerCoachingActivity?.status === "active" ||
        careerCoachingActivity?.status === "suggested"
      )
        return NextResponse.json(
          {
            error:
              "Finish the current activity before starting a new application.",
          },
          { status: 409 }
        );
      try {
        requestedApplicationStart = await claimApplicationStartOffer({
          admin,
          userId: user.id,
          conversationId,
          messageId: startRequest.data.sessionMessageId,
          documentId: startRequest.data.documentId,
        });
        // Preserve the exact optimistic user message; the verified role is in the offer.
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Unable to start" },
          { status: 409 }
        );
      }
    }
    const textChatModel = resolveCareerTextChatModelForRequest(
      body.textChatModel,
      requestChannel === "chat" && canUseCareerDevControls(user.email),
      Boolean(requestedApplicationStart) || simulationSession?.state.status === "active"
    );
    const simulationCardAction =
      !startRequest && body.simulationAction
        ? cardRequestSchema.safeParse(body.simulationAction)
        : null;
    if (simulationCardAction && !simulationCardAction.success)
      return NextResponse.json(
        { error: "Invalid simulation action" },
        { status: 400 }
      );
    if (
      simulationCardAction?.success &&
      (!simulationSession ||
        simulationSession.state.status !== "active" ||
        simulationSession.messageId !==
          simulationCardAction.data.sessionMessageId ||
        simulationSession.state.revision !==
          simulationCardAction.data.expectedRevision)
    )
      return NextResponse.json(
        {
          error:
            "This simulation card is no longer current. Reload the conversation.",
        },
        { status: 409 }
      );

    if (
      simulationCardAction?.success &&
      simulationCardAction.data.action !== "end"
    ) {
      const target = simulationSession?.state.actions.find(
        (a) => a.id === simulationCardAction.data.actionId
      );
      if (!target || ["completed", "skipped"].includes(target.status))
        return NextResponse.json(
          { error: "This action is no longer available." },
          { status: 409 }
        );
    }
    if (simulationCardAction?.success && simulationSession) {
      const action = simulationCardAction.data;
      if (action.action === "select_analysis") {
        const target = resolveAnalysisCardAction(simulationSession.state, action);
        if (!target) return NextResponse.json({ error: "This analysis action is no longer available." }, { status: 409 });
        message = careerT(responseLocale, "career.simulation.actionRequest", "‘{title}’ 액션을 함께 진행해 주세요.", { values: { title: target.title } });
      } else if (action.action === "select") {
        const proposal = simulationSession.state.proposal;
        if (!proposal || proposal.actionId !== action.actionId)
          return NextResponse.json(
            { error: "This proposal is no longer available." },
            { status: 409 }
          );
        // Resolve the request from the stored proposal, never from a client-supplied execution prompt.
        message = proposal.request;
      } else {
        message =
          action.action === "end"
            ? responseLocale === "ko"
              ? "시뮬레이트는 여기서 마칠게요."
              : "End this simulation session."
            : responseLocale === "ko"
              ? "이 액션은 건너뛸게요."
              : "Skip this action.";
      }
    }
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
      applicationStartRequested: Boolean(requestedApplicationStart),
      applicationActive: simulationSession?.state.status === "active",
      applicationInputSubmitted: Boolean(submission),
      channel: requestChannel,
      isOnboardingDone: Boolean(talentSetting?.is_onboarding_done),
      allowedToolNames,
    });
    const { data: insertedUserMessage, error: userMessageError } = submission
      ? await admin.from("talent_messages").select("*").eq("conversation_id", conversationId).eq("user_id", user.id).order("id", {ascending:false}).limit(1).single()
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
            ...(trackCapabilities ? { payload: initialCareerCapabilityPayload(capabilityMode) } : {}),
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
    // The current activity already carries its immutable suggestions, answers,
    // resume and role facts. Older application transcripts describe other runs
    // and must not become examples or instructions for this preparation.
    const applicationHistoryStart = simulationSession?.state.status === "active"
      ? simulationSession.messageId
      : null;
    const promptMessages = applicationHistoryStart !== null
      ? recentMessages.filter((item) => Number(item.id) >= applicationHistoryStart)
      : recentMessages;

    const llmMessages = promptMessages
      .filter(
        (item) =>
          !["simulation_session", "simulation_action"].includes(
            item.message_type ?? ""
          ) &&
          !(
            simulationSession?.state.status === "active" &&
            item.message_type === "application_simulation"
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

    if (submission) llmMessages.push({role: "user", content: message});

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
    if (simulationCardAction?.success && simulationSession) {
      const action = simulationCardAction.data;
      const mutation =
        action.action === "end"
          ? { action: "end" as const }
          : action.action === "skip"
            ? {
                action: "update_action" as const,
                actionId: action.actionId,
                status: "skipped" as const,
                reason: "User chose to skip this action.",
              }
            : { action: "select" as const, actionId: action.actionId };
      simulationSession = await saveSession(
        simulationStore,
        simulationSession,
        mutateSimulationSession(
          simulationSession.state,
          mutation,
          Number(insertedUserMessage.id)
        ),
        `card:${insertedUserMessage.id}`
      );
    }
    const toolSelection = resolveCareerChatTools({
      simulationActive: simulationSession?.state.status === "active",
        simulationPreparation: Boolean(simulationSession?.state.preparation),
      activeInternalFitHoldQuestion: Boolean(activeInternalFitHoldQuestion),
      allowedToolNames,
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
      selectedPendingActionRuntimeInstruction,
      uploadedDocumentRuntimeInstruction,
      coachingActivityActionRuntimeInstruction,
    ]
      .filter((value): value is string => Boolean(value))
      .join("\n\n");
    let applicationStartOutcomeInstruction: string | undefined;
    const currentPromptArgs = (): Parameters<typeof buildCareerConversationPromptPlan>[0] => ({
        simulationAvailability: !simulationSchemaAvailable
          ? "unavailable"
          : simulationSession?.state.status === "active"
            ? undefined
            : "inactive",
        simulationSession:
          simulationSession?.state.status === "active"
            ? simulationSession.state
            : undefined,
        activeInternalFitHoldQuestion,
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
        conversationMode:
          simulationSession?.state.status === "active"
            ? "simulation"
            : careerCoachingActivity?.status === "active"
              ? "career_coaching"
              : conversationStarter?.id === "career_coaching"
                ? "default"
                : (conversationStarter?.id ?? "default"),
        recentActivitySummaries,
        recentRecommendedOpportunitiesText,
        runtimeInstruction: [
          simulationSession?.state.status === "active" ? uploadedDocumentRuntimeInstruction : runtimeInstruction,
          applicationStartOutcomeInstruction,
        ].filter(Boolean).join("\n\n") || undefined,
        structuredProfileText,
        timeZone: promptTimeZone,
        toolNames: toolSelection.toolNames,
      });
    const buildCurrentPromptPlan = () => buildCareerConversationPromptPlan(currentPromptArgs());
    const capabilityPromptArgs = currentPromptArgs();
    if (simulationSession?.state.status === "active" && !submission) {
      simulationSession = await saveSession(simulationStore, simulationSession, {...simulationSession.state, lastActivityAt: new Date().toISOString()}, `user-turn:${insertedUserMessage.id}`);
    }
    const { isOnboardingActive, promptBlocks } = buildCurrentPromptPlan();
    const capabilityTurn = trackCapabilities ? await createCareerCapabilityTurn({
    origin: "web",
      admin, userId: user.id, conversationId, sourceMessage: submission ? null : insertedUserMessage as TalentMessageRow,
      mode: capabilityMode, eligibleTools: toolSelection.tools, promptArgs: capabilityPromptArgs,
      getPromptArgs: currentPromptArgs,
      getEligibleTools: () => resolveCareerChatTools({
        simulationActive: simulationSession?.state.status === "active",
        simulationPreparation: Boolean(simulationSession?.state.preparation),
        activeInternalFitHoldQuestion: Boolean(activeInternalFitHoldQuestion),
        allowedToolNames,
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
    const initialCapabilityStep = capabilityTurn?.runtime.resolveStep(false);
    if (initialCapabilityStep) toolDefinitions = initialCapabilityStep.tools;
    const systemBlocks = initialCapabilityStep?.systemBlocks ?? promptBlocks;
    const refreshSimulationRuntime = async () => {
      if (!simulationSchemaAvailable) return;
      simulationSession = await sessionOperation({
        ...simulationStore,
        operation: "read",
      });
      careerCoachingActivity = await fetchCurrentCareerCoachingActivity({
        admin,
        conversationId,
        userId: user.id,
      });
      const selected = resolveCareerChatTools({
        simulationActive: simulationSession?.state.status === "active",
        simulationPreparation: Boolean(simulationSession?.state.preparation),
        allowedToolNames,
        channel: requestChannel,
        hasActiveGmailIntegration: Boolean(activeGmailIntegration),
        isOnboardingDone: talentSetting?.is_onboarding_done,
        responseLocale,
      });
      toolDefinitions.splice(0, toolDefinitions.length, ...selected.tools);
      toolSelection.stopAfterToolNames.splice(0, toolSelection.stopAfterToolNames.length, ...selected.stopAfterToolNames);
      toolSelection.toolNames.splice(
        0,
        toolSelection.toolNames.length,
        ...selected.toolNames
      );
      systemBlocks.splice(
        0,
        systemBlocks.length,
        ...buildCurrentPromptPlan().promptBlocks
      );
    };

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
    const preparedCompanySnapshotRef: {
      current: CompanySnapshotToolResult | null;
    } = { current: null };
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
    if (simulationSession) {
      const snapshot = await sessionOperation({
        ...simulationStore,
        operation: "read",
        messageId: simulationSession.messageId,
      });
      if (snapshot) auxiliaryAssistantMessages.push(snapshot.message);
    }
    if (requestedApplicationStart)
      auxiliaryAssistantMessages.push(requestedApplicationStart.message);
    let suppressRolePreviews = Boolean(requestedApplicationStart || simulationSession?.state.status === "active");
    let proposalChanged = false;
    let analysisCompletedThisTurn = false;
    let careerCoachingCallReady: CareerCoachingActivity | null = null;
    let emitSimulationMessage:
      | ((message: TalentMessageResponse) => void)
      | null = null;
    let simulationResult: Promise<unknown> | null = null;
    let simulationInputKey: string | null = null;
    let activityTransport = simulationSession?.state;
    const onSimulationMessage = (message: TalentMessageResponse) => {
      if (message.simulationSession?.activity) activityTransport=message.simulationSession;
      if (activityTransport?.activity) message={...message,applicationActivity:{activityId:activityTransport.sessionId,revision:activityTransport.revision,view:message.messageType,runId:message.applicationDraft?.runId ?? activityTransport.analysisStartedAt}};
      if (message.simulation?.status === "completed") analysisCompletedThisTurn = true;
      if(message.applicationStartOffer || message.simulation || message.simulationSession?.status === "active") suppressRolePreviews=true;
      auxiliaryAssistantMessages = [
        ...auxiliaryAssistantMessages.filter((item) => item.id !== message.id),
        message,
      ];
      emitSimulationMessage?.(message);
    };
    const attachResponseStartOffer = async (replyId: number) => {
      if (!responseStartOffer || simulationSession?.state.status === "active") return;
      try {
        const card = await prepareApplicationStartPayload({ admin, userId: user.id, conversationId, replyId, request: responseStartOffer });
        auxiliaryAssistantMessages.push(card);
      } catch (error) {
        console.error("[application-start] Could not prepare response card", { replyId, error: error instanceof Error ? error.message : "Unknown error" });
      }
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
        simulationSession ||
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
            abortSignal: req.signal,
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
        if (req.signal.aborted) {
          throw error;
        }
        recordRecommendationStatus({ ...latestProgress, state: "error" }, { persist: true });
        throw error;
      }
    };
    const executeDefaultTalentTool = async (toolArgs: {
      input: Record<string, unknown>;
      name: string;
      startConfirmed?: boolean;
    }) => {
      const { toolInput } = splitToolUiStatus(toolArgs.input);
      if (simulationSession?.state.status === "active" && !toolArgs.startConfirmed && !SIMULATION_TOOL_NAMES.includes(toolArgs.name))
        throw new Error("Tool unavailable in Apply with Harper mode");
      if (toolArgs.name === APPLY_TO_ROLE) {
        if (!simulationSession || simulationSession.state.status !== "active") throw new Error("No active application");
        const saved=await startApplicationBrowser(simulationStore,simulationSession,toolInput);
        simulationSession=saved;
        onSimulationMessage(saved.message);
        await dispatchBrowser(saved);
        applicationQuestionsAsked=true;
        thinkingLogs.length=0;
        return {ok:true,applicationInProgress:true};
      }
      if(toolArgs.name===MANAGE_APPLICATION_SUGGESTIONS) {
        if(!simulationSession) throw new Error("No active application");
        const execution = await executeApplicationPreparationTool({ store: simulationStore, record: simulationSession, name: toolArgs.name, input: toolInput, messageId: Number(insertedUserMessage.id), submittedBatchId: submission?.batchId });
        const saved=execution!.record;
        simulationSession=saved;
        onSimulationMessage(saved.message);
        const awaitingUserInput=!!pendingApplicationBatch(saved.state);
        if(awaitingUserInput) {applicationQuestionsAsked=true;thinkingLogs.length=0;}
        await refreshSimulationRuntime();
        return execution!.result;
      }
      if(toolArgs.name===READY_FOR_ROLE) {
        if(!simulationSession) throw new Error("No active application");
        const prepared=await executeApplicationPreparationTool({ store: simulationStore, record: simulationSession, name: toolArgs.name, input: toolInput, messageId: Number(insertedUserMessage.id), submittedBatchId: submission?.batchId });
        if (!prepared || !("documentId" in prepared.result)) throw new Error("Prepared document unavailable");
        simulationSession=prepared.record;
        onSimulationMessage(prepared.record.message);
        generatedDocumentLinks.set(prepared.result.documentId,prepared.result.documentLink);
        documentsChanged=true;
        await refreshSimulationRuntime();
        return prepared.result;
      }
      if (toolArgs.name === SIMULATION_SESSION_TOOL) {
        if (toolInput.action === "list" || toolInput.action === "resume") {
          const { manageSavedApplications } = await import("@/lib/career/simulation/savedApplications");
          const result = await manageSavedApplications(simulationStore, toolInput, `turn:${insertedUserMessage.id}`, onSimulationMessage);
          await refreshSimulationRuntime();
          return result;
        }
        if (!simulationSession || simulationSession.state.status !== "active")
          return { ok: false, reason: "No active simulation session." };
        const mutation = sessionMutationSchema.parse(toolInput);
        if (simulationSession.state.preparation && !APPLICATION_PREPARATION_SESSION_ACTIONS.includes(mutation.action))
          throw new Error("Use manage_application_suggestions to resolve or revise preparation suggestions.");
        if(simulationSession.state.browser && ["queued","running"].includes(simulationSession.state.browser.status) && !["end","request_switch","cancel_switch"].includes(mutation.action)) throw new Error("The browser is using the current application data. Stop it before changing those details.");
        if (mutation.action === "end") await stopApplicationBrowser(simulationSession.state.browser);
        if (mutation.action === "propose" && analysisCompletedThisTurn && !simulationSession.state.preparation) {
          return { ok: false, reason: "The analysis already displays the action list. A separate reminder card is available in a later user turn; continue this reply briefly in prose." };
        }
        if (mutation.action === "generate_draft") throw new Error("Write the revised document in ordinary chat instead.");
        if (mutation.action === "respond") {
          if(!mutation.actionId || !mutation.response) return {ok:false,reason:"Response required"};
          const saved=await respondPreparationFromChat(simulationStore,simulationSession,mutation.actionId,mutation.response,Number(insertedUserMessage.id),`response:${submission?.batchId ?? insertedUserMessage.id}:${JSON.stringify(mutation)}`);
          const batch=saved.state.activity?.batches.find(b=>b.browser && b.status === "submitted" && b.continuation === "pending");
          if(batch) {
            simulationSession=await resumeApplicationBrowser(simulationStore,saved,batch.id);
            await dispatchBrowser(simulationSession);
          } else simulationSession=saved;
          onSimulationMessage(saved.message);
          await refreshSimulationRuntime();
          return {ok:true, responseRecorded:true, draftAvailable:simulationSession.state.preparation?.generation.status==="ready"};
        }
        const saved = await saveSession(
          simulationStore,
          simulationSession,
          mutateSimulationSession(
            simulationSession.state,
            mutation,
            Number(insertedUserMessage.id)
          ),
          `turn:${submission?.batchId ?? insertedUserMessage.id}:${JSON.stringify(mutation)}`
        );
        simulationSession = saved;
        onSimulationMessage(saved.message);
        if (mutation.action === "propose") proposalChanged = true;
        await refreshSimulationRuntime();
        return applicationSessionToolResult(saved.state, mutation.action);
      }
      if (toolArgs.name === TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS) {
        return executeRecommendJobPostings(toolInput);
      }

      if (toolArgs.name === TALENT_TOOL_NAMES.SIMULATE_APPLICATION) {
        if (toolArgs.startConfirmed && !simulationSchemaAvailable)
          return {
            ok: false,
            reason:
              "Simulation sessions are unavailable until the database migration is applied. No analysis or edits were started.",
          };
        const key = JSON.stringify([
          toolInput.roleId,
          toolInput.official_job_slug,
          toolInput.document_id,
          toolInput.profile_only === true,
        ]);
        if (simulationInputKey !== null && simulationInputKey !== key) {
          return {
            ok: false,
            reason:
              "One role and source can be simulated per chat turn. The existing card belongs to the first selected role. Ask the user to request the other analysis in the next turn.",
          };
        }
        simulationInputKey = key;
        simulationResult ??= executeTalentTool({
          context: {
            admin,
            abortSignal: req.signal,
            conversationId,
            isMobile,
            responseLocale,
            userMessageId: insertedUserMessage.id,
            userId: user.id,
            onSimulationMessage,
            scheduleAfter: (task) => afterApplicationResponse(task),
            simulationStartConfirmed: toolArgs.startConfirmed === true,
            textChatModel: textChatModel.model,
            simulationStartOfferId: toolArgs.startConfirmed ? requestedApplicationStart?.message.id : undefined,
          },
          logging: false,
          name: toolArgs.name,
          input: toolInput,
        });
        if (toolArgs.startConfirmed) {
          const preparationRun = simulationResult;
          afterApplicationResponse(async () => { await preparationRun; });
        }
        try {
          const result = await simulationResult;
          if (isRecord(result) && result.startCardDisplayed === true && result.awaitingUserInput === true)
            applicationQuestionsAsked = true;
          return result;
        } finally {
          try { await refreshSimulationRuntime(); }
          catch (error) { req.signal.throwIfAborted(); reportToolDiagnostic({ error, source: "context_refresh" }); }
        }
      }

      if (toolArgs.name === TALENT_TOOL_NAMES.GENERATE_RESUME && simulationSession?.state.status === "active") {
        if(simulationSession.state.preparation) throw new Error("Use ready_for_role to preserve the selected source and save the prepared resume");
        assertApplicationResumeWrite(simulationSession.state);
      }
      const result = await executeTalentTool({
        context: {
          admin,
          abortSignal: req.signal,
          conversationId,
          isMobile,
          responseLocale,
          suppressCommonAssistantInstruction: simulationSession?.state.status === "active",
          registerProcessClosureNotices,
          scheduleAfter: (task) => after(task),
          userMessageId: insertedUserMessage.id,
          resumeRequestId: submission ? `${conversationId}:application-answers:${submission.batchId}` : typeof body.clientRequestId === "string" && /^[0-9a-f-]{36}$/i.test(body.clientRequestId) ? `${conversationId}:${body.clientRequestId}` : undefined,
          userId: user.id,
        },
        logging: false,
        name: toolArgs.name,
        input: toolInput,
      });
      if ((toolArgs.name === TALENT_TOOL_NAMES.GENERATE_RESUME || toolArgs.name === TALENT_TOOL_NAMES.WRITE_DOCUMENT) && isRecord(result) && result.ok === true && typeof result.documentId === "string" && typeof result.documentLink === "string") {
        generatedDocumentLinks.set(result.documentId, result.documentLink);
        if (toolArgs.name === TALENT_TOOL_NAMES.GENERATE_RESUME && simulationSession?.state.status === "active" && simulationSession.state.preparation && typeof result.revision === "number" && typeof result.fileName === "string") {
          const state = recordApplicationResume(simulationSession.state, {documentId: result.documentId, revision: result.revision, fileName: result.fileName});
          const saved = await saveSession(simulationStore, simulationSession, state, `resume:${result.documentId}:${result.revision}`);
          simulationSession = saved;
          onSimulationMessage(saved.message);
          await refreshSimulationRuntime();
        }
      }
      rememberCareerCoachingActivityMessage(result);
      rememberRecommendationPostingRoleIds(result);

      if (toolArgs.name === TALENT_TOOL_NAMES.UPDATE_DOCUMENT || toolArgs.name === TALENT_TOOL_NAMES.GENERATE_RESUME || toolArgs.name === TALENT_TOOL_NAMES.WRITE_DOCUMENT) {
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

    const startRequestedApplication = async () => {
      if (!requestedApplicationStart) return;
      onSimulationMessage(requestedApplicationStart.message);
      const result = await executeDefaultTalentTool({
        name: TALENT_TOOL_NAMES.SIMULATE_APPLICATION,
        input: requestedApplicationStart.input,
        startConfirmed: true,
      });
      if(isRecord(result) && result.awaitingUserInput===true) applicationQuestionsAsked=true;
      applicationStartOutcomeInstruction = `The user pressed Start. Verified preparation outcome: ${JSON.stringify(result)}. Suggestions are already published in the composer when awaitingUserInput is true; do not duplicate them or ask another batch. If preparation succeeded and no suggestions are needed, review the now-inspected required application fields first, propose only essential missing information or materials if needed, otherwise call ready_for_role with action=reuse. Its result decides whether to offer assisted application or provide the direct application link. If preparation failed or was interrupted, distinguish the already displayed start card and started work from the unfinished preparation; do not claim that neither existed. Briefly explain the known blocker without inventing a cancellation reason. The role and selected resume are already known: offer to retry with those, without asking the user to identify them again or directing them to press an already consumed Start button. Include the application link when available.`;
      systemBlocks.push({
        key: "application_start_outcome",
        text: applicationStartOutcomeInstruction,
      });
    };

    if (streamResponse) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: string, data: unknown) => {
            if (req.signal.aborted) return;
            try {
              controller.enqueue(encoder.encode(createSseMessage(event, data)));
            } catch {
              // Client disconnected while a tool or model call was still resolving.
            }
          };
          emitSimulationMessage = (message) =>
            send("simulation_message", { message, suppressRolePreviews });
          emitToolStatus = (message) => send("tool_status", { message });
          emitRecommendationStatus = (status) =>
            send("recommendation_search_status", status);
          emitOpportunityRecommendationsChanged = (roleId) =>
            send("opportunity_recommendations_changed", { roleId });
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
            const safeLength = Math.min(pendingAssistantText.length - heldSuffixLength, startOfferVisibleLength(pendingAssistantText));
            if (safeLength <= 0) return;

            const visibleDelta = pendingAssistantText.slice(0, safeLength);
            pendingAssistantText = pendingAssistantText.slice(safeLength);
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
          const clearToolPreamble = () => {
            if (!streamedAssistantText && !pendingAssistantText) return;
            pendingAssistantText = "";
            streamedAssistantText = "";
            send("assistant_text_replace", { content: "" });
          };
          let injectedRecommendationToolPreamble = "";
          const ensureRecommendationToolPreamble = () => {
            if (
              injectedRecommendationToolPreamble ||
              streamedAssistantText.trim() ||
              pendingAssistantText.trim()
            ) {
              return;
            }

            const recommendationToolPreamble =
              getRecommendJobPostingsChatPreamble(responseLocale);
            injectedRecommendationToolPreamble = recommendationToolPreamble;
            sendVisibleTextDelta(`${recommendationToolPreamble}\n\n`);
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
            if (!submission) send("user_message", {
              message: toResponseMessage(
                insertedUserMessage as TalentMessageRow
              ),
            });

            if(suppressRolePreviews) send("application_mode", {suppressRolePreviews:true});
            let assistantText: string;
            try {
              await startRequestedApplication();
              assistantText = applicationQuestionsAsked ? "" : await runCareerChatAssistantStream({
                toolRuntime: capabilityTurn?.runtime,
                chatCompletionReasoningEffort:
                  textChatModel.chatCompletionReasoningEffort,
                messages: llmMessages,
                tools: toolDefinitions,
                isOnboardingActive,
                stopAfterToolNames: toolSelection.stopAfterToolNames,
                systemBlocks,
                responseLocale,
                onTextDelta: (delta) => {
                  if (!recommendationToolStarted && !simulationSession?.state.activity) sendVisibleTextDelta(delta);
                },
                onToolDetected: (tool) => {
                  if (tool.name !== TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS) {
                    clearToolPreamble();
                  }
                },
                onToolStart: (tool) => {
                  if (tool.name === MANAGE_APPLICATION_SUGGESTIONS || tool.name === TALENT_TOOL_NAMES.SIMULATE_APPLICATION) return;
                  if (tool.name === TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS) {
                    recommendationToolStarted = true;
                    ensureRecommendationToolPreamble();
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
                onStopToolStart: () => {
                  clearToolPreamble();
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
                  if (status && name !== MANAGE_APPLICATION_SUGGESTIONS && name !== TALENT_TOOL_NAMES.SIMULATE_APPLICATION && !(name === SIMULATION_SESSION_TOOL && toolInput.action === "generate_draft")) {
                    recordThinkingLog(status);
                  }

                  if (name === TALENT_TOOL_NAMES.RESEARCH_COMPANY) {
                    await insertTalentToolUsageLog({
                      admin,
                      name,
                      userId: user.id,
                    });

                    const companyName =
                      optionalToolString(toolInput.company_name) ??
                      optionalToolString(toolInput.companyName);
                    if (!companyName) {
                      throw new Error(
                        "research_company requires company_name."
                      );
                    }

                    const cachedSnapshot = await fetchRecentCompanySnapshot({
                      admin,
                      companyName,
                      preferredLocale: responseLocale,
                    });
                    if (cachedSnapshot) {
                      const personalizedResult =
                        await getOrCreateCompanySnapshot({
                          admin,
                          companyName,
                          preferredLocale: responseLocale,
                          reason: optionalToolString(toolInput.reason),
                          recentSnapshot: cachedSnapshot,
                          userId: user.id,
                        });
                      documentsChanged ||= Boolean(
                        personalizedResult.snapshot.document
                      );
                      const messageContent = stripPostgresUnsafeChars(
                        formatCompanySnapshotMessage({
                          preferredLocale: responseLocale,
                          reused: true,
                          snapshot: personalizedResult.snapshot,
                        })
                      );
                      const { data: cacheMessage, error: cacheMessageError } =
                        await admin
                          .from("talent_messages")
                          .insert(
                            withIsMobile(
                              {
                                content: messageContent,
                                conversation_id: conversationId,
                                message_type:
                                  COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
                                role: "assistant",
                                user_id: user.id,
                              },
                              isMobile
                            )
                          )
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
                          toResponseMessage(cacheMessage as TalentMessageRow),
                        ],
                      };
                      return withTalentToolAssistantInstruction({
                        ok: true,
                        cached: true,
                      });
                    }

                    // Intentional double cache-fetch: route checked cache above for fast-path,
                    // but getOrCreateCompanySnapshot rechecks for idempotency (another request
                    // may have created the snapshot between the two calls).
                    const result = await getOrCreateCompanySnapshot({
                      admin,
                      companyName,
                      preferredLocale: responseLocale,
                      reason: optionalToolString(toolInput.reason),
                      userId: user.id,
                    });
                    documentsChanged ||= Boolean(result.snapshot.document);
                    const messageContent = stripPostgresUnsafeChars(
                      formatCompanySnapshotMessage({
                        preferredLocale: responseLocale,
                        reused: result.reused,
                        snapshot: result.snapshot,
                      })
                    );
                    const {
                      data: researchMessage,
                      error: researchMessageError,
                    } = await admin
                      .from("talent_messages")
                      .insert(
                        withIsMobile(
                          {
                            content: messageContent,
                            conversation_id: conversationId,
                            message_type: COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
                            role: "assistant",
                            user_id: user.id,
                          },
                          isMobile
                        )
                      )
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
                        toResponseMessage(researchMessage as TalentMessageRow),
                      ],
                    };
                    return withTalentToolAssistantInstruction({
                      ok: true,
                      cached: result.reused,
                    });
                  }

                  return executeDefaultTalentTool({ name, input: toolInput });
                },
              });
            } catch (error) {
              await finishApplicationContinuation(true);
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
              await persistInsightExtractionForAssistantMessage({
                content: preparedAssistantText,
                messageId: preparedMessageId,
              });
              const messagesWithThinkingLogs = attachThinkingLogsToLastMessage(
                preparedCompanySnapshot.messages,
                thinkingLogs
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
                conversationId,
                includeDocuments: documentsChanged,
                userId: user.id,
              });
              send("talent_profile", profileSnapshot);
              await capabilityTurn?.complete();
              send("done", { ok: true });
              return;
            }

            const extractedStartOffer = extractStartOfferPayload(assistantText);
            responseStartOffer = simulationSession?.state.status === "active" ? undefined : extractedStartOffer.request;
            if (responseStartOffer) suppressRolePreviews = true;
            let assistantTextSource = withGeneratedDocumentLinks(extractedStartOffer.content);
            if (recommendationReceiptRef.current) {
              assistantTextSource =
                recommendationReceiptRef.current.answerDraft;
            }
            if (!assistantTextSource && !applicationQuestionsAsked) {
              assistantTextSource = (
                await recoverCareerChatAssistantText({
                  latestUserMessage: normalizedContent,
                  messages: llmMessages,
                  onTextDelta: sendVisibleTextDelta,
                  responseLocale,
                  systemBlocks,
                })
              ).trim();
            }
            if (!assistantTextSource && !applicationQuestionsAsked) {
              throw new Error(
                "Career assistant returned no visible text after recovery."
              );
            }

            let assistantTextWithMarkers = simulationSession?.state.activity
              ? renderableApplicationMarkdown(assistantTextSource)
              : assistantTextSource;

            const completion = resolveTalentOnboardingCompletion({
              assistantContent: assistantTextWithMarkers,
            });

            let safeAssistantText = stripPostgresUnsafeChars(
              stripTalentOnboardingCompletionMarker(assistantTextWithMarkers)
            );
            if (!safeAssistantText && !applicationQuestionsAsked) {
              const recoveredText = (
                await recoverCareerChatAssistantText({
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
            if (
              !recommendationReceiptRef.current &&
              injectedRecommendationToolPreamble &&
              !safeAssistantText.startsWith(injectedRecommendationToolPreamble)
            ) {
              safeAssistantText = [
                injectedRecommendationToolPreamble,
                safeAssistantText,
              ]
                .filter((text) => text.trim().length > 0)
                .join("\n\n");
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
            await finishApplicationContinuation();
            if (applicationQuestionsAsked) {
              // The question batch owns its introduction; discard provisional prose.
              send("assistant_text_done", {ok:true, discard:true});
              send("assistant_messages", {messages:auxiliaryAssistantMessages});
              send("done", {ok:true});
              return;
            }
            flushVisibleText(safeAssistantText);
            send("assistant_text_done", { ok: true });

            const { data: insertedAssistantMessage, error: assistantError } =
              await admin
                .from("talent_messages")
                .insert(
                  withIsMobile(
                    {
                      conversation_id: conversationId,
                      user_id: user.id,
                      role: "assistant",
                      content: safeAssistantText,
                      message_type: "chat",
                      payload: {suppressRolePreviews, ...(responseStartOffer ? { applicationStartRequest: responseStartOffer } : {})},
                      thinking_logs: thinkingLogs,
                    },
                    isMobile
                  )
                )
                .select("*")
                .single();

            if (assistantError) {
              throw new Error(
                assistantError.message ?? "Failed to insert assistant message"
              );
            }

            await attachResponseStartOffer(Number(insertedAssistantMessage.id));

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
                  ...auxiliaryAssistantMessages,
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

            if (proposalChanged && simulationSession) {
              const card = await persistSimulationProposal(
                simulationStore,
                simulationSession,
                Number(insertedAssistantMessage.id)
              );
              if (card) assistantResponseMessages.push(card);
            }
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
            await capabilityTurn?.complete();
            send("done", { ok: true });
          } catch (error) {
            if (req.signal.aborted) return;
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
            emitSimulationMessage = null;
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
      await startRequestedApplication();
      assistantText = applicationQuestionsAsked ? "" : await runCareerChatAssistant({
        toolRuntime: capabilityTurn?.runtime,
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
          if (
            simulationSession?.state.status === "active" &&
            !SIMULATION_TOOL_NAMES.includes(name)
          )
            return {
              ok: false,
              reason:
                "This action is unavailable in Simulate. End the session after user agreement before changing modes.",
            };
          const { status, toolInput } = splitToolUiStatus(input);
          if (status) {
            recordThinkingLog(status);
          }

          if (name === TALENT_TOOL_NAMES.RESEARCH_COMPANY) {
            await insertTalentToolUsageLog({
              admin,
              name,
              userId: user.id,
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
              const personalizedResult = await getOrCreateCompanySnapshot({
                admin,
                companyName,
                preferredLocale: responseLocale,
                reason: optionalToolString(toolInput.reason),
                recentSnapshot: cachedSnapshot,
                userId: user.id,
              });
              documentsChanged ||= Boolean(
                personalizedResult.snapshot.document
              );
              const messageContent = stripPostgresUnsafeChars(
                formatCompanySnapshotMessage({
                  preferredLocale: responseLocale,
                  reused: true,
                  snapshot: personalizedResult.snapshot,
                })
              );
              const { data: cacheMessage, error: cacheMessageError } =
                await admin
                  .from("talent_messages")
                  .insert(
                    withIsMobile(
                      {
                        content: messageContent,
                        conversation_id: conversationId,
                        message_type: COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
                        role: "assistant",
                        user_id: user.id,
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
                    streamResponse: false,
                  },
                  route: "/api/talent/chat",
                  stage: "talent_messages.insert:company_snapshot_cached",
                  userId: user.id,
                });
                throw new Error(
                  cacheMessageError?.message ??
                    "Failed to insert company_snapshot result message."
                );
              }
              await touchConversationIfAllowed();
              preparedCompanySnapshotRef.current = {
                messages: [toResponseMessage(cacheMessage as TalentMessageRow)],
              };
              return withTalentToolAssistantInstruction({
                ok: true,
                cached: true,
              });
            }

            // Intentional double cache-fetch: route checked cache above for fast-path,
            // but getOrCreateCompanySnapshot rechecks for idempotency (another request
            // may have created the snapshot between the two calls).
            const result = await getOrCreateCompanySnapshot({
              admin,
              companyName,
              preferredLocale: responseLocale,
              reason: optionalToolString(toolInput.reason),
              userId: user.id,
            });
            documentsChanged ||= Boolean(result.snapshot.document);
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
                      user_id: user.id,
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
                  streamResponse: false,
                },
                route: "/api/talent/chat",
                stage: "talent_messages.insert:company_snapshot",
                userId: user.id,
              });
              throw new Error(
                researchMessageError?.message ??
                  "Failed to insert company_snapshot result message."
              );
            }
            await touchConversationIfAllowed();
            preparedCompanySnapshotRef.current = {
              messages: [
                toResponseMessage(researchMessage as TalentMessageRow),
              ],
            };
            return withTalentToolAssistantInstruction({
              ok: true,
              cached: result.reused,
            });
          }

          return executeDefaultTalentTool({ name, input: toolInput });
        },
      });
    } catch (error) {
      await finishApplicationContinuation(true);
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
      await persistInsightExtractionForAssistantMessage({
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
          userId: user.id,
        });
      }
      summarizeConversationInBackground();
      const profileSnapshot = await buildTalentProfileSnapshot({
        admin,
        conversationId,
        includeDocuments: documentsChanged,
        userId: user.id,
      });

      await capabilityTurn?.complete();
      return NextResponse.json({
        ok: true,
        historyChangedRoleId: changedOpportunityRoleId,
        historyShouldRefresh: opportunityRecommendationsChanged,
        assistantMessage:
          messagesWithThinkingLogs[messagesWithThinkingLogs.length - 1],
        assistantMessages: messagesWithThinkingLogs,
        progress: {
          answeredCount: userTurnCount,
          completed: false,
          currentStep: currentProgressStep,
          targetCount: TALENT_INTERVIEW_FINAL_STEP,
        },
        userMessage: submission ? undefined : toResponseMessage(insertedUserMessage as TalentMessageRow),
        ...profileSnapshot,
      });
    }

    if (generatedDocumentLinks.size === 0) {
      logger.log("\n\nassistantText : ", assistantText, "\n\n");
    }

    const extractedStartOffer = extractStartOfferPayload(assistantText);
            responseStartOffer = simulationSession?.state.status === "active" ? undefined : extractedStartOffer.request;
            if (responseStartOffer) suppressRolePreviews = true;
            let assistantTextSource = withGeneratedDocumentLinks(extractedStartOffer.content);
    if (recommendationReceiptRef.current) {
      assistantTextSource = recommendationReceiptRef.current.answerDraft;
    }
    if (!assistantTextSource && !applicationQuestionsAsked) {
      assistantTextSource = (
        await recoverCareerChatAssistantText({
          latestUserMessage: normalizedContent,
          messages: llmMessages,
          responseLocale,
          systemBlocks,
        })
      ).trim();
    }
    if (!assistantTextSource && !applicationQuestionsAsked) {
      throw new Error(
        "Career assistant returned no visible text after recovery."
      );
    }

    let assistantTextWithMarkers = simulationSession?.state.activity
              ? renderableApplicationMarkdown(assistantTextSource)
              : assistantTextSource;

    const completion = resolveTalentOnboardingCompletion({
      assistantContent: assistantTextWithMarkers,
    });

    await finishApplicationContinuation();
    let safeAssistantText = stripPostgresUnsafeChars(
      stripTalentOnboardingCompletionMarker(assistantTextWithMarkers)
    );
    if (!safeAssistantText && !applicationQuestionsAsked) {
      const recoveredText = (
        await recoverCareerChatAssistantText({
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
      return NextResponse.json({
        ok: true,
        stopped: true,
        userMessage: toResponseMessage(stoppedSourceMessage),
        assistantMessages: [],
      });
    }

    if (applicationQuestionsAsked) {
      await finishApplicationContinuation();
      return NextResponse.json({ok:true,conversationId,userMessage:submission ? undefined : toResponseMessage(insertedUserMessage as TalentMessageRow),assistantMessages:auxiliaryAssistantMessages});
    }
    // --- Save assistant message ---
    const { data: insertedAssistantMessage, error: assistantError } =
      await admin
        .from("talent_messages")
        .insert(
          withIsMobile(
            {
              conversation_id: conversationId,
              user_id: user.id,
              role: "assistant",
              content: safeAssistantText,
              message_type: "chat",
              payload: {suppressRolePreviews, ...(responseStartOffer ? { applicationStartRequest: responseStartOffer } : {})},
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
      return NextResponse.json(
        {
          error: assistantError.message ?? "Failed to insert assistant message",
        },
        { status: 500 }
      );
    }

    await attachResponseStartOffer(Number(insertedAssistantMessage.id));

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
        ...auxiliaryAssistantMessages,
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
    if (proposalChanged && simulationSession) {
      const card = await persistSimulationProposal(
        simulationStore,
        simulationSession,
        Number(insertedAssistantMessage.id)
      );
      if (card) assistantResponseMessages.push(card);
    }
    assistantResponseMessages.splice(0, assistantResponseMessages.length, ...orderApplicationMessages(assistantResponseMessages));
    const insertedAssistantResponseMessage = assistantResponseMessages.find(
      (message) => message.id === insertedAssistantMessage.id
    );

    await capabilityTurn?.complete();
    return NextResponse.json({
      ok: true,
      historyChangedRoleId: changedOpportunityRoleId,
      historyShouldRefresh: opportunityRecommendationsChanged,
      userMessage: submission ? undefined : toResponseMessage(insertedUserMessage as TalentMessageRow),
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
    const message =
      error instanceof Error ? error.message : "Failed to process talent chat";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
