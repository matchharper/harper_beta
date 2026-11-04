import { createHash } from "node:crypto";
import type { TalentOpportunityHistoryItem } from "@/lib/talentOpportunity";
import type { TalentOpportunityFeedbackActivityItem } from "@/lib/talentOnboarding/activityEvents";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";

export const CAREER_FEEDBACK_SILENT = "[[CAREER_FEEDBACK_SILENT]]";

/** Distinguish the action's effect from a raw boolean the writer might repeat. */
export function formatOpportunityDecisionReceipt(args: {
  opportunity: TalentOpportunityHistoryItem | null; feedback: string;
  companyShared?: boolean; updatedAt?: string;
}) {
  const opportunity = args.opportunity;
  return [
    `Decision saved: ${args.feedback}; recommendation ${opportunity?.id ?? "unavailable"}; role ${opportunity?.roleId ?? "unavailable"}.`,
    opportunity ? `${opportunity.companyName} / ${opportunity.title}; ${opportunity.sourceType}.` : "",
    args.feedback === "like" && opportunity?.sourceType === "internal"
      ? "The candidate has accepted Harper's introduction to this company using the materials pinned at acceptance."
      : args.feedback === "like" ? "External posting saved as an interested opportunity. This action did not submit an application."
      : args.feedback === "keep" ? "Saved for later without accepting or declining an introduction."
      : "The candidate's rejection is recorded for this exact opportunity.",
    opportunity?.sourceType === "internal" && args.feedback === "like"
      ? args.companyShared === true ? "Company sharing has been confirmed by the executor." : ""
      : "",
    opportunity?.acceptanceMaterial ? `Pinned material ${opportunity.acceptanceMaterial.materialId ?? "default"}; assignment revision ${opportunity.acceptanceMaterial.assignmentRevision}.` : "",
    opportunity?.internalProgress ? `Current progress: ${opportunity.internalProgress.message}` : "",
    args.updatedAt ? `Recorded ${formatLlmDateTime(args.updatedAt)} (Asia/Seoul).` : "",
  ].filter(Boolean).join("\n");
}

/** Identity uses durable saved facts, never the caller's proposed decision. */
export function careerFeedbackReplyId(conversationId: string, opportunity: TalentOpportunityHistoryItem | null, items: readonly TalentOpportunityFeedbackActivityItem[]) {
  const key = opportunity?.feedbackAt
    ? [opportunity.id, opportunity.feedbackAt, opportunity.feedback]
    : items.map(item => item.eventId).sort();
  return `feedback:${createHash("sha256").update(JSON.stringify([conversationId, key])).digest("hex")}`;
}

export function formatSavedOpportunityDecision(opportunity: TalentOpportunityHistoryItem | null) {
  if (!opportunity) return "";
  return [
    "## Current saved opportunity",
    `Recommendation ${opportunity.id}; role ${opportunity.roleId}; ${opportunity.sourceType}; type ${opportunity.opportunityType}.`,
    `${opportunity.companyName} / ${opportunity.title}`,
    `Saved decision: ${opportunity.feedback === "positive" ? opportunity.sourceType === "internal" ? "introduction accepted" : "interested in external posting" : opportunity.feedback === "negative" ? "declined" : opportunity.feedback === "keep" ? "saved for later" : "no decision"}.`,
    opportunity.isExpired ? "This opportunity has expired." : "",
    opportunity.feedbackAt ? `Decision time: ${formatLlmDateTime(opportunity.feedbackAt)}.` : "",
    opportunity.feedbackReason ? `User's saved reason (source text): ${opportunity.feedbackReason}` : "",
    opportunity.acceptanceMaterial ? `Accepted material ${opportunity.acceptanceMaterial.materialId}; assignment revision ${opportunity.acceptanceMaterial.assignmentRevision}.` : "",
    opportunity.internalProgress ? `Introduction progress: ${opportunity.internalProgress.message}` : "",
  ].filter(Boolean).join("\n");
}
