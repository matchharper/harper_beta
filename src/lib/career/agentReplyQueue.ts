import { send } from "@vercel/queue";
import { scheduleCareerDevelopmentJob } from "./developmentQueue.server";
import { CareerAgentReplyUnavailable } from "./agentReplyError";
import type { CareerTextChatModelId } from "./textChatModelConfig";
export const CAREER_AGENT_REPLY_TOPIC = "career-agent-reply-v1";
export type CareerAgentReplyJob = {
  invocationId?: string;
  assistantModel?: string;
  textChatModel?: CareerTextChatModelId;
  userId: string;
  conversationId: string;
  sourceMessageId?: number;
  replyId: string;
  proactiveContext?: string;
  noMessageMarker?: string;
  checkpointKey?: string;
  backgroundRunId?: string;
};
export async function enqueueCareerAgentReply(job: CareerAgentReplyJob) {
  const idempotencyKey = `career-reply:${job.replyId}:${job.checkpointKey ?? crypto.randomUUID()}`;
  // Admission can wake the same inbox many times; one local consumer owns it
  // until it finishes. Provider publication retains independent retry receipts.
  if (scheduleCareerDevelopmentJob(job.invocationId ? `career-invocation:${job.invocationId}` : idempotencyKey, async () => {
    const { processCareerAgentReply } = await import("./agentReplyWorker");
    return processCareerAgentReply(job);
  })) return { messageId: null };
  return send(CAREER_AGENT_REPLY_TOPIC, job, {
    idempotencyKey,
    retentionSeconds: 86400,
  });
}

/** The user message is already saved. A busy conversation defers that same
 * logical reply; queue delivery retries the existing claim instead of dropping it. */
export async function deferBusyCareerAgentReply(
  error: unknown,
  job: CareerAgentReplyJob | undefined,
  publish: (job: CareerAgentReplyJob) => Promise<unknown> = enqueueCareerAgentReply,
) {
  if (!(error instanceof CareerAgentReplyUnavailable) || error.completed || !job)
    return false;
  await publish({ ...job, checkpointKey: job.checkpointKey ?? "initial" });
  return true;
}

