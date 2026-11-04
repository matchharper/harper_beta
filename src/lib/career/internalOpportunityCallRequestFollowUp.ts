import { createTalentOpportunityFeedbackFollowUpReply } from "./historyActionReply";
import { CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER } from "./prompts/types";
import type { TalentAdminClient } from "@/lib/talentOnboarding/server";
import type { TalentOpportunityFeedback } from "@/lib/talentOpportunity";

/** Compatibility for an older client. The same event identity makes its second
 * request a no-op; it cannot launch a second model or insert a canned call offer. */
export async function createInternalOpportunityCallRequestFollowUp(args: {
  admin: TalentAdminClient; conversationId: string | null;
  feedback?: TalentOpportunityFeedback | null; isMobile?: boolean | null;
  opportunityId?: string | null; userId: string;
}) {
  const assistantMessage = await createTalentOpportunityFeedbackFollowUpReply({
    ...args, action: args.feedback === "keep" ? null : args.feedback,
    trigger: CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER.ImmediateInternalFeedback,
  });
  return { assistantMessage };
}
