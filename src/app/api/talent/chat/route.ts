import { after, NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  buildTalentProfileContext,
  countUserChatTurns,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  TalentMessageRow,
  fetchTalentUserProfile,
  getCareerOnboardingChecklistCoverage,
  getTalentSupabaseAdmin,
  normalizeTalentEngagementTypes,
  normalizeTalentInsightContent,
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
import { insertTalentToolUsageLog } from "@/lib/talentOnboarding/toolUsageLog";
import { resolveCareerChatTools } from "@/lib/career/llmTools";
import {
  fetchRecentMessagesWithSummary,
  maybeSummarizeTalentConversation,
} from "@/lib/talentOnboarding/conversationSummary";
import { createOnboardingCompletionMessages } from "@/lib/talentOnboarding/onboardingCompletionWrapup";
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
  getRecommendJobPostingsChatPreamble,
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
  COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
  fetchRecentCompanySnapshot,
  formatCompanySnapshotMessage,
  getOrCreateCompanySnapshot,
  touchConversation,
} from "@/lib/career/companySnapshot";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
import { getCareerConversationStarter } from "@/lib/career/prompts/conversationStarters";
import {
  fetchActiveCompanyTalentRequest,
  serializeTalentPendingRequest,
} from "@/lib/companyTalentRequests/server";
import { careerT } from "@/lib/career/translatedCareerMessage";
import { logger } from "@/utils/logger";
import { isMobileRequest, withIsMobile } from "@/lib/requestDevice";
import {
  sanitizeSingleLineDbText,
  stripPostgresUnsafeChars,
} from "@/lib/textSanitization";
import { notifyUnsupportedUnicodeEscapeError } from "@/lib/errorAlert";
import { OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE } from "@/lib/officialJobs";

export const maxDuration = 180;

type Body = {
  allowedToolNames?: unknown;
  channel?: string;
  conversationStarterId?: string;
  conversationId?: string;
  locale?: string;
  message?: string;
  messageType?: unknown;
  link?: string;
};

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
    case TALENT_TOOL_NAMES.INTERNAL_ROLE_PRIORITY_REVIEW:
      return careerT(
        locale,
        "career.chat.tool.internal_role_priority_review.start",
        "포지션 우선 검토 요청을 처리하고 있습니다."
      );
    default:
      return "";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getJsonStringField(value: unknown, key: string) {
  if (!isRecord(value)) return null;
  const field = value[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
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

async function countPostOnboardingUserChatTurns(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  conversationId: string;
  onboardingCompletedAt: string;
  userId: string;
}) {
  const { count, error } = await args.admin
    .from("talent_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", args.conversationId)
    .eq("user_id", args.userId)
    .eq("role", "user")
    .in("message_type", [
      "chat",
      "call_transcript",
      TALENT_MESSAGE_TYPE_OPEN_POSITION_RECOMMENDATION_REQUEST,
    ])
    .gte("created_at", args.onboardingCompletedAt);

  if (error) {
    throw new Error(
      error.message ?? "Failed to count post-onboarding user chat turns"
    );
  }

  return count ?? 0;
}

async function fetchOfficialJobSignupSourceContext(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  onboardingCompletedAt: string;
  userId: string;
}) {
  const { data: event, error: eventError } = await args.admin
    .from("official_job_events")
    .select("job_slug, metadata")
    .eq("user_id", args.userId)
    .eq("event_type", "job_apply_click")
    .not("job_slug", "is", null)
    .lte("created_at", args.onboardingCompletedAt)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (eventError) {
    console.warn("[TalentChat] Failed to load official job signup source", {
      error: eventError.message,
      userId: args.userId,
    });
    return null;
  }

  const slug = String(event?.job_slug ?? "").trim();
  if (!slug) return null;

  const { data: job, error: jobError } = await args.admin
    .from("official_jobs")
    .select("company_name, role_title, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (jobError) {
    console.warn("[TalentChat] Failed to load official job source detail", {
      error: jobError.message,
      slug,
      userId: args.userId,
    });
  }

  return {
    companyName:
      job?.company_name ??
      getJsonStringField(event?.metadata, "companyName") ??
      null,
    roleTitle:
      job?.role_title ??
      getJsonStringField(event?.metadata, "roleTitle") ??
      null,
    slug,
  };
}

function buildOfficialJobSignupSourcePrompt(args: {
  companyName: string | null;
  roleTitle: string | null;
  slug: string;
}) {
  const roleLabel = [args.roleTitle, args.companyName]
    .filter((value): value is string => Boolean(value))
    .join(" @ ");
  const sourceLabel = roleLabel || `/jobs/${args.slug}`;

  return [
    "## Official jobs signup source follow-up",
    `The user signed up from this Harper-internal connected opportunity: ${sourceLabel}.`,
    "",
    "If natural, briefly explain that Harper can help with connected opportunities when there is strong fit, then ask once whether the user is interested in this specific opportunity.",
    `Example: "${sourceLabel} 기회에 연결을 도와드릴 수 있어요. 이 포지션에 관심 있으신가요? 그렇다고하면 우선적으로 검토되실 수 있게 할게요."`,
    "If recent conversation already asked about this opportunity, do not ask again.",
    "",
    "If the user says yes or clearly shows interest, help the user with get_internal_roles and internal_role_priority_review using action=register.",
    "The question above is optional.",
  ].join("\n");
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
    const isMobile = isMobileRequest(req);
    const conversationId = sanitizeSingleLineDbText(body.conversationId, 80);
    const message =
      typeof body.message === "string"
        ? stripPostgresUnsafeChars(body.message).trim()
        : "";
    const link = sanitizeSingleLineDbText(body.link, 2000);
    const userMessageType = normalizeUserChatMessageType(body.messageType);
    const requestChannel = body.channel === "voice" ? "voice" : "chat";
    const allowedToolNames = normalizeAllowedToolNames(body.allowedToolNames);
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
    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }
    const admin = getTalentSupabaseAdmin();
    const talentSetting = await fetchTalentSetting({ admin, userId: user.id });
    const responseLocale =
      talentSetting?.preferred_locale ??
      body.locale ??
      req.cookies.get("NEXT_LOCALE")?.value;
    const conversationStarter = conversationStarterId
      ? getCareerConversationStarter(conversationStarterId, responseLocale)
      : null;
    const skipConversationWrites = Boolean(
      conversationStarter && message === conversationStarter.chatMessage
    );
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
      onboardingCompletionEvent,
      officialJobSignupIntentEvent,
      pendingOpportunityFeedbackContext,
      recentActivitySummaries,
      recentRecommendedOpportunities,
    ] = await Promise.all([
      fetchTalentUserProfile({ admin, userId: user.id }),
      fetchTalentInsights({ admin, userId: user.id }),
      fetchLatestTalentActivityEvent({
        admin,
        conversationId,
        eventType: "onboarding_completed",
        userId: user.id,
      }),
      fetchLatestTalentActivityEvent({
        admin,
        eventType: OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE,
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
      fetchRecentRecommendedOpportunitiesForPrompt({
        admin,
        limit: 10,
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
    const recentRecommendedOpportunitiesText =
      formatRecentRecommendedOpportunitiesForPrompt(
        recentRecommendedOpportunities
      );

    const currentInsightContent = (currentInsights?.content ?? null) as Record<
      string,
      string
    > | null;
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
    const extractTurnInsights = (assistantContent: string) =>
      shouldAutoExtractInsights
        ? extractAndPersistChatInsights({
            admin,
            assistantContent,
            buildPrompt: (promptArgs) =>
              buildCareerInsightExtractionPrompt({
                currentChecklistCoverage: promptArgs.currentChecklistCoverage,
                currentInsightContent: promptArgs.currentInsightContent,
                onboardingChecklistContext:
                  promptArgs.onboardingChecklistContext,
                preferredLocale: responseLocale,
              }),
            conversationId,
            currentInsightContent,
            logPrefix: "TalentChat",
            onboardingChecklistContext: profile,
            sourceChannel: "text_chat",
            userId: user.id,
          })
        : Promise.resolve(0);

    const normalizedContent = link
      ? `${message}\n\nReference link: ${link}`
      : message;

    const { data: insertedUserMessage, error: userMessageError } = await admin
      .from("talent_messages")
      .insert(
        withIsMobile(
          {
            conversation_id: conversationId,
            user_id: user.id,
            role: "user",
            content: normalizedContent,
            message_type: userMessageType,
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
    const postOnboardingUserTurnCount =
      requestChannel === "chat" &&
      talentSetting?.is_onboarding_done &&
      onboardingCompletionEvent?.created_at
        ? await countPostOnboardingUserChatTurns({
            admin,
            conversationId,
            onboardingCompletedAt: onboardingCompletionEvent.created_at,
            userId: user.id,
          })
        : null;
    const officialJobSignupSourceContext =
      postOnboardingUserTurnCount !== null &&
      postOnboardingUserTurnCount <= 5 &&
      onboardingCompletionEvent?.created_at
        ? await fetchOfficialJobSignupSourceContext({
            admin,
            onboardingCompletedAt: onboardingCompletionEvent.created_at,
            userId: user.id,
          })
        : null;
    const officialJobSignupSourcePrompt = officialJobSignupSourceContext
      ? buildOfficialJobSignupSourcePrompt(officialJobSignupSourceContext)
      : undefined;
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

    const canUseInternalFitHoldQuestionTool =
      !Array.isArray(allowedToolNames) ||
      allowedToolNames.includes(
        TALENT_TOOL_NAMES.RECORD_INTERNAL_FIT_REEVALUATION_INFORMATION
      );
    const activeInternalFitHoldQuestion =
      talentSetting?.is_onboarding_done &&
      talentSetting.profile_visibility !== "dont_share" &&
      canUseInternalFitHoldQuestionTool
        ? await fetchActiveInternalFitHoldQuestion({ admin, userId: user.id })
        : null;
    const activeCompanyTalentRequest = talentSetting?.is_onboarding_done
      ? await fetchActiveCompanyTalentRequest({
          admin: admin as any,
          awaitingTalentOnly: true,
          talentId: user.id,
        })
      : null;
    const toolSelection = resolveCareerChatTools({
      activeCompanyTalentRequestMode:
        activeCompanyTalentRequest
          ? activeCompanyTalentRequest.expects_document
            ? "document"
            : "text"
          : null,
      activeInternalFitHoldQuestion: Boolean(activeInternalFitHoldQuestion),
      allowedToolNames,
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
        companyTalentRequestText: serializeTalentPendingRequest(
          activeCompanyTalentRequest
        ),
        onboardingChecklistCoverage,
        currentInsightContent,
        currentPreferences,
        isOnboardingDone: talentSetting?.is_onboarding_done,
        officialJobSignupIntentPrompt: talentSetting?.is_onboarding_done
          ? null
          : officialJobSignupIntentEvent?.summary,
        opportunityStatus,
        pendingOpportunityFeedbackContext,
        profile,
        conversationMode: conversationStarter?.id ?? "default",
        recentActivitySummaries,
        recentRecommendedOpportunitiesText,
        runtimeInstruction: officialJobSignupSourcePrompt,
        structuredProfileText,
        toolNames: toolSelection.toolNames,
      });
    const systemBlocks = promptBlocks;

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
    let opportunityRecommendationsChanged = false;
    let changedOpportunityRoleId: string | null = null;
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
    const scheduleInsightExtractionForAssistantMessage = (args: {
      content: string;
      messageId: number | string | null | undefined;
    }) => {
      if (!shouldAutoExtractInsights || !args.content.trim()) {
        return;
      }

      const runBackgroundInsightExtraction = async () => {
        try {
          const changedKeysCount = await extractTurnInsights(args.content);
          console.info("[TalentChat] background insight done", {
            changedKeysCount,
            conversationId,
            messageId: args.messageId ?? null,
            userId: user.id,
          });
        } catch (error) {
          console.error("[TalentChat] Failed to extract background insights", {
            conversationId,
            error: error instanceof Error ? error.message : String(error),
            messageId: args.messageId ?? null,
            userId: user.id,
          });
        }
      };

      try {
        after(runBackgroundInsightExtraction);
      } catch {
        void runBackgroundInsightExtraction();
      }
    };
    const rememberRecommendationPostingRoleIds = (result: unknown) => {
      pendingRecommendationPostingRoleIds = normalizePostingRoleIds([
        ...pendingRecommendationPostingRoleIds,
        ...extractRecommendationPostingRoleIds(result),
      ]);
    };
    const ensureRecommendationPostingLinks = (content: string) =>
      ensureStandalonePostingLinksInText(
        content,
        pendingRecommendationPostingRoleIds
      );
    const executeRecommendJobPostings = async (
      input: Record<string, unknown>
    ) => {
      recordRecommendationStatus({ state: "running" });

      try {
        const result = await executeTalentTool({
          context: {
            admin,
            abortSignal: req.signal,
            conversationId,
            isMobile,
            responseLocale,
            userMessageId: insertedUserMessage.id,
            userId: user.id,
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
        recordRecommendationStatus({ state: "error" }, { persist: true });
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

      const result = await executeTalentTool({
        context: {
          admin,
          abortSignal: req.signal,
          conversationId,
          isMobile,
          responseLocale,
          userMessageId: insertedUserMessage.id,
          userId: user.id,
        },
        logging: false,
        name: toolArgs.name,
        input: toolInput,
      });

      if (
        toolArgs.name ===
          TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK &&
        isRecord(result) &&
        result.ok === true
      ) {
        opportunityRecommendationsChanged = true;
        const opportunity = isRecord(result.opportunity)
          ? result.opportunity
          : null;
        changedOpportunityRoleId =
          typeof opportunity?.roleId === "string"
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
            if (req.signal.aborted) return;
            try {
              controller.enqueue(encoder.encode(createSseMessage(event, data)));
            } catch {
              // Client disconnected while a tool or model call was still resolving.
            }
          };
          emitToolStatus = (message) => send("tool_status", { message });
          emitRecommendationStatus = (status) =>
            send("recommendation_search_status", status);
          emitOpportunityRecommendationsChanged = (roleId) =>
            send("opportunity_recommendations_changed", { roleId });
          let pendingAssistantText = "";
          let streamedAssistantText = "";
          let recommendationStatusAfterCharCount: number | null = null;
          const sendVisibleTextDelta = (delta: string) => {
            pendingAssistantText = stripPostgresUnsafeChars(
              pendingAssistantText + delta
            ).replaceAll(TALENT_ONBOARDING_DONE_MARKER, "");
            const heldSuffixLength =
              getOnboardingMarkerPrefixSuffixLength(pendingAssistantText);
            const safeLength = pendingAssistantText.length - heldSuffixLength;
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
          const clearStopToolPreamble = () => {
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
            send("user_message", {
              message: toResponseMessage(
                insertedUserMessage as TalentMessageRow
              ),
            });

            const assistantText = await runCareerChatAssistantStream({
              messages: llmMessages,
              tools: toolDefinitions,
              isOnboardingActive,
              stopAfterToolNames: toolSelection.stopAfterToolNames,
              systemBlocks,
              responseLocale,
              onTextDelta: (delta) => {
                sendVisibleTextDelta(delta);
              },
              onToolStart: (tool) => {
                if (tool.name === TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS) {
                  ensureRecommendationToolPreamble();
                  markRecommendationStatusAnchor();
                  recordRecommendationStatus({ state: "running" });
                  return;
                }

                const status = getToolStartThinkingLog(
                  tool.name,
                  responseLocale
                );
                if (status) {
                  recordThinkingLog(status);
                }
              },
              onStopToolStart: () => {
                clearStopToolPreamble();
              },
              executeTool: async ({ name, input }) => {
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
                    const messageContent = stripPostgresUnsafeChars(
                      formatCompanySnapshotMessage({
                        preferredLocale: responseLocale,
                        reused: true,
                        snapshot: cachedSnapshot,
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
              scheduleInsightExtractionForAssistantMessage({
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
                userId: user.id,
              });
              send("talent_profile", profileSnapshot);
              send("done", { ok: true });
              return;
            }

            let assistantTextSource = assistantText.trim();
            if (!assistantTextSource) {
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

            scheduleInsightExtractionForAssistantMessage({
              content: safeAssistantText,
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
                  userId: user.id,
                });
              insertedCompletionWrapupMessage =
                completionMessages.wrapupMessage;
              insertedCompletionNextStepsMessage =
                completionMessages.nextStepsMessage;
            }
            const assistantResponseMessages =
              await attachPostingPreviewsToMessages({
                admin,
                messages: [
                  withRecommendationStatusAnchor({
                    ...toResponseMessage(
                      insertedAssistantMessage as TalentMessageRow
                    ),
                    thinkingLogs: finalAssistantThinkingLogs,
                  }),
                  insertedCompletionWrapupMessage
                    ? toResponseMessage(insertedCompletionWrapupMessage)
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

            if (assistantResponseMessages.length > 1) {
              send("assistant_messages", {
                messages: assistantResponseMessages,
              });
            } else if (!sentFinalAssistantMessage) {
              send("assistant_message", {
                message: assistantResponseMessages[0],
              });
            }
            if (shouldApplyCompletion) {
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
                completed: shouldApplyCompletion,
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

    const assistantText = await runCareerChatAssistant({
      messages: llmMessages,
      tools: toolDefinitions,
      isOnboardingActive,
      stopAfterToolNames: toolSelection.stopAfterToolNames,
      systemBlocks,
      responseLocale,
      executeTool: async ({ name, input }) => {
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
            messages: [toResponseMessage(researchMessage as TalentMessageRow)],
          };
          return withTalentToolAssistantInstruction({
            ok: true,
            cached: result.reused,
          });
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
      scheduleInsightExtractionForAssistantMessage({
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
        userId: user.id,
      });

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
        userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
        ...profileSnapshot,
      });
    }

    logger.log("\n\nassistantText : ", assistantText, "\n\n");

    let assistantTextSource = assistantText.trim();
    if (!assistantTextSource) {
      assistantTextSource = (
        await recoverCareerChatAssistantText({
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

    scheduleInsightExtractionForAssistantMessage({
      content: safeAssistantText,
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
          userId: user.id,
        })
      : null;
    const insertedCompletionWrapupMessage =
      completionMessages?.wrapupMessage ?? null;
    const insertedCompletionNextStepsMessage =
      completionMessages?.nextStepsMessage ?? null;

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
        insertedCompletionNextStepsMessage
          ? toResponseMessage(insertedCompletionNextStepsMessage)
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
      historyChangedRoleId: changedOpportunityRoleId,
      historyShouldRefresh: opportunityRecommendationsChanged,
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
