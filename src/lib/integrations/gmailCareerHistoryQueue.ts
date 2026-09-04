import "server-only";

import { send } from "@vercel/queue";
import { after } from "next/server";
import { analyzeGmailCareerHistory } from "@/lib/integrations/gmailCareerHistory";
import { parseGmailCareerHistoryQueueMessage } from "@/lib/integrations/gmailCareerHistoryQueueMessage";
import type { TalentAdminClient } from "@/lib/talentOnboarding/server";

export const GMAIL_CAREER_HISTORY_QUEUE_TOPIC =
  "harper-gmail-career-history-v1";
export const GMAIL_CAREER_HISTORY_QUEUE_RETENTION_SECONDS = 86_400;

function cleanQueueKey(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

export async function publishGmailCareerHistoryAnalysis(args: {
  idempotencyKeySuffix?: string;
  integrationUpdatedAt: string;
  talentId: string;
}) {
  const message = parseGmailCareerHistoryQueueMessage({
    expectedIntegrationUpdatedAt: args.integrationUpdatedAt,
    kind: "analyze_gmail_career_history",
    talentId: args.talentId,
    version: 1,
  });
  if (!message) throw new Error("Invalid Gmail career history queue message");
  const keySuffix = cleanQueueKey(
    args.idempotencyKeySuffix ?? message.expectedIntegrationUpdatedAt,
    200
  );
  if (!keySuffix) throw new Error("Gmail analysis idempotency key is required");

  return send(GMAIL_CAREER_HISTORY_QUEUE_TOPIC, message, {
    idempotencyKey: `gmail-career-history:${message.talentId}:${keySuffix}`,
    retentionSeconds: GMAIL_CAREER_HISTORY_QUEUE_RETENTION_SECONDS,
  });
}

export async function scheduleGmailCareerHistoryAnalysis(args: {
  admin: TalentAdminClient;
  idempotencyKeySuffix?: string;
  integrationUpdatedAt: string;
  talentId: string;
}) {
  if (process.env.NODE_ENV === "development") {
    after(async () => {
      try {
        await analyzeGmailCareerHistory({
          admin: args.admin,
          expectedIntegrationUpdatedAt: args.integrationUpdatedAt,
          talentId: args.talentId,
        });
      } catch (error) {
        console.error("[gmail-career-history/local] analysis failed", {
          message:
            error instanceof Error ? error.message : "Unknown analysis error",
        });
      }
    });
    return { mode: "next_after" as const };
  }

  await publishGmailCareerHistoryAnalysis(args);
  return { mode: "vercel_queue" as const };
}
