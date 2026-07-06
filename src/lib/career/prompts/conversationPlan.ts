import type { ActiveInternalFitHoldQuestion } from "@/lib/talentOnboarding/internalFitHoldQuestion";
import {
  getCareerPromptLanguageName,
  getCareerPromptToneRule,
} from "@/lib/career/promptLocale";
import {
  CAREER_CHAT_CORE_SYSTEM_PROMPT,
  CAREER_CORE_RESPONSE_GUIDANCE_PROMPT,
  CAREER_CONVERSATION_STARTER_MODE_PROMPT,
  CAREER_DEFAULT_CONVERSATION_GUIDANCE_PROMPT,
  CAREER_ONBOARDING_CONVERSATION_PROMPT,
  CAREER_VOICE_CALL_MODE_PROMPT,
  CAREER_VOICE_CALL_STARTER_MODE_PROMPT,
} from "@/lib/career/prompts/rawPrompts";
import {
  interpolateCareerPromptText,
  normalizeToolNames,
  renderCareerPromptBlocks,
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
import type {
  CareerPromptActivitySummary,
  CareerPromptBlock,
  CareerPromptChannel,
  CareerPromptOpportunityStatus,
  CareerPromptPlan,
  CareerPromptPreferences,
  CareerPromptProfile,
  CareerProactiveTurnInstructionMode,
  OnboardingChecklistCoverage,
} from "@/lib/career/prompts/types";

const ONBOARDING_TOOL_POLICY_ALLOWED_TOOLS = [
  "update_setting",
  "update_talent_profile",
  "open_url",
  "read_talent_activity_events",
  "read_recommended_opportunities",
] as const;

function shouldIncludeToolPolicyDuringOnboarding(toolNames: string[]) {
  return ONBOARDING_TOOL_POLICY_ALLOWED_TOOLS.some((toolName) =>
    toolNames.includes(toolName)
  );
}

function buildVoiceCallRules(args: {
  callEndInstruction?: string;
  interruptHandling?: string;
  isConversationStarterMode: boolean;
}) {
  return [
    args.interruptHandling,
    args.callEndInstruction,
    args.isConversationStarterMode
      ? CAREER_VOICE_CALL_STARTER_MODE_PROMPT
      : CAREER_VOICE_CALL_MODE_PROMPT,
    "## Voice Call Style\n질문은 짧게 하나씩만 하고, 사용자가 듣고 바로 답할 수 있는 자연스러운 구어체로 말하라. Markdown 문법, 긴 목록, 표 형식은 사용하지 마라.",
  ]
    .filter((value) => value && value.trim().length > 0)
    .join("\n\n");
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
function buildCareerConversationPromptPlan(args: {
  activeInternalFitHoldQuestion?: ActiveInternalFitHoldQuestion | null;
  callEndInstruction?: string;
  channel: CareerPromptChannel;
  currentInsightContent: Record<string, string> | null;
  currentPreferences?: CareerPromptPreferences | null;
  interruptHandling?: string;
  isOnboardingDone?: boolean;
  officialJobSignupIntentPrompt?: string | null;
  onboardingChecklistCoverage?: OnboardingChecklistCoverage | null;
  opportunityStatus?: CareerPromptOpportunityStatus | null;
  pendingOpportunityFeedbackContext?: string | null;
  profile: CareerPromptProfile | null;
  proactiveTurnInstructionMode?: CareerProactiveTurnInstructionMode;
  proactiveTurnInstruction?: string;
  recentActivitySummaries?: readonly CareerPromptActivitySummary[] | null;
  recentRecommendedOpportunitiesText?: string | null;
  recentConversationSection?: string;
  sessionStartInstruction?: string;
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

  const isConversationStarterMode =
    args.proactiveTurnInstructionMode === "conversation_starter";
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

  const conversationGuidePrompt = isConversationStarterMode
    ? {
        key: "conversation_starter_mode",
        text: interpolateCareerPromptText(
          CAREER_CONVERSATION_STARTER_MODE_PROMPT,
          promptVars
        ),
        cacheable: true,
      }
    : isOnboardingActive
      ? {
          key: "core_response_guidance",
          text: interpolateCareerPromptText(
            CAREER_CORE_RESPONSE_GUIDANCE_PROMPT,
            promptVars
          ),
          cacheable: true,
        }
      : {
          key: "default_conversation_guidance",
          text: interpolateCareerPromptText(
            CAREER_DEFAULT_CONVERSATION_GUIDANCE_PROMPT,
            promptVars
          ),
          cacheable: true,
        };

  promptBlocks.push(coreSystemPrompt);
  promptBlocks.push(conversationGuidePrompt);

  if (isOnboardingActive) {
    promptBlocks.push({
      key: "onboarding_rules",
      text: CAREER_ONBOARDING_CONVERSATION_PROMPT,
      cacheable: true,
    });
  }

  if (isVoiceCall) {
    const voiceRules = buildVoiceCallRules({
      callEndInstruction: args.callEndInstruction,
      interruptHandling: args.interruptHandling,
      isConversationStarterMode,
    });

    if (voiceRules) {
      promptBlocks.push({
        key: "voice_call_rules",
        text: voiceRules,
        cacheable: true,
      });
    }
  }

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

  const proactiveInstruction = args.proactiveTurnInstruction?.trim();
  // conversation starter, voice call opening, wrapup처럼 이번 호출에서만 우선 적용할 지시다.
  // 없으면 sessionStartInstruction 같은 일반 session 지시를 그대로 넣는다.
  const runtimeInstruction = proactiveInstruction
    ? [
        "## High-priority runtime instruction",
        isConversationStarterMode
          ? "The following conversation-starter instruction is the active objective for this turn/session. It overrides default career-intake and general matching guidance unless the latest user message explicitly asks to change topic."
          : "The following instruction is more specific than the generic onboarding/default conversation rules. Follow it for this turn/session unless the latest user message explicitly asks to change topic.",
        `Response language remains ${outputLanguage}. If the instruction text includes Korean tone examples or Korean sample wording, adapt the intent naturally into ${outputLanguage} instead of copying the sample language.`,
        proactiveInstruction,
      ].join("\n\n")
    : (args.sessionStartInstruction ?? "");
  const officialJobSignupIntentPrompt = isOnboardingActive
    ? (args.officialJobSignupIntentPrompt?.trim() ?? "")
    : "";

  const dynamicStateLines = [
    // 항상 포함: 현재 채널, 현재 시각, 활성 runtime instruction.
    `## Runtime context\n현재 후보자와 ${channelType}을 통해 소통하고 있습니다.\n현재 시각: ${new Date().toLocaleString()}`,
    runtimeInstruction,
    officialJobSignupIntentPrompt,
    onboardingRuntimeStateSection,
    futureMatchingInsightsSection,
    existingPreferencesSection,
    optionalFollowUpOpportunitiesSection,
    // text chat에만 포함:
    args.channel === "chat"
      ? (args.pendingOpportunityFeedbackContext ?? "")
      : "",
    recentActivitySummariesSection,
    opportunityStatusSection,
    // voice call에만 포함: 최근 채팅 맥락을 짧게 넣어 통화 시작점을 맞춘다.
    `Important: Use ${outputLanguage} unless the latest user message explicitly asks to change language.`,
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

/**
 * /career 텍스트 채팅 LLM 호출에 쓰는 prompt plan을 만든다.
 *
 * text chat은 core prompt 안의 Markdown/link 규칙을 받는다.
 * voice 전용 interrupt, 통화 종료, 구어체 응답 블록은 받지 않는다.
 */
export function buildCareerTextChatPromptBlocks(args: {
  activeInternalFitHoldQuestion?: ActiveInternalFitHoldQuestion | null;
  currentInsightContent: Record<string, string> | null;
  currentPreferences?: CareerPromptPreferences | null;
  isOnboardingDone?: boolean;
  officialJobSignupIntentPrompt?: string | null;
  onboardingChecklistCoverage?: OnboardingChecklistCoverage | null;
  opportunityStatus?: CareerPromptOpportunityStatus | null;
  pendingOpportunityFeedbackContext?: string | null;
  profile: CareerPromptProfile | null;
  proactiveTurnInstructionMode?: CareerProactiveTurnInstructionMode;
  proactiveTurnInstruction?: string;
  recentActivitySummaries?: readonly CareerPromptActivitySummary[] | null;
  recentRecommendedOpportunitiesText?: string | null;
  sessionStartInstruction?: string;
  structuredProfileText: string;
  toolNames?: readonly string[] | string;
}): CareerPromptPlan {
  const plan = buildCareerConversationPromptPlan({
    ...args,
    channel: "chat",
  });

  return plan;
}

/**
 * 실시간 voice call의 instructions로 쓰는 최종 prompt plan을 만든다.
 *
 * voice call은 interrupt 처리, 통화 종료 규칙, 구어체 응답 스타일,
 * 최근 채팅 맥락을 받는다. text chat 전용 feedback/activity 블록은 넣지 않는다.
 */
export function buildCareerRealtimePromptPlan(args: {
  currentInsightContent: Record<string, string> | null;
  currentPreferences?: CareerPromptPreferences | null;
  interruptHandling: string;
  isOnboardingDone?: boolean;
  callEndInstruction: string;
  officialJobSignupIntentPrompt?: string | null;
  onboardingChecklistCoverage?: OnboardingChecklistCoverage | null;
  opportunityStatus?: CareerPromptOpportunityStatus | null;
  proactiveTurnInstructionMode?: CareerProactiveTurnInstructionMode;
  proactiveTurnInstruction?: string;
  recentConversationSection: string;
  recentRecommendedOpportunitiesText?: string | null;
  structuredProfileText: string;
  toolNames?: readonly string[] | string;
  profile: CareerPromptProfile | null;
}) {
  const plan = buildCareerConversationPromptPlan({
    callEndInstruction: args.callEndInstruction,
    channel: "voice",
    currentInsightContent: args.currentInsightContent,
    currentPreferences: args.currentPreferences,
    interruptHandling: args.interruptHandling,
    isOnboardingDone: args.isOnboardingDone,
    officialJobSignupIntentPrompt: args.officialJobSignupIntentPrompt,
    onboardingChecklistCoverage: args.onboardingChecklistCoverage,
    opportunityStatus: args.opportunityStatus,
    profile: args.profile,
    proactiveTurnInstructionMode: args.proactiveTurnInstructionMode,
    proactiveTurnInstruction: args.proactiveTurnInstruction,
    recentConversationSection: args.recentConversationSection,
    recentRecommendedOpportunitiesText: args.recentRecommendedOpportunitiesText,
    structuredProfileText: args.structuredProfileText,
    toolNames: args.toolNames,
  });

  return {
    ...plan,
    instructions: renderCareerPromptBlocks(plan.promptBlocks),
  };
}
