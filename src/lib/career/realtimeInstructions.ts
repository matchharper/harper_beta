import { buildMockInterviewCandidateContext } from "./mockInterviewCandidateContext";
import { fetchMockInterviewContext } from "./mockInterview";
import {
  buildTalentMemoryRetrievalQuery,
  buildTalentProfileContext,
  fetchTalentContextPromptSnapshot,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  fetchVisibleMessagesPage,
  getCareerOnboardingChecklistCoverage,
  getTalentSupabaseAdmin,
  projectBriefsToLegacyInsights,
  renderTalentContextPrompt,
} from "@/lib/talentOnboarding/server";
import {
  buildCareerConversationPromptPlan,
  buildCareerRealtimeRecentConversationSection,
  renderCareerPromptBlocks,
} from "@/lib/career/prompts";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
import { getCareerConversationStarter } from "@/lib/career/prompts/conversationStarters";
import { normalizeCareerPromptLocale } from "@/lib/career/promptLocale";
import {
  fetchRecentRecommendedOpportunitiesForPrompt,
  formatRecentRecommendedOpportunitiesForPrompt,
} from "@/lib/talentOpportunity";
import {
  fetchInternalOpportunityCallRequestById,
  isOpenInternalOpportunityCallRequestStatus,
} from "@/lib/talentOnboarding/internalOpportunityCallRequest";
import {
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
} from "@/lib/talentOnboarding/recommendationSettings";
import { fetchLatestTalentActivityEvent } from "@/lib/talentOnboarding/activityEvents";
import { OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE } from "@/lib/officialJobs";
import { TALENT_TOOL_NAMES } from "@/lib/talentOnboarding/tools";
import { shouldUseCareerRealtimeOnboarding } from "@/lib/career/realtimeCallScope";
import { fetchActiveTalentGmailIntegration } from "@/lib/integrations/gmail";
import { hasActiveConversationCompletedOpportunityRun } from "@/lib/opportunityDiscovery/store";
import { fetchCareerPostOnboardingContext } from "@/lib/career/postOnboardingContext";

/**
 * Build realtime instructions from the shared Harper system prompt plus
 * voice-only guidance and dynamic context.
 */
export async function buildCareerRealtimeSessionInstructions(args: {
  conversationId: string;
  conversationStarterId?: string | null;
  internalCallRequestId?: string | null;
  mockInterviewOpportunityId?: string | null;
  preferredLocale?: string | null;
  timeZone?: string | null;
  toolNames: string[];
  userId: string;
}) {
  const admin = getTalentSupabaseAdmin();
  const mockInterviewContext = args.mockInterviewOpportunityId
    ? await fetchMockInterviewContext({
        admin,
        userId: args.userId,
        opportunityId: args.mockInterviewOpportunityId,
      })
    : null;

  // Mock calls never retrieve recommendation, Gmail, Brief/Memory or chat history.
  if (mockInterviewContext) {
    const [profile, setting] = await Promise.all([
      fetchTalentUserProfile({ admin, userId: args.userId }),
      fetchTalentSetting({ admin, userId: args.userId }),
    ]);
    const structuredProfile = await fetchTalentStructuredProfile({
      admin,
      userId: args.userId,
      talentUser: profile,
    });
    const plan = buildCareerConversationPromptPlan({
      channel: "voice",
      conversationMode: "mock_interview",
      mockInterviewContext,
      currentPreferences: {
        preferredLocale: setting?.preferred_locale ?? args.preferredLocale,
      },
      profile: null,
      structuredProfileText:
        buildMockInterviewCandidateContext(structuredProfile),
      talentContextSection: "",
      toolNames: args.toolNames,
    });
    return {
      ...plan,
      instructions: renderCareerPromptBlocks(plan.promptBlocks),
    };
  }

  const [
    profile,
    talentSetting,
    officialJobSignupIntentEvent,
    postOnboardingContext,
    recentRecommendedOpportunities,
    activeGmailIntegration,
    isConversationCompletedOpportunityRunActive,
  ] = await Promise.all([
    fetchTalentUserProfile({ admin, userId: args.userId }),
    fetchTalentSetting({ admin, userId: args.userId }),
    fetchLatestTalentActivityEvent({
      admin,
      conversationId: args.conversationId,
      eventType: OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE,
      userId: args.userId,
    }),
    fetchCareerPostOnboardingContext({
      admin,
      conversationId: args.conversationId,
      userId: args.userId,
    }),
    fetchRecentRecommendedOpportunitiesForPrompt({
      admin,
      limit: 10,
      userId: args.userId,
    }),
    fetchActiveTalentGmailIntegration({
      admin,
      talentId: args.userId,
    }),
    hasActiveConversationCompletedOpportunityRun({
      admin,
      userId: args.userId,
    }),
  ]);

  const structuredProfile = await fetchTalentStructuredProfile({
    admin,
    userId: args.userId,
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

  const { messages: visibleMessages } = await fetchVisibleMessagesPage({
    admin,
    conversationId: args.conversationId,
    limit: 12,
  });
  const conversationStarterId = args.conversationStarterId?.trim();
  const conversationStarterForRetrieval = conversationStarterId
    ? getCareerConversationStarter(conversationStarterId, args.preferredLocale)
    : null;
  const memoryRetrievalInputs = visibleMessages
    .slice(-6)
    .map((message) => formatTalentMessageContentForLlmPrompt(message));
  if (conversationStarterForRetrieval?.id === "career_coaching") {
    memoryRetrievalInputs.push(
      normalizeCareerPromptLocale(args.preferredLocale) === "en"
        ? "Purpose of this conversation: continue the user's current career concern, tradeoffs between options, and previously confirmed career criteria and decision context"
        : "이번 대화의 목적: 현재 커리어 고민, 선택지 사이의 트레이드오프, 이전에 확인한 커리어 기준과 결정 맥락을 이어서 이야기하기"
    );
  }

  const talentContextSnapshot = await fetchTalentContextPromptSnapshot({
    admin,
    query: buildTalentMemoryRetrievalQuery(memoryRetrievalInputs),
    userId: args.userId,
  });
  const currentInsightContent = projectBriefsToLegacyInsights(
    talentContextSnapshot.allBriefs
  );
  const talentContextSection = renderTalentContextPrompt(talentContextSnapshot);
  const currentPreferences = {
    getExternalRecommendation:
      talentSetting?.get_external_recommendation ?? true,
    periodicIntervalDays: talentSetting
      ? normalizeTalentPeriodicIntervalDays(
          talentSetting.periodic_interval_days
        )
      : null,
    preferredLocale:
      talentSetting?.preferred_locale ?? args.preferredLocale ?? null,
    profileVisibility: talentSetting?.profile_visibility ?? null,
    recommendationBatchSize: talentSetting
      ? normalizeTalentRecommendationBatchSize(
          talentSetting.recommendation_batch_size
        )
      : null,
    talentSettingStatus: talentSetting?.status ?? null,
  };
  const conversationStarter = conversationStarterId
    ? getCareerConversationStarter(
        conversationStarterId,
        currentPreferences.preferredLocale
      )
    : null;
  const internalCallRequestId = args.internalCallRequestId?.trim();
  const internalCallRequest = internalCallRequestId
    ? await fetchInternalOpportunityCallRequestById({
        admin,
        callId: internalCallRequestId,
        userId: args.userId,
      })
    : null;
  const openInternalCallRequest =
    internalCallRequest &&
    isOpenInternalOpportunityCallRequestStatus(internalCallRequest.status)
      ? internalCallRequest
      : null;
  const isOnboardingActiveForSession = shouldUseCareerRealtimeOnboarding({
    hasConversationStarter: Boolean(conversationStarter),
    hasMockInterview: false,
    hasInternalOpportunityCall: Boolean(openInternalCallRequest),
    isOnboardingDone: Boolean(talentSetting?.is_onboarding_done),
  });
  const onboardingChecklistCoverage = isOnboardingActiveForSession
    ? await getCareerOnboardingChecklistCoverage({
        admin,
        conversationId: args.conversationId,
        currentInsightContent,
        userId: args.userId,
      })
    : null;
  const promptToolNames =
    openInternalCallRequest || isOnboardingActiveForSession
      ? args.toolNames.filter((name) => name === TALENT_TOOL_NAMES.END_CALL)
      : args.toolNames;

  const recentConversationSection =
    buildCareerRealtimeRecentConversationSection(
      visibleMessages.map((message) => ({
        role: message.role,
        content: formatTalentMessageContentForLlmPrompt(message, {
          preferredLocale: currentPreferences.preferredLocale,
          timeZone: args.timeZone,
        }),
        createdAt: message.created_at,
      })),
      currentPreferences.preferredLocale,
      args.timeZone
    );

  const promptPlan = buildCareerConversationPromptPlan({
    channel: "voice",
    talentContextSection,
    currentPreferences,
    gmailCapability: activeGmailIntegration
      ? "connected_but_unavailable_this_turn"
      : "not_connected",
    isConversationCompletedOpportunityRunActive,
    isOnboardingDone: !isOnboardingActiveForSession,
    officialJobSignupIntentPrompt: isOnboardingActiveForSession
      ? officialJobSignupIntentEvent?.summary
      : null,
    onboardingChecklistCoverage,
    postOnboardingContext,
    profile,
    conversationMode: openInternalCallRequest
      ? "internal_opportunity_call"
      : (conversationStarter?.id ?? "default"),
    internalCallRequest,
    recentConversationSection,
    recentRecommendedOpportunitiesText,
    structuredProfileText,
    timeZone: args.timeZone,
    toolNames: promptToolNames,
  });

  return {
    ...promptPlan,
    instructions: renderCareerPromptBlocks(promptPlan.promptBlocks),
  };
}
