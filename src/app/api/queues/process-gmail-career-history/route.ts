import { handleCallback, type MessageMetadata } from "@vercel/queue";
import { analyzeGmailCareerHistory } from "@/lib/integrations/gmailCareerHistory";
import { parseGmailCareerHistoryQueueMessage } from "@/lib/integrations/gmailCareerHistoryQueueMessage";
import { createGmailCareerHistoryFollowUpReply } from "@/lib/integrations/gmailCareerHistoryReply";
import { updateGmailCareerHistoryRun } from "@/lib/integrations/gmailCareerHistoryRun";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_DELIVERIES = 5;

class GmailCareerHistoryPermanentError extends Error {}

function retryAfterSeconds(deliveryCount: number) {
  return Math.min(300, 2 ** Math.max(1, deliveryCount) * 5);
}

async function processQueueMessage(
  rawMessage: unknown,
  metadata: MessageMetadata
) {
  const message = parseGmailCareerHistoryQueueMessage(rawMessage);
  if (!message) {
    throw new GmailCareerHistoryPermanentError(
      "Invalid Gmail career history queue message"
    );
  }
  if (metadata.deliveryCount > MAX_DELIVERIES) {
    await updateGmailCareerHistoryRun({
      admin: getTalentSupabaseAdmin(),
      deliveryCount: metadata.deliveryCount,
      reason: "retry_budget_exhausted",
      runId: message.runId,
      status: "failed",
      talentId: message.talentId,
    });
    throw new GmailCareerHistoryPermanentError(
      "Gmail career history retry budget exhausted"
    );
  }

  const admin = getTalentSupabaseAdmin();
  await updateGmailCareerHistoryRun({
    admin,
    deliveryCount: metadata.deliveryCount,
    runId: message.runId,
    status: "running",
    talentId: message.talentId,
  });
  let result;
  try {
    result = await analyzeGmailCareerHistory({
      admin,
      expectedIntegrationUpdatedAt: message.expectedIntegrationUpdatedAt,
      talentId: message.talentId,
    });
    if (result.status === "completed") {
      await createGmailCareerHistoryFollowUpReply({
        admin,
        entries: result.entries,
        runStartedAt: message.runStartedAt ?? result.updatedAt,
        userId: message.talentId,
      });
    }
  } catch (error) {
    await updateGmailCareerHistoryRun({
      admin,
      deliveryCount: metadata.deliveryCount,
      reason: "analysis_failed",
      runId: message.runId,
      status: metadata.deliveryCount >= MAX_DELIVERIES ? "failed" : "retrying",
      talentId: message.talentId,
    });
    throw error;
  }
  await updateGmailCareerHistoryRun({
    admin,
    deliveryCount: metadata.deliveryCount,
    reason: result.status === "skipped" ? result.reason : undefined,
    runId: message.runId,
    status: result.status === "completed" ? "completed" : "failed",
    talentId: message.talentId,
  });
  console.info("[gmail-career-history/queue] finished", {
    deliveryCount: metadata.deliveryCount,
    entryCount: result.status === "completed" ? result.entryCount : undefined,
    messageId: metadata.messageId,
    reason: result.status === "skipped" ? result.reason : undefined,
    status: result.status,
  });
}

export const POST = handleCallback(processQueueMessage, {
  retry: (error, metadata) => {
    if (error instanceof GmailCareerHistoryPermanentError) {
      console.error("[gmail-career-history/queue] permanent failure", {
        deliveryCount: metadata.deliveryCount,
        message: error.message,
        messageId: metadata.messageId,
      });
      return { acknowledge: true };
    }
    if (metadata.deliveryCount >= MAX_DELIVERIES) {
      console.error("[gmail-career-history/queue] retry budget exhausted", {
        deliveryCount: metadata.deliveryCount,
        message:
          error instanceof Error ? error.message : "Unknown processing error",
        messageId: metadata.messageId,
      });
      return { acknowledge: true };
    }
    return { afterSeconds: retryAfterSeconds(metadata.deliveryCount) };
  },
  visibilityTimeoutSeconds: 330,
});
