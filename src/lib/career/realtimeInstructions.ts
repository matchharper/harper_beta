import {
  buildTalentProfileContext,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  fetchVisibleMessagesPage,
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
  fetchTalentOpportunityHistory,
  formatRecentRecommendedOpportunitiesForPrompt,
} from "@/lib/talentOpportunity";

/**
 * Build realtime instructions from the shared Harper system prompt plus
 * voice-only guidance and dynamic context.
 */
export async function buildCareerRealtimeSessionInstructions(args: {
  conversationId: string;
  conversationStarterId?: string | null;
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
    fetchTalentOpportunityHistory({
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
  const promptToolNames = talentSetting?.is_onboarding_done ? args.toolNames : [];
  const conversationStarterId = args.conversationStarterId?.trim();
  const conversationStarter = conversationStarterId
    ? getCareerConversationStarterPrompt(conversationStarterId)
    : null;

  const recentConversationSection = buildCareerRealtimeRecentConversationSection(
    visibleMessages.map((message) => ({
      role: message.role,
      content: formatTalentMessageContentForLlmPrompt(message),
      createdAt: message.created_at,
    }))
  );

  return buildCareerRealtimePromptPlan({
    additionalQuestionSelectionCount: null,
    callEndInstruction: getCareerCallEndInstructionPrompt(),
    currentInsightContent,
    interruptHandling: getCareerInterruptHandlingPrompt(),
    isOnboardingDone: talentSetting?.is_onboarding_done,
    profile,
    proactiveTurnInstructionMode: conversationStarter
      ? "conversation_starter"
      : undefined,
    proactiveTurnInstruction:
      conversationStarter?.voiceProactiveInstruction ?? undefined,
    recentConversationSection,
    recentRecommendedOpportunitiesText,
    structuredProfileText,
    toolNames: promptToolNames,
  });
}
