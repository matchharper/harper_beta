import {
  buildCareerConversationPromptPlan,
  type CareerPromptBlock,
} from "@/lib/career/prompts";
import { buildCareerRealtimeSessionInstructions } from "@/lib/career/realtimeInstructions";
import { getCareerConversationStarter } from "@/lib/career/prompts/conversationStarters";
import {
  getCareerRealtimeToolCandidates,
  resolveCareerChatTools,
  resolveCareerRealtimeTools,
} from "@/lib/career/llmTools";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
import {
  buildTalentProfileContext,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getCareerOnboardingChecklistCoverage,
  type TalentAdminClient,
} from "@/lib/talentOnboarding/server";
import { fetchRecentMessagesWithSummary } from "@/lib/talentOnboarding/conversationSummary";
import {
  fetchLatestTalentActivityEvent,
  fetchPendingOpportunityFeedbackPromptContext,
  fetchRecentTalentActivitySummaries,
} from "@/lib/talentOnboarding/activityEvents";
import { fetchActiveInternalFitHoldQuestion } from "@/lib/talentOnboarding/internalFitHoldQuestion";
import {
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE,
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP,
} from "@/lib/talentOnboarding/onboarding";
import {
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
} from "@/lib/talentOnboarding/recommendationSettings";
import { TALENT_TOOL_NAMES } from "@/lib/talentOnboarding/tools";
import {
  fetchRecentRecommendedOpportunitiesForPrompt,
  formatRecentRecommendedOpportunitiesForPrompt,
} from "@/lib/talentOpportunity";
import {
  getActiveOpportunityRun,
  serializeOpportunityRun,
} from "@/lib/opportunityDiscovery/store";
import type { TalentChatTool } from "@/lib/talentOnboarding/llm";
import type { CareerRealtimeTool } from "@/lib/career/llmTools";

type DebugMessage = {
  content: string;
  role: "assistant" | "user";
};

export type CareerDebugPromptPayload = {
  channel: "text" | "voice";
  enabledToolNames: string[];
  instructions?: string;
  messages?: DebugMessage[];
  promptBlocks: CareerPromptBlock[];
  renderedPrompt: string;
  stopAfterToolNames?: string[];
  summary: {
    conversationId: string;
    historyChars?: number;
    historyMessageCount?: number;
    instructionsChars?: number;
    promptBlockChars: number;
    promptBlockCount: number;
    toolSchemaChars: number;
    toolCount: number;
    userId: string;
  };
  tools: unknown[];
};

function countChars(value: string | null | undefined) {
  return typeof value === "string" ? value.length : 0;
}

function countPromptBlockChars(blocks: readonly CareerPromptBlock[]) {
  return blocks.reduce((sum, block) => sum + countChars(block.text), 0);
}

function countMessageChars(messages: readonly DebugMessage[]) {
  return messages.reduce((sum, message) => sum + countChars(message.content), 0);
}

function countSerializedChars(value: unknown) {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function renderPromptBlocks(blocks: readonly CareerPromptBlock[]) {
  return blocks
    .map((block) =>
      [
        `### system block: ${block.key}`,
        `cacheable: ${block.cacheable === true ? "true" : "false"}`,
        block.text.trim(),
      ].join("\n")
    )
    .join("\n\n");
}

function renderMessages(messages: readonly DebugMessage[]) {
  if (messages.length === 0) return "(none)";

  return messages
    .map((message, index) =>
      [
        `### message ${index + 1}: ${message.role}`,
        message.content.trim() || "(empty)",
      ].join("\n")
    )
    .join("\n\n");
}

function renderTools(tools: unknown[]) {
  if (tools.length === 0) return "(none)";

  return JSON.stringify(tools, null, 2);
}

function renderTextDebugPrompt(args: {
  messages: readonly DebugMessage[];
  promptBlocks: readonly CareerPromptBlock[];
  tools: unknown[];
}) {
  return [
    "# Career Text Chat Prompt Debug",
    "Actual chat calls send system blocks, conversation messages, and tool schemas as separate request fields. This render keeps those boundaries visible.",
    "",
    "## System Blocks",
    renderPromptBlocks(args.promptBlocks),
    "",
    "## Conversation Messages",
    renderMessages(args.messages),
    "",
    "## Tool Schemas",
    renderTools(args.tools),
  ].join("\n");
}

function renderVoiceDebugPrompt(args: {
  instructions: string;
  promptBlocks: readonly CareerPromptBlock[];
  tools: unknown[];
}) {
  return [
    "# Career Voice Realtime Prompt Debug",
    "Actual Realtime calls send `instructions` plus Realtime tool schemas. The prompt blocks below are the inputs used to render `instructions`.",
    "",
    "## Rendered Instructions",
    args.instructions.trim(),
    "",
    "## Prompt Blocks",
    renderPromptBlocks(args.promptBlocks),
    "",
    "## Realtime Tool Schemas",
    renderTools(args.tools),
  ].join("\n");
}

export async function buildCareerTextChatDebugPrompt(args: {
  admin: TalentAdminClient;
  allowedToolNames?: readonly string[] | null;
  conversationId: string;
  conversationStarterId?: string | null;
  preferredLocale?: string | null;
  userId: string;
}): Promise<CareerDebugPromptPayload> {
  const { admin, conversationId, userId } = args;

  const { data: conversation, error: conversationError } = await admin
    .from("talent_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (conversationError) {
    throw new Error(conversationError.message ?? "Failed to read conversation");
  }
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const [
    profile,
    currentInsights,
    talentSetting,
    onboardingCompletionEvent,
    pendingOpportunityFeedbackContext,
    recentActivitySummaries,
    recentRecommendedOpportunities,
    activeRun,
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
    fetchPendingOpportunityFeedbackPromptContext({
      admin,
      conversationId,
      limit: 10,
      userId,
    }),
    fetchRecentTalentActivitySummaries({ admin, limit: 5, userId }),
    fetchRecentRecommendedOpportunitiesForPrompt({
      admin,
      limit: 10,
      userId,
    }),
    getActiveOpportunityRun({ admin, conversationId, userId }),
  ]);

  const responseLocale =
    talentSetting?.preferred_locale ?? args.preferredLocale ?? null;
  const structuredProfile = await fetchTalentStructuredProfile({
    admin,
    userId,
    talentUser: profile,
  });
  const structuredProfileText = buildTalentProfileContext({
    maxResumeChars: 3000,
    profile,
    setting: talentSetting,
    structuredProfile,
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
        userId,
      })
    : null;

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

  const toolSelection = resolveCareerChatTools({
    activeInternalFitHoldQuestion: Boolean(activeInternalFitHoldQuestion),
    allowedToolNames: args.allowedToolNames,
    channel: "chat",
    isOnboardingDone: talentSetting?.is_onboarding_done,
    responseLocale,
  });
  const currentPreferences = {
    getExternalRecommendation:
      talentSetting?.get_external_recommendation ?? true,
    periodicIntervalDays: talentSetting
      ? normalizeTalentPeriodicIntervalDays(talentSetting.periodic_interval_days)
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

  const conversationStarterId = args.conversationStarterId?.trim();
  const conversationStarter = conversationStarterId
    ? getCareerConversationStarter(conversationStarterId, responseLocale)
    : null;

  const { promptBlocks } = buildCareerConversationPromptPlan({
    activeInternalFitHoldQuestion,
    channel: "chat",
    currentInsightContent,
    currentPreferences,
    isOnboardingDone: talentSetting?.is_onboarding_done,
    onboardingChecklistCoverage,
    opportunityStatus,
    pendingOpportunityFeedbackContext,
    profile,
    conversationMode: conversationStarter?.id ?? "default",
    recentActivitySummaries,
    recentRecommendedOpportunitiesText,
    structuredProfileText,
    toolNames: toolSelection.toolNames,
  });

  const recentMessages = await fetchRecentMessagesWithSummary({
    admin,
    conversationId,
    recentLimit: 12,
    userId,
  });
  const messages = recentMessages
    .filter(
      (item) =>
        item.message_type !== TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE &&
        item.message_type !== TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP
    )
    .map((item) => ({
      role: item.role as "assistant" | "user",
      content: formatTalentMessageContentForLlmPrompt(item),
    }))
    .filter((item) => item.content.trim().length > 0);
  const tools = toolSelection.tools as TalentChatTool[];
  const renderedPrompt = renderTextDebugPrompt({
    messages,
    promptBlocks,
    tools,
  });

  return {
    channel: "text",
    enabledToolNames: toolSelection.toolNames,
    messages,
    promptBlocks,
    renderedPrompt,
    stopAfterToolNames: toolSelection.stopAfterToolNames,
    summary: {
      conversationId,
      historyChars: countMessageChars(messages),
      historyMessageCount: messages.length,
      promptBlockChars: countPromptBlockChars(promptBlocks),
      promptBlockCount: promptBlocks.length,
      toolSchemaChars: countSerializedChars(tools),
      toolCount: tools.length,
      userId,
    },
    tools,
  };
}

export async function buildCareerVoiceDebugPrompt(args: {
  admin: TalentAdminClient;
  conversationId: string;
  conversationStarterId?: string | null;
  internalCallRequestId?: string | null;
  preferredLocale?: string | null;
  userId: string;
}): Promise<CareerDebugPromptPayload> {
  const realtimeToolCandidates = getCareerRealtimeToolCandidates(
    args.preferredLocale
  );
  const realtimePromptPlan = await buildCareerRealtimeSessionInstructions({
    conversationId: args.conversationId,
    conversationStarterId: args.conversationStarterId,
    internalCallRequestId: args.internalCallRequestId,
    preferredLocale: args.preferredLocale,
    toolNames: realtimeToolCandidates.map((tool) => tool.name),
    userId: args.userId,
  });
  const realtimeToolSelection = resolveCareerRealtimeTools({
    candidateTools: realtimeToolCandidates,
    enabledToolNames: realtimePromptPlan.enabledToolNames,
    preferredLocale: args.preferredLocale,
  });
  const tools = realtimeToolSelection.tools as CareerRealtimeTool[];
  const renderedPrompt = renderVoiceDebugPrompt({
    instructions: realtimePromptPlan.instructions,
    promptBlocks: realtimePromptPlan.promptBlocks,
    tools,
  });

  return {
    channel: "voice",
    enabledToolNames: realtimePromptPlan.enabledToolNames,
    instructions: realtimePromptPlan.instructions,
    promptBlocks: realtimePromptPlan.promptBlocks,
    renderedPrompt,
    summary: {
      conversationId: args.conversationId,
      instructionsChars: realtimePromptPlan.instructions.length,
      promptBlockChars: countPromptBlockChars(realtimePromptPlan.promptBlocks),
      promptBlockCount: realtimePromptPlan.promptBlocks.length,
      toolSchemaChars: countSerializedChars(tools),
      toolCount: tools.length,
      userId: args.userId,
    },
    tools,
  };
}
