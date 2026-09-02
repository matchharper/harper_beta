import type { ActiveInternalFitHoldQuestion } from "@/lib/talentOnboarding/internalFitHoldQuestion";
import {
  getCareerPromptLanguageName,
  getCareerPromptToneRule,
} from "@/lib/career/promptLocale";
import {
  CAREER_CHAT_CORE_SYSTEM_PROMPT,
  CAREER_CORE_RESPONSE_GUIDANCE_PROMPT,
  CAREER_CORE_RESPONSE_GUIDANCE_PROMPT_FOR_ONBOARDING_CALL,
  CAREER_DEFAULT_CONVERSATION_GUIDANCE_PROMPT,
  CAREER_ONBOARDING_CONVERSATION_PROMPT,
  CAREER_POST_ONBOARDING_VOICE_RESPONSE_GUIDANCE_PROMPT,
} from "@/lib/career/prompts/rawPrompts";
import { CAREER_VOICE_CALL_MODE_PROMPT } from "@/lib/career/prompts/cases/voicePrompts";
import {
  formatCareerPromptKoreanDateTime,
  interpolateCareerPromptText,
  normalizeToolNames,
} from "@/lib/career/prompts/promptUtils";
import {
  buildCareerChannelContextRules,
  buildKnownFutureMatchingInsightsSection,
  buildKnownPreferencesSection,
  buildOnboardingRuntimeStateSection,
  buildOptionalFollowUpOpportunitiesSection,
  buildOpportunityStatusSection,
  buildProfileContextBlock,
  buildRecentActivitySummariesSection,
  getCareerChannelType,
} from "@/lib/career/prompts/conversationSections";
import { buildCareerToolPolicyPrompt } from "@/lib/career/prompts/toolPolicyPrompt";
import { getCareerConversationStarter } from "@/lib/career/prompts/conversationStarters";
import type {
  CareerPromptActivitySummary,
  CareerPromptBlock,
  CareerPromptChannel,
  CareerConversationPromptMode,
  CareerPromptOpportunityStatus,
  CareerPromptPlan,
  CareerPromptPreferences,
  CareerPromptProfile,
  GmailCapability,
  OnboardingChecklistCoverage,
} from "@/lib/career/prompts/types";
import { getCareerInterruptHandlingPrompt } from "./initialPrompts";
import { buildInternalOpportunityRealtimeInstruction } from "./cases/lifecyclePrompts";
import type { InternalOpportunityCallRequest } from "@/lib/talentOnboarding/internalOpportunityCallRequest";

const ONBOARDING_TOOL_POLICY_ALLOWED_TOOLS = [
  "update_language_setting",
  "update_setting",
  "update_talent_profile",
  "open_url",
  "read_talent_activity_events",
  "read_recommended_opportunities",
  "list_documents",
  "read_document",
  "update_document",
] as const;

function shouldIncludeToolPolicyDuringOnboarding(toolNames: string[]) {
  return ONBOARDING_TOOL_POLICY_ALLOWED_TOOLS.some((toolName) =>
    toolNames.includes(toolName)
  );
}

export function buildGmailCapabilityPrompt(capability: GmailCapability) {
  if (capability === "available") {
    return [
      "## Gmail capability",
      "The user's Gmail integration is active and the Gmail search tool is available in this turn. Use the tool when the answer depends on inbox contents.",
      "Never claim that an email exists, was read, or contains specific information until the tool returns successfully with status=ok.",
    ].join("\n");
  }

  if (capability === "connected_but_unavailable_this_turn") {
    return [
      "## Gmail capability",
      "The user's Gmail is connected, but Gmail inbox access is not available in this turn.",
      "Do not claim that you checked or can currently inspect the inbox.",
    ].join("\n");
  }

  return [
    "## Gmail capability",
    "The user's Gmail is not connected, so you cannot access or inspect their inbox.",
    "If the user asks for Gmail information, explain this limitation and direct them to Profile → Resume & Links → Gmail Connect.",
    "Never imply that you checked their Gmail.",
  ].join("\n");
}

export function buildSavedGmailCareerHistoryPrompt(args: {
  canReadDocument: boolean;
}) {
  if (!args.canReadDocument) {
    return [
      "## Saved Gmail career history",
      "A saved Gmail career-history document exists, but document reading is not available in this turn.",
      "Do not claim that you read the saved document or inspected the current inbox.",
    ].join("\n");
  }

  return [
    "## Saved Gmail career history",
    "A saved, user-editable Gmail career-history document is available.",
    "When the answer depends on the user's past applications, interviews, or recruiting history, use list_documents and then read_document.",
    "This document is a saved snapshot, not proof of the current inbox state. Distinguish reading it from checking Gmail with search_connected_gmail.",
  ].join("\n");
}

/**
 * /career 텍스트 채팅과 실시간 voice call 프롬프트를 조립하는 핵심 함수.
 *
 * 블록 포함 규칙:
 * - 항상 포함: chat_core, mode guidance, profile_context, dynamic_state.
 * - 온보딩 중에만 포함: onboarding_rules, dynamic_state 안의 checklist/runtime progress.
 * - voice call에만 포함: voice_call_rules, dynamic_state 안의 최근 채팅 맥락.
 * - text chat에만 포함: dynamic_state 안의 opportunity feedback, recent activity summaries.
 */
export function buildCareerConversationPromptPlan(args: {
  activeInternalFitHoldQuestion?: ActiveInternalFitHoldQuestion | null;
  channel: CareerPromptChannel;
  companyTalentRequestText?: string | null;
  conversationMode?: CareerConversationPromptMode;
  currentInsightContent: Record<string, string> | null;
  currentPreferences?: CareerPromptPreferences | null;
  gmailCapability?: GmailCapability;
  hasSavedGmailCareerHistory?: boolean;
  internalCallRequest?: InternalOpportunityCallRequest | null;
  isOnboardingDone?: boolean;
  officialJobSignupIntentPrompt?: string | null;
  onboardingChecklistCoverage?: OnboardingChecklistCoverage | null;
  opportunityStatus?: CareerPromptOpportunityStatus | null;
  pendingOpportunityFeedbackContext?: string | null;
  profile: CareerPromptProfile | null;
  recentActivitySummaries?: readonly CareerPromptActivitySummary[] | null;
  recentRecommendedOpportunitiesText?: string | null;
  recentConversationSection?: string;
  runtimeInstruction?: string | null;
  structuredProfileText: string;
  toolNames?: readonly string[] | string;
}): CareerPromptPlan {
  const channelType = getCareerChannelType(args.channel);
  const channelContextRules = buildCareerChannelContextRules(args.channel);

  const outputLanguage = getCareerPromptLanguageName(
    args.currentPreferences?.preferredLocale
  );
  const outputLanguageToneRule = getCareerPromptToneRule(
    args.currentPreferences?.preferredLocale
  );
  const positionsTabLabel =
    outputLanguage === "English" ? "Jobs tab" : "포지션 탭";

  const isOnboardingActive = !Boolean(args.isOnboardingDone);

  const conversationMode = args.conversationMode ?? "default";

  const normalizedToolNames = normalizeToolNames(args.toolNames);

  // 온보딩 중에는 checklist 진행/종료 조건/현재 insight 값을 하나의 runtime state 블록으로 넣는다.
  const onboardingRuntimeStateSection = isOnboardingActive
    ? buildOnboardingRuntimeStateSection({
        checklistContext: args.profile,
        checklistCoverage: args.onboardingChecklistCoverage,
        content: args.currentInsightContent,
        quoteKeys: args.channel === "chat",
      })
    : "";

  const futureMatchingInsightsSection = isOnboardingActive
    ? ""
    : buildKnownFutureMatchingInsightsSection({
        content: args.currentInsightContent,
        quoteKeys: args.channel === "chat",
      });

  const profileContextBlock = buildProfileContextBlock({
    profile: args.profile,
    recentRecommendedOpportunitiesText: args.recentRecommendedOpportunitiesText,
    structuredProfileText: args.structuredProfileText,
  });

  // 온보딩 중에는 일반 tool policy를 빼되, 상태 저장/보조 selector처럼
  // 온보딩 중에도 실제로 노출되는 tool이 있으면 해당 trigger 규칙을 넣는다.
  const allowToolPolicyDuringOnboarding =
    shouldIncludeToolPolicyDuringOnboarding(normalizedToolNames);

  const toolPolicy =
    isOnboardingActive && !allowToolPolicyDuringOnboarding
      ? ""
      : buildCareerToolPolicyPrompt({
          channel: args.channel,
          isOnboardingActive,
          preferredLocale: args.currentPreferences?.preferredLocale ?? null,
          toolNames: normalizedToolNames,
        });

  const isVoiceCall = args.channel === "voice";

  // 블록 순서는 중요하다: 안정적인 시스템 규칙, 프로필/tool 맥락,
  // 매 턴 바뀌는 runtime state 순서로 넣는다.
  const promptBlocks: CareerPromptBlock[] = [];
  const promptVars = {
    channel_context_rules: channelContextRules,
    output_language: outputLanguage,
    output_language_tone_rule: outputLanguageToneRule,
    positions_tab_label: positionsTabLabel,
  };

  const coreSystemPrompt = {
    key: "chat_core",
    text: interpolateCareerPromptText(
      CAREER_CHAT_CORE_SYSTEM_PROMPT,
      promptVars
    ),
    cacheable: true,
  };

  const conversationGuidePrompt = () => {
    if (isOnboardingActive)
      if (isVoiceCall)
        // 단순히 더 짧은 프롬프트.
        return {
          key: "core_response_guidance",
          text: interpolateCareerPromptText(
            CAREER_CORE_RESPONSE_GUIDANCE_PROMPT_FOR_ONBOARDING_CALL,
            promptVars
          ),
          cacheable: true,
        };
      else
        return {
          key: "core_response_guidance",
          text: interpolateCareerPromptText(
            CAREER_CORE_RESPONSE_GUIDANCE_PROMPT,
            promptVars
          ),
          cacheable: true,
        };
    else if (isVoiceCall)
      return {
        key: "post_onboarding_voice_response_guidance",
        text: interpolateCareerPromptText(
          CAREER_POST_ONBOARDING_VOICE_RESPONSE_GUIDANCE_PROMPT,
          promptVars
        ),
        cacheable: true,
      };
    else
      return {
        key: "default_conversation_guidance",
        text: interpolateCareerPromptText(
          CAREER_DEFAULT_CONVERSATION_GUIDANCE_PROMPT,
          promptVars
        ),
        cacheable: true,
      };
  };

  promptBlocks.push(coreSystemPrompt);
  promptBlocks.push(conversationGuidePrompt());

  if (isOnboardingActive) {
    promptBlocks.push({
      key: "onboarding_rules",
      text: CAREER_ONBOARDING_CONVERSATION_PROMPT,
      cacheable: true,
    });
  }

  // 통화중일 때
  if (isVoiceCall) {
    const voiceRules = [
      CAREER_VOICE_CALL_MODE_PROMPT,
      getCareerInterruptHandlingPrompt(
        args.currentPreferences?.preferredLocale
      ),
    ]
      .filter((value) => value && value.trim().length > 0)
      .join("\n\n");

    if (voiceRules) {
      promptBlocks.push({
        key: "voice_call_rules",
        text: voiceRules,
        cacheable: true,
      });
    }
  }
  const callModePrompt = () => {
    if (
      conversationMode === "internal_opportunity_call" &&
      args.internalCallRequest
    ) {
      return buildInternalOpportunityRealtimeInstruction({
        ...args.internalCallRequest,
        preferredLocale: args.currentPreferences?.preferredLocale,
      });
    }

    if (
      conversationMode === "preference_update" ||
      conversationMode === "match_quality"
    )
      return (
        getCareerConversationStarter(
          conversationMode,
          args.currentPreferences?.preferredLocale
        )?.turnInstruction ?? ""
      );

    return "";
  };

  const callModeInstruction = callModePrompt();

  promptBlocks.push({
    key: "profile_context",
    text: profileContextBlock,
    cacheable: true,
  });

  if (toolPolicy) {
    promptBlocks.push({
      key: "tool_policy",
      text: toolPolicy,
      cacheable: true,
    });
  }

  if (args.gmailCapability) {
    promptBlocks.push({
      key: "gmail_capability",
      text: buildGmailCapabilityPrompt(args.gmailCapability),
    });
  }

  if (args.hasSavedGmailCareerHistory) {
    promptBlocks.push({
      key: "saved_gmail_career_history",
      text: buildSavedGmailCareerHistoryPrompt({
        canReadDocument:
          normalizedToolNames.includes("list_documents") &&
          normalizedToolNames.includes("read_document"),
      }),
    });
  }

  if (futureMatchingInsightsSection) {
    promptBlocks.push({
      key: "future_matching_insights",
      text: futureMatchingInsightsSection,
      cacheable: true,
    });
  }

  if (callModeInstruction) {
    promptBlocks.push({
      key: "call_mode_instruction",
      text: callModeInstruction,
    });
  }

  const optionalFollowUpOpportunitiesSection =
    buildOptionalFollowUpOpportunitiesSection({
      activeInternalFitHoldQuestion: args.activeInternalFitHoldQuestion,
      canRecordInternalFitHoldQuestion: normalizedToolNames.includes(
        "record_internal_fit_reevaluation_information"
      ),
      currentInsightContent: args.currentInsightContent,
      isOnboardingActive,
      profile: args.profile,
    });

  const recentActivitySummariesSection =
    args.channel === "chat"
      ? buildRecentActivitySummariesSection(args.recentActivitySummaries)
      : "";

  const opportunityStatusSection = buildOpportunityStatusSection(
    args.opportunityStatus
  );

  const existingPreferencesSection = buildKnownPreferencesSection(
    args.currentPreferences
  );

  const officialJobSignupIntentPrompt = isOnboardingActive
    ? (args.officialJobSignupIntentPrompt?.trim() ?? "")
    : "";

  const runtimeOneTimeInstruction = args.runtimeInstruction
    ? "## High-priority runtime instruction : " + args.runtimeInstruction
    : "";

  const dynamicStateLines = [
    // 항상 포함: 현재 채널, 현재 시각, 활성 runtime instruction.
    `## Runtime context\n현재 후보자와 ${channelType}을 통해 소통하고 있습니다.\n현재 시각: ${formatCareerPromptKoreanDateTime(
      new Date().toISOString()
    )}\n이 prompt와 최근 메시지에 표시되는 모든 시각은 한국 시간(UTC+9) 기준이다.`,
    runtimeOneTimeInstruction,
    args.companyTalentRequestText?.trim() ?? "",
    officialJobSignupIntentPrompt,
    onboardingRuntimeStateSection,
    existingPreferencesSection,
    optionalFollowUpOpportunitiesSection,
    // text chat에만 포함:
    args.channel === "chat"
      ? (args.pendingOpportunityFeedbackContext ?? "")
      : "",
    recentActivitySummariesSection,
    opportunityStatusSection,
    // voice call에만 포함: 최근 채팅 맥락을 짧게 넣어 통화 시작점을 맞춘다.
    args.channel === "voice" ? (args.recentConversationSection ?? "") : "",
  ].filter((value) => value && value.trim().length > 0);

  promptBlocks.push({
    key: "dynamic_state",
    text: dynamicStateLines.join("\n\n"),
  });

  return {
    enabledToolNames: normalizedToolNames,
    isOnboardingActive,
    promptBlocks,
    toolPolicy,
  };
}
