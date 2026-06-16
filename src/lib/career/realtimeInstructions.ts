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
  buildCareerRealtimePromptPlan,
  buildCareerRealtimeRecentConversationSection,
  getCareerCallEndInstructionPrompt,
  getCareerInterruptHandlingPrompt,
} from "@/lib/career/prompts";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
import { getCareerConversationStarterPrompt } from "@/lib/career/conversationStarterPrompts";
import {
  fetchRecentRecommendedOpportunitiesForPrompt,
  formatRecentRecommendedOpportunitiesForPrompt,
} from "@/lib/talentOpportunity";
import {
  buildInternalOpportunityRealtimeInstruction,
  fetchInternalOpportunityCallRequestById,
  isOpenInternalOpportunityCallRequestStatus,
} from "@/lib/talentOnboarding/internalOpportunityCallRequest";

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
    recentRecommendedOpportunities,
  ] = await Promise.all([
    fetchTalentUserProfile({ admin, userId: args.userId }),
    fetchTalentInsights({ admin, userId: args.userId }),
    fetchTalentSetting({ admin, userId: args.userId }),
    fetchRecentRecommendedOpportunitiesForPrompt({
      admin,
      limit: 10,
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
    getInternalRecommendation:
      talentSetting?.get_internal_recommendation ?? true,
    periodicIntervalDays: talentSetting?.periodic_interval_days ?? null,
    preferredLocale:
      args.preferredLocale ?? talentSetting?.preferred_locale ?? null,
    profileVisibility: talentSetting?.profile_visibility ?? null,
    recommendationBatchSize: talentSetting?.recommendation_batch_size ?? null,
  };
  const onboardingChecklistCoverage = !Boolean(
    talentSetting?.is_onboarding_done
  )
    ? await getCareerOnboardingChecklistCoverage({
        admin,
        conversationId: args.conversationId,
        currentInsightContent,
        userId: args.userId,
      })
    : null;
  const promptToolNames = talentSetting?.is_onboarding_done
    ? args.toolNames
    : [];
  const conversationStarterId = args.conversationStarterId?.trim();
  const conversationStarter = conversationStarterId
    ? getCareerConversationStarterPrompt(conversationStarterId)
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

  const recentConversationSection =
    buildCareerRealtimeRecentConversationSection(
      visibleMessages.map((message) => ({
        role: message.role,
        content: formatTalentMessageContentForLlmPrompt(message),
        createdAt: message.created_at,
      })),
      currentPreferences.preferredLocale
    );

  return buildCareerRealtimePromptPlan({
    additionalQuestionSelectionCount: null,
    callEndInstruction: getCareerCallEndInstructionPrompt(),
    currentInsightContent,
    currentPreferences,
    interruptHandling: getCareerInterruptHandlingPrompt(),
    isOnboardingDone: talentSetting?.is_onboarding_done,
    onboardingChecklistCoverage,
    profile,
    proactiveTurnInstructionMode: conversationStarter
      ? "conversation_starter"
      : openInternalCallRequest
        ? "internal_opportunity_call"
        : undefined,
    proactiveTurnInstruction: [
      conversationStarter?.voiceProactiveInstruction ?? "",
      openInternalCallRequest
        ? buildInternalOpportunityRealtimeInstruction({
            ...openInternalCallRequest,
            preferredLocale: currentPreferences.preferredLocale,
          })
        : "",
    ]
      .filter((section) => section.trim().length > 0)
      .join("\n\n"),
    recentConversationSection,
    recentRecommendedOpportunitiesText,
    structuredProfileText,
    toolNames: promptToolNames,
  });
}
