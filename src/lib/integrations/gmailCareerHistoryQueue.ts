import "server-only";

import { send } from "@vercel/queue";
import { after } from "next/server";
import { analyzeGmailCareerHistory } from "@/lib/integrations/gmailCareerHistory";
import { parseGmailCareerHistoryQueueMessage } from "@/lib/integrations/gmailCareerHistoryQueueMessage";
import { createGmailCareerHistoryFollowUpReply } from "@/lib/integrations/gmailCareerHistoryReply";
import {
  createGmailCareerHistoryRun,
  updateGmailCareerHistoryRun,
} from "@/lib/integrations/gmailCareerHistoryRun";
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
  runId: number;
  runStartedAt: string;
  talentId: string;
}) {
  const message = parseGmailCareerHistoryQueueMessage({
    expectedIntegrationUpdatedAt: args.integrationUpdatedAt,
    kind: "analyze_gmail_career_history",
    runId: args.runId,
    runStartedAt: args.runStartedAt,
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
  const run = await createGmailCareerHistoryRun({
    admin: args.admin,
    talentId: args.talentId,
  });
  if (process.env.NODE_ENV === "development") {
    after(async () => {
      await updateGmailCareerHistoryRun({
        admin: args.admin,
        runId: run.id,
        status: "running",
        talentId: args.talentId,
      });
      try {
        const result = await analyzeGmailCareerHistory({
          admin: args.admin,
          expectedIntegrationUpdatedAt: args.integrationUpdatedAt,
          talentId: args.talentId,
        });
        if (result.status === "completed") {
          await createGmailCareerHistoryFollowUpReply({
            admin: args.admin,
            entries: result.entries,
            runStartedAt: run.createdAt,
            userId: args.talentId,
          });
        }
        await updateGmailCareerHistoryRun({
          admin: args.admin,
          reason: result.status === "skipped" ? result.reason : undefined,
          runId: run.id,
          status: result.status === "completed" ? "completed" : "failed",
          talentId: args.talentId,
        });
      } catch (error) {
        await updateGmailCareerHistoryRun({
          admin: args.admin,
          reason: "analysis_failed",
          runId: run.id,
          status: "failed",
          talentId: args.talentId,
        });
        console.error("[gmail-career-history/local] analysis failed", {
          message:
            error instanceof Error ? error.message : "Unknown analysis error",
        });
      }
    });
    return { mode: "next_after" as const, startedAt: run.createdAt };
  }

  try {
    await publishGmailCareerHistoryAnalysis({
      ...args,
      runId: run.id,
      runStartedAt: run.createdAt,
    });
  } catch (error) {
    await updateGmailCareerHistoryRun({
      admin: args.admin,
      reason: "enqueue_failed",
      runId: run.id,
      status: "failed",
      talentId: args.talentId,
    });
    throw error;
  }
  return { mode: "vercel_queue" as const, startedAt: run.createdAt };
}
