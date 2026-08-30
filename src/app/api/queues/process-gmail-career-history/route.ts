import { handleCallback, type MessageMetadata } from "@vercel/queue";
import { analyzeGmailCareerHistory } from "@/lib/integrations/gmailCareerHistory";
import { parseGmailCareerHistoryQueueMessage } from "@/lib/integrations/gmailCareerHistoryQueueMessage";
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
    throw new GmailCareerHistoryPermanentError(
      "Gmail career history retry budget exhausted"
    );
  }

  const result = await analyzeGmailCareerHistory({
    admin: getTalentSupabaseAdmin(),
    expectedIntegrationUpdatedAt: message.expectedIntegrationUpdatedAt,
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
