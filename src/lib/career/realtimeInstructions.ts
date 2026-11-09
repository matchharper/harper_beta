import { fetchRecentMessagesWithSummary } from "@/lib/talentOnboarding/conversationSummary";
import { readCareerCheckInContext } from './schedules/server';
import { readInternalProposalContext } from './internalSelections';
import { buildInternalOpportunityRealtimeInstruction } from "./prompts/cases/lifecyclePrompts";
import { buildMockInterviewCandidateContext } from "./mockInterviewCandidateContext";
import { fetchMockInterviewContext } from "./mockInterview";
import {
  buildTalentMemoryRetrievalQuery,
  buildTalentProfileContext,
  fetchTalentContextPromptSnapshot,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
  renderTalentContextPrompt,
} from "@/lib/talentOnboarding/server";
import {
  buildCareerConversationPromptPlan,
  buildCareerRealtimeRecentConversationSection,
  renderCareerPromptBlocks,
} from "@/lib/career/prompts";
import {
  formatTalentMessageContentForLlmPrompt,
  formatTalentConversationReferencesForLlm,
} from "@/lib/career/opportunityFeedbackNote";
import { getCareerConversationStarter } from "@/lib/career/prompts/conversationStarters";
import { fetchCurrentCareerCoachingActivity } from "@/lib/career/careerCoachingActivity";
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
import { fetchLatestTalentActivityEvent, fetchRecentTalentActivitySummaries } from "@/lib/talentOnboarding/activityEvents";
import { OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE } from "@/lib/officialJobs";
import { TALENT_TOOL_NAMES } from "@/lib/talentOnboarding/tools";
import { shouldUseCareerRealtimeOnboarding } from "@/lib/career/realtimeCallScope";
import { fetchActiveTalentGmailIntegration } from "@/lib/integrations/gmail";
import { hasActiveConversationCompletedOpportunityRun } from "@/lib/opportunityDiscovery/store";
import { fetchCareerPostOnboardingContext } from "@/lib/career/postOnboardingContext";
import { buildCareerCoachingCallOpeningInstruction } from "@/lib/career/prompts/cases/coachingPrompts";
import {
  buildLiveBackendInstructions,
  buildLiveOnboardingContext,
} from "./liveOnboarding";

/**
 * Build realtime instructions from the shared Harper system prompt plus
 * voice-only guidance and dynamic context.
 */
export async function buildCareerRealtimeSessionInstructions(args: {
  careerCoachingActivityMessageId?: number | null;
  careerCoachingActivityRevision?: number | null;
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
      liveInstructions: buildLiveBackendInstructions(plan),
      liveOnboardingContext: null,
      internalCallContext: null,
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
    recentActivitySummaries,
    checkInContext,
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
    fetchRecentTalentActivitySummaries({admin,userId:args.userId,limit:5}),
    readCareerCheckInContext({ admin, userId: args.userId }).catch(() => 'Persistent Career check-in could not be read; its timing and active state are unknown.'),
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

  const visibleMessages = await fetchRecentMessagesWithSummary({
    admin,
    conversationId: args.conversationId,
    userId: args.userId,
  });
  const conversationStarterId = args.conversationStarterId?.trim();
  const conversationStarterForRetrieval = conversationStarterId
    ? getCareerConversationStarter(conversationStarterId, args.preferredLocale)
    : null;
  const memoryRetrievalInputs = visibleMessages
    .slice(-6)
    .map((message) => formatTalentMessageContentForLlmPrompt(message));
  const talentContextSnapshot = await fetchTalentContextPromptSnapshot({
    admin,
    query: buildTalentMemoryRetrievalQuery(memoryRetrievalInputs),
    userId: args.userId,
  });
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
  const careerCoachingActivity = args.careerCoachingActivityMessageId
    ? await fetchCurrentCareerCoachingActivity({
        activityMessageId: args.careerCoachingActivityMessageId,
        admin,
        conversationId: args.conversationId,
        userId: args.userId,
      })
    : null;
  if (
    args.careerCoachingActivityMessageId &&
    (!careerCoachingActivity ||
      careerCoachingActivity.revision !== args.careerCoachingActivityRevision ||
      careerCoachingActivity.status !== "active" ||
      careerCoachingActivity.channel !== "call")
  ) {
    throw new Error("Career coaching call activity is stale or unavailable");
  }
  const isOnboardingActiveForSession = shouldUseCareerRealtimeOnboarding({
    hasConversationStarter: Boolean(
      conversationStarter || careerCoachingActivity
    ),
    hasMockInterview: false,
    hasInternalOpportunityCall: Boolean(openInternalCallRequest),
    isOnboardingDone: Boolean(talentSetting?.is_onboarding_done),
  });
  const promptToolNames = openInternalCallRequest
    ? args.toolNames.filter(
        (name) =>
          name === TALENT_TOOL_NAMES.END_CALL ||
          name === TALENT_TOOL_NAMES.RECORD_CALL_ANSWERS,
      )
    : isOnboardingActiveForSession
      ? args.toolNames.filter((name) => name === TALENT_TOOL_NAMES.END_CALL)
      : args.toolNames.filter(
          (name) => name !== TALENT_TOOL_NAMES.RECORD_CALL_ANSWERS,
        );

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
    careerCoachingActivity,
    channel: "voice",
    talentContextSection,
    recentActivitySummaries,
    currentPreferences,
    gmailCapability: activeGmailIntegration
      ? "connected_but_unavailable_this_turn"
      : "not_connected",
    isConversationCompletedOpportunityRunActive,
    isOnboardingDone: !isOnboardingActiveForSession,
    officialJobSignupIntentPrompt: isOnboardingActiveForSession
      ? officialJobSignupIntentEvent?.summary
      : null,
    postOnboardingContext,
    profile,
    conversationMode: openInternalCallRequest
      ? "internal_opportunity_call"
      : careerCoachingActivity
        ? "career_coaching"
        : (conversationStarter?.id ?? "default"),
    internalCallRequest,
    recentConversationSection,
    recentRecommendedOpportunitiesText,
    runtimeInstruction: [
      checkInContext,
      await readInternalProposalContext({ admin, userId: args.userId }).catch(() => "Selected Harper-connected proposals could not be read; availability is unknown."),
      formatTalentConversationReferencesForLlm(visibleMessages, {
        preferredLocale: currentPreferences.preferredLocale,
        timeZone: args.timeZone,
      }),
      careerCoachingActivity
        ? buildCareerCoachingCallOpeningInstruction({
            activity: careerCoachingActivity,
            preferredLocale: currentPreferences.preferredLocale,
          })
        : undefined,
    ].filter(Boolean).join("\n\n"),
    structuredProfileText,
    timeZone: args.timeZone,
    toolNames: promptToolNames,
  });

  return {
    ...promptPlan,
    instructions: renderCareerPromptBlocks(promptPlan.promptBlocks),
    liveInstructions: buildLiveBackendInstructions(promptPlan),
    internalCallContext: openInternalCallRequest
      ? {
          callId: openInternalCallRequest.id,
          revision: openInternalCallRequest.updatedAt,
          text: buildInternalOpportunityRealtimeInstruction({
            ...openInternalCallRequest,
            preferredLocale: currentPreferences.preferredLocale,
          }),
        }
      : null,
    liveOnboardingContext: promptPlan.isOnboardingActive
      ? buildLiveOnboardingContext({
          checklistContext: profile,
          structuredProfileText,
          talentContextSection,
          recentConversationSection,
        })
      : null,
  };
}
