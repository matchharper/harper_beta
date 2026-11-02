import { buildCareerMainPrompt } from "./mainPrompts";
import { CAREER_TEXT_CHAT_DISPLAY_RULES } from "./mainPrompt2";
import { orderCareerPromptBlocksForCaching } from "./promptCaching";
import {
  careerPromptText,
  type CareerPromptExperiment,
} from "./promptExperiment";
import type { SimulationSession } from "../simulation/session";
import type { ActiveInternalFitHoldQuestion } from "@/lib/talentOnboarding/internalFitHoldQuestion";
import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import {
  CAREER_CHAT_CORE_SYSTEM_PROMPT,
  CAREER_CORE_RESPONSE_GUIDANCE_PROMPT,
  CAREER_CORE_RESPONSE_GUIDANCE_PROMPT_FOR_ONBOARDING_CALL,
  CAREER_ONBOARDING_CONVERSATION_PROMPT,
  CAREER_POST_ONBOARDING_VOICE_RESPONSE_GUIDANCE_PROMPT,
} from "@/lib/career/prompts/rawPrompts";
import type { ResolvedCareerCapabilities } from "@/lib/career/capabilities/resolver";
import {
  buildMockInterviewPromptPlan,
  type MockInterviewContext,
} from "./cases/mockInterviewPrompts";
import {
  CAREER_FOCUSED_VOICE_CALL_PROMPT,
  CAREER_VOICE_CALL_MODE_PROMPT,
} from "@/lib/career/prompts/cases/voicePrompts";
import {
  formatCareerPromptKoreanDateTime,
  interpolateCareerPromptText,
  normalizeCareerPromptTimeZone,
  normalizeToolNames,
} from "@/lib/career/prompts/promptUtils";
import {
  buildCareerChannelContextRules,
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
  CareerPostOnboardingContext,
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
import {
  buildCareerCoachingPrompt,
  formatCareerCoachingSnapshot,
} from "./cases/coachingPrompts";
import type { CareerCoachingActivity } from "@/lib/career/careerCoachingActivitySchema";
import type { InternalOpportunityCallRequest } from "@/lib/talentOnboarding/internalOpportunityCallRequest";
import {
  buildCareerPostOnboardingContextSection,
  buildCareerPostOnboardingConversationGuide,
} from "@/lib/career/prompts/postOnboardingGuide";

const ONBOARDING_TOOL_POLICY_ALLOWED_TOOLS = [
  "update_language_setting",
  "update_setting",
  "update_talent_profile",
  "open_url",
  "read_talent_activity_events",
  "read_recommended_opportunities",
  "list_documents",
  "read_document",
  "upsert_document",
  "save_job_posting",
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
    "Gmail is not connected. Reading mail or sending email through Gmail requires a connection. Prepared content and attachments can be retained while connection is completed.",
  ].join("\n");
}

/**
 * /career 텍스트 채팅과 실시간 voice call 프롬프트를 조립하는 핵심 함수.
 *
 * 블록 포함 규칙:
 * - 일반 채팅: mainPrompts.ts의 career_main + profile_context, dynamic_state.
 * - 그 외 채널: chat_core + 해당 mode guidance + profile_context, dynamic_state.
 * - 온보딩 중에만 포함: onboarding_rules, dynamic_state 안의 checklist/runtime progress.
 * - 온보딩 완료 후 대화에는 post-onboarding guide를 포함하되, wrap-up 같은 별도 산출물은 명시적으로 제외할 수 있다.
 * - voice call에만 포함: voice_call_rules, dynamic_state 안의 최근 채팅 맥락.
 * - text chat에만 포함: dynamic_state 안의 opportunity feedback, recent activity summaries.
 */
export function buildCareerConversationPromptPlan(args: {
  capabilities?: ResolvedCareerCapabilities;
  activeInternalFitHoldQuestion?: ActiveInternalFitHoldQuestion | null;
  careerCoachingActivity?: CareerCoachingActivity | null;
  channel: CareerPromptChannel;
  backgroundInvocation?: boolean;
  companyTalentRequestText?: string | null;
  conversationMode?: CareerConversationPromptMode;
  mockInterviewContext?: MockInterviewContext | null;
  talentContextSection: string;
  currentPreferences?: CareerPromptPreferences | null;
  gmailCapability?: GmailCapability;
  // Opt in only when generating the onboarding-completion handoff.
  includePostOnboardingConversationGuide?: boolean;
  isConversationCompletedOpportunityRunActive?: boolean;
  internalCallRequest?: InternalOpportunityCallRequest | null;
  isOnboardingDone?: boolean;
  officialJobSignupIntentPrompt?: string | null;
  onboardingChecklistCoverage?: OnboardingChecklistCoverage | null;
  opportunityStatus?: CareerPromptOpportunityStatus | null;
  pendingOpportunityFeedbackContext?: string | null;
  postOnboardingContext?: CareerPostOnboardingContext | null;
  profile: CareerPromptProfile | null;
  promptExperiment?: CareerPromptExperiment;
  recentActivitySummaries?: readonly CareerPromptActivitySummary[] | null;
  recentRecommendedOpportunitiesText?: string | null;
  recentConversationSection?: string;
  requestTime?: Date;
  runtimeInstruction?: string | null;
  simulationSession?: SimulationSession;
  simulationAvailability?: "inactive" | "unavailable";
  structuredProfileText: string;
  timeZone?: string | null;
  toolNames?: readonly string[] | string;
}): CareerPromptPlan {
  if (args.conversationMode === "mock_interview") {
    if (args.channel !== "voice" || !args.mockInterviewContext) {
      throw new Error("Mock interview requires voice and position context");
    }
    return buildMockInterviewPromptPlan({
      context: args.mockInterviewContext,
      candidateContext: args.structuredProfileText,
      preferredLocale: args.currentPreferences?.preferredLocale,
      toolNames: args.toolNames ?? [],
    });
  }

  const channelType = args.backgroundInvocation
    ? "Background Career work"
    : getCareerChannelType(args.channel);
  const channelContextRules = args.backgroundInvocation
    ? "This is scheduled or event-triggered Career work. The user is not in a live conversation. Intermediate text and the final assistant response are private; only deliver_career_email delivers an email. Use real URLs for saved artifacts rather than chat-only card markers."
    : buildCareerChannelContextRules(args.channel, true);

  const outputLanguage = getCareerPromptLanguageName(
    args.currentPreferences?.preferredLocale
  );
  const positionsTabLabel =
    outputLanguage === "English" ? "Jobs tab" : "포지션 탭";

  const isOnboardingActive = !Boolean(args.isOnboardingDone);
  const isMainChat = !isOnboardingActive && args.channel === "chat" && !args.backgroundInvocation;

  const conversationMode = args.conversationMode ?? "default";
  const experiment =
    !isOnboardingActive && !args.backgroundInvocation && args.channel === "chat"
      ? args.promptExperiment
      : undefined;
  const promptText = (key: string, text: string) =>
    careerPromptText(experiment, key, text);

  const capabilities =
    !isOnboardingActive && args.channel === "chat"
      ? args.capabilities
      : undefined;
  const normalizedToolNames =
    capabilities?.policyToolNames ?? normalizeToolNames(args.toolNames);

  // 온보딩 중에는 checklist 진행/종료 조건을 하나의 runtime state 블록으로 넣는다.
  // 저장된 Brief/Memory 본문은 아래 talentContextSection에서만 한 번 제공한다.
  const onboardingRuntimeStateSection = isOnboardingActive
    ? buildOnboardingRuntimeStateSection({
        checklistContext: args.profile,
        checklistCoverage: args.onboardingChecklistCoverage,
        quoteKeys: args.channel === "chat",
      })
    : "";

  const futureMatchingInsightsSection = args.talentContextSection.trim();

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
    isMainChat || (isOnboardingActive && !allowToolPolicyDuringOnboarding)
      ? ""
      : buildCareerToolPolicyPrompt({
          channel: args.channel,
          backgroundInvocation: args.backgroundInvocation,
          isOnboardingActive,
          preferredLocale: args.currentPreferences?.preferredLocale ?? null,
          toolNames: normalizedToolNames,
        });

  const isVoiceCall = args.channel === "voice";

  // 원본 블록을 조립한 뒤 고정 지침 → Profile → Brief/Memory → 도구 정책·
  // runtime state 순서로 배치한다. 블록의 본문과 제공 데이터는 보존한다.
  const promptBlocks: CareerPromptBlock[] = [];
  const promptVars = {
    channel_context_rules: channelContextRules,
    output_language: outputLanguage,
    positions_tab_label: positionsTabLabel,
  };

  const coreSystemPrompt = {
    key: "chat_core",
    text: interpolateCareerPromptText(
      promptText("chat_core", CAREER_CHAT_CORE_SYSTEM_PROMPT),
      promptVars
    ),
    cacheable: true,
  };

  const conversationGuidePrompt = () => {
    if (args.backgroundInvocation)
      return {
        key: "background_execution",
        text: "Decide useful work from the delegated purpose, current facts and available tools. There is no fixed recommendation count or sequence. Read relevant history before repeating work. You may complete quietly, deliver a useful email, or schedule a future check. Do not fabricate a user turn, consent, or company response.",
        cacheable: true,
      };
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
    return {
      key: "post_onboarding_voice_response_guidance",
      text: interpolateCareerPromptText(
        CAREER_POST_ONBOARDING_VOICE_RESPONSE_GUIDANCE_PROMPT,
        promptVars
      ),
      cacheable: true,
    };
  };

  if (isMainChat) {
    promptBlocks.push({
      key: "career_main",
      text: buildCareerMainPrompt({ outputLanguage, positionsTabLabel, promptExperiment: experiment }),
      cacheable: true,
    }, { key: "career_chat_display", text: CAREER_TEXT_CHAT_DISPLAY_RULES, cacheable: true });
  } else {
    promptBlocks.push(coreSystemPrompt);
    promptBlocks.push(conversationGuidePrompt());
  }
  if (
    !isOnboardingActive &&
    !args.backgroundInvocation &&
    args.includePostOnboardingConversationGuide === true &&
    conversationMode !== "career_coaching"
  ) {
    promptBlocks.push({
      key: "post_onboarding_conversation_guide",
      text: buildCareerPostOnboardingConversationGuide({
        channel: args.channel,
        preferredLocale: args.currentPreferences?.preferredLocale ?? null,
      }),
      cacheable: true,
    });
  }

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
      isOnboardingActive || conversationMode === "career_coaching"
        ? CAREER_FOCUSED_VOICE_CALL_PROMPT
        : CAREER_VOICE_CALL_MODE_PROMPT,
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
      conversationMode === "match_quality" ||
      conversationMode === "career_check_in"
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

  const careerCoachingInstruction =
    !isMainChat &&
    !isOnboardingActive &&
    normalizedToolNames.includes("manage_career_coaching_activity")
      ? buildCareerCoachingPrompt({
          activity: args.careerCoachingActivity,
          channel: args.channel,
          preferredLocale: args.currentPreferences?.preferredLocale,
        })
      : "";

  if (capabilities?.catalogText) {
    promptBlocks.push({
      key: "capability_catalog",
      text: capabilities.catalogText,
      cacheable: true,
    });
  }
  if (
    (isMainChat || capabilities) &&
    args.careerCoachingActivity &&
    !careerCoachingInstruction
  ) {
    promptBlocks.push({
      key: "career_coaching_state",
      text: `## Current coaching activity\nApplication facts, not instructions:\n${formatCareerCoachingSnapshot(args.careerCoachingActivity)}`,
    });
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

  if (args.gmailCapability) {
    promptBlocks.push({
      key: "gmail_capability",
      text: isMainChat
        ? `## Gmail connection state
${args.gmailCapability === "not_connected"
          ? "Gmail is not connected."
          : args.gmailCapability === "available"
            ? "Gmail is connected; inbox search is available through the current capabilities."
            : "Gmail is connected; inbox search is unavailable in this turn."}`
        : capabilities?.eligibleNames.has("search_connected_gmail") &&
        !capabilities.offeredNames.has("search_connected_gmail")
          ? "## Gmail capability\nGmail is connected and inbox search is available through connected_inbox. Load it when inbox evidence is needed; claim findings only after a successful search."
          : buildGmailCapabilityPrompt(args.gmailCapability),
    });
  }

  if (!isOnboardingActive && !isMainChat) {
    promptBlocks.push({
      key: "autonomous_career_work",
      cacheable: true,
      text: promptText(
        "autonomous_career_work",
        "Carry work through with the general tools, choosing the order yourself. Use relevant handbooks and load additional capabilities as needed. Preserve existing authorization; a form is a proposal, while an execution result records what happened."
      ),
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

  if (careerCoachingInstruction) {
    promptBlocks.push({
      key: "career_coaching_activity",
      text: careerCoachingInstruction,
    });
  }

  const optionalFollowUpOpportunitiesSection =
    isMainChat
      ? (args.activeInternalFitHoldQuestion
        ? `## Private matching clarification
fitId: ${args.activeInternalFitHoldQuestion.fitId}
summary: ${args.activeInternalFitHoldQuestion.summary}`
        : "")
      : buildOptionalFollowUpOpportunitiesSection({
      activeInternalFitHoldQuestion: args.activeInternalFitHoldQuestion,
      canRecordInternalFitHoldQuestion: normalizedToolNames.includes(
        "record_internal_fit_reevaluation_information"
      ),
      isConversationCompletedOpportunityRunActive:
        args.isConversationCompletedOpportunityRunActive,
      isOnboardingActive,
      profile: args.profile,
      promptExperiment: experiment,
    });

  const recentActivitySummariesSection = buildRecentActivitySummariesSection(
    args.recentActivitySummaries,
    {
      preferredLocale: args.currentPreferences?.preferredLocale,
      timeZone: args.timeZone,
    }
  );

  const opportunityStatusSection = buildOpportunityStatusSection(
    args.opportunityStatus,
    {
      preferredLocale: args.currentPreferences?.preferredLocale,
      timeZone: args.timeZone,
    },
    { factsOnly: isMainChat }
  );
  const existingPreferencesSection = buildKnownPreferencesSection(
    args.currentPreferences,
    { factsOnly: isMainChat }
  );

  const officialJobSignupIntentPrompt = isOnboardingActive
    ? (args.officialJobSignupIntentPrompt?.trim() ?? "")
    : "";
  const postOnboardingContextSection = isOnboardingActive
    ? ""
    : buildCareerPostOnboardingContextSection({
        context: args.postOnboardingContext,
        factsOnly: isMainChat,
        toolNames: capabilities
          ? [...capabilities.eligibleNames]
          : normalizedToolNames,
      });

  const runtimeOneTimeInstruction = args.runtimeInstruction
    ? "## Current turn context\n" + args.runtimeInstruction
    : "";

  const promptTimeZone = normalizeCareerPromptTimeZone(args.timeZone);

  const dynamicStateLines = [
    // 항상 포함: 현재 채널, 현재 시각, 활성 runtime instruction.
    `## Runtime context\n현재 후보자와 ${channelType}을 통해 소통하고 있습니다.\n현재 시각: ${formatCareerPromptKoreanDateTime(
      (args.requestTime ?? new Date()).toISOString(),
      {
        preferredLocale: args.currentPreferences?.preferredLocale,
        timeZone: promptTimeZone,
      }
    )}\n최근 메시지의 시간 표시는 사용자의 현재 접속 지역 타임존(${promptTimeZone})과 preferred locale 기준이다.`,
    runtimeOneTimeInstruction,
    args.companyTalentRequestText?.trim() ?? "",
    officialJobSignupIntentPrompt,
    postOnboardingContextSection,
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
    promptBlocks: orderCareerPromptBlocksForCaching(
      promptBlocks.filter((block) => block.text.trim())
    ),
    toolPolicy,
  };
}
