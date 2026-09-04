import {
  buildTalentProfileContext,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  fetchVisibleMessagesPage,
  getCareerOnboardingChecklistCoverage,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import {
  buildCareerConversationPromptPlan,
  buildCareerRealtimeRecentConversationSection,
  renderCareerPromptBlocks,
} from "@/lib/career/prompts";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
import { getCareerConversationStarter } from "@/lib/career/prompts/conversationStarters";
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

/**
 * Build realtime instructions from the shared Harper system prompt plus
 * voice-only guidance and dynamic context.
 */
export async function buildCareerRealtimeSessionInstructions(args: {
  conversationId: string;
  conversationStarterId?: string | null;
  internalCallRequestId?: string | null;
  preferredLocale?: string | null;
  toolNames: string[];
  userId: string;
}) {
  const admin = getTalentSupabaseAdmin();

  const [
    profile,
    currentInsights,
    talentSetting,
    officialJobSignupIntentEvent,
    recentRecommendedOpportunities,
    activeGmailIntegration,
    isConversationCompletedOpportunityRunActive,
  ] = await Promise.all([
    fetchTalentUserProfile({ admin, userId: args.userId }),
    fetchTalentInsights({ admin, userId: args.userId }),
    fetchTalentSetting({ admin, userId: args.userId }),
    fetchLatestTalentActivityEvent({
      admin,
      eventType: OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE,
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

  const currentInsightContent = (currentInsights?.content ?? null) as Record<
    string,
    string
  > | null;
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
  const conversationStarterId = args.conversationStarterId?.trim();
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
        content: formatTalentMessageContentForLlmPrompt(message),
        createdAt: message.created_at,
      })),
      currentPreferences.preferredLocale
    );

  const promptPlan = buildCareerConversationPromptPlan({
    channel: "voice",
    currentInsightContent,
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
    profile,
    conversationMode: openInternalCallRequest
      ? "internal_opportunity_call"
      : (conversationStarter?.id ?? "default"),
    internalCallRequest,
    recentConversationSection,
    recentRecommendedOpportunitiesText,
    structuredProfileText,
    toolNames: promptToolNames,
  });

  return {
    ...promptPlan,
    instructions: renderCareerPromptBlocks(promptPlan.promptBlocks),
  };
}
