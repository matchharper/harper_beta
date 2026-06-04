import {
  completeOnboardingAndQueueInitialOpportunityRun,
  getActiveOpportunityRun,
  serializeOpportunityRun,
} from "@/lib/opportunityDiscovery/store";
import { maybeSummarizeTalentConversation } from "@/lib/talentOnboarding/conversationSummary";
import {
  createOnboardingCompletionMessages,
  regenerateOnboardingCompletionMessages,
} from "@/lib/talentOnboarding/onboardingCompletionWrapup";
import {
  fetchTalentInsights,
  type TalentAdminClient,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";

export async function completeTalentOnboardingManually(args: {
  admin: TalentAdminClient;
  conversationId: string;
  isMobile?: boolean | null;
  latestUserMessageId?: number | string | null;
  regenerateWrapup?: boolean;
  source: string;
  userId: string;
}) {
  const now = new Date().toISOString();
  const { error: conversationUpdateError } = await args.admin
    .from("talent_conversations")
    .update({
      stage: "completed",
      updated_at: now,
    })
    .eq("id", args.conversationId)
    .eq("user_id", args.userId);

  if (conversationUpdateError) {
    throw new Error(
      conversationUpdateError.message ??
        "Failed to complete onboarding conversation"
    );
  }

  const queuedRun = await completeOnboardingAndQueueInitialOpportunityRun({
    admin: args.admin,
    completionReason: "user_requested_manual_completion",
    conversationId: args.conversationId,
    source: args.source,
    userId: args.userId,
  });

  if (queuedRun) {
    console.info("[opportunity-discovery] queued for harper_worker", {
      runId: queuedRun.id,
    });
  }

  const completionMessages = await (args.regenerateWrapup
    ? regenerateOnboardingCompletionMessages
    : createOnboardingCompletionMessages)({
    admin: args.admin,
    conversationId: args.conversationId,
    isMobile: args.isMobile,
    latestUserMessageId: args.latestUserMessageId ?? null,
    userId: args.userId,
  });

  void maybeSummarizeTalentConversation({
    admin: args.admin,
    conversationId: args.conversationId,
    userId: args.userId,
  }).catch((error) => {
    console.error("[manual-completion] Failed to summarize conversation", {
      conversationId: args.conversationId,
      error: error instanceof Error ? error.message : String(error),
      userId: args.userId,
    });
  });

  const [activeRun, latestInsights] = await Promise.all([
    queuedRun
      ? Promise.resolve(queuedRun)
      : getActiveOpportunityRun({
          admin: args.admin,
          conversationId: args.conversationId,
          userId: args.userId,
        }),
    fetchTalentInsights({ admin: args.admin, userId: args.userId }),
  ]);

  return {
    insightUpdatedAt: latestInsights?.last_updated_at ?? null,
    opportunityDiscoveryQueued: Boolean(queuedRun),
    opportunityRun: serializeOpportunityRun(activeRun),
    talentInsights: latestInsights?.content ?? {},
    nextStepsMessage: (completionMessages.nextStepsMessage ??
      null) as TalentMessageRow | null,
    wrapupMessage: (completionMessages.wrapupMessage ??
      null) as TalentMessageRow | null,
  };
}
